import { useState } from "react";
import {
  useBusinessSummary,
  useCreateMemory,
  useDeleteMemory,
  useMemory,
  useUpdateMemory,
} from "../lib/query";
import type { MemoryEntry, MemoryKind } from "../lib/types";

// Memoria dell'impresa (P1.1): fatti, note, preferenze, vincoli, decisioni e
// contatti che il tenant vuole ricordare fra una sessione e l'altra. Alimenta la
// chat centrale (P1.3). Persistenza: `business.memory`.

const KINDS: { id: MemoryKind; label: string }[] = [
  { id: "fact", label: "Fatto" },
  { id: "note", label: "Nota" },
  { id: "preference", label: "Preferenza" },
  { id: "constraint", label: "Vincolo" },
  { id: "decision", label: "Decisione" },
  { id: "contact", label: "Contatto" },
];

const KIND_LABEL: Record<MemoryKind, string> = Object.fromEntries(
  KINDS.map((k) => [k.id, k.label]),
) as Record<MemoryKind, string>;

function kindClass(kind: MemoryKind): string {
  switch (kind) {
    case "fact":
      return "text-[--color-primary] border-[--color-primary]/40";
    case "decision":
      return "text-emerald-300 border-emerald-500/40";
    case "constraint":
      return "text-[--color-accent] border-[--color-accent]/40";
    case "preference":
      return "text-sky-300 border-sky-500/40";
    default:
      return "text-[--color-muted] border-[--color-border]";
  }
}

export default function Memory() {
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const list = useMemory({ kind: kind || undefined, search: search || undefined });
  const summary = useBusinessSummary();
  const update = useUpdateMemory();
  const remove = useDeleteMemory();

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Memoria</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          La base di conoscenza dell'impresa: cio' che va ricordato fra una sessione e l'altra
          (fatti, preferenze, vincoli, decisioni, contatti). Alimenta la chat centrale.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Voci totali" value={summary.data?.memory.total ?? 0} />
        <Metric label="Fissate" value={summary.data?.memory.pinned ?? 0} />
        <Metric label="Decisioni" value={summary.data?.memory.byKind.decision ?? 0} />
        <Metric label="Vincoli" value={summary.data?.memory.byKind.constraint ?? 0} />
      </div>

      <NewMemoryForm />

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        <button className={`btn ${!kind ? "btn-primary" : "btn-ghost"}`} onClick={() => setKind("")}>
          Tutte
        </button>
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`btn ${kind === k.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
        <input
          className="input ml-auto max-w-xs"
          placeholder="Cerca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {list.isLoading ? (
          <div className="card p-6 text-sm text-[--color-muted]">Caricamento…</div>
        ) : !list.data?.length ? (
          <div className="card p-6 text-sm text-[--color-muted]">Nessuna voce in memoria.</div>
        ) : (
          list.data.map((m: MemoryEntry) => (
            <article key={m.id} className="card p-5">
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {m.pinned && <span className="text-[--color-accent]">★</span>}
                    <span className={`badge ${kindClass(m.kind)}`}>{KIND_LABEL[m.kind]}</span>
                    {m.title && <span className="font-medium text-white">{m.title}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn btn-ghost"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: m.id, pinned: !m.pinned })}
                  >
                    {m.pinned ? "Rimuovi" : "Fissa"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(m.id)}
                  >
                    Elimina
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[--color-muted]">{m.content}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[--color-muted]">
                {m.tags.map((t) => (
                  <span key={t} className="rounded-full border border-[--color-border] px-2 py-0.5">
                    #{t}
                  </span>
                ))}
                {m.source && <span>fonte: {m.source}</span>}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[--color-muted]">{label}</div>
    </div>
  );
}

function NewMemoryForm() {
  const create = useCreateMemory();
  const [kind, setKind] = useState<MemoryKind>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    create.mutate(
      {
        kind,
        title: title.trim() || undefined,
        content: content.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        pinned,
      },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setTags("");
          setPinned(false);
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Aggiungi alla memoria</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Tipo
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as MemoryKind)}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Titolo (opzionale)
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted] lg:col-span-2">
          Contenuto
          <textarea
            className="input min-h-[80px]"
            value={content}
            placeholder="Es. Il tone of voice e' professionale ma diretto."
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Tag (separati da virgola)
          <input
            className="input"
            value={tags}
            placeholder="brand, copy"
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-xs text-[--color-muted]">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Fissa in cima
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4">
        <button
          className="btn btn-primary"
          disabled={!content.trim() || create.isPending}
          onClick={submit}
        >
          Ricorda
        </button>
      </div>
    </section>
  );
}
