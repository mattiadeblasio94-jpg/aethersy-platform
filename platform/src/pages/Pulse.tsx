// =============================================================================
// Pulse (Home) — "Polso dell'attività": HUD operativo su dati reali.
// Sorgenti: /api/platform/overview, /api/platform/account, /api/platform/roster,
// /api/platform/chat/conversations. Nessun dato simulato: ogni indicatore
// corrisponde a un contatore restituito dal BFF.
// =============================================================================

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Bot,
  CheckCircle,
  Clock,
  Cpu,
  FolderOpen,
  Globe,
  Mail,
  MessageSquare,
  Plus,
  Radar,
  Share2,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/common/PageElements";
import { PageTransition, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { CyberBar, CyberPanel, CyberStat, CyberStatus } from "@/components/common/Cyber";
import { useAccount, useConversations, useOverview, useRoster } from "@/lib/platform-queries";
import { cn, formatDateTime, formatFullDate } from "@/lib/utils";

const ICON_MAP: Record<string, React.ReactNode> = {
  "folder-open": <FolderOpen className="h-4 w-4" aria-hidden="true" />,
  mail: <Mail className="h-4 w-4" aria-hidden="true" />,
  globe: <Globe className="h-4 w-4" aria-hidden="true" />,
  "share-2": <Share2 className="h-4 w-4" aria-hidden="true" />,
  "bar-chart-2": <BarChart2 className="h-4 w-4" aria-hidden="true" />,
  target: <Target className="h-4 w-4" aria-hidden="true" />,
};

const STATE_LABEL = {
  active: "Operativo",
  empty: "In attesa",
  attention: "Attenzione",
};

export default function Pulse() {
  const navigate = useNavigate();
  const overview = useOverview();
  const account = useAccount();
  const conversations = useConversations();
  const roster = useRoster();

  const tiles = overview.data?.areaTiles ?? [];
  const counters = overview.data?.counters;
  const credits = overview.data?.credits;
  const upcoming = overview.data?.upcoming ?? [];
  const attention = overview.data?.attention ?? [];

  const planLabel = (account.data?.plan ?? "").trim();
  const planText = planLabel ? planLabel.toUpperCase() : "N/D";
  const activeDroids = (roster.data ?? []).filter((d) => d.running > 0).length;

  const health = useMemo(() => {
    if (!counters) return null;
    const totalRuns = counters.runs.total || 1;
    const delivered = counters.assets.delivered + counters.assets.approved;
    const failedRate = counters.tasks.total ? counters.tasks.failed / counters.tasks.total : 0;
    return {
      completion: Math.round((delivered / (counters.assets.total || 1)) * 100),
      failure: Math.round(failedRate * 100),
      totalRuns,
    };
  }, [counters]);

  const activityItems = useMemo(() => {
    const items: {
      id: string;
      title: string;
      description: string;
      time: Date;
      type: "attention" | "conversation" | "run";
      href: string;
    }[] = [];

    for (const a of attention.slice(0, 3)) {
      items.push({
        id: `att-${a.id}`,
        title: a.title || `Run ${a.stage}`,
        description: a.opportunity.needsHuman ? "In attesa della tua approvazione" : "Richiede attenzione",
        time: new Date(a.updated_at),
        type: "attention",
        href: "/opportunities",
      });
    }

    for (const c of (conversations.data ?? []).slice(0, 3)) {
      items.push({
        id: `conv-${c.id}`,
        title: c.title,
        description: "Conversazione con l'orchestratore",
        time: new Date(c.updated_at),
        type: "conversation",
        href: `/studio?conv=${c.id}`,
      });
    }

    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6);
  }, [attention, conversations.data]);

  return (
    <PageTransition>
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader
          title="Polso dell'attività"
          description={formatFullDate(new Date())}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <CyberStatus label={`Piano ${planText}`} tone="neutral" />
              <Button onClick={() => navigate("/studio")}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Avvia
              </Button>
            </div>
          }
        />

        {/* Core HUD */}
        <CyberPanel label="Core" tone="active" scan className="p-0">
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <CyberStat
              label="Crediti disponibili"
              value={credits ? credits.available.toLocaleString("it-IT") : "—"}
              hint={credits ? `riservati ${credits.reserved.toLocaleString("it-IT")}` : "crediti reali dal BFF"}
              tone={credits && credits.available > 0 ? "active" : "attention"}
              icon={<Zap className="h-4 w-4" aria-hidden="true" />}
            />
            <CyberStat
              label="Task in corso"
              value={counters ? counters.tasks.running : "—"}
              hint={counters ? `${counters.tasks.pending} in coda, ${counters.tasks.failed} falliti` : undefined}
              tone={counters && counters.tasks.failed > 0 ? "attention" : "neutral"}
              icon={<Cpu className="h-4 w-4" aria-hidden="true" />}
            />
            <CyberStat
              label="Agenti attivi"
              value={roster.data ? activeDroids : "—"}
              hint={roster.data ? `${roster.data.length} orchestratori` : undefined}
              tone={activeDroids > 0 ? "active" : "idle"}
              icon={<Bot className="h-4 w-4" aria-hidden="true" />}
            />
            <CyberStat
              label="Asset prodotti"
              value={counters ? counters.assets.total : "—"}
              hint={counters ? `${counters.assets.inReview} in revisione, ${counters.assets.approved} approvati` : undefined}
              tone="neutral"
              icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
            />
            <CyberStat
              label="Lead"
              value={counters ? counters.leads.total : "—"}
              hint={counters ? `${counters.leads.new} nuovi` : undefined}
              tone={counters && counters.leads.new > 0 ? "active" : "idle"}
              icon={<Target className="h-4 w-4" aria-hidden="true" />}
            />
          </div>

          <div className="grid gap-3 border-t border-secondary/10 p-4 lg:grid-cols-3">
            <div className="space-y-2">
              <CyberBar
                label="Asset approvati o consegnati"
                value={health?.completion ?? 0}
                tone={health && health.completion > 0 ? "active" : "idle"}
              />
              <CyberBar
                label="Task falliti"
                value={health?.failure ?? 0}
                tone={health && health.failure > 0 ? "attention" : "idle"}
              />
            </div>
            <div className="rounded-lg border border-secondary/10 bg-bg-primary/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Coda programmata</p>
              {upcoming.length === 0 ? (
                <p className="mt-1 text-sm text-text-muted">Nessuna attività programmata.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {upcoming.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-text-primary">{s.title}</span>
                      <span className="shrink-0 font-mono text-xs text-text-muted">
                        {s.nextRunAt ? new Date(s.nextRunAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-secondary/10 bg-bg-primary/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Sistemi</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <CyberStatus label="Pipeline" tone={counters && counters.runs.open > 0 ? "active" : "idle"} pulse={Boolean(counters && counters.runs.open > 0)} />
                <CyberStatus label="Scheduling" tone={counters && counters.schedule.active > 0 ? "active" : "idle"} />
                <CyberStatus label="Crediti" tone={credits && credits.available > 0 ? "active" : "attention"} />
                <CyberStatus label="Orchestratore" tone={activeDroids > 0 ? "active" : "idle"} />
              </div>
            </div>
          </div>
        </CyberPanel>

        {/* Aree dell'attività */}
        <section aria-label="Aree dell'attività">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-text-primary">Aree dell'attività</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {tiles.length} moduli attivi
            </span>
          </div>
          <StaggerGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile) => (
              <StaggerItem key={tile.id}>
                <Link
                  to={tile.route}
                  className={cn(
                    "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow",
                    tile.state === "attention"
                      ? "border-warning/50"
                      : tile.state === "active"
                        ? "border-success/30"
                        : "border-secondary/10",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md border border-secondary/20 bg-secondary/10 p-1.5 text-secondary">
                      {ICON_MAP[tile.icon] ?? <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[9px] uppercase tracking-[0.14em]",
                        tile.state === "attention"
                          ? "text-warning"
                          : tile.state === "active"
                            ? "text-success"
                            : "text-text-muted",
                      )}
                    >
                      {STATE_LABEL[tile.state]}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-text-primary">{tile.count}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{tile.description}</p>
                  <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                    <span>{tile.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-secondary/40 to-transparent" />
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        {/* Feed attività */}
        <CyberPanel label="Attività recente" tone="neutral" padded={false}>
          <ul className="divide-y divide-secondary/10">
            {activityItems.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <Radar className="h-6 w-6 text-text-muted" aria-hidden="true" />
                <p className="text-sm text-text-muted">Nessuna attività recente. Avvia una conversazione per avviare il sistema.</p>
                <Button size="sm" variant="secondary" onClick={() => navigate("/studio")}>
                  <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                  Apri l'orchestratore
                </Button>
              </li>
            ) : (
              activityItems.map((item) => (
                <li key={item.id}>
                  <Link to={item.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                        item.type === "attention"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-secondary/20 bg-secondary/10 text-secondary",
                      )}
                    >
                      {item.type === "attention" ? (
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateTime(item.time.toISOString())}
                      </p>
                    </div>
                    <span className="hidden text-xs text-text-muted sm:block">{item.description}</span>
                    <Badge variant={item.type === "attention" ? "warning" : "default"}>
                      {item.type === "attention" ? "Attenzione" : "Info"}
                    </Badge>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </CyberPanel>

        {/* CTA */}
        <CyberPanel label="Comando" tone="neutral">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-secondary/20 bg-secondary/10 p-2 text-secondary">
                <Target className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold text-text-primary">Nuova opportunità?</p>
                <p className="text-sm text-text-secondary">
                  Chiedi all'AI Operating Officer un piano d'azione: la chat crea task reali sulla pipeline.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate("/studio")}>
                <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                Parla con l'assistente
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => navigate("/agents/create")}>
                <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Crea un agente
              </Button>
            </div>
          </div>
        </CyberPanel>
      </div>
    </PageTransition>
  );
}
