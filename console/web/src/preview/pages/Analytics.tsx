// =============================================================================
// Analisi (brief §3.9) — rotta /analytics. Selettore intervallo, KPI con trend,
// andamento follower, engagement per piattaforma, distribuzione contenuti,
// attivita' agenti, tabella per piattaforma e insight degli agenti.
// =============================================================================

import { useMemo, useState } from "react";
import {
  Activity,
  Download,
  Lightbulb,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { useToast } from "@pv/components/ui/Toast";import { BarChart, DonutChart, LineChart } from "@pv/components/charts/Charts";
import { EmptyState, KpiCard, PageHeader, RangeSelector } from "@pv/components/common/PageElements";
import {
  useAgentActivitySeries,
  useAnalytics,
  useEngagementByPlatform,
  useInsights,
  usePostDistribution,
  useSocialSummary,
} from "@pv/lib/queries";
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatRelative,
  platformLabel,
  postKindLabel,
} from "@pv/lib/utils";

const RANGES = [
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "90", label: "90 giorni" },
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#FF9F1C",
  linkedin: "#00D4FF",
  tiktok: "#00E676",
  youtube: "#FF5252",
  x: "#A8A3C7",
  facebook: "#4C6EF5",
};

/** Ritaglio deterministico di una serie in base all'intervallo scelto. */
function sliceForRange<T>(items: T[], range: string): T[] {
  const days = Number(range);
  const take = days === 7 ? 7 : days === 30 ? 30 : items.length;
  return items.slice(Math.max(0, items.length - take));
}

