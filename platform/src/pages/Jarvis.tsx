// =============================================================================
// Jarvis — l'assistente sempre sveglio.
//
// Non e' una chat a turni: Jarvis resta in ascolto continuo, segmenta il
// parlato con una VAD (energy gate sul flusso del microfono), trascrive in
// tempo reale, interrompe la propria voce se l'utente gli parla sopra
// (barge-in) e riparte subito. In parallelo e' in ascolto degli eventi
// proattivi (SSE): quando il watcher sul VPS dedicato rileva qualcosa che
// merita attenzione, Jarvis lo annuncia e lo dice a voce.
//
// Ciclo vocale:
//   ascolto -> VAD (inizio/fine parlato) -> trascrizione -> risposta ->
//   sintesi vocale -> ascolto (loop continuo, senza premere nulla)
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import {
  platformApi,
  type JarvisEvent,
  type JarvisMessage,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Evento proattivo (non e' una risposta a una richiesta). */
  proactive?: boolean;
}

type VoiceState = "idle" | "hearing" | "thinking" | "speaking";

/** Soglie VAD: energia media del segnale (0..1). */
const VAD_THRESHOLD = 0.035;
/** Silenzio (ms) che chiude un turno di parlato. */
const VAD_SILENCE_MS = 750;
/** Durata minima di una frase (ms) per non scattare sui rumori. */
const VAD_MIN_SPEECH_MS = 350;
/** Intervallo fra due trascrizioni parziali durante il parlato (ms). */
const PARTIAL_EVERY_MS = 4000;

export default function Jarvis() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ enabled: boolean; reachable: boolean } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(true);
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [wakeWord, setWakeWord] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recordingSegment, setRecordingSegment] = useState(false);
  const [events, setEvents] = useState<JarvisEvent[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const utteranceRef = useRef<Blob[]>([]);
  // Primo chunk del MediaRecorder: contiene l'header webm. Va sempre
  // riattaccato ai chunk successivi per ottenere un file decodificabile.
  const headerRef = useRef<Blob | null>(null);
  // Frequenza delle trascrizioni: il rumore ambientale non deve consumare
  // la quota del provider. Al massimo un turno al secondo e 12 al minuto.
  const lastSttAtRef = useRef(0);
  const sttWindowRef = useRef<number[]>([]);
  const hearingRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const silenceSinceRef = useRef(0);
  const lastPartialRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const busyRef = useRef(false);
  // Messaggio in attesa: se l'utente parla mentre Jarvis sta rispondendo,
  // l'ultima frase non viene persa: viene girata al modello appena libero.
  const pendingRef = useRef<string | null>(null);
  const voiceRef = useRef(true);
  const wakeWordRef = useRef(false);
  const alwaysOnRef = useRef(false);

  useEffect(() => {
    platformApi
      .getJarvisStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, reachable: false }));
    platformApi
      .getJarvisEvents(20)
      .then((res) => setEvents(res.events ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    voiceRef.current = voice;
    wakeWordRef.current = wakeWord;
    alwaysOnRef.current = alwaysOn;
  }, [voice, wakeWord, alwaysOn]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, busy, liveTranscript]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const pushTurn = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  /**
   * Riproduce la risposta a voce. Se l'utente parla durante l'ascolto, la
   * riproduzione si ferma (barge-in): Jarvis non parla sopra l'utente.
   */
  const speak = useCallback(async (text: string, highFidelity = false) => {
    const clean = text.replace(/[*_`#]/g, " ").slice(0, 1200).trim();
    if (!clean) return;
    try {
      setVoiceState("speaking");
      // In conversazione si usa il modello rapido (latenza minima); il
      // riascolto manuale usa il modello di massima fedelta'.
      const result = await platformApi.speakJarvis(
        clean,
        "",
        "it",
        highFidelity ? "elevenlabs/eleven_multilingual_v2" : undefined,
      );
      if (!result.audio) throw new Error(result.message ?? "sintesi vocale vuota");
      const bytes = Uint8Array.from(atob(result.audio), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: `audio/${result.format ?? "mp3"}` }));
      const audio = new Audio(url);
      audioRef.current = audio;
      // Il browser puo' non riprodurre l'audio (nessun dispositivo di uscita,
      // scheda sospesa): senza un tetto massimo la promise non finirebbe
      // mai e bloccherebbe il ciclo di ascolto.
      const maxPlaybackMs = Math.min(120_000, Math.max(8_000, (bytes.length / 16_000) * 1000 + 5_000));
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve();
        };
        const timer = window.setTimeout(done, maxPlaybackMs);
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
      });
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
    } catch (err) {
      toast({
        kind: "warning",
        title: "Voce non disponibile",
        description: (err as Error).message,
      });
    } finally {
      setVoiceState("idle");
    }
  }, [toast]);

  /** Invia un turno a Jarvis e ne annuncia la risposta (testo + voce). */
  const ask = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message) return;
      if (busyRef.current) {
        // Jarvis sta rispondendo: si tiene l'ultima frase e la si gira dopo.
        pendingRef.current = message;
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setVoiceState("thinking");
      const history: JarvisMessage[] = turnsRef.current
        .filter((turn) => !turn.proactive)
        .map((turn) => ({ role: turn.role, content: turn.content }));
      pushTurn({ role: "user", content: message });
      try {
        const response = await platformApi.askJarvis(message, history);
        const answer =
          response.choices?.[0]?.message?.content ??
          response.error?.message ??
          "Jarvis non ha restituito una risposta.";
        pushTurn({ role: "assistant", content: answer });
        // La riproduzione non deve bloccare il ciclo: il turno si chiude
        // subito e l'audio va avanti in parallelo.
        if (voiceRef.current) void speak(answer);
      } catch (err) {
        const detail = (err as Error).message;
        pushTurn({ role: "assistant", content: `Errore: ${detail}` });
        toast({ kind: "error", title: "Jarvis non raggiungibile", description: detail });
      } finally {
        busyRef.current = false;
        setBusy(false);
        setVoiceState("idle");
        const pending = pendingRef.current;
        if (pending) {
          pendingRef.current = null;
          void ask(pending);
        }
      }
    },
    [pushTurn, speak, toast],
  );

  /** Trascrive l'audio accumulato e, se ha senso, lo manda a Jarvis. */
  const transcribeAndAsk = useCallback(
    async (blob: Blob) => {
      if (blob.size < 800) return;
      // Filtro di frequenza: scarta i segmenti troppo ravvicinati e quelli
      // in eccesso nella finestra di un minuto.
      const now = Date.now();
      const window = sttWindowRef.current.filter((t) => now - t < 60_000);
      if (now - lastSttAtRef.current < 1_200 || window.length >= 12) return;
      lastSttAtRef.current = now;
      sttWindowRef.current = [...window, now];
      setVoiceState("thinking");
      try {
        const result = await platformApi.transcribeJarvis(blob, blob.type || "audio/webm");
        const text = (result.text ?? "").trim();
        setLiveTranscript("");
        if (!text) return;
        if (wakeWordRef.current && !/jarvis/i.test(text)) {
          // Modalita' wake word: la frase non attiva l'assistente.
          setVoiceState("idle");
          return;
        }
        await ask(text);
      } catch (err) {
        toast({ kind: "error", title: "Trascrizione fallita", description: (err as Error).message });
        setVoiceState("idle");
      }
    },
    [ask, toast],
  );

  /**
   * Loop VAD: analizza il livello del microfono, distingue parlato da
   * silenzio, interrompe l'audio di Jarvis quando l'utente la interrompe e
   * chiude il turno di parlato dopo una pausa.
   */
  const startListening = useCallback(async () => {
    if (recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      toast({ kind: "error", title: "Microfono non disponibile", description: (err as Error).message });
      return;
    }
    streamRef.current = stream;

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", ""].find(
      (type) => !type || MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    utteranceRef.current = [];

    /**
     * Ogni turno di parlato deve essere un file audio VALIDO: i chunk di
     * MediaRecorder presi a meta' stream non sono decodificabili
     * (whisper: "Invalid data found when processing input"). Il primo chunk
     * contiene l'header webm: lo si conserva e lo si riattacca ai chunk del
     * turno, cosi' da inviare sempre un container completo.
     */
    recorder.ondataavailable = (event) => {
      if (event.data.size <= 0) return;
      if (!headerRef.current) headerRef.current = event.data;
      utteranceRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = utteranceRef.current;
      const head = headerRef.current;
      const blob = new Blob(head && chunks[0] !== head ? [head, ...chunks] : chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      utteranceRef.current = [];
      setRecordingSegment(false);
      if (blob.size > 800) void transcribeAndAsk(blob);
      // Il ciclo continua: Jarvis resta in ascolto.
      if (alwaysOnRef.current && recorderRef.current === recorder) {
        try {
          headerRef.current = null;
          recorder.start(250);
          setRecordingSegment(true);
        } catch {
          // Il recorder non e' ripartito: il ciclo riprova al prossimo evento.
        }
      }
    };
    headerRef.current = null;
    recorder.start(250);
    setRecordingSegment(true);

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const value = (samples[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();

      if (rms > VAD_THRESHOLD) {
        // Barge-in: l'utente parla mentre Jarvis parla -> la voce si ferma.
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioRef.current = null;
          setVoiceState("hearing");
        }
        if (!hearingRef.current) {
          hearingRef.current = true;
          speechStartedAtRef.current = now;
          silenceSinceRef.current = 0;
          utteranceRef.current = [];
          lastPartialRef.current = 0;
          setVoiceState("hearing");
          setLiveTranscript("");
        } else {
          silenceSinceRef.current = 0;
        }
        // Trascrizione parziale: il testo compare mentre l'utente parla.
        const duration = now - speechStartedAtRef.current;
        if (duration > 2500 && now - lastPartialRef.current > PARTIAL_EVERY_MS) {
          lastPartialRef.current = now;
          const chunks = utteranceRef.current;
          const head = headerRef.current;
          const snapshot = new Blob(head && chunks[0] !== head ? [head, ...chunks] : chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          if (snapshot.size > 1200) {
            void platformApi
              .transcribeJarvis(snapshot, snapshot.type, true)
              .then((res) => {
                const partial = (res.text ?? "").trim();
                if (partial && hearingRef.current) setLiveTranscript(partial);
              })
              .catch(() => undefined);
          }
        }
      } else if (hearingRef.current) {
        if (!silenceSinceRef.current) silenceSinceRef.current = now;
        if (now - silenceSinceRef.current > VAD_SILENCE_MS) {
          const duration = speechStartedAtRef.current ? now - speechStartedAtRef.current : 0;
          hearingRef.current = false;
          setLiveTranscript("");
          // Chiusura del turno: la registrazione viene fermata e riaperta, cosi'
          // ogni frase inviata al backend e' un file audio valido.
          if (duration >= VAD_MIN_SPEECH_MS && recorder.state === "recording") {
            recorder.stop();
          } else {
            setVoiceState("idle");
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    setAlwaysOn(true);
  }, [toast, transcribeAndAsk]);

  const stopListening = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    alwaysOnRef.current = false;
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    utteranceRef.current = [];
    hearingRef.current = false;
    setRecordingSegment(false);
    setLiveTranscript("");
    setVoiceState("idle");
    setAlwaysOn(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  /**
   * Eventi proattivi: il BFF li trasmette in streaming (SSE). Jarvis li
   * mostra e li legge a voce: e' il modo in cui l'assistente informa senza
   * che l'utente debba chiedere.
   */
  useEffect(() => {
    const source = new EventSource("/api/platform/jarvis/stream", { withCredentials: true });
    const onEvent = (raw: MessageEvent) => {
      try {
        const event = JSON.parse(raw.data) as JarvisEvent;
        setEvents((prev) => [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 30));
        const line = event.message ? `${event.title}. ${event.message}` : event.title;
        pushTurn({ role: "assistant", content: line, proactive: true });
        if (voiceRef.current) void speak(line);
      } catch {
        // Payload non conforme: ignorato.
      }
    };
    source.addEventListener("jarvis", onEvent as EventListener);
    return () => source.close();
  }, [pushTurn, speak]);

  const disabled = status !== null && !status.enabled;

  const stateLabel =
    voiceState === "hearing"
      ? "sto ascoltando"
      : voiceState === "thinking"
        ? "sto elaborando"
        : voiceState === "speaking"
          ? "sto parlando"
          : alwaysOn
            ? recordingSegment
              ? "sveglio, in ascolto"
              : "sveglio, in attesa"
            : "in pausa";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jarvis"
        description="Assistente sempre sveglio: ascolta in continuo, risponde a voce e ti avvisa di tutto quello che succede sulla piattaforma."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={status?.reachable ? "success" : status?.enabled ? "warning" : "default"}>
              {status?.reachable
                ? "Jarvis online"
                : status?.enabled
                  ? "Jarvis non raggiungibile"
                  : "Jarvis non configurato"}
            </Badge>
            <Badge variant={alwaysOn ? "success" : "default"}>
              <Radio className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {stateLabel}
            </Badge>
          </div>
        }
      />

      {disabled && (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
          title="Jarvis non e' ancora attivo"
          description="L'assistente gira su un VPS dedicato: quando sara' collegato, qui potrai parlare e pilotare la piattaforma a voce."
        />
      )}

      <Card className="flex min-h-[460px] flex-col gap-4 p-5">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto">
          {turns.length === 0 && (
            <p className="text-sm text-text-secondary">
              Esempi: "quanti prodotti ci sono nel catalogo?", "aggiungi il prodotto X a 29 euro",
              "aggiornami la guida passo-passo", "scrivi un piano per la mia campagna".
            </p>
          )}
          {turns.map((turn, index) => (
            <div
              key={index}
              data-turn={turn.proactive ? "event" : turn.role}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                turn.role === "user"
                  ? "ml-auto bg-secondary/15 text-text-primary"
                  : "bg-primary/60 text-text-secondary",
                turn.proactive && "border border-secondary/40",
              )}
            >
              {turn.proactive && (
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-secondary">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Jarvis ha rilevato un evento
                </p>
              )}
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => void speak(turn.content, true)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
                  aria-label="Rileggi la risposta a voce"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Rileggi
                </button>
              )}
            </div>
          ))}
          {liveTranscript && (
            <p className="ml-auto max-w-[85%] rounded-2xl bg-secondary/10 px-4 py-2 text-sm text-text-muted italic">
              {liveTranscript}
            </p>
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Jarvis sta lavorando...
            </div>
          )}
        </div>

        {events.length > 0 && (
          <div className="rounded-xl border border-secondary/20 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              Ultimi eventi monitorati
            </p>
            <ul className="space-y-1 text-xs text-text-secondary">
              {events.slice(0, 4).map((event) => (
                <li key={event.id} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      event.severity === "critical"
                        ? "bg-red-500"
                        : event.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                  />
                  <span>
                    <span className="text-text-primary">{event.title}</span>
                    {event.message ? ` — ${event.message}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Button
            variant={voice ? "primary" : "secondary"}
            size="icon"
            aria-label={voice ? "Voce attiva" : "Voce disattivata"}
            title={voice ? "Jarvis risponde a voce" : "Jarvis risponde in testo"}
            onClick={() => setVoice((prev) => !prev)}
            disabled={disabled || busy}
          >
            {voice ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
          <Button
            variant={alwaysOn ? "danger" : "secondary"}
            size="icon"
            aria-label={alwaysOn ? "Ferma l'ascolto continuo" : "Ascolto continuo attivo"}
            title={alwaysOn ? "Jarvis e' in ascolto continuo" : "Tieni Jarvis sempre in ascolto"}
            onClick={() => (alwaysOn ? stopListening() : void startListening())}
            disabled={disabled}
          >
            {alwaysOn ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant={wakeWord ? "primary" : "secondary"}
            size="icon"
            aria-label={wakeWord ? "Attivazione solo con la parola Jarvis" : "Attivazione a voce libera"}
            title={wakeWord ? "Si attiva solo dicendo 'Jarvis'" : "Risponde a qualsiasi voce"}
            onClick={() => setWakeWord((prev) => !prev)}
            disabled={disabled}
          >
            <Radio className="h-5 w-5" />
          </Button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
            rows={2}
            placeholder="Scrivi a Jarvis..."
            className="flex-1 rounded-lg border border-secondary/20 bg-primary/60 px-3 py-2 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <Button
            variant="primary"
            size="icon"
            aria-label="Invia a Jarvis"
            onClick={() => void ask(input)}
            disabled={disabled || busy || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {status === null && <Skeleton className="h-4 w-40" />}
      </Card>
    </div>
  );
}
