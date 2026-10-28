// =============================================================================
// Dettaglio piattaforma social (brief §3.4) — rotta /social-media/:platform.
// Intestazione con avatar e stato, KPI, grafico crescita follower, tabella post
// filtrabile e prossime pubblicazioni.
// =============================================================================

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  MessageCircle,
  Plus,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Input } from "@pv/components/ui/Input";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { Tabs } from "@pv/components/ui/Tabs";
import { useToast } from "@pv/components/ui/Toast";
import { LineChart } from "@pv/components/charts/Charts";
import { EmptyState, KpiCard, PageHeader, ProgressBar } from "@pv/components/common/PageElements";
import { StatusIndicator } from "@pv/components/domain/StatusIndicator";
import {
  useFollowerSeries,
  usePlatforms,
  usePosts,
  useScheduledPosts,
} from "@pv/lib/queries";
import type { PlatformId, PostStatus } from "@pv/lib/types";
import {
  formatCompactNumber,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  platformLabel,
  postKindLabel,
  postStatusLabel,
} from "@pv/lib/utils";

const POST_STATUS_VARIANT: Record<string, "success" | "info" | "default"> = {
  published: "success",
  scheduled: "info",
  draft: "default",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "published", label: "Pubblicati" },
  { value: "scheduled", label: "Programmati" },
  { value: "draft", label: "Bozze" },
];

