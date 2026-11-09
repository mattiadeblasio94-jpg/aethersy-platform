import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useApproveRun,
  useDeliverRun,
  useOpportunities,
  useRetryRun,
  useStages,
} from "../lib/query";
import type { OpportunityRun, OpportunityState } from "../lib/types";

// Opportunities: la roadmap operativa. Ogni riga e' un run di pipeline reale,
// mostrato con lo stato del modello pazi (Aperta / In corso / In attesa di
// input / Pronta / Consegnata / Errore). Le azioni (approva, consegna, riprova)
// passano dalla stessa macchina a stati della Pipeline: nessuna scorciatoia.

const FILTERS: { key: "" | OpportunityState; label: string }[] = [
  { key: "", label: "Tutte" },
  { key: "awaiting_input", label: "In attesa di input" },
  { key: "in_progress", label: "In corso" },
  { key: "ready", label: "Pronte" },
  { key: "error", label: "Errori" },
  { key: "done", label: "Consegnate" },
];

function toneClass(tone: string): string {
  switch (tone) {
    case "success":
      return "text-emerald-300 border-emerald-500/40";
    case "warning":
      return "text-[color:var(--color-accent)] border-[color:var(--color-accent)]/40";
    case "danger":
      return "text-red-300 border-red-500/40";
    case "info":
      return "text-[color:var(--color-primary)] border-[color:var(--color-primary)]/40";
    default:
      return "text-[color:var(--color-muted)] border-[color:var(--color-border)]";
  }
}

function dt(v: string): string {
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Opportunities() {
  const [filter, setFilter] = useState<"" | OpportunityState>("");
  const [stage, setStage] = useState("");
  const stages = useStages();
  const list = useOpportunities({ stage: stage || undefined });

  const approve = useApproveRun();
  const deliver = useDeliverRun();
  const retry = useRetryRun();
  const busy = approve.isPending || deliver.isPending || retry.isPending;

  const rows = (list.data ?? []).filter((o) => !filter || o.opportunity.state === filter);

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Opportunità</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          La roadmap operativa: ogni opportunità è un lavoro reale in pipeline. Approva ciò che è
          pronto, sblocca ciò che attende input, recupera ciò che è in errore.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              className={`btn ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select className="input w-auto" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Tutti gli stadi</option>
          {(stages.data?.stages ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {list.isLoading ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
        ) : !rows.length ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">
            Nessuna opportunità con questo filtro.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Opportunità</th>
                <th className="px-4 py-3">Stadio</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Aggiornata</th>
                <th className="px-4 py-3">Azione</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o: OpportunityRun) => (
                <tr key={o.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3">
                    <Link
                      to="/console/pipeline"
                      className="text-white hover:text-[color:var(--color-primary)] hover:underline"
                    >
                      {o.title || o.stage}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{o.stage}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${toneClass(o.opportunity.tone)}`}>
                      {o.opportunity.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{dt(o.updated_at)}</td>
                  <td className="px-4 py-3">
                    {o.status === "in_review" && (
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => approve.mutate(o.id)}
                      >
                        Approva
                      </button>
                    )}
                    {o.status === "approved" && (
                      <button
                        className="btn btn-primary glow"
                        disabled={busy}
                        onClick={() => deliver.mutate(o.id)}
                      >
                        Consegna
                      </button>
                    )}
                    {o.status === "failed" && (
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => retry.mutate(o.id)}
                      >
                        Riprova
                      </button>
                    )}
                    {(o.status === "draft" || o.status === "in_progress") && (
                      <span className="text-[11px] text-[color:var(--color-muted)]">in lavorazione</span>
                    )}
                    {o.status === "delivered" && (
                      <span className="text-[11px] text-emerald-300">completata</span>
                    )}
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
