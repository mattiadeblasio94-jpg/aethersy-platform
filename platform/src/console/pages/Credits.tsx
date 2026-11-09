import { useCreditBalance, useUsageEvents } from "../lib/query";

function eur(v: number): string {
  return `${v.toFixed(4)} €`;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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

export default function Credits() {
  const balance = useCreditBalance();
  const usage = useUsageEvents(50);

  const b = balance.data;
  const quota = b?.quota ?? null;
  const usedPct = quota && quota.limitCredits > 0 ? quota.consumed / quota.limitCredits : 0;

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Crediti e consumo</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Modello a consumo: 1 credito = 0,0001 €. Ogni chiamata AI è metrata e addebitata sul saldo.
        </p>
      </header>

      {!b?.metering ? (
        <div className="card p-6 text-sm text-[color:var(--color-muted)]">
          Metering disattivato (`METERING_ENABLED=false`): il consumo non viene registrato.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Saldo" value={b.balance !== null ? String(b.balance) : "—"} accent />
            <Metric label="Prenotato" value={String(b.reserved ?? 0)} />
            <Metric label="Disponibile" value={b.available !== null ? String(b.available) : "—"} />
            <Metric label="Tenant" value={b.tenant ?? "—"} />
          </div>

          <section className="card mt-8 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Quota</h2>
            {!quota ? (
              <p className="text-sm text-[color:var(--color-muted)]">
                Nessuna quota impostata: il consumo è limitato solo dal saldo.
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[color:var(--color-muted)]">
                    {quota.consumed} / {quota.limitCredits} crediti ({quota.window === "day" ? "giornaliera" : "mensile"})
                  </span>
                  <span className="text-white">{Math.round(usedPct * 100)}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.35)]">
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
                <p className="mt-2 text-xs text-[color:var(--color-muted)]">
                  Soglia soft {quota.softPct}%: oltre, il router degrada ai modelli gratuiti; al 100%
                  le richieste sono respinte (402).
                </p>
              </>
            )}
          </section>
        </>
      )}

      <section className="card mt-8 overflow-hidden">
        <div className="p-6 pb-3">
          <h2 className="text-lg font-semibold text-white">Ultimi eventi di consumo</h2>
        </div>
        {usage.isLoading ? (
          <div className="p-6 pt-0 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
        ) : !usage.data?.events.length ? (
          <div className="p-6 pt-0 text-sm text-[color:var(--color-muted)]">Nessun consumo registrato.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Capacità</th>
                <th className="px-4 py-3">Modello</th>
                <th className="px-4 py-3">Unità</th>
                <th className="px-4 py-3">Crediti</th>
                <th className="px-4 py-3">Prezzo</th>
                <th className="px-4 py-3">Esito</th>
              </tr>
            </thead>
            <tbody>
              {usage.data.events.map((e) => (
                <tr key={e.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">
                    {new Date(e.created_at).toLocaleString("it-IT")}
                  </td>
                  <td className="px-4 py-3 text-white">{e.capability}</td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{e.model ?? "—"}</td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">
                    {e.billable_units} {e.unit}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{e.credits}</td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{eur(Number(e.price_eur))}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        e.status === "success"
                          ? "text-emerald-300 border-emerald-500/40"
                          : "text-red-300 border-red-500/40"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
