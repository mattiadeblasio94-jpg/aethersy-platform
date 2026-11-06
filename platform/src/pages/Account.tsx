// =============================================================================
// Account (IA pazi "Account"). Dati reali dal BFF: edge platform.account
// (tenant, piano, saldo, markup, unita' di credito, stop a saldo zero) e
// platform.faq (domande frequenti su billing e abbonamento).
// =============================================================================

import { useMemo, useState } from "react";
import { Building2, HelpCircle, ShieldAlert, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useAccount, useFaq } from "@/lib/platform-queries";
import { formatNumber } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Fatturazione",
  subscription: "Abbonamento",
  usage: "Consumo",
  general: "Generale",
};

export default function Account() {
  const [tab, setTab] = useState("details");
  const account = useAccount();
  const faq = useFaq();

  const faqs = faq.data?.faqs ?? [];

  const stats = useMemo(
    () => ({
      balance: account.data?.balance ?? 0,
      reserved: account.data?.reserved ?? 0,
      available: account.data?.available ?? 0,
      markupBps: account.data?.markupBps ?? 0,
    }),
    [account.data],
  );

  const tabs = [
    { value: "details", label: "Dettagli" },
    { value: "faq", label: "FAQ", badge: String(faqs.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account"
        description="Tenant, piano, regole di addebito e domande frequenti su crediti e fatturazione."
      />

      <section aria-label="Statistiche account" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Saldo"
          value={`${formatNumber(stats.balance)} crediti`}
          icon={<Wallet className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Disponibile" value={`${formatNumber(stats.available)} crediti`} />
        <KpiCard label="Riservato" value={`${formatNumber(stats.reserved)} crediti`} />
        <KpiCard
          label="Markup"
          value={`${(stats.markupBps / 100).toFixed(0)}%`}
          hint="su costo provider"
          icon={<ShieldAlert className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs items={tabs} value={tab} onValueChange={setTab} />
      </Card>

      {tab === "details" ? (
        account.isLoading ? (
          <Card bodyClassName="p-5">
            <Skeleton lines={8} />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-secondary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-text-primary">Workspace</h2>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-text-muted">Tenant</dt>
                  <dd className="text-text-primary">{account.data?.tenantName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Piano</dt>
                  <dd>
                    <Badge variant="accent">{account.data?.plan ?? "—"}</Badge>
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-text-muted">Tenant ID</dt>
                  <dd className="font-mono text-xs text-text-secondary">{account.data?.tenantId ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-text-muted">Riferimento fatturazione</dt>
                  <dd className="font-mono text-xs text-text-secondary">
                    {account.data?.billingCustomerRef ?? "non impostato"}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-secondary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-text-primary">Regole di addebito</h2>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-text-muted">Unita' di credito</dt>
                  <dd className="text-text-primary">
                    {formatNumber(account.data?.creditUnit ?? 0)} EUR per credito
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Markup applicato</dt>
                  <dd className="text-text-primary">
                    {((account.data?.markupBps ?? 0) / 100).toFixed(0)}%
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-text-muted">Stop a saldo zero</dt>
                  <dd>
                    <Badge variant={account.data?.hardStopOnEmpty ? "error" : "success"}>
                      {account.data?.hardStopOnEmpty ? "attivo" : "disattivato"}
                    </Badge>
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-text-muted">Quota</dt>
                  <dd className="text-text-secondary">
                    {account.data?.quota ? JSON.stringify(account.data.quota) : "nessuna quota"}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        )
      ) : faq.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : faqs.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="h-5 w-5" aria-hidden="true" />}
          title="Nessuna domanda frequente"
          description="Le risposte su billing, abbonamento e consumo compariranno qui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map((item) => (
            <Card key={item.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-text-primary">{item.question}</h2>
                <Badge variant="default">{CATEGORY_LABEL[item.category] ?? item.category}</Badge>
              </div>
              <p className="text-sm text-text-secondary">{item.answer}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
