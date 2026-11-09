import { Link } from "react-router-dom";
import { usePulse, useRoster } from "../lib/query";
import type { OpportunityRun, ScheduleEntry } from "../lib/types";

// Business Pulse: lo stato dell'azienda-cliente in un colpo d'occhio. Aggrega i
// contatori reali della pipeline (run, task, asset, lead), il saldo crediti,
// l'agenda imminente e le opportunita' che richiedono un'azione umana (HITL).
// Modello pazi.ai "Business Pulse", alimentato dalle entita' reali di Aethersy.

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

function dt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold ${accent ? "text-[color:var(--color-primary)]" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function Pulse() {
  const pulse = usePulse();
  const roster = useRoster();

  if (pulse.isLoading) {
    return <div className="p-8 text-[color:var(--color-muted)]">Caricamento Business Pulse…</div>;
  }
  if (pulse.isError) {
    return (
      <div className="card p-6 text-sm text-red-300">
        Impossibile leggere il Business Pulse: {(pulse.error as Error).message}
      </div>
    );
  }

  const p = pulse.data!;
  const c = p.counters;
  const quota = p.credits.quota;
  const usedPct = quota && quota.limitCredits > 0 ? quota.consumed / quota.limitCredits : 0;
  const activeDroids = (roster.data ?? []).filter((d) => d.tasks > 0).length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Business Pulse</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Stato dell'azienda in tempo reale: cosa è in corso, cosa attende una tua decisione,
          cosa è pronto e quanto costa.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Opportunità aperte" value={c.runs.open} accent />
        <Stat label="In attesa di input" value={c.runs.awaitingInput} />
        <Stat label="Deliverable approvati" value={c.assets.approved} />
        <Stat label="Lead nuovi" value={c.leads.new} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Task in corso" value={c.tasks.running} />
        <Stat label="Task falliti" value={c.tasks.failed} />
        <Stat label="Voci in agenda" value={c.schedule.active} />
        <Stat label="Specialisti attivi" value={activeDroids} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Da gestire ora</h2>
            <Link to="/console/opportunities" className="text-xs text-[color:var(--color-primary)] hover:underline">
              Tutte le opportunità →
            </Link>
          </div>
          {!p.attention.length ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              Nulla in attesa di decisione. La pipeline procede da sola.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {p.attention.map((o: OpportunityRun) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{o.title || o.stage}</div>
                    <div className="text-[11px] text-[color:var(--color-muted)]">
                      {o.stage} · aggiornato {dt(o.updated_at)}
                    </div>
                  </div>
                  <span className={`badge ${toneClass(o.opportunity.tone)}`}>
                    {o.opportunity.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Agenda</h2>
            <Link to="/console/schedule" className="text-xs text-[color:var(--color-primary)] hover:underline">
              Tasks & Calendar →
            </Link>
          </div>
          {!p.upcoming.length ? (
            <p className="text-sm text-[color:var(--color-muted)]">Nessuna attività pianificata.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {p.upcoming.map((s: ScheduleEntry) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{s.title}</div>
                    <div className="text-[11px] text-[color:var(--color-muted)]">
                      {s.cron ? `cron ${s.cron}` : "una tantum"} · {s.timezone}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-[color:var(--color-primary)]">
                    {dt(s.nextRunAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-8 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Consumo e credito</h2>
          <Link to="/console/credits" className="text-xs text-[color:var(--color-primary)] hover:underline">
            Crediti →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Saldo</div>
            <div className="mt-1 text-2xl font-semibold text-white">{p.credits.balance}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Prenotato</div>
            <div className="mt-1 text-2xl font-semibold text-white">{p.credits.reserved}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Disponibile</div>
            <div className="mt-1 text-2xl font-semibold text-[color:var(--color-primary)]">
              {p.credits.available}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">Quota</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {quota ? `${Math.round(usedPct * 100)}%` : "—"}
            </div>
          </div>
        </div>
        {quota && (
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.35)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round(usedPct * 100))}%`,
                background:
                  usedPct >= 1
                    ? "#ff5c5c"
                    : usedPct >= quota.softPct / 100
                      ? "var(--color-accent)"
                      : "var(--color-primary)",
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
