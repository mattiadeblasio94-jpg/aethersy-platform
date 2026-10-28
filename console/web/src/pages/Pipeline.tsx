import { useState } from "react";
import {
  useApproveRun,
  useDeliverRun,
  useExecuteRun,
  useExportRun,
  useOpenRun,
  usePipelineRuns,
  useRetryRun,
  useRunDetail,
  useStages,
} from "../lib/query";
import type { RunDetail, StageSpec } from "../lib/types";

const RUN_STATUSES = [
  { key: "", label: "Tutti" },
  { key: "draft", label: "Bozza" },
  { key: "in_progress", label: "In corso" },
  { key: "in_review", label: "In revisione" },
  { key: "approved", label: "Approvati" },
  { key: "delivered", label: "Consegnati" },
  { key: "failed", label: "Falliti" },
];

function RunStatusBadge({ status }: { status: string }) {
  const color =
    status === "delivered"
      ? "text-emerald-300 border-emerald-500/40"
      : status === "approved"
        ? "text-[--color-primary] border-[--color-primary]/40"
        : status === "in_review"
          ? "text-[--color-accent] border-[--color-accent]/40"
          : status === "in_progress"
            ? "text-[--color-primary] border-[--color-primary]/40"
            : status === "failed"
              ? "text-red-300 border-red-500/40"
              : "text-[--color-muted] border-[--color-border]";
  return <span className={`badge ${color}`}>{status}</span>;
}

function eur(v: number): string {
  return `${v.toFixed(4)} €`;
}

