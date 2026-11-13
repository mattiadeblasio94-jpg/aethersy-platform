// =============================================================================
// Jarvis — l'assistente della piattaforma.
//
// Punto di ingresso vocale: l'utente parla (o scrive) e Jarvis orchestra i
// servizi della piattaforma (Wix, business, memoria, coding agent). Il BFF
// inoltra a Jarvis sul VPS dedicato e gli passa la memoria del tenant come
// contesto, cosi' le risposte poggiano su fatti reali.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import {
  platformApi,
  type JarvisMessage,
} from "@/lib/platform-api";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export default function Jarvis() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ enabled: boolean; reachable: boolean } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    platformApi
      .getJarvisStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, reachable: false }));
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scorre solo il riquadro della conversazione: scrollIntoView sul documento
    // sposterebbe anche la pagina, nascondendo l'intestazione.
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    const history: JarvisMessage[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    try {
      const response = await platformApi.askJarvis(message, history);
      const answer =
        response.choices?.[0]?.message?.content ??
        response.error?.message ??
        "Jarvis non ha restituito una risposta.";
      setTurns((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      const detail = (err as Error).message;
      setTurns((prev) => [...prev, { role: "assistant", content: `Errore: ${detail}` }]);
      toast({ kind: "error", title: "Jarvis non raggiungibile", description: detail });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setBusy(true);
        try {
          const result = await platformApi.transcribeJarvis(blob, blob.type);
          const text = (result.text ?? "").trim();
          if (!text) {
            toast({ kind: "warning", title: "Trascrizione vuota", description: "Riprova parlando vicino al microfono." });
            return;
          }
          setTurns((prev) => [...prev, { role: "user", content: text }]);
          const history: JarvisMessage[] = [
            ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
            { role: "user", content: text },
          ];
          const response = await platformApi.askJarvis(text, history);
          const answer =
            response.choices?.[0]?.message?.content ??
            response.error?.message ??
            "Jarvis non ha restituito una risposta.";
          setTurns((prev) => [...prev, { role: "assistant", content: answer }]);
        } catch (err) {
          toast({ kind: "error", title: "Trascrizione fallita", description: (err as Error).message });
        } finally {
          setBusy(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      toast({ kind: "error", title: "Microfono non disponibile", description: (err as Error).message });
    }
  }

  const disabled = status !== null && !status.enabled;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jarvis"
        description="Parla con l'assistente: interpreta la richiesta in linguaggio naturale e agisce sulla piattaforma (dati reali, niente stime)."
        actions={
          <Badge variant={status?.reachable ? "success" : status?.enabled ? "warning" : "default"}>
            {status?.reachable
              ? "Jarvis online"
              : status?.enabled
                ? "Jarvis non raggiungibile"
                : "Jarvis non configurato"}
          </Badge>
        }
      />

      {disabled && (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
          title="Jarvis non e' ancora attivo"
          description="L'assistente gira su un VPS dedicato: quando sara' collegato, qui potrai parlare e pilotare la piattaforma a voce."
        />
      )}

      <Card className="flex min-h-[420px] flex-col gap-4 p-5">
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
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                turn.role === "user"
                  ? "ml-auto bg-secondary/15 text-text-primary"
                  : "bg-primary/60 text-text-secondary",
              )}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Jarvis sta lavorando...
            </div>
          )}
        </div>

        <div className="flex items-end gap-2">
          <Button
            variant={recording ? "danger" : "secondary"}
            size="icon"
            aria-label={recording ? "Ferma la registrazione" : "Parla a Jarvis"}
            onClick={toggleRecording}
            disabled={disabled || busy}
          >
            {recording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
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
            onClick={() => void send(input)}
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
