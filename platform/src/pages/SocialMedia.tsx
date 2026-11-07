import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, FileText, Share2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useConnectPlatform,
  useDisconnectPlatform,
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

function postPlatform(meta: Record<string, unknown>): string | null {
  for (const key of ["platform", "channel", "provider"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

export default function SocialMedia() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const platformsQuery = usePlatforms();
  const postsQuery = useSocialPosts();
  const scheduledQuery = useSocialScheduledPosts();
  const summaryQuery = useSocialSummary();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const platforms = platformsQuery.data ?? [];
  const posts = postsQuery.data ?? [];
  const scheduled = scheduledQuery.data ?? [];
  const summary = summaryQuery.data;

  const activeChannels = useMemo(
    () => platforms.filter((platform) => platform.connected),
    [platforms],
  );

  async function handleConnect(provider: string) {
    try {
      await connectPlatform.mutateAsync(provider);
      toast({
        kind: "success",
        title: "Canale collegato",
        description: `${platformLabel(provider)} e' ora attivo sul tenant.`,
      });
    } catch (error) {
      toast({ kind: "error", title: "Collegamento non riuscito", description: errorText(error) });
    }
  }

  async function handleDisconnect(id: string, label: string) {
    try {
      await disconnectPlatform.mutateAsync(id);
      toast({ kind: "info", title: "Canale disconnesso", description: label });
    } catch (error) {
      toast({ kind: "error", title: "Disconnessione non riuscita", description: errorText(error) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Social Media"
        description="Canali collegati, contenuti prodotti e pubblicazioni pianificate: tutto dai dati reali del tenant."
        actions={
          <Button
            variant="secondary"
            leftIcon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate("/content-calendar")}
          >
            Calendario editoriale
          </Button>
        }
      />

      <section aria-label="Statistiche social" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Contenuti prodotti"
          value={formatNumber(summary?.totalPosts ?? 0)}
          icon={<FileText className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Pubblicazioni pianificate"
          value={formatNumber(summary?.totalScheduled ?? 0)}
          icon={<CalendarClock className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Canali attivi"
          value={formatNumber(activeChannels.length)}
          icon={<Share2 className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Follower totali"
          value="Non disponibile"
          icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
          hint="Il BFF non espone metriche per canale."
        />
      </section>

      <section aria-label="Canali collegati" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">Canali</h2>
        {platformsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : platformsQuery.isError ? (
          <Card bodyClassName="p-5">
            <EmptyState
              icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
              title="Canali non disponibili"
              description={errorText(platformsQuery.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => platformsQuery.refetch()}>
                  Ricarica canali
                </Button>
              }
            />
          </Card>
        ) : platforms.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
              title="Nessun canale registrato"
              description="Il BFF espone solo i canali gia' registrati sul tenant: la creazione di una nuova connessione avviene dal pipeline."
              action={
                <Button variant="secondary" size="sm" onClick={() => platformsQuery.refetch()}>
                  Ricarca canali
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {platforms.map((platform) => (
              <Card key={platform.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15">
                    <Share2 className="h-5 w-5 text-secondary" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {platformLabel(platform.provider)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {platform.kind}
                      {platform.label && platform.label !== platform.provider
                        ? ` · ${platform.label}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={platform.connected ? "success" : "warning"}>{platform.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {platform.connected ? (
                    <>
                      <Link
                        to={`/social-media/${platform.provider}`}
                        className="inline-flex h-11 items-center rounded-lg border border-secondary/20 bg-bg-hover px-3 text-sm text-text-primary transition-colors hover:bg-bg-hover-strong"
                      >
                        Dettaglio canale
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={
                          disconnectPlatform.isPending && disconnectPlatform.variables === platform.id
                        }
                        onClick={() => handleDisconnect(platform.id, platformLabel(platform.provider))}
                      >
                        Disconnetti
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={
                        connectPlatform.isPending && connectPlatform.variables === platform.provider
                      }
                      onClick={() => handleConnect(platform.provider)}
                    >
                      Collega
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-label="Contenuti prodotti" className="xl:col-span-2">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Contenuti prodotti</h2>
                <span className="text-xs text-text-muted">{posts.length} deliverable social</span>
              </>
            }
            bodyClassName="p-0"
          >
            {postsQuery.isLoading ? (
              <div className="p-5">
                <Skeleton lines={5} />
              </div>
            ) : postsQuery.isError ? (
              <div className="p-5">
                <EmptyState
                  icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                  title="Contenuti non disponibili"
                  description={errorText(postsQuery.error)}
                  action={
                    <Button variant="secondary" size="sm" onClick={() => postsQuery.refetch()}>
                      Ricarica contenuti
                    </Button>
                  }
                />
              </div>
            ) : posts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun contenuto prodotto"
                  description="I deliverable generati dal pipeline (testi, immagini, video) compariranno qui."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {posts.map((post) => {
                  const channel = postPlatform(post.meta ?? {});
                  return (
                    <li key={post.id} className="flex items-start gap-4 px-5 py-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-secondary/15 bg-primary/60">
                        <FileText className="h-5 w-5 text-secondary" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-text-primary">
                          {post.name}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <span>{postKindLabel(post.kind)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelative(post.createdAt)}</span>
                          {channel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{platformLabel(channel)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <Badge variant={POST_STATUS_VARIANT[post.status] ?? "default"}>
                        {postStatusLabel(post.status)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section aria-label="Pubblicazioni pianificate" className="flex flex-col gap-4">
          <Card
            header={<h2 className="text-base font-semibold text-text-primary">Programmati</h2>}
            bodyClassName="p-0"
          >
            {scheduledQuery.isLoading ? (
              <div className="p-5">
                <Skeleton lines={4} />
              </div>
            ) : scheduled.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
                  title="Nessuna programmazione"
                  description="Le pubblicazioni con data di uscita fissata compariranno qui e nel calendario editoriale."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {scheduled.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tertiary/15">
                      <CalendarClock className="h-4 w-4 text-tertiary" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {postKindLabel(item.kind)} ·{" "}
                        {item.runAt ? formatDateTime(item.runAt) : (item.cron ?? "—")} ·{" "}
                        {item.timezone}
                      </p>
                    </div>
                    <Badge variant={POST_STATUS_VARIANT[item.status] ?? "default"}>
                      {postStatusLabel(item.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card header={<h2 className="text-base font-semibold text-text-primary">Riepilogo</h2>}>
            <dl className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
                <dt className="text-sm text-text-muted">Pubblicati</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {formatNumber(summary?.postsByStatus?.published ?? 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
                <dt className="text-sm text-text-muted">Bozze</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {formatNumber(summary?.postsByStatus?.draft ?? 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-text-muted">Ultimo contenuto</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {summary?.lastPostAt ? formatDateTime(summary.lastPostAt) : "—"}
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      </div>
    </div>
  );
}