export default function SocialPlatformDetail() {
  const { platform: platformParam } = useParams<{ platform: string }>();
  const platformId = (platformParam ?? "") as PlatformId;
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const platforms = usePlatforms();
  const series = useFollowerSeries(platformId);
  const posts = usePosts(platformId);
  const scheduled = useScheduledPosts(platformId);

  const platform = (platforms.data ?? []).find((item) => item.id === platformId);

  const points = useMemo(
    () => (series.data ?? []).map((point) => ({ label: point.label, value: point.value })),
    [series.data],
  );

  const filteredPosts = useMemo(() => {
    const list = posts.data ?? [];
    return list.filter((post) => {
      const matchesStatus = statusFilter === "all" || post.status === (statusFilter as PostStatus);
      const matchesQuery =
        query.trim() === "" || post.text.toLowerCase().includes(query.trim().toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [posts.data, statusFilter, query]);

  const growth = useMemo(() => {
    const values = series.data ?? [];
    if (values.length < 2) return 0;
    const first = values[0].value;
    const last = values[values.length - 1].value;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  }, [series.data]);

  const totalEngagement = useMemo(
    () =>
      (posts.data ?? []).reduce(
        (sum, post) =>
          sum + post.engagement.likes + post.engagement.comments + post.engagement.shares,
        0,
      ),
    [posts.data],
  );

  if (platforms.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!platform) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Piattaforma non trovata" />
        <EmptyState
          icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
          title="Piattaforma sconosciuta"
          description={`Nessuna piattaforma con id "${platformId}".`}
          action={
            <Link to="/preview/social-media" className="text-sm font-medium text-pv-cyan hover:underline">
              Torna a Social Media
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Intestazione */}
      <div className="flex flex-col gap-4">
        <Link
          to="/preview/social-media"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-pv-ink-3 transition-colors hover:text-pv-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Social Media
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-pv-cyan/15 bg-pv-indigo/60"
              style={{ boxShadow: `0 0 24px ${platform.color}33` }}
            >
              <img src={platform.icon} alt="" width={28} height={28} className="h-7 w-7" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold text-pv-ink">
                {platform.name}
              </h1>
              <p className="text-sm text-pv-ink-2">
                {platform.accountName ?? "Nessun account collegato"}
              </p>
              <div className="mt-1.5">
                <StatusIndicator status={platform.status} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
              onClick={() =>
                toast({ kind: "info", title: "Programma", description: "Pianificazione contenuti." })
              }
            >
              Programma
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={() =>
                toast({ kind: "success", title: "Nuovo post", description: "Editor contenuti aperto." })
              }
            >
              Nuovo Post
            </Button>
          </div>
        </div>
      </div>

      {/* KPI */}
      <section aria-label="KPI piattaforma" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Follower"
          value={formatCompactNumber(platform.stats.followers)}
          icon={<Users className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
          delta={`${growth >= 0 ? "+" : ""}${formatPercent(growth)}`}
          trend={growth >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Post pubblicati"
          value={formatNumber(platform.stats.posts)}
          icon={<Share2 className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
        />
        <KpiCard
          label="Engagement totale"
          value={formatCompactNumber(totalEngagement)}
          icon={<MessageCircle className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
          delta="+8,4%"
          trend="up"
        />
        <KpiCard
          label="Reach (30 giorni)"
          value={formatCompactNumber((series.data ?? []).reduce((sum, point) => sum + point.value, 0))}
          icon={<Eye className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
          delta="-1,2%"
          trend="down"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Grafico crescita */}
        <Card
          className="xl:col-span-2"
          header={
            <>
              <h2 className="text-base font-semibold text-pv-ink">Crescita follower</h2>
              <span className="inline-flex items-center gap-1 text-xs text-pv-success">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                {`${growth >= 0 ? "+" : ""}${formatPercent(growth)} (30 giorni)`}
              </span>
            </>
          }
        >
          {series.isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : (
            <LineChart
              data={points}
              area
              color={platform.color === "#FFFFFF" ? "#00D4FF" : platform.color}
              ariaLabel={`Crescita follower su ${platform.name}`}
              valueFormatter={(value) => formatCompactNumber(value)}
            />
          )}
        </Card>

        {/* Programmazioni */}
        <Card
          header={<h2 className="text-base font-semibold text-pv-ink">In programma</h2>}
          bodyClassName="p-0"
        >
          {scheduled.isLoading ? (
            <ul className="divide-y divide-pv-cyan/10">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="px-5 py-4">
                  <Skeleton lines={2} />
                </li>
              ))}
            </ul>
          ) : (scheduled.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
                title="Nessuna programmazione"
                description="Non ci sono contenuti pianificati."
              />
            </div>
          ) : (
            <ul className="divide-y divide-pv-cyan/10">
              {(scheduled.data ?? []).map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <p className="text-sm font-medium text-pv-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs text-pv-ink-3">{formatDateTime(item.date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Tabella post */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-pv-ink">Contenuti</h2>
            <span className="text-xs text-pv-ink-3">
              {filteredPosts.length} di {(posts.data ?? []).length}
            </span>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              items={FILTERS.map((item) => ({ value: item.value, label: item.label }))}
              value={statusFilter}
              onValueChange={setStatusFilter}
            />
            <Input
              type="search"
              placeholder="Cerca contenuto…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="sm:max-w-xs"
            />
          </div>

          {posts.isLoading ? (
            <Skeleton lines={4} />
          ) : filteredPosts.length === 0 ? (
            <EmptyState
              icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
              title="Nessun contenuto"
              description="Nessun contenuto corrisponde ai filtri selezionati."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">Contenuti della piattaforma {platform.name}</caption>
                <thead>
                  <tr className="border-b border-pv-cyan/10 text-left text-xs text-pv-ink-3">
                    <th scope="col" className="py-2 pr-4 font-medium">Contenuto</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Data</th>
                    <th scope="col" className="py-2 pr-4 font-medium text-right">Interazioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => {
                    const interactions =
                      post.engagement.likes + post.engagement.comments + post.engagement.shares;
                    return (
                      <tr key={post.id} className="border-b border-pv-cyan/5">
                        <td className="max-w-xs py-3 pr-4">
                          <span className="line-clamp-1 text-pv-ink">{post.text}</span>
                        </td>
                        <td className="py-3 pr-4 text-pv-ink-2">{postKindLabel(post.kind)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={POST_STATUS_VARIANT[post.status] ?? "default"}>
                            {postStatusLabel(post.status)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-pv-ink-3">{formatRelative(post.date)}</td>
                        <td className="py-3 pr-4 text-right text-pv-ink-2">
                          {formatCompactNumber(interactions)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <ProgressBar
            value={platform.stats.posts}
            max={Math.max(platform.stats.posts, 150)}
            label={`Obiettivo mensile contenuti (${platform.stats.posts}/150)`}
          />
        </div>
      </Card>

      <p className="text-xs text-pv-ink-3">
        Piattaforma: {platformLabel(platform.id)} · dati aggiornati {formatRelative(new Date().toISOString())}
      </p>
    </div>
  );
}
