import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock3, Share2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton, SkeletonCardGrid } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/domain/StatCard";
import { AgentList } from "@/components/domain/AgentList";
import { PlatformGrid } from "@/components/domain/PlatformGrid";
import { ConnectionModal } from "@/components/domain/ConnectionModal";
import { StatusIndicator } from "@/components/domain/StatusIndicator";
import {
  useActivateAgent,
  useAgents,
  useConnectPlatform,
  useDashboardStats,
  useDisconnectPlatform,
  usePauseAgent,
  usePlatforms,
  useTasks,
} from "@/lib/queries";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { useToast } from "@/components/ui/Toast";
import type { Platform, PlatformId } from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatFullDate,
  formatGreeting,
  platformLabel,
} from "@/lib/utils";

const TAB_ITEMS = [
  { value: "overview", label: "Panoramica" },
  { value: "agents", label: "Agenti" },
  { value: "platforms", label: "Piattaforme" },
  { value: "activity", label: "Attivita'" },
];

/**
 * Dashboard (brief §4.5). Vista d'insieme del workspace: KPI, agenti attivi,
 * stato piattaforme e attivita' recente. Ogni pannello gestisce i propri stati
 * di caricamento ed errore.
 */
export default function Dashboard() {
  const [tab, setTab] = useState("overview");
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<Platform | null>(null);

  const user = useAuthStore((state) => state.user);
  const activeWorkspaceId = useUiStore((state) => state.activeWorkspaceId);
  const customWorkspaces = useUiStore((state) => state.customWorkspaces);
  const { toast } = useToast();

  const stats = useDashboardStats();
  const agents = useAgents();
  const platforms = usePlatforms();
  const tasks = useTasks();

  const activateAgent = useActivateAgent();
  const pauseAgent = usePauseAgent();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const workspaceName = useMemo(() => {
    const custom = customWorkspaces.find((item) => item.id === activeWorkspaceId);
    if (custom) return custom.name;
    return "Aethersy Studio";
  }, [customWorkspaces, activeWorkspaceId]);

  const now = new Date();

  const activeAgents = (agents.data ?? []).filter((agent) => agent.status === "active");
  const recentTasks = (tasks.data ?? []).slice(0, 6);

  function handleConfirmConnection(platformId: PlatformId) {
    return connectPlatform.mutateAsync(platformId).then(() => undefined);
  }

  async function handleDisconnect(platformId: PlatformId) {
    try {
      await disconnectPlatform.mutateAsync(platformId);
      toast({
        kind: "info",
        title: "Piattaforma disconnessa",
        description: platformLabel(platformId),
      });
    } catch {
      toast({ kind: "error", title: "Disconnessione non riuscita" });
    }
  }

  async function handleAgentAction(
    agentId: string,
    action: "activate" | "pause",
  ) {
    setPendingAgentId(agentId);
    try {
      if (action === "activate") await activateAgent.mutateAsync(agentId);
      else await pauseAgent.mutateAsync(agentId);
      toast({
        kind: "success",
        title: action === "activate" ? "Agente attivato" : "Agente in pausa",
      });
    } catch {
      toast({ kind: "error", title: "Operazione non riuscita" });
    } finally {
      setPendingAgentId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{formatFullDate(now)}</p>
        <h1 className="font-display text-2xl font-semibold text-text-primary lg:text-3xl">
          {formatGreeting(now)}, {user?.name?.split(" ")[0] ?? "ospite"}
        </h1>
        <p className="text-sm text-text-secondary">
          Ecco cosa stanno facendo gli agenti nel workspace{" "}
          <span className="font-medium text-text-primary">{workspaceName}</span>.
        </p>
      </header>

      <Tabs items={TAB_ITEMS} value={tab} onValueChange={setTab} />

      {tab === "overview" && (
        <div className="flex flex-col gap-6">
          <section aria-label="Indicatori chiave">
            {stats.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="flex flex-col gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                  </Card>
                ))}
              </div>
            ) : stats.isError ? (
              <Card>
                <p className="text-sm text-error">Impossibile caricare le statistiche.</p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(stats.data ?? []).map((stat) => (
                  <StatCard key={stat.id} stat={stat} />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="xl:col-span-2" aria-label="Agenti attivi">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  Agenti attivi
                </h2>
                <Link
                  to="/agents"
                  className="inline-flex items-center gap-1 text-sm text-secondary hover:underline"
                >
                  Tutti gli agenti
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <AgentList
                agents={activeAgents}
                loading={agents.isLoading}
                pendingAgentId={pendingAgentId}
                onActivate={(id) => handleAgentAction(id, "activate")}
                onPause={(id) => handleAgentAction(id, "pause")}
                emptyMessage="Nessun agente attivo. Attivane uno per iniziare."
              />
            </section>

            <section aria-label="Attivita' recente">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  Attivita' recente
                </h2>
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1 text-sm text-secondary hover:underline"
                >
                  Vedi tutto
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <Card bodyClassName="p-0">
                <ul className="divide-y divide-secondary/10">
                  {tasks.isLoading &&
                    Array.from({ length: 4 }).map((_, index) => (
                      <li key={index} className="flex items-center gap-3 px-5 py-3.5">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                          <Skeleton lines={2} />
                        </div>
                      </li>
                    ))}

                  {!tasks.isLoading &&
                    recentTasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-3 px-5 py-3.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/15">
                          <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {task.title}
                          </p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatDateTime(task.date)}
                            <span aria-hidden="true">·</span>
                            {platformLabel(task.platform)}
                          </p>
                        </div>
                        <StatusIndicator status={task.status} withLabel={false} />
                      </li>
                    ))}

                  {!tasks.isLoading && recentTasks.length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-text-muted">
                      Nessuna attivita' recente.
                    </li>
                  )}
                </ul>
              </Card>
            </section>
          </div>
        </div>
      )}

      {tab === "agents" && (
        <AgentList
          agents={agents.data ?? []}
          loading={agents.isLoading}
          pendingAgentId={pendingAgentId}
          onActivate={(id) => handleAgentAction(id, "activate")}
          onPause={(id) => handleAgentAction(id, "pause")}
        />
      )}

      {tab === "platforms" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Share2 className="h-4 w-4 text-secondary" aria-hidden="true" />
            Collega o gestisci i canali social del workspace.
          </div>
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
        </div>
      )}

      {tab === "activity" && (
        <Card header={<h2 className="text-base font-semibold text-text-primary">Tutti i task</h2>}>
          {tasks.isLoading ? (
            <SkeletonCardGrid count={2} />
          ) : (
            <ul className="divide-y divide-secondary/10">
              {(tasks.data ?? []).map((task) => (
                <li key={task.id} className="flex items-start gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {task.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDateTime(task.date)}
                      <span aria-hidden="true">·</span>
                      {task.agentName}
                      <span aria-hidden="true">·</span>
                      {platformLabel(task.platform)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      task.status === "failed"
                        ? "error"
                        : task.status === "completed"
                          ? "success"
                          : task.status === "running"
                            ? "info"
                            : "default"
                    }
                  >
                    {task.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ConnectionModal
        open={Boolean(connectionTarget)}
        onOpenChange={(open) => {
          if (!open) setConnectionTarget(null);
        }}
        platform={connectionTarget}
        onConfirm={handleConfirmConnection}
        onSuccess={(id) => {
          toast({ kind: "success", title: `${platformLabel(id)} collegata` });
          setConnectionTarget(null);
        }}
      />

      <p className={cn("sr-only")} aria-live="polite">
        Sezione corrente: {tab}
      </p>
    </div>
  );
}
