import { useState } from "react";
import { useBusinessSummary, useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../lib/query";
import type { Goal, GoalStatus } from "../lib/types";

// Obiettivi dell'impresa (P1.1): il vertice "goal-driven" della piattaforma.
// Ogni lavoro della pipeline dovrebbe servire un obiettivo; qui si definiscono
// e si monitorano gli obiettivi del tenant. Persistenza: `business.goal`.

const STATUSES: { id: GoalStatus; label: string }[] = [
  { id: "active", label: "Attivo" },
  { id: "achieved", label: "Raggiunto" },
  { id: "paused", label: "In pausa" },
  { id: "abandoned", label: "Abbandonato" },
];

const PRIORITY_LABELS: Record<number, string> = {
  1: "Critica",
  2: "Alta",
  3: "Media",
  4: "Bassa",
  5: "Minima",
};

function statusClass(status: GoalStatus): string {
  switch (status) {
    case "active":
      return "text-[--color-primary] border-[--color-primary]/40";
    case "achieved":
      return "text-emerald-300 border-emerald-500/40";
    case "paused":
      return "text-[--color-accent] border-[--color-accent]/40";
    default:
      return "text-[--color-muted] border-[--color-border]";
  }
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Goals() {
  const [status, setStatus] = useState("");
  const list = useGoals({ status: status || undefined });
  const summary = useBusinessSummary();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Obiettivi</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Gli obiettivi dell'impresa. Ogni lavoro della pipeline dovrebbe servire un obiettivo: qui
          si definiscono priorita' e risultati attesi.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Totali" value={summary.data?.goals.total ?? 0} />
        <Metric label="Attivi" value={summary.data?.goals.active ?? 0} />
        <Metric label="Raggiunti" value={summary.data?.goals.achieved ?? 0} />
        <Metric label="Prodotti attivi" value={summary.data?.products.active ?? 0} />
      </div>

      <NewGoalForm />

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        {[{ id: "" as const, label: "Tutti" }, ...STATUSES].map((f) => (
          <button
            key={f.id || "all"}
            className={`btn ${status === f.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setStatus(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {list.isLoading ? (
          <div className="p-6 text-sm text-[--color-muted]">Caricamento…</div>
        ) : !list.data?.length ? (
          <div className="p-6 text-sm text-[--color-muted]">Nessun obiettivo definito.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[--color-muted]">
              <tr>
                <th className="px-4 py-3">Obiettivo</th>
                <th className="px-4 py-3">Priorita'</th>
                <th className="px-4 py-3">Metrica</th>
                <th className="px-4 py-3">Scadenza</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((g: Goal) => (
                <tr key={g.id} className="border-t border-[--color-border]">
                  <td className="px-4 py-3 text-white">
                    {g.title}
                    {g.description && (
                      <div className="text-[11px] text-[--color-muted]">{g.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">
                    P{g.priority} · {PRIORITY_LABELS[g.priority] ?? ""}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">{g.metric || "—"}</td>
                  <td className="px-4 py-3 text-[--color-muted]">{fmtDate(g.target_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusClass(g.status)}`}>{g.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {g.status === "active" ? (
                        <button
                          className="btn btn-ghost"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: g.id, status: "achieved" })}
                        >
                          Raggiunto
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: g.id, status: "active" })}
                        >
                          Riattiva
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(g.id)}
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[--color-muted]">{label}</div>
    </div>
  );
}

function NewGoalForm() {
  const create = useCreateGoal();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [metric, setMetric] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        metric: metric.trim() || undefined,
        targetDate: targetDate || null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setMetric("");
          setTargetDate("");
          setPriority(3);
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Nuovo obiettivo</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Titolo
          <input
            className="input"
            value={title}
            placeholder="Es. Raggiungere 100 clienti attivi"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Priorita'
          <select
            className="input"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                P{p} · {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Metrica di successo (opzionale)
          <input
            className="input"
            value={metric}
            placeholder="Es. clienti attivi / mese"
            onChange={(e) => setMetric(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted]">
          Data obiettivo (opzionale)
          <input
            type="date"
            className="input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[--color-muted] lg:col-span-2">
          Descrizione (opzionale)
          <textarea
            className="input min-h-[72px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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
          disabled={!title.trim() || create.isPending}
          onClick={submit}
        >
          Crea obiettivo
        </button>
      </div>
    </section>
  );
}
