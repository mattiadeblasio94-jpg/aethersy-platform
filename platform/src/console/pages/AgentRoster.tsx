import { useMemo, useState } from "react";
import { useDroid, useRoster } from "../lib/query";
import type { DroidDepartment, RosterEntry } from "../lib/types";

// Agent Roster: i 12 specialisti operativi di Aethersy, raggruppati per reparto,
// con il carico reale del tenant (task eseguiti/in corso/falliti). Modello
// pazi.ai "Agent Roster": gli stessi droid che eseguono i task di pipeline.

const DEPARTMENTS: DroidDepartment[] = [
  "Product",
  "Engineering",
  "Design",
  "Growth",
  "Data",
  "Quality",
  "Ops",
  "Security",
  "Support",
];

const DEPARTMENT_LABEL: Record<DroidDepartment, string> = {
  Product: "Prodotto",
  Engineering: "Ingegneria",
  Design: "Design & Contenuti",
  Growth: "Crescita",
  Data: "Dati & Ricerca",
  Quality: "Qualità",
  Ops: "Operations",
  Security: "Sicurezza",
  Support: "Supporto",
};

function dt(v: string | null): string {
  if (!v) return "mai";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgentRoster() {
  const roster = useRoster();
  const [selected, setSelected] = useState<string | null>(null);

  const byDepartment = useMemo(() => {
    const groups = new Map<DroidDepartment, RosterEntry[]>();
    for (const entry of roster.data ?? []) {
      const list = groups.get(entry.department) ?? [];
      list.push(entry);
      groups.set(entry.department, list);
    }
    return groups;
  }, [roster.data]);

  if (roster.isLoading) {
    return <div className="p-8 text-[color:var(--color-muted)]">Caricamento roster…</div>;
  }
  if (roster.isError) {
    return (
      <div className="card p-6 text-sm text-red-300">
        Impossibile leggere il roster: {(roster.error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Agenti</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          L'organizzazione degli specialisti: chi fa cosa, in quale stadio, con quanto carico reale.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-8">
          {DEPARTMENTS.filter((d) => byDepartment.has(d)).map((dept) => (
            <section key={dept}>
              <h2 className="mb-3 text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
                {DEPARTMENT_LABEL[dept]}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {byDepartment.get(dept)!.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className={`card p-4 text-left transition-colors hover:border-[color:var(--color-primary)]/40 ${
                      selected === d.id ? "border-[color:var(--color-primary)]/60" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-semibold text-white">{d.name}</span>
                      <span className="text-[11px] text-[color:var(--color-primary)]">{d.id}</span>
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">{d.role}</div>
                    <p className="mt-2 text-[11px] text-[color:var(--color-muted)]">{d.tagline}</p>
                    <div className="mt-3 flex gap-3 text-[11px]">
                      <span className="text-white">{d.tasks} task</span>
                      {d.running > 0 && <span className="text-[color:var(--color-primary)]">{d.running} attivi</span>}
                      {d.failed > 0 && <span className="text-red-300">{d.failed} falliti</span>}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <DroidPanel droidId={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function DroidPanel({ droidId, onClose }: { droidId: string | null; onClose: () => void }) {
  const detail = useDroid(droidId ?? undefined);

  if (!droidId) {
    return (
      <div className="card h-fit p-6">
        <h2 className="text-lg font-semibold text-white">Scheda specialista</h2>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          Seleziona un agente per vedere competenze, stadi e carico.
        </p>
      </div>
    );
  }
  if (detail.isLoading) {
    return <div className="card h-fit p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>;
  }
  if (!detail.data) {
    return <div className="card h-fit p-6 text-sm text-red-300">Specialista non trovato.</div>;
  }

  const d = detail.data;
  return (
    <div className="card h-fit p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{d.name}</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {d.role} · {DEPARTMENT_LABEL[d.department]}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Chiudi
        </button>
      </div>

      <p className="text-sm text-[color:var(--color-muted)]">{d.tagline}</p>

      <section className="mt-5">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Competenze</h3>
        <div className="flex flex-wrap gap-1">
          {d.skills.map((s) => (
            <span key={s} className="badge text-[color:var(--color-primary)] border-[color:var(--color-primary)]/30">
              {s}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
          Stadi di impiego
        </h3>
        <div className="flex flex-wrap gap-1">
          {d.stages.length ? (
            d.stages.map((s) => (
              <span key={s} className="badge text-[color:var(--color-muted)] border-[color:var(--color-border)]">
                {s}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-[color:var(--color-muted)]">Nessuno stadio dedicato</span>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Carico reale</h3>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Task totali" value={d.tasks} />
          <Metric label="In corso" value={d.running} accent />
          <Metric label="Completati" value={d.done} />
          <Metric label="Falliti" value={d.failed} danger={d.failed > 0} />
        </div>
        <p className="mt-3 text-[11px] text-[color:var(--color-muted)]">
          Ultimo task: {dt(d.lastTaskAt)}
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${
          danger ? "text-red-300" : accent ? "text-[color:var(--color-primary)]" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
