// =============================================================================
// Task (brief §3.3). Rotte: /tasks (tutti), /tasks/active, /tasks/scheduled,
// /tasks/completed. La tab attiva e' derivata dalla rotta per essere
// condivisibile nei link. Filtri per agente, piattaforma, priorita' e testo.
// =============================================================================

import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  ListChecks,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { StatusIndicator } from "@/components/domain/StatusIndicator";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useAgents, usePlatforms, useTasks } from "@/lib/queries";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatNumber,
  formatRelative,
  platformLabel,
  priorityLabel,
  taskTypeLabel,
} from "@/lib/utils";

const TAB_PATHS: Record<string, string> = {
  all: "/tasks",
  active: "/tasks/active",
  scheduled: "/tasks/scheduled",
  completed: "/tasks/completed",
};

const PRIORITY_VARIANT: Record<TaskPriority, "error" | "warning" | "default"> = {
  high: "error",
  medium: "warning",
  low: "default",
};

/** Un task e' "attivo" se in attesa o in esecuzione. */
function isActive(status: TaskStatus): boolean {
  return status === "running" || status === "pending";
}

function matchesTab(status: TaskStatus, tab: string): boolean {
  if (tab === "all") return true;
  if (tab === "active") return isActive(status);
  return status === tab;
}

const TAB_EMPTY: Record<string, { title: string; description: string }> = {
  all: { title: "Nessun task", description: "Non ci sono task nel workspace." },
  active: { title: "Nessun task attivo", description: "Tutti i task sono conclusi o programmati." },
  scheduled: { title: "Nessun task programmato", description: "Non ci sono esecuzioni pianificate." },
  completed: { title: "Nessun task completato", description: "I task conclusi appariranno qui." },
};

export default function Tasks() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const tab = useMemo(() => {
    const segment = location.pathname.replace(/^\/tasks\/?/, "");
    return segment === "" ? "all" : segment;
  }, [location.pathname]);

  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const tasks = useTasks();
  const agents = useAgents();
  const platforms = usePlatforms();

  const allTasks = tasks.data ?? [];

  const filtered = useMemo(
    () =>
      allTasks.filter((task) => {
        if (!matchesTab(task.status, tab)) return false;
        if (agentFilter !== "all" && task.agentId !== agentFilter) return false;
        if (platformFilter !== "all" && task.platform !== platformFilter) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        if (query.trim() !== "" && !task.title.toLowerCase().includes(query.trim().toLowerCase())) {
          return false;
        }
        return true;
      }),
    [allTasks, tab, agentFilter, platformFilter, priorityFilter, query],
  );

  const stats = useMemo(() => {
    const completed = allTasks.filter((task) => task.status === "completed").length;
    const inProgress = allTasks.filter((task) => isActive(task.status)).length;
    const failed = allTasks.filter((task) => task.status === "failed").length;
    return { total: allTasks.length, completed, inProgress, failed };
  }, [allTasks]);

  const tabs = [
    { value: "all", label: "Tutti", badge: String(allTasks.length) },
    { value: "active", label: "Attivi", badge: String(stats.inProgress) },
    { value: "scheduled", label: "Programmati", badge: String(allTasks.filter((t) => t.status === "scheduled").length) },
    { value: "completed", label: "Completati", badge: String(stats.completed) },
  ];

  function handleDelete(taskId: string) {
    toast({
      kind: "info",
      title: "Task rimosso",
      description: `Il task ${taskId} e' stato eliminato (mock).`,
    });
  }

  function handleRetry(taskId: string) {
    toast({ kind: "success", title: "Task riavviato", description: `Nuova esecuzione per ${taskId}.` });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Task"
        description="Tutte le operazioni degli agenti, con filtri per stato, agente e priorita'."
      />

      <section aria-label="Statistiche task" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Task totali" value={formatNumber(stats.total)} icon={<ListChecks className="h-5 w-5 text-secondary" aria-hidden="true" />} />
        <KpiCard label="Completati" value={formatNumber(stats.completed)} icon={<CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />} />
        <KpiCard label="In corso" value={formatNumber(stats.inProgress)} icon={<Clock className="h-5 w-5 text-secondary" aria-hidden="true" />} />
        <KpiCard label="Falliti" value={formatNumber(stats.failed)} icon={<XCircle className="h-5 w-5 text-error" aria-hidden="true" />} />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs
          items={tabs}
          value={tab}
          onValueChange={(value) => navigate(TAB_PATHS[value] ?? "/tasks")}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="search"
            placeholder="Cerca task…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          />

          <select
            aria-label="Filtra per agente"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="h-11 w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="all">Tutti gli agenti</option>
            {(agents.data ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtra per piattaforma"
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            className="h-11 w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="all">Tutte le piattaforme</option>
            {(platforms.data ?? []).map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtra per priorita'"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="h-11 w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="all">Tutte le priorita'</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Bassa</option>
          </select>
        </div>
      </Card>

      {tasks.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CircleDashed className="h-5 w-5" aria-hidden="true" />}
          title={TAB_EMPTY[tab]?.title ?? "Nessun task"}
          description={TAB_EMPTY[tab]?.description ?? "Nessun risultato."}
        />
      ) : (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-secondary/10">
            {filtered.map((task) => (
              <li key={task.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{task.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {task.type && <span>{taskTypeLabel(task.type)}</span>}
                    <span aria-hidden="true">·</span>
                    <Link
                      to={`/agents/${task.agentId}`}
                      className="text-secondary hover:underline"
                    >
                      {task.agentName}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <span>{platformLabel(task.platform)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(task.date)}</span>
                    {task.durationMs !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>durata {(task.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={PRIORITY_VARIANT[task.priority]}>
                    {priorityLabel(task.priority)}
                  </Badge>
                  <StatusIndicator status={task.status} />
                  <span className="text-xs text-text-muted">{formatRelative(task.date)}</span>

                  <div className="flex items-center gap-1">
                    {task.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => handleRetry(task.id)}>
                        Riprova
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Elimina task ${task.title}`}
                      onClick={() => handleDelete(task.id)}
                      className={cn("text-text-muted hover:text-error")}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
