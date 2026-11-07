import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Receipt, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmptyState, ProgressBar } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import { useAccount, useBalance, useUsage } from "@/lib/platform-queries";
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "@/lib/utils";

const CAPABILITY_LABEL: Record<string, string> = {
  chat: "Chat",
  text: "Testo",
  image: "Immagini",
  video: "Video",
  tts: "Audio",
  embedding: "Embedding",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  succeeded: "success",
  completed: "success",
  pending: "warning",
  reserved: "warning",
  failed: "error",
  released: "info",
};

interface QuotaView {
  limitCredits: number;
  window: string;
  softPct: number;
  consumed: number;
}

function readQuota(quota: unknown): QuotaView | null {
  if (!quota || typeof quota !== "object") return null;
  const value = quota as Partial<QuotaView>;
  if (typeof value.limitCredits !== "number" || typeof value.consumed !== "number") return null;
  return {
    limitCredits: value.limitCredits,
    window: typeof value.window === "string" ? value.window : "month",
    softPct: typeof value.softPct === "number" ? value.softPct : 0,
    consumed: value.consumed,
  };
}

export default function SettingsBilling() {
  const account = useAccount();
  const balance = useBalance();
  const usage = useUsage(50);

  const events = usage.data?.events ?? [];
  const meteringOn = (usage.data as { metering?: boolean } | undefined)?.metering ?? null;
  const quota = useMemo(() => readQuota(balance.data?.quota), [balance.data?.quota]);
  const balanceValue = balance.data?.balance ?? null;
  const reservedValue = balance.data?.reserved ?? null;
  const availableValue = balance.data?.available ?? null;

  return (
    <PageTransition>
      <SettingsLayout
        title="Fatturazione"
        description="Saldo crediti, quota di consumo e piano del tenant: fatture e metodi di pagamento non sono esposti dal BFF."
      >
        <Card header={<h3 className="text-base font-semibold text-text-primary">Piano e tenant</h3>}>
          {account.isLoading ? (
            <Skeleton lines={3} />
          ) : (
            <dl className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
                <dt className="text-sm text-text-muted">Workspace</dt>
                <dd className="text-right text-sm font-medium text-text-primary">
                  {account.data?.tenantName ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
                <dt className="text-sm text-text-muted">Piano</dt>
                <dd className="text-right text-sm font-medium text-text-primary">
                  {account.data?.plan ?? "Nessun piano attivo"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
                <dt className="text-sm text-text-muted">Unita' di credito</dt>
                <dd className="text-right text-sm font-medium text-text-primary">
                  {formatNumber(account.data?.creditUnit ?? 1)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-text-muted">Blocco a saldo zero</dt>
                <dd className="text-right text-sm font-medium text-text-primary">
                  {account.data?.hardStopOnEmpty ? "Attivo" : "Disattivo"}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <Wallet className="h-4 w-4 text-secondary" aria-hidden="true" />
                Saldo crediti
              </h3>
              {meteringOn === false && <Badge variant="warning">Metering disattivato</Badge>}
            </>
          }
        >
          {balance.isLoading ? (
            <Skeleton lines={4} />
          ) : balance.isError ? (
            <EmptyState
              icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
              title="Saldo non raggiungibile"
              description="Il BFF non ha risposto sulla rotta crediti. Riprova fra poco."
              action={
                <Button variant="secondary" size="sm" onClick={() => balance.refetch()}>
                  Ricarica saldo
                </Button>
              }
            />
          ) : meteringOn === false ? (
            <EmptyState
              title="Saldo non disponibile"
              description="Il metering dei crediti e' disattivato su questa installazione: saldo, riserve e quota non vengono calcolati."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-text-muted">Saldo</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-text-primary">
                    {balanceValue === null ? "—" : formatNumber(balanceValue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Disponibile</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-text-primary">
                    {availableValue === null ? "—" : formatNumber(availableValue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Riservato</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-text-primary">
                    {reservedValue === null ? "—" : formatNumber(reservedValue)}
                  </p>
                </div>
              </div>

              {quota ? (
                <div className="flex flex-col gap-2">
                  <ProgressBar
                    value={quota.consumed}
                    max={quota.limitCredits}
                    label={`Quota ${quota.window === "day" ? "giornaliera" : "mensile"}`}
                  />
                  <p className="text-xs text-text-muted">
                    {formatNumber(quota.consumed)} crediti consumati su {formatNumber(quota.limitCredits)} ·{" "}
                    soglia di avviso al {formatPercent(quota.softPct, 0)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Nessuna quota configurata per questo tenant.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          header={
            <>
              <h3 className="text-base font-semibold text-text-primary">Consumo recente</h3>
              <span className="text-xs text-text-muted">{events.length} eventi</span>
            </>
          }
          bodyClassName="p-0"
        >
          {usage.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : usage.isError ? (
            <div className="p-5">
              <EmptyState
                icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
                title="Consumo non disponibile"
                description="Impossibile leggere lo storico eventi di consumo dal BFF."
                action={
                  <Button variant="secondary" size="sm" onClick={() => usage.refetch()}>
                    Ricarica consumo
                  </Button>
                }
              />
            </div>
          ) : events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
                title="Nessun evento di consumo"
                description="Gli usi di chat, immagini, audio e video compariranno qui con crediti e costo provider."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">Eventi di consumo del tenant</caption>
                <thead>
                  <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                    <th scope="col" className="py-2 pl-5 pr-4 font-medium">Data e ora</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Capability</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Provider</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Costo</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Crediti</th>
                    <th scope="col" className="py-2 pr-5 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-secondary/5">
                      <td className="whitespace-nowrap py-3 pl-5 pr-4 text-text-muted">
                        {formatDateTime(event.created_at)}
                      </td>
                      <td className="py-3 pr-4 text-text-primary">
                        {CAPABILITY_LABEL[event.capability] ?? event.capability}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {event.provider ?? "—"}
                        {event.model ? (
                          <span className="text-xs text-text-muted"> · {event.model}</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {formatCurrency(Number(event.price_eur ?? 0))}
                      </td>
                      <td className="py-3 pr-4 font-medium text-text-primary">
                        {formatNumber(Number(event.credits))}
                      </td>
                      <td className="py-3 pr-5">
                        <Badge variant={STATUS_VARIANT[event.status] ?? "default"}>{event.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card header={<h3 className="text-base font-semibold text-text-primary">Fatture</h3>}>
          <EmptyState
            icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
            title="Fatture e metodi di pagamento non disponibili"
            description="Il BFF non espone un ledger di fatturazione e Stripe non e' configurato su questa installazione. Il consumo resta comunque visibile qui sopra."
            action={
              <Link to="/account" className="text-sm font-medium text-secondary hover:underline">
                Apri il riepilogo account
              </Link>
            }
          />
        </Card>
      </SettingsLayout>
    </PageTransition>
  );
}
