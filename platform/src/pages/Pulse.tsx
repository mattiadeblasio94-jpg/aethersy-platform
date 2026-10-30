// =============================================================================
// Pulse (Home) — "Polso dell'attività" (pazi.ai parity).
// Balance USD + Avvia, "Aree dell'attività" tiles, activity feed, CTA "Gestisci l'attività".
// Real backend via /api/platform/overview (BusinessPulse + areaTiles).
// =============================================================================

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Target, FolderOpen, Mail, Globe, Share2, BarChart2, Plus, Sparkles, AlertTriangle, CheckCircle, Clock, ArrowRight, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/common/PageElements";
import { PageTransition, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { useOverview, useConversations } from "@/lib/platform-queries";
import { cn, formatDateTime, formatFullDate } from "@/lib/utils";

const ICON_MAP: Record<string, React.ReactNode> = {
  "folder-open": <FolderOpen className="h-5 w-5" aria-hidden="true" />,
  mail: <Mail className="h-5 w-5" aria-hidden="true" />,
  globe: <Globe className="h-5 w-5" aria-hidden="true" />,
  "share-2": <Share2 className="h-5 w-5" aria-hidden="true" />,
  "bar-chart-2": <BarChart2 className="h-5 w-5" aria-hidden="true" />,
  target: <Target className="h-5 w-5" aria-hidden="true" />,
};

const STATE_LABEL = {
  active: "Attivo",
  empty: "Vuoto",
  attention: "Attenzione",
};

export default function Pulse() {
  const overview = useOverview();
  const conversations = useConversations();
  const now = new Date();

  const tiles = overview.data?.areaTiles ?? [];
  const counters = overview.data?.counters;
  const credits = overview.data?.credits;
  const upcoming = overview.data?.upcoming ?? [];
  const attention = overview.data?.attention ?? [];

  // Status line: balance + piano + next action
  const statusLine = useMemo(() => {
    if (!credits) return null;
    const planLabel = counters ? "Pro" : "Free"; // placeholder
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-success/10 text-success">
          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Piano {planLabel}
        </span>
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-bg-primary border border-secondary/10">
          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono font-medium text-text-primary">{credits.available.toLocaleString()}</span>
          <span className="text-text-muted">crediti disponibili</span>
        </span>
        {upcoming[0]?.nextRunAt && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-bg-primary border border-secondary/10">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Prossimo: <span className="font-medium text-text-primary">{new Date(upcoming[0].nextRunAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="text-text-muted">{upcoming[0].title}</span>
          </span>
        )}
      </div>
    );
  }, [credits, upcoming, counters]);

  // Activity feed: attention items + recent conversations
  const activityItems = useMemo(() => {
    const items: { id: string; title: string; description: string; time: Date; type: "attention" | "conversation" | "run"; href?: string }[] = [];

    // Attention items (runs needing human input)
    for (const a of attention.slice(0, 3)) {
      items.push({
        id: `att-${a.id}`,
        title: a.title || `Run ${a.stage}`,
        description: a.opportunity.needsHuman ? "In attesa della tua approvazione" : "Richiede attenzione",
        time: new Date(a.updated_at),
        type: "attention",
        href: `/opportunities`,
      });
    }

    // Recent conversations
    for (const c of (conversations.data ?? []).slice(0, 3)) {
      items.push({
        id: `conv-${c.id}`,
        title: c.title,
        description: "Ultimo messaggio",
        time: new Date(c.updated_at),
        type: "conversation",
        href: `/chat?conv=${c.id}`,
      });
    }

    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5);
  }, [attention, conversations.data]);

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        {/* Header */}
        <PageHeader
          title="Polso dell'attività"
          description={formatFullDate(now)}
          actions={
            <Button>
              <Link to="/studio" className="flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Avvia
              </Link>
            </Button>
          }
        />

        {/* Status line */}
        {statusLine && (
          <Card className="p-4">
            {statusLine}
          </Card>
        )}

        {/* Aree dell'attività tiles */}
        <section aria-label="Aree dell'attività">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-text-primary">Aree dell'attività</h2>
          </div>
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile) => (
              <StaggerItem key={tile.id}>
                <Link
                  to={tile.route}
                  className={cn(
                    "group flex flex-col h-full p-4 rounded-xl border transition-all duration-200",
                    tile.state === "attention"
                      ? "border-warning/50 bg-warning/5 shadow-[0_0_0_1px_rgb(245,158,11)]"
                      : tile.state === "active"
                        ? "border-secondary/20 bg-bg-card hover:border-secondary/40"
                        : "border-secondary/10 bg-bg-card/50",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-secondary/10 text-secondary group-hover:scale-110 transition-transform">
                      {ICON_MAP[tile.icon] ?? <Sparkles className="h-5 w-5" aria-hidden="true" />}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        tile.state === "attention"
                          ? "bg-warning/10 text-warning"
                          : tile.state === "active"
                            ? "bg-success/10 text-success"
                            : "bg-secondary/10 text-text-muted",
                      )}
                    >
                      {STATE_LABEL[tile.state as keyof typeof STATE_LABEL]}
                    </span>
                  </div>
                  <div className="mt-4 flex-1 flex flex-col justify-end">
                    <p className="font-display text-2xl font-semibold text-text-primary">{tile.count}</p>
                    <p className="mt-1 text-sm text-text-secondary">{tile.description}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                    <span>{tile.title}</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        {/* Activity feed */}
        <section aria-label="Attività recente">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-text-primary">Attività recente</h2>
            <Link
              to="/opportunities"
              className="inline-flex items-center gap-1 text-sm text-secondary hover:underline"
            >
              Vedi tutto
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <Card bodyClassName="p-0">
            <ul className="divide-y divide-secondary/10">
              {activityItems.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-text-muted">Nessuna attività recente.</li>
              ) : (
                activityItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        item.type === "attention"
                          ? "bg-warning/10 text-warning"
                          : "bg-secondary/10 text-secondary",
                      )}
                    >
                      {item.type === "attention" ? (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateTime(item.time.toISOString())}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.type === "attention" ? "warning" : "default"
                      }
                    >
                      {STATE_LABEL[item.type === "attention" ? "attention" : "empty"]}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </section>

        {/* Quick CTA */}
        <Card className="p-4 bg-gradient-to-r from-secondary/10 to-secondary/5 border-secondary/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/20">
                <Target className="h-6 w-6 text-secondary" aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-text-primary">Nuova opportunità?</p>
                <p className="text-sm text-text-secondary">Chiedi all'AI Operating Officer di creare un piano d'azione.</p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                // Trigger assistant panel open
                const event = new CustomEvent("open-assistant");
                window.dispatchEvent(event);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" aria-hidden="true" />
              Parla con l'assistente
            </Button>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
