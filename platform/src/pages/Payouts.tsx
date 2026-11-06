// =============================================================================
// Pagamenti e consumi (IA pazi "Payouts"). Dati reali dal BFF: /api/ai/balance
// (saldo, riserve, disponibile) e /api/ai/usage (eventi di consumo con crediti,
// prezzo EUR e provider). Nessun endpoint ledger/billing esposto: la pagina
// mostra il consumo osservabile, non le payout Stripe.
// =============================================================================

import { useMemo, useState } from "react";
import { Coins, CreditCard, Receipt, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useBalance, useUsage } from "@/lib/platform-queries";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

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

export default function Payouts() {
  const [tab, setTab] = useState("events");
  const balance = useBalance();
  const usage = useUsage(100);

  const events = usage.data?.events ?? [];

  const totals = useMemo(() => {
    const spent = events.reduce((sum, event) => sum + Number(event.credits ?? 0), 0);
    const eur = events.reduce((sum, event) => sum + Number(event.price_eur ?? 0), 0);
    const byCapability = new Map<string, number>();
    for (const event of events) {
      const key = event.capability ?? "altro";
      byCapability.set(key, (byCapability.get(key) ?? 0) + Number(event.credits ?? 0));
    }
    return {
      spent,
      eur,
      byCapability: [...byCapability.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [events]);

  const tabs = [
    { value: "events", label: "Eventi di consumo", badge: String(events.length) },
    { value: "byCapability", label: "Per categoria", badge: String(totals.byCapability.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pagamenti e consumi"
        description="Saldo crediti, riserve in corso e consumo per capability: ogni evento e' imputato al tenant."
      />

      <section aria-label="Statistiche credito" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Saldo"
          value={`${formatNumber(balance.data?.balance ?? 0)} crediti`}
          icon={<Wallet className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Disponibile" value={`${formatNumber(balance.data?.available ?? 0)} crediti`} />
        <KpiCard
          label="Riservato"
          value={`${formatNumber(balance.data?.reserved ?? 0)} crediti`}
          hint="prenotazioni in corso"
        />
        <KpiCard
          label="Costo provider"
          value={formatCurrency(totals.eur)}
          icon={<Coins className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs items={tabs} value={tab} onValueChange={setTab} />
      </Card>

      {tab === "events" ? (
        usage.isLoading ? (
          <Card bodyClassName="p-5">
            <Skeleton lines={8} />
          </Card>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
            title="Nessun evento di consumo"
            description="Gli usi di chat, immagini e video compariranno qui con crediti e costo provider."
          />
        ) : (
          <Card bodyClassName="p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-secondary/10 text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Data
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Capability
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Provider / modello
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Costo
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Crediti
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Stato
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary/10">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-5 py-3 text-text-muted">{formatDateTime(event.created_at)}</td>
                    <td className="px-5 py-3 text-text-primary">
                      {CAPABILITY_LABEL[event.capability] ?? event.capability}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {event.provider ?? "—"}
                      {event.model ? (
                        <span className="text-xs text-text-muted"> · {event.model}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {formatCurrency(Number(event.price_eur ?? 0))}
                    </td>
                    <td className="px-5 py-3 font-medium text-text-primary">
                      {formatNumber(Number(event.credits))}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={STATUS_VARIANT[event.status] ?? "default"}>
                        {event.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {totals.byCapability.map(([capability, credits]) => (
            <Card key={capability} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-secondary" aria-hidden="true" />
                <h2 className="text-sm font-medium text-text-primary">
                  {CAPABILITY_LABEL[capability] ?? capability}
                </h2>
              </div>
              <p className="text-2xl font-semibold text-text-primary">
                {formatNumber(credits)} <span className="text-sm font-normal text-text-muted">crediti</span>
              </p>
              <p className="text-xs text-text-muted">
                {totals.spent > 0 ? Math.round((credits / totals.spent) * 100) : 0}% del consumo
                osservato
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
