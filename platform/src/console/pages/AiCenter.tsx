import { useState } from "react";
import { useAiCatalog, useAiChat } from "../lib/query";
import type { AiCapability } from "../lib/types";

const CAPS: { key: AiCapability; label: string; hint: string }[] = [
  { key: "text", label: "Testo", hint: "Prompt testuale" },
  { key: "image", label: "Immagine → Testo", hint: "URL immagine" },
  { key: "audio", label: "Voce → Testo", hint: "URL audio (STT)" },
  { key: "video", label: "Video → Testo", hint: "URL video" },
];

export default function AiCenter() {
  const [capability, setCapability] = useState<AiCapability>("text");
  const [prompt, setPrompt] = useState("Spiega in una frase cosa fa la piattaforma Aethersy.");
  const [fileUrl, setFileUrl] = useState("");
  const [preferFree, setPreferFree] = useState(true);
  const [model, setModel] = useState<string>("");

  const catalog = useAiCatalog(capability);
  const chat = useAiChat();

  const needsFile = capability !== "text";

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">AI Center</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Router multimodale: sceglie automaticamente il modello per capacità, preferendo i gratuiti
          (OpenRouter).
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {CAPS.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setCapability(c.key);
              setModel("");
            }}
            className={`btn ${capability === c.key ? "btn-primary" : "btn-ghost"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          className="card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            chat.mutate({ capability, prompt, model: model || undefined, preferFree, fileUrl });
          }}
        >
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">
            Modello ({catalog.data?.models.length ?? 0} disponibili per questa capacità)
          </label>
          <select
            className="input mb-4"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">Auto (router: preferisci gratuiti)</option>
            {catalog.data?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.free ? "★ free" : "paid"} — {m.name}
              </option>
            ))}
          </select>

          {needsFile && (
            <>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">
                {CAPS.find((c) => c.key === capability)?.hint}
              </label>
              <input
                className="input mb-4"
                placeholder="https://…"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                required
              />
            </>
          )}

          <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">Prompt</label>
          <textarea
            className="input mb-4 min-h-28"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />

          <label className="mb-4 flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
            <input
              type="checkbox"
              checked={preferFree}
              onChange={(e) => setPreferFree(e.target.checked)}
            />
            Preferisci modelli gratuiti
          </label>

          <button className="btn btn-primary glow w-full justify-center" disabled={chat.isPending}>
            {chat.isPending ? "Elaborazione…" : "Esegui"}
          </button>

          {chat.isError && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              Errore: {(chat.error as Error).message}
            </div>
          )}
        </form>

        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Risposta</h2>
          {chat.isPending ? (
            <p className="text-sm text-[color:var(--color-muted)]">In corso…</p>
          ) : chat.data ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="badge text-[color:var(--color-primary)] border-[color:var(--color-primary)]/40">
                  {chat.data.model}
                </span>
                <span className="badge text-[color:var(--color-muted)]">{chat.data.latencyMs} ms</span>
                {chat.data.usage?.total_tokens && (
                  <span className="badge text-[color:var(--color-muted)]">
                    {chat.data.usage.total_tokens} token
                  </span>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-white">
                {chat.data.answer}
              </pre>
            </>
          ) : (
            <p className="text-sm text-[color:var(--color-muted)]">Nessun risultato ancora.</p>
          )}
        </div>
      </div>
    </div>
  );
}
