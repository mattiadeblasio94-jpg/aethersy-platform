// =============================================================================
// Pannello di controllo (admin) — andamento della piattaforma.
//
// Dati reali da GET /api/platform/admin/overview (visibile solo agli admin):
// utenti e tenant, richieste degli ultimi 30 giorni, ricavo addebitato, costo
// reale dei provider, consumi per provider/capabilita', costi per utente e
// ultimi eventi di consumo. L'admin non viene addebitato: il suo consumo resta
// visibile qui ma non genera crediti scalati.
// =============================================================================

import { useMemo } from "react";
import {
  Activity,
  Banknote,
  Coins,
  Cpu,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useAdminOverview } from "@/lib/platform-queries";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

export default function Admin() {
  const overview = useAdminOverview();
  const data = overview.data;

  const margin = useMemo(() => {
    if (!data) return null;
    const revenue = data.totals.revenueEur;
    const cost = data.totals.providerCostUsd;
    if (revenue <= 0) return null;
    return ((revenue - cost) / revenue) * 100;
  }, [data]);

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (overview.isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pannello di controllo"
          description="Accesso riservato agli amministratori della piattaforma."
        />
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Dati non disponibili"
          description="Il pannello richiede il ruolo di amministratore e il metering attivo."
        />
      </div>
    );
  }

  if (!data) return null;

  const totals = data.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pannello di controllo"
        description={`Andamento degli ultimi 30 giorni: ${formatNumber(
          totals.requests30d,
        )} richieste su ${formatNumber(totals.activeTenants30d)} tenant attivi. Aggiornato ${formatDateTime(
          data.generatedAt,
        )}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Richieste AI (30gg)"
          value={formatNumber(totals.requests30d)}
          icon={<Activity className="h-5 w-5 text-primary" />}
          hint={`${formatNumber(totals.exemptedRequests30d)} non addebitate (admin)`}
        />
        <KpiCard
          label="Ricavo addebitato (30gg)"
          value={formatCurrency(totals.revenueEur)}
          icon={<Banknote className="h-5 w-5 text-success" />}
          hint={margin === null ? "—" : `Margine lordo ${margin.toFixed(1)}%`}
        />
        <KpiCard
          label="Costo provider (30gg)"
          value={`${totals.providerCostUsd.toFixed(4)} USD`}
          icon={<Cpu className="h-5 w-5 text-warning" />}
          hint="Costo reale OpenRouter, NVIDIA, z.ai, Venice, fal.ai, Replicate"
        />
        <KpiCard
          label="Crediti in circolazione"
          value={formatNumber(totals.outstandingCredits)}
          icon={<Coins className="h-5 w-5 text-primary" />}
          hint="Crediti acquistati e non ancora consumati"
        />
        <KpiCard
          label="Tenant"
          value={formatNumber(totals.tenants)}
          icon={<Wallet className="h-5 w-5 text-primary" />}
          hint={`${formatNumber(totals.activeTenants30d)} attivi negli ultimi 30 giorni`}
        />
        <KpiCard
          label="Utenti registrati"
          value={formatNumber(totals.users)}
          icon={<Users className="h-5 w-5 text-primary" />}
          hint="Contabilita' per utente nella tabella qui sotto"
        />
        <KpiCard
          label="Margine lordo (30gg)"
          value={margin === null ? "—" : `${margin.toFixed(1)}%`}
          icon={<TrendingUp className="h-5 w-5 text-success" />}
          hint="Ricavo addebitato rispetto al costo provider"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Consumi per provider
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Costo reale del provider e ricavo addebitato agli utenti (30 giorni).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2">Provider</th>
                  <th className="py-2 text-right">Richieste</th>
                  <th className="py-2 text-right">Costo provider</th>
                  <th className="py-2 text-right">Ricavo</th>
                  <th className="py-2 text-right">Crediti</th>
                </tr>
              </thead>
              <tbody>
                {data.byProvider.map((row) => (
                  <tr key={row.provider} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium text-text-primary">{row.provider}</td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.requests)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {row.providerCostUsd.toFixed(4)} USD
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatCurrency(row.priceEur)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.credits)}
                    </td>
                  </tr>
                ))}
                {data.byProvider.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      Nessun consumo registrato negli ultimi 30 giorni.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Consumi per capacita'
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Cosa viene usato davvero (testo, generazione, TTS, orchestrazione).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2">Capacita'</th>
                  <th className="py-2 text-right">Richieste</th>
                  <th className="py-2 text-right">Costo provider</th>
                  <th className="py-2 text-right">Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {data.byCapability.map((row) => (
                  <tr key={row.capability} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium text-text-primary">{row.capability}</td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.requests)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {row.providerCostUsd.toFixed(4)} USD
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatCurrency(row.priceEur)}
                    </td>
                  </tr>
                ))}
                {data.byCapability.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-text-muted">
                      Nessun consumo registrato negli ultimi 30 giorni.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Costi per utente
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Ogni utente che consuma viene addebitato sul proprio tenant. Gli admin
            non vengono addebitati.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2">Utente</th>
                  <th className="py-2 text-right">Richieste</th>
                  <th className="py-2 text-right">Costo provider</th>
                  <th className="py-2 text-right">Addebitato</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((row) => (
                  <tr key={row.email} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium text-text-primary">{row.email}</td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.requests30d)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {row.providerCostUsd.toFixed(4)} USD
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatCurrency(row.priceEur)}
                    </td>
                  </tr>
                ))}
                {data.topUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-text-muted">
                      Nessun consumo per utente negli ultimi 30 giorni.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-text-primary">Tenant</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Tenant per attivita' e saldo crediti residuo.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2">Tenant</th>
                  <th className="py-2 text-right">Utenti</th>
                  <th className="py-2 text-right">Richieste</th>
                  <th className="py-2 text-right">Ricavo</th>
                  <th className="py-2 text-right">Saldo crediti</th>
                </tr>
              </thead>
              <tbody>
                {data.topTenants.map((row) => (
                  <tr key={row.tenantId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium text-text-primary">
                      {row.tenantName}
                      {row.plan === "admin" && (
                        <Badge variant="info" className="ml-2">
                          admin
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-right text-text-secondary">{row.users}</td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.requests30d)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatCurrency(row.priceEur)}
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {formatNumber(row.balanceCredits)}
                    </td>
                  </tr>
                ))}
                {data.topTenants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      Nessun tenant registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          Ultimi consumi
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Ultimi eventi registrati sul ledger di consumo.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2">Quando</th>
                <th className="py-2">Utente</th>
                <th className="py-2">Tenant</th>
                <th className="py-2">Provider / modello</th>
                <th className="py-2 text-right">Costo</th>
                <th className="py-2 text-right">Addebitato</th>
                <th className="py-2">Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 text-text-secondary">{formatDateTime(row.createdAt)}</td>
                  <td className="py-2 text-text-primary">{row.userEmail ?? "-"}</td>
                  <td className="py-2 text-text-secondary">{row.tenantName}</td>
                  <td className="py-2 text-text-secondary">
                    {row.provider} / {row.model}
                  </td>
                  <td className="py-2 text-right text-text-secondary">
                    {row.providerCostUsd.toFixed(4)} USD
                  </td>
                  <td className="py-2 text-right text-text-secondary">
                    {formatCurrency(row.priceEur)}
                  </td>
                  <td className="py-2">
                    <Badge variant={row.status === "success" ? "success" : "warning"}>
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {data.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-text-muted">
                    Nessun evento registrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
