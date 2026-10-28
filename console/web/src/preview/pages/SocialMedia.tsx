// =============================================================================
// Social Media (brief §3.4). Stato dei collegamenti, griglia piattaforme,
// post recenti e KPI social. Il dettaglio per piattaforma e' in
// SocialPlatformDetail.tsx (rotta /social-media/:platform).
// =============================================================================

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Eye,
  Heart,
  MessageCircle,
  Plus,
  Share2,
  TrendingUp,
} from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { useToast } from "@pv/components/ui/Toast";
import { PlatformGrid } from "@pv/components/domain/PlatformGrid";
import { ConnectionModal } from "@pv/components/domain/ConnectionModal";
import { EmptyState, KpiCard, PageHeader } from "@pv/components/common/PageElements";
import {
  useConnectPlatform,
  useDisconnectPlatform,
  usePlatforms,
  usePosts,
  useScheduledPosts,
  useSocialSummary,
} from "@pv/lib/queries";
import type { Platform, PlatformId } from "@pv/lib/types";
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

export default function SocialMedia() {
  const [connectionTarget, setConnectionTarget] = useState<Platform | null>(null);
  const { toast } = useToast();

  const platforms = usePlatforms();
  const posts = usePosts();
  const scheduled = useScheduledPosts();
  const summary = useSocialSummary();

  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const recentPosts = useMemo(() => (posts.data ?? []).slice(0, 6), [posts.data]);
  const connectedPlatforms = (platforms.data ?? []).filter(
    (platform) => platform.status === "connected",
  );

  async function handleDisconnect(platformId: PlatformId) {
    try {
      await disconnectPlatform.mutateAsync(platformId);
      toast({ kind: "info", title: "Piattaforma disconnessa", description: platformLabel(platformId) });
    } catch {
      toast({ kind: "error", title: "Disconnessione non riuscita" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Social Media"
        description="Gestisci i collegamenti, pianifica i contenuti e monitora l'engagement di tutti i canali."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
              onClick={() =>
                toast({
                  kind: "info",
                  title: "Calendario editoriale",
                  description: "Apri il dettaglio di una piattaforma per programmare.",
                })
              }
            >
              Programma
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={() =>
                toast({
                  kind: "info",
                  title: "Nuovo post",
                  description: "Seleziona una piattaforma collegata per pubblicare.",
                })
              }
            >
              Nuovo Post
            </Button>
          </>
        }
      />

      {/* Statistiche rapide */}
      <section aria-label="Statistiche social">
        {summary.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="flex flex-col gap-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Follower totali"
              value={formatCompactNumber(summary.data?.totalFollowers ?? 0)}
              icon={<Share2 className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+3,2%"
              trend="up"
            />
            <KpiCard
              label="Engagement rate"
              value={formatPercent(summary.data?.engagementRate ?? 0)}
              icon={<TrendingUp className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+0,6 pt"
              trend="up"
            />
            <KpiCard
              label="Post questa settimana"
              value={formatNumber(summary.data?.postsThisWeek ?? 0)}
              icon={<CalendarClock className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="+4"
              trend="up"
            />
            <KpiCard
              label="Reach"
              value={formatCompactNumber(summary.data?.reach ?? 0)}
              icon={<Eye className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
              delta="-1,1%"
              trend="down"
            />
          </div>
        )}
      </section>

      {/* Piattaforme */}
      <section aria-label="Piattaforme collegate" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-pv-ink">Piattaforme</h2>
        <PlatformGrid
          platforms={platforms.data ?? []}
          loading={platforms.isLoading}
          connectingId={connectPlatform.isPending ? (connectPlatform.variables ?? null) : null}
          onConnect={(id) => {
            const platform = (platforms.data ?? []).find((item) => item.id === id) ?? null;
            setConnectionTarget(platform);
          }}
          onDisconnect={handleDisconnect}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Post recenti */}
        <section aria-label="Post recenti" className="xl:col-span-2">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-pv-ink">Post recenti</h2>
                <span className="text-xs text-pv-ink-3">Ultimi contenuti pubblicati</span>
              </>
            }
            bodyClassName="p-0"
          >
            {posts.isLoading ? (
              <ul className="divide-y divide-pv-cyan/10">
                {Array.from({ length: 4 }).map((_, index) => (
                  <li key={index} className="flex items-center gap-4 px-5 py-4">
                    <Skeleton className="h-14 w-14 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton lines={2} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : recentPosts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun post ancora"
                  description="Collega una piattaforma e pubblica il tuo primo contenuto."
                />
              </div>
            ) : (
              <ul className="divide-y divide-pv-cyan/10">
                {recentPosts.map((post) => {
                  const platform = (platforms.data ?? []).find((item) => item.id === post.platform);
                  return (
                    <li key={post.id} className="flex items-start gap-4 px-5 py-4">
                      <span
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-pv-cyan/15 bg-pv-indigo/60"
                        style={{ boxShadow: `0 0 16px ${platform?.color ?? "#00D4FF"}22` }}
                      >
                        {platform?.icon ? (
                          <img src={platform.icon} alt="" width={24} height={24} className="h-6 w-6" />
                        ) : (
                          <Share2 className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-pv-ink">
                          {post.text}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pv-ink-3">
                          <span>{platformLabel(post.platform)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{postKindLabel(post.kind)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelative(post.date)}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <Badge variant={POST_STATUS_VARIANT[post.status] ?? "default"}>
                          {postStatusLabel(post.status)}
                        </Badge>
                        {post.status === "published" && (
                          <dl className="flex items-center gap-3 text-xs text-pv-ink-2">
                            <div className="flex items-center gap-1">
                              <dt className="sr-only">Mi piace</dt>
                              <Heart className="h-3.5 w-3.5 text-pv-orange" aria-hidden="true" />
                              <dd>{formatCompactNumber(post.engagement.likes)}</dd>
                            </div>
                            <div className="flex items-center gap-1">
                              <dt className="sr-only">Commenti</dt>
                              <MessageCircle className="h-3.5 w-3.5 text-pv-cyan" aria-hidden="true" />
                              <dd>{formatCompactNumber(post.engagement.comments)}</dd>
                            </div>
                            <div className="flex items-center gap-1">
                              <dt className="sr-only">Condivisioni</dt>
                              <Share2 className="h-3.5 w-3.5 text-pv-ink-3" aria-hidden="true" />
                              <dd>{formatCompactNumber(post.engagement.shares)}</dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Prossime pubblicazioni */}
        <section aria-label="Pubblicazioni programmate" className="flex flex-col gap-4">
          <Card
            header={<h2 className="text-base font-semibold text-pv-ink">Programmati</h2>}
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
                  description="I contenuti programmati appariranno qui."
                />
              </div>
            ) : (
              <ul className="divide-y divide-pv-cyan/10">
                {(scheduled.data ?? []).map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pv-orange/15">
                      <CalendarClock className="h-4 w-4 text-pv-orange" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-pv-ink">{item.title}</p>
                      <p className="mt-0.5 text-xs text-pv-ink-3">
                        {platformLabel(item.platform)} · {formatDateTime(item.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={<h2 className="text-base font-semibold text-pv-ink">Vai al dettaglio</h2>}
          >
            {connectedPlatforms.length === 0 ? (
              <p className="text-sm text-pv-ink-3">Nessuna piattaforma collegata.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {connectedPlatforms.map((platform) => (
                  <li key={platform.id}>
                    <Link
                      to={`/social-media/${platform.id}`}
                      className="flex items-center gap-3 rounded-lg border border-pv-cyan/10 bg-pv-indigo/40 px-3 py-2.5 text-sm text-pv-ink-2 transition-colors hover:border-pv-cyan/40 hover:text-pv-ink"
                    >
                      <img src={platform.icon} alt="" width={18} height={18} className="h-4 w-4" />
                      {platform.name}
                      <span className="ml-auto text-xs text-pv-ink-3">
                        {formatCompactNumber(platform.stats.followers)} follower
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <ConnectionModal
        open={Boolean(connectionTarget)}
        onOpenChange={(open) => {
          if (!open) setConnectionTarget(null);
        }}
        platform={connectionTarget}
        onConfirm={async (platformId) => {
          await connectPlatform.mutateAsync(platformId);
        }}
        onSuccess={(id) => {
          toast({ kind: "success", title: `${platformLabel(id)} collegata` });
          setConnectionTarget(null);
        }}
      />
    </div>
  );
}
