// =============================================================================
// Analisi — solo dati reali dal BFF.
//
// Contatori dal Business Pulse (GET /api/platform/overview), consumo reale
// (GET /api/ai/usage), riepilogo social (GET /api/platform/social/summary) e
// lead reali (GET /api/pipeline/leads). Non esistono serie storiche per
// canale nel BFF: i valori reali sono mostrati in elenchi e tabelle, e i
// grafici usano solo eventi di consumo effettivamente registrati.
// =============================================================================

import { useMemo } from "react";
import { Activity, AlertTriangle, Coins, Share2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { BarChart } from "@/components/charts/Charts";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useLeads, useOverview, useSocialSummary, useUsage } from "@/lib/platform-queries";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/utils";

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  qualified: "Qualificato",
  won: "Acquisito",
  lost: "Perso",
  spam: "Spam",
};

const POST_STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  in_review: "In revisione",
  approved: "Approvato",
  rejected: "Rifiutato",
  delivered: "Consegnato",
};

export default function Analytics() {
  const overview = useOverview();
  const usage = useUsage(100);
  const social = useSocialSummary();
  const leads = useLeads();

  const events = usage.data?.events ?? [];
  const counters = overview.data?.counters;
  const leadRows = leads.data ?? [];

  const byCapability = useMemo(() => {
    const map = new Map<string, { credits: number; events: number; eur: number }>();
    for (const event of events) {
      const key = event.capability || "altro";
      const current = map.get(key) ?? { credits: 0, events: 0, eur: 0 };
      current.credits += Number(event.credits ?? 0);
      current.events += 1;
      current.eur += Number(event.price_eur ?? 0);
      map.set(key, current);
    }
    return [...map.entries()]
      .map(([capability, value]) => ({ capability, ...value }))
      .sort((a, b) => b.credits - a.credits);
  }, [events]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const day = event.created_at.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + Number(event.credits ?? 0));
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, value]) => ({ label: formatDate(day), value }));
  }, [events]);

  const totalCredits = useMemo(
    () => events.reduce((sum, event) => sum + Number(event.credits ?? 0), 0),
    [events],
  );

  const leadCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leadRows) {
      map.set(lead.status, (map.get(lead.status) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [leadRows]);

  const postCounts = useMemo(
    () => Object.entries(social.data?.postsByStatus ?? {}),
    [social.data],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analisi"
        description="Numeri reali del workspace: consumo crediti, attivita' della pipeline, social e lead."
      />

      <section aria-label="KPI analisi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading && usage.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Crediti consumati"
              value={formatNumber(totalCredits)}
              icon={<Coins className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="eventi di consumo registrati"
            />
            <KpiCard
              label="Task in corso"
              value={formatNumber(counters?.tasks.running ?? 0)}
              icon={<Activity className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint={`${formatNumber(counters?.tasks.total ?? 0)} task totali`}
            />
            <KpiCard
              label="Lead"
              value={formatNumber(counters?.leads.total ?? 0)}
              icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint={`${formatNumber(counters?.leads.new ?? 0)} nuovi`}
            />
            <KpiCard
              label="Post social"
              value={formatNumber(social.data?.totalPosts ?? 0)}
              icon={<Share2 className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint={`${formatNumber(social.data?.totalScheduled ?? 0)} programmati`}
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Consumo per capability</h2>
              <span className="text-xs text-text-muted">{events.length} eventi</span>
            </>
          }
          bodyClassName="p-0"
        >
          {usage.isLoading ? (
            <div className="p-5">
              <Skeleton lines={4} />
            </div>
          ) : byCapability.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Coins className="h-5 w-5" aria-hidden="true" />}
                title="Nessun consumo registrato"
                description="Gli usi reali di chat, immagini e video compariranno qui con crediti e costo provider."
              />
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Consumo reale per capability</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Capability</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Eventi</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Costo provider</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Crediti</th>
                </tr>
              </thead>
              <tbody>
                {byCapability.map((row) => (
                  <tr key={row.capability} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4 font-medium text-text-primary">
                      {row.capability}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{formatNumber(row.events)}</td>
                    <td className="py-3 pr-4 text-text-secondary">{formatCurrency(row.eur)}</td>
                    <td className="py-3 pr-5 text-right font-medium text-text-primary">
                      {formatNumber(row.credits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">
                Crediti consumati per giorno
              </h2>
              <span className="text-xs text-text-muted">eventi di consumo reali</span>
            </>
          }
        >
          {usage.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : byDay.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-5 w-5" aria-hidden="true" />}
              title="Nessuna serie disponibile"
              description="Il grafico viene costruito dagli eventi di consumo registrati: senza eventi non c'e' nulla da mostrare."
            />
          ) : (
            <BarChart
              data={byDay}
              height={200}
              ariaLabel="Crediti consumati per giorno"
              valueFormatter={(value) => `${formatNumber(value)} crediti`}
            />
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Social</h2>
              <span className="text-xs text-text-muted">
                ultimo post {social.data?.lastPostAt ? formatDate(social.data.lastPostAt) : "—"}
              </span>
            </>
          }
        >
          {social.isLoading ? (
            <Skeleton lines={4} />
          ) : (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-primary/40 px-3 py-2">
                  <dt className="text-xs text-text-muted">Post prodotti</dt>
                  <dd className="font-semibold text-text-primary">
                    {formatNumber(social.data?.totalPosts ?? 0)}
                  </dd>
                </div>
                <div className="rounded-lg bg-primary/40 px-3 py-2">
                  <dt className="text-xs text-text-muted">Pubblicazioni programmate</dt>
                  <dd className="font-semibold text-text-primary">
                    {formatNumber(social.data?.totalScheduled ?? 0)}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Post per stato
                </p>
                {postCounts.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Nessun post prodotto: il primo deliverable social apparira' qui.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {postCounts.map(([status, count]) => (
                      <li
                        key={status}
                        className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                      >
                        <span className="text-text-secondary">
                          {POST_STATUS_LABEL[status] ?? status}
                        </span>
                        <Badge variant="default">{formatNumber(count)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Programmazioni per stato
                </p>
                {Object.keys(social.data?.scheduledByStatus ?? {}).length === 0 ? (
                  <p className="text-sm text-text-muted">Nessuna programmazione registrata.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {Object.entries(social.data?.scheduledByStatus ?? {}).map(([status, count]) => (
                      <li
                        key={status}
                        className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                      >
                        <span className="text-text-secondary">{status}</span>
                        <Badge variant="info">{formatNumber(count)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Lead</h2>
              <span className="text-xs text-text-muted">{leadRows.length} contatti</span>
            </>
          }
        >
          {leads.isLoading ? (
            <Skeleton lines={4} />
          ) : leadCounts.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title="Nessun lead registrato"
              description="I contatti raccolti dal form del sito o dai webhook compariranno qui, divisi per stato del funnel."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {leadCounts.map((row) => (
                <li
                  key={row.status}
                  className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="text-text-secondary">
                    {LEAD_STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <Badge variant="default">{formatNumber(row.count)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card header={<h2 className="text-base font-semibold text-text-primary">Stato dei dati</h2>}>
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            Il BFF non espone metriche di audience per canale: follower, reach, engagement rate e
            conversioni non sono misurati e quindi non vengono mostrati. Le uniche serie disponibili
            sono quelle derivate dagli eventi di consumo reali.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Badge variant={usage.data?.metering === false ? "warning" : "success"}>
              {usage.data?.metering === false ? "Metering non attivo" : "Metering attivo"}
            </Badge>
            {events[0] && (
              <span>Ultimo evento di consumo: {formatDateTime(events[0].created_at)}</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