export default function Pipeline() {
  const [stage, setStage] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);

  const stages = useStages();
  const runs = usePipelineRuns({ stage: stage || undefined, status: status || undefined });
  const open = useOpenRun();
  const [openError, setOpenError] = useState<string | null>(null);

  const specs = stages.data?.stages ?? [];

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Pipeline</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Stadi Brand → Sito → Contenuti → Social. Ogni run produce deliverable soggetti ad
          approvazione umana prima della consegna.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-[--color-muted]">
          Avvia un nuovo stadio
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {specs.map((s) => (
            <StageCard
              key={s.id}
              spec={s}
              disabled={open.isPending}
              onOpen={() => {
                setOpenError(null);
                open.mutate(
                  { stage: s.id, title: `${s.title} — ${new Date().toLocaleDateString("it-IT")}` },
                  {
                    onSuccess: (run) => setSelected(run.id),
                    onError: (e) => setOpenError((e as Error).message),
                  },
                );
              }}
            />
          ))}
          {!specs.length && (
            <div className="card p-5 text-sm text-[--color-muted]">Caricamento stadi…</div>
          )}
        </div>
        {openError && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {openError}
          </div>
        )}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Tutti gli stadi</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {RUN_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="card overflow-hidden">
          {runs.isLoading ? (
            <div className="p-6 text-sm text-[--color-muted]">Caricamento…</div>
          ) : !runs.data?.length ? (
            <div className="p-6 text-sm text-[--color-muted]">
              Nessun run. Avvia uno stadio qui sopra.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[--color-muted]">
                <tr>
                  <th className="px-4 py-3">Titolo</th>
                  <th className="px-4 py-3">Stadio</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Creato</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={`cursor-pointer border-t border-[--color-border] hover:bg-[rgba(0,164,255,0.06)] ${
                      selected === r.id ? "bg-[rgba(0,212,255,0.08)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-white">{r.title || "—"}</td>
                    <td className="px-4 py-3 text-[--color-muted]">{r.stage}</td>
                    <td className="px-4 py-3">
                      <RunStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[--color-muted]">
                      {new Date(r.created_at).toLocaleString("it-IT")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <RunPanel runId={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function StageCard({
  spec,
  onOpen,
  disabled,
}: {
  spec: StageSpec;
  onOpen: () => void;
  disabled: boolean;
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-white">{spec.title}</h3>
        <span className="text-[11px] text-[--color-muted]">intensità {spec.intensity}</span>
      </div>
      <p className="mt-1 flex-1 text-xs text-[--color-muted]">{spec.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {spec.droids.map((d) => (
          <span key={d} className="badge text-[--color-primary] border-[--color-primary]/30">
            {d}
          </span>
        ))}
      </div>
      <button className="btn btn-primary mt-4 justify-center" disabled={disabled} onClick={onOpen}>
        Apri run
      </button>
    </div>
  );
}

function RunPanel({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const detail = useRunDetail(runId ?? undefined);

  if (!runId) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Dettaglio run</h2>
        <p className="mt-2 text-sm text-[--color-muted]">
          Seleziona un run per vedere task, deliverable e consumo.
        </p>
      </div>
    );
  }
  if (detail.isLoading) return <div className="card p-6 text-sm text-[--color-muted]">Caricamento…</div>;
  if (!detail.data) return <div className="card p-6 text-sm text-red-300">Run non trovato.</div>;

  return <RunDetailView key={runId} detail={detail.data} onClose={onClose} />;
}

function RunDetailView({ detail, onClose }: { detail: RunDetail; onClose: () => void }) {
  const { run, tasks, assets, usage } = detail;
  const execute = useExecuteRun();
  const approve = useApproveRun();
  const deliver = useDeliverRun();
  const retry = useRetryRun();
  const exportRun = useExportRun();
  const [error, setError] = useState<string | null>(null);

  const pending = tasks.filter((t) => t.status === "pending" || t.status === "failed").length;
  const busy = execute.isPending || approve.isPending || deliver.isPending || retry.isPending;
  const exportable = run.status === "approved" || run.status === "delivered";

  function act(fn: () => void) {
    setError(null);
    fn();
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">{run.title || "Run"}</h2>
          <p className="mt-1 text-xs text-[--color-muted]">
            {run.stage} · creato {new Date(run.created_at).toLocaleString("it-IT")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RunStatusBadge status={run.status} />
          <button className="btn btn-ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          className="btn btn-ghost"
          disabled={busy || pending === 0}
          onClick={() =>
            act(() =>
              execute.mutate(
                { runId: run.id, continueOnError: true },
                { onError: (e) => setError((e as Error).message) },
              ),
            )
          }
        >
          Esegui task ({pending})
        </button>
        {run.status === "in_review" && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              act(() =>
                approve.mutate(run.id, { onError: (e) => setError((e as Error).message) }),
              )
            }
          >
            Approva
          </button>
        )}
        {run.status === "approved" && (
          <button
            className="btn btn-primary glow"
            disabled={busy}
            onClick={() =>
              act(() =>
                deliver.mutate(run.id, { onError: (e) => setError((e as Error).message) }),
              )
            }
          >
            Consegna
          </button>
        )}
        {run.status === "failed" && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              act(() => retry.mutate(run.id, { onError: (e) => setError((e as Error).message) }))
            }
          >
            Riprova
          </button>
        )}
        {exportable && (
          <button
            className="btn btn-ghost"
            disabled={exportRun.isPending}
            onClick={() =>
              act(() =>
                exportRun.mutate(run.id, { onError: (e) => setError((e as Error).message) }),
              )
            }
          >
            Esporta pacchetto
          </button>
        )}
      </div>

      <section className="mb-5">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[--color-muted]">
          Task ({tasks.length})
        </h3>
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-[--color-border] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-white">
                  <span className="mr-2 text-[--color-primary]">{t.seq}</span>
                  {t.title}
                </div>
                <div className="text-[11px] text-[--color-muted]">droid {t.droid}</div>
                {t.error && <div className="text-[11px] text-red-300">{t.error}</div>}
              </div>
              <span className={`badge ${taskColor(t.status)}`}>{t.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-5">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[--color-muted]">
          Consumo del run
        </h3>
        {!usage.byCapability.length ? (
          <p className="text-sm text-[--color-muted]">Nessun consumo registrato.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-[--color-muted]">
              <tr>
                <th className="pb-2">Capacità</th>
                <th className="pb-2">Richieste</th>
                <th className="pb-2">Crediti</th>
                <th className="pb-2">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              {usage.byCapability.map((c) => (
                <tr key={c.capability} className="border-t border-[--color-border]">
                  <td className="py-2 text-white">{c.capability}</td>
                  <td className="py-2 text-[--color-muted]">{c.requests}</td>
                  <td className="py-2 text-[--color-muted]">{c.credits}</td>
                  <td className="py-2 text-[--color-muted]">{eur(c.price_eur)}</td>
                </tr>
              ))}
              <tr className="border-t border-[--color-border] font-semibold">
                <td className="py-2 text-white">Totale</td>
                <td className="py-2 text-white">{usage.totals.requests}</td>
                <td className="py-2 text-white">{usage.totals.credits}</td>
                <td className="py-2 text-[--color-primary]">{eur(usage.totals.price_eur)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-[--color-muted]">
          Deliverable ({assets.length})
        </h3>
        {!assets.length ? (
          <p className="text-sm text-[--color-muted]">Nessun deliverable ancora prodotto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-[--color-border] px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-white">{a.name}</span>
                <span className="ml-3 shrink-0 text-[11px] text-[--color-muted]">
                  v{a.version} · {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function taskColor(status: string): string {
  return status === "done"
    ? "text-emerald-300 border-emerald-500/40"
    : status === "failed"
      ? "text-red-300 border-red-500/40"
      : status === "running"
        ? "text-[--color-primary] border-[--color-primary]/40"
        : "text-[--color-muted] border-[--color-border]";
}
