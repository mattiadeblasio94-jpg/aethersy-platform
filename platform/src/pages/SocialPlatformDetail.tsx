import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, FileText, Share2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  usePlatforms,
  useSocialPosts,
  useSocialScheduledPosts,
  useSocialSummary,
} from "@/lib/platform-queries";
import {
  formatDateTime,
  formatNumber,
  formatRelative,
  platformLabel,
  postKindLabel,
  postStatusLabel,
} from "@/lib/utils";

const POST_STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "error" | "info" | "accent"
> = {
  published: "success",
  scheduled: "info",
  draft: "warning",
  queued: "accent",
  failed: "error",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "published", label: "Pubblicati" },
  { value: "scheduled", label: "Programmati" },
  { value: "draft", label: "Bozze" },
];

function postPlatform(meta: Record<string, unknown>): string | null {
  for (const key of ["platform", "channel", "provider"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export default function SocialPlatformDetail() {
  const { platform: platformParam = "" } = useParams<{ platform: string }>();
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const platformsQuery = usePlatforms();
  const postsQuery = useSocialPosts();
  const scheduledQuery = useSocialScheduledPosts();
  const summaryQuery = useSocialSummary();

  const platforms = platformsQuery.data ?? [];
  const connection =
    platforms.find((item) => item.provider === platformParam) ??
    platforms.find((item) => item.id === platformParam) ??
    null;

  const posts = postsQuery.data ?? [];
  const taggedPosts = useMemo(
    () => posts.filter((post) => postPlatform(post.meta ?? {}) !== null),
    [posts],
  );
  const scopedPosts = useMemo(() => {
    if (taggedPosts.length === 0) return posts;
    return taggedPosts.filter((post) => postPlatform(post.meta ?? {}) === platformParam);
  }, [taggedPosts, posts, platformParam]);

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopedPosts.filter((post) => {
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      const matchesQuery = needle === "" || post.name.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [scopedPosts, statusFilter, query]);

  const scheduled = scheduledQuery.data ?? [];

  if (platformsQuery.isLoading) {
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

  if (platformsQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Canale non disponibile" />
        <EmptyState
          icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
          title="Canali non raggiungibili"
          description="Il BFF non ha risposto sulla lista dei canali social collegati."
          action={
            <Button variant="secondary" size="sm" onClick={() => platformsQuery.refetch()}>
              Ricarica canali
            </Button>
          }
        />
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Piattaforma non trovata" />
        <EmptyState
          icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
          title="Canale sconosciuto"
          description={`Nessun canale con id "${platformParam}" e' registrato su questo tenant.`}
          action={
            <Link to="/social-media" className="text-sm font-medium text-secondary hover:underline">
              Torna a Social Media
            </Link>
          }
        />
      </div>
    );
  }

  const label = platformLabel(connection.provider);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/social-media"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Social Media
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-secondary/15 bg-primary/60">
            <Share2 className="h-6 w-6 text-secondary" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-text-primary">{label}</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {connection.kind}
              {connection.label && connection.label !== connection.provider
                ? ` · ${connection.label}`
                : ""}
            </p>
            <div className="mt-1.5">
              <Badge variant={connection.connected ? "success" : "warning"}>
                {connection.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <section aria-label="KPI canale" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Contenuti del canale"
          value={formatNumber(scopedPosts.length)}
          icon={<FileText className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Pubblicazioni pianificate"
          value={formatNumber(scheduled.length)}
          icon={<CalendarClock className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Ultimo contenuto"
          value={summaryQuery.data?.lastPostAt ? formatRelative(summaryQuery.data.lastPostAt) : "—"}
          icon={<Share2 className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Follower"
          value="Non disponibile"
          icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
          hint="Il BFF non espone metriche per canale."
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Contenuti</h2>
              <span className="text-xs text-text-muted">
                {filteredPosts.length} di {scopedPosts.length}
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

            {postsQuery.isLoading ? (
              <Skeleton lines={4} />
            ) : postsQuery.isError ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title="Contenuti non disponibili"
                description="Impossibile leggere i contenuti social del tenant."
                action={
                  <Button variant="secondary" size="sm" onClick={() => postsQuery.refetch()}>
                    Ricarica contenuti
                  </Button>
                }
              />
            ) : filteredPosts.length === 0 ? (
              <EmptyState
                icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
                title="Nessun contenuto"
                description="Nessun contenuto corrisponde ai filtri selezionati."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <caption className="sr-only">Contenuti social del canale {label}</caption>
                  <thead>
                    <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                      <th scope="col" className="py-2 pl-5 pr-4 font-medium">Contenuto</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                      <th scope="col" className="py-2 pr-5 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.map((post) => (
                      <tr key={post.id} className="border-b border-secondary/5">
                        <td className="max-w-xs py-3 pl-5 pr-4">
                          <span className="line-clamp-1 text-text-primary">{post.name}</span>
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">{postKindLabel(post.kind)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={POST_STATUS_VARIANT[post.status] ?? "default"}>
                            {postStatusLabel(post.status)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-5 text-text-muted">{formatRelative(post.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {taggedPosts.length === 0 && posts.length > 0 && (
              <p className="text-xs text-text-muted">
                I deliverable social non registrano il canale di pubblicazione: l'elenco mostra tutti
                i contenuti social del tenant.
              </p>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            header={<h2 className="text-base font-semibold text-text-primary">In programma</h2>}
            bodyClassName="p-0"
          >
            {scheduledQuery.isLoading ? (
              <div className="p-5">
                <Skeleton lines={3} />
              </div>
            ) : scheduledQuery.isError ? (
              <div className="p-5">
                <EmptyState
                  icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
                  title="Programmazione non disponibile"
                  description="Impossibile leggere le pubblicazioni social pianificate."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => scheduledQuery.refetch()}>
                      Ricarica programmazione
                    </Button>
                  }
                />
              </div>
            ) : scheduled.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
                  title="Nessuna programmazione"
                  description="Non ci sono contenuti social pianificati sul tenant."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {scheduled.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <p className="text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {item.runAt ? formatDateTime(item.runAt) : (item.cron ?? "—")} · {item.timezone}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card header={<h2 className="text-base font-semibold text-text-primary">Metriche</h2>}>
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title="Metriche per canale non disponibili"
              description="Il BFF espone solo il riepilogo aggregato del tenant: follower, reach e engagement per canale non sono disponibili."
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