export default function Analytics() {
  const { toast } = useToast();
  const [range, setRange] = useState("30");

  const summary = useSocialSummary();
  const analytics = useAnalytics();
  const engagement = useEngagementByPlatform();
  const distribution = usePostDistribution();
  const insights = useInsights();
  const agentActivity = useAgentActivitySeries();

  // Andamento follower aggregato (somma di tutte le piattaforme disponibili).
  const followerPoints = useMemo(() => {
    const list = analytics.data ?? [];
    if (list.length === 0) return [];
    const length = Math.max(...list.map((item) => item.points.length));
    const sliced = sliceForRange(Array.from({ length }).map((_, index) => index), range);
    return sliced.map((index) => {
      const label = list[0]?.points[index]?.label ?? String(index + 1);
      const value = list.reduce((sum, item) => sum + (item.points[index]?.value ?? 0), 0);
      return { label, value };
    });
  }, [analytics.data, range]);

  const engagementPoints = useMemo(
    () =>
      (engagement.data ?? []).map((item) => ({
        label: platformLabel(item.platform),
        value: item.value,
        color: PLATFORM_COLORS[item.platform] ?? "#00D4FF",
      })),
    [engagement.data],
  );

  const distributionSlices = useMemo(
    () =>
      (distribution.data ?? []).map((item, index) => ({
        label: postKindLabel(item.kind),
        value: item.value,
        color: Object.values(PLATFORM_COLORS)[index % 6],
      })),
    [distribution.data],
  );

  const activityPoints = useMemo(() => {
    const sliced = sliceForRange(agentActivity.data ?? [], range);
    return sliced.map((point) => ({ label: point.label, value: point.value }));
  }, [agentActivity.data, range]);

  const totalFollowers = summary.data?.totalFollowers ?? 0;
  const growth = analytics.data?.reduce((sum, item) => sum + item.growth, 0) ?? 0;
  const avgGrowth = (analytics.data ?? []).length
    ? growth / (analytics.data?.length ?? 1)
    : 0;

  function handleExport() {
    toast({
      kind: "info",
      title: "Report esportato",
      description: `Report ${range} giorni generato in PDF (mock).`,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analisi"
        description="Performance cross-canale, crescita audience e attivita' degli agenti."
        actions={
          <>
            <RangeSelector
              options={RANGES}
              value={range}
              onChange={setRange}
              label="Intervallo temporale"
            />
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
              onClick={handleExport}
            >
              Esporta
            </Button>
          </>
        }
      />

      {/* KPI */}
      <section aria-label="KPI analisi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Follower totali"
              value={formatNumber(totalFollowers)}
              icon={<Users className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+6,8%"
              trend="up"
            />
            <KpiCard
              label="Engagement rate"
              value={formatPercent(summary.data?.engagementRate ?? 0)}
              icon={<Activity className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+0,6 pt"
              trend="up"
            />
            <KpiCard
              label="Reach"
              value={formatCompactNumber(summary.data?.reach ?? 0)}
              icon={<TrendingUp className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+11,2%"
              trend="up"
            />
            <KpiCard
              label="Crescita media"
              value={formatPercent(avgGrowth)}
              icon={<Share2 className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta={avgGrowth >= 0 ? "+1,2 pt" : "-0,8 pt"}
              trend={avgGrowth >= 0 ? "up" : "down"}
            />
          </>
        )}
      </section>

      {/* Andamento follower + attivita' agenti */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-pv-ink">Crescita follower</h2>
              <span className="text-xs text-pv-ink-3">tutte le piattaforme</span>
            </>
          }
        >
          {analytics.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <LineChart
              data={followerPoints}
              area
              ariaLabel="Andamento aggregato dei follower"
              valueFormatter={(value) => formatNumber(value)}
            />
          )}
        </Card>

        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-pv-ink">Attivita' agenti</h2>
              <span className="text-xs text-pv-ink-3">task per periodo</span>
            </>
          }
        >
          {agentActivity.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <LineChart
              data={activityPoints}
              color="#FF9F1C"
              ariaLabel="Andamento delle attivita' degli agenti"
              valueFormatter={(value) => formatNumber(value)}
            />
          )}
        </Card>
      </div>

      {/* Engagement + distribuzione */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card header={<h2 className="text-base font-semibold text-pv-ink">Engagement per piattaforma</h2>}>
          {engagement.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <BarChart
              data={engagementPoints}
              height={200}
              ariaLabel="Tasso di engagement per piattaforma"
              valueFormatter={(value) => formatPercent(value)}
            />
          )}
        </Card>

        <Card header={<h2 className="text-base font-semibold text-pv-ink">Distribuzione contenuti</h2>}>
          {distribution.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <DonutChart
              data={distributionSlices}
              ariaLabel="Distribuzione dei contenuti per tipo"
            />
          )}
        </Card>
      </div>

      {/* Tabella per piattaforma */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-pv-ink">Dettaglio per piattaforma</h2>
            <span className="text-xs text-pv-ink-3">{analytics.data?.length ?? 0} canali</span>
          </>
        }
        bodyClassName="p-0"
      >
        {analytics.isLoading ? (
          <div className="p-5">
            <Skeleton lines={4} />
          </div>
        ) : (analytics.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nessun dato" description="Collega una piattaforma per vedere le analisi." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Analisi per piattaforma</caption>
              <thead>
                <tr className="border-b border-pv-cyan/10 text-left text-xs text-pv-ink-3">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Piattaforma</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Follower</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Engagement</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Crescita</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.data ?? []).map((item) => {
                  const eng = (engagement.data ?? []).find((e) => e.platform === item.platform);
                  return (
                    <tr key={item.platform} className="border-b border-pv-cyan/5">
                      <td className="py-3 pl-5 pr-4">
                        <span className="inline-flex items-center gap-2 text-pv-ink">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: PLATFORM_COLORS[item.platform] ?? "#00D4FF" }}
                            aria-hidden="true"
                          />
                          {platformLabel(item.platform)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-pv-ink-2">
                        {formatNumber(item.total)}
                      </td>
                      <td className="py-3 pr-4 text-pv-ink-2">
                        {eng ? formatPercent(eng.value) : "—"}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <Badge variant={item.growth >= 0 ? "success" : "error"}>
                          {item.growth >= 0 ? "+" : ""}
                          {formatPercent(item.growth)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Insight */}
      <section aria-label="Insight degli agenti" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-pv-ink">Insight dagli agenti</h2>
        {insights.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (insights.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="h-5 w-5" aria-hidden="true" />}
            title="Nessun insight"
            description="Gli agenti non hanno ancora prodotto suggerimenti."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(insights.data ?? []).map((insight) => {
              const Icon =
                insight.kind === "warning"
                  ? AlertTriangle
                  : insight.kind === "trend"
                    ? TrendingUp
                    : Sparkles;
              const variant =
                insight.kind === "warning" ? "warning" : insight.kind === "trend" ? "info" : "success";
              return (
                <Card key={insight.id} className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pv-cyan/15">
                      <Icon className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
                    </span>
                    <Badge variant={variant}>{insight.kind}</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-pv-ink">{insight.title}</h3>
                  <p className="flex-1 text-sm text-pv-ink-2">{insight.body}</p>
                  <p className="text-xs text-pv-ink-3">
                    {insight.agentName} · {formatRelative(insight.date)}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
