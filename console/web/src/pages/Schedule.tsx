import { useState } from "react";
import {
  useCreateSchedule,
  useCronPreview,
  useDeleteSchedule,
  useSchedule,
  useStages,
  useToggleSchedule,
} from "../lib/query";
import type { ScheduleEntry, ScheduleKind } from "../lib/types";

// Tasks & Calendar: l'agenda del tenant. Una voce e' un promemoria o una run
// ricorrente/singola legata a uno stadio; il motore cron calcola la prossima
// esecuzione nella timezone della voce. Il modello e' pazi.ai "Tasks &
// Calendar", la persistenza e' `pipeline.schedule`.

const KINDS: { id: ScheduleKind; label: string }[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "social", label: "Social" },
  { id: "report", label: "Report" },
  { id: "reminder", label: "Promemoria" },
];

function dt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: string): string {
  switch (status) {
    case "scheduled":
      return "text-[--color-primary] border-[--color-primary]/40";
    case "paused":
      return "text-[--color-accent] border-[--color-accent]/40";
    case "done":
      return "text-emerald-300 border-emerald-500/40";
    default:
      return "text-[--color-muted] border-[--color-border]";
  }
}

export default function Schedule() {
  const [status, setStatus] = useState("");
  const list = useSchedule({ status: status || undefined });
  const toggle = useToggleSchedule();
  const remove = useDeleteSchedule();

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Tasks & Calendar</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          L'agenda delle attività ricorrenti e pianificate. Il calendario non esegue nulla da solo:
          definisce quando un lavoro deve partire.
        </p>
      </header>

      <NewScheduleForm />

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        {[
          { key: "", label: "Tutte" },
          { key: "scheduled", label: "Attive" },
          { key: "paused", label: "In pausa" },
          { key: "done", label: "Concluse" },
        ].map((f) => (
          <button
            key={f.key || "all"}
            className={`btn ${status === f.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {list.isLoading ? (
          <div className="p-6 text-sm text-[--color-muted]">Caricamento…</div>
        ) : !list.data?.length ? (
          <div className="p-6 text-sm text-[--color-muted]">Nessuna voce in agenda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[--color-muted]">
              <tr>
                <th className="px-4 py-3">Titolo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Ricorrenza</th>
                <th className="px-4 py-3">Prossima</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s: ScheduleEntry) => (
                <tr key={s.id} className="border-t border-[--color-border]">
                  <td className="px-4 py-3 text-white">
                    {s.title}
                    {s.stage && (
                      <span className="ml-2 text-[11px] text-[--color-muted]">{s.stage}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">
                    {KINDS.find((k) => k.id === s.kind)?.label ?? s.kind}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">
                    {s.cron ? <code className="text-[--color-primary]">{s.cron}</code> : "una tantum"}
                    <div className="text-[11px]">{s.timezone}</div>
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">{dt(s.nextRunAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusClass(s.status)}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {(s.status === "scheduled" || s.status === "paused") && (
                        <button
                          className="btn btn-ghost"
                          disabled={toggle.isPending}
                          onClick={() =>
                            toggle.mutate({
                              id: s.id,
                              action: s.status === "scheduled" ? "pause" : "resume",
                            })
                          }
                        >
                          {s.status === "scheduled" ? "Pausa" : "Riattiva"}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(s.id)}
                      >
                        Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewScheduleForm() {
  const stages = useStages();
  const create = useCreateSchedule();
  const preview = useCronPreview();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("pipeline");
  const [stage, setStage] = useState("");
  const [mode, setMode] = useState<"cron" | "once">("cron");
  const [cron, setCron] = useState("0 9 * * 1");
  const [runAt, setRunAt] = useState("");
  const [timezone, setTimezone] = useState("Europe/Rome");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && (mode === "cron" ? cron.trim() : runAt);

  function submit() {
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        kind,
        stage: stage || undefined,
        cron: mode === "cron" ? cron.trim() : null,
        runAt: mode === "once" ? new Date(runAt).toISOString() : null,
        timezone,
      },
      {
        onSuccess: () => {
          setTitle("");
          setCron("0 9 * * 1");
          setRunAt("");
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Nuova voce di agenda</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Titolo
          <input
            className="input"
            value={title}
            placeholder="Es. Report settimanale pipeline"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Tipo
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ScheduleKind)}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Stadio (opzionale)
          <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Nessuno</option>
            {(stages.data?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Timezone
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>

        <div className="lg:col-span-2">
          <div className="mb-3 flex gap-2">
            <button
              className={`btn ${mode === "cron" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode("cron")}
            >
              Ricorrente (cron)
            </button>
            <button
              className={`btn ${mode === "once" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode("once")}
            >
              Una tantum
            </button>
          </div>

          {mode === "cron" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
                Espressione cron (5 campi: minuto ora giorno mese giorno-settimana)
                <input
                  className="input font-mono"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                />
              </label>
              <button
                className="btn btn-ghost self-end"
                disabled={!cron.trim() || preview.isPending}
                onClick={() =>
                  preview.mutate(
                    { cron: cron.trim(), timezone, count: 5 },
                    { onError: (e) => setError((e as Error).message) },
                  )
                }
              >
                Anteprima
              </button>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
              Data e ora di esecuzione
              <input
                type="datetime-local"
                className="input"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </label>
          )}
        </div>
      </div>

      {preview.data && (
        <div className="mt-4 rounded-lg border border-[--color-border] px-3 py-2 text-xs text-[--color-muted]">
          Prossime esecuzioni ({preview.data.timezone}):
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.data.runs.map((r) => (
              <li key={r} className="text-[--color-primary]">
                {dt(r)}
              </li>
            ))}
            {!preview.data.runs.length && <li>Nessuna esecuzione calcolabile.</li>}
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4">
        <button
          className="btn btn-primary"
          disabled={!canSubmit || create.isPending}
          onClick={submit}
        >
          Aggiungi all'agenda
        </button>
      </div>
    </section>
  );
}
