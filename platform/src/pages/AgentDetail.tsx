import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, FileText, Pause, Play, Target, Timer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import { realKeys } from "@/lib/platform-queries";
import {
  useActivateAgent,
  useBuilderTasks,
  useDeleteBuilderTask,
  usePauseAgent,
  useTasks,
} from "@/lib/platform-queries";
import { HttpError } from "@/lib/http";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

const TASK_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  running: "info",
  done: "success",
  completed: "success",
  failed: "error",
  pending: "warning",
  queued: "warning",
};

function errorFeedback(error: unknown): { title: string; description: string } {
  if (error instanceof HttpError) {
    if (error.code === "AP_TOKEN_REQUIRED") {
      return { title: "Accesso Activepieces richiesto", description: error.message };
    }
    return { title: "Operazione non riuscita", description: error.message };
  }
  return {
    title: "Operazione non riuscita",
    description: error instanceof Error ? error.message : "Operazione non riuscita",
  };
}

export default function AgentDetailPage() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const droid = useQuery({
    queryKey: realKeys.droid(agentId),
    queryFn: () => platformApi.getDroid(agentId),
    enabled: Boolean(agentId),
  });
  const tasksQuery = useTasks();
  const builderTasksQuery = useBuilderTasks();
  const activateAgent = useActivateAgent();
  const pauseAgent = usePauseAgent();
  const deleteBuilderTask = useDeleteBuilderTask();

  const pipelineTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => task.droid === agentId),
    [tasksQuery.data, agentId],
  );

  const builderTasks = useMemo(
    () =>
      (builderTasksQuery.data ?? []).filter((task) => {
        const specAgent = typeof task.spec?.agent === "string" ? task.spec.agent : null;
        return specAgent === agentId || task.type === agentId;
      }),
    [builderTasksQuery.data, agentId],
  );

  async function handleActivate() {
    try {
      await activateAgent.mutateAsync(agentId);
      toast({ kind: "success", title: "Agente attivato" });
    } catch (error) {
      const feedback = errorFeedback(error);
      toast({ kind: "error", title: feedback.title, description: feedback.description });
    }
  }

  async function handleDeleteBuilderTask(taskId: string, title: string) {
    try {
      await deleteBuilderTask.mutateAsync(taskId);
      toast({ kind: "success", title: "Task eliminato", description: title });
    } catch (error) {
      const feedback = errorFeedback(error);
      toast({ kind: "error", title: feedback.title, description: feedback.description });
    }
  }

  async function handlePause() {
    try {
      await pauseAgent.mutateAsync(agentId);
      toast({ kind: "info", title: "Agente messo in pausa" });
    } catch (error) {
      const feedback = errorFeedback(error);
      toast({ kind: "error", title: feedback.title, description: feedback.description });
    }
  }

  if (droid.isLoading) {
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

  if (droid.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Agente non disponibile" />
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Dettaglio non raggiungibile"
          description={
            droid.error instanceof HttpError
              ? droid.error.message
              : "Errore nel caricamento del roster."
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => droid.refetch()}>
              Ricarica agente
            </Button>
          }
        />
      </div>
    );
  }

  if (!droid.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Agente non trovato" />
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Agente inesistente"
          description={`Nessun agente con id "${agentId}" nel roster di questo tenant.`}
          action={
            <Link to="/agents" className="text-sm font-medium text-secondary hover:underline">
              Torna agli Agenti
            </Link>
          }
        />
      </div>
    );
  }

  const entry = droid.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/agents"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Agenti
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-secondary/15 bg-primary/60">
            <Bot className="h-6 w-6 text-secondary" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-text-primary">{entry.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {entry.role} · {entry.department}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            leftIcon={<FileText className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate(`/agents/${agentId}/logs`)}
          >
            Log
          </Button>
          <Button
            variant="secondary"
            loading={pauseAgent.isPending}
            leftIcon={<Pause className="h-4 w-4" aria-hidden="true" />}
            onClick={handlePause}
          >
            Pausa
          </Button>
          <Button
            variant="primary"
            loading={activateAgent.isPending}
            leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
            onClick={handleActivate}
          >
            Attiva
          </Button>
        </div>
      </div>

      <p className="max-w-3xl text-sm text-text-secondary">{entry.tagline}</p>

      <section aria-label="Metriche agente" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Task assegnati"
          value={formatNumber(entry.tasks)}
          icon={<Bot className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="In esecuzione"
          value={formatNumber(entry.running)}
          icon={<Timer className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Completati"
          value={formatNumber(entry.done)}
          icon={<Target className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Falliti"
          value={formatNumber(entry.failed)}
          hint={entry.lastTaskAt ? `ultimo task ${formatRelative(entry.lastTaskAt)}` : "nessun task registrato"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card header={<h2 className="text-base font-semibold text-text-primary">Specialista</h2>}>
          <dl className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
              <dt className="text-sm text-text-muted">Ruolo</dt>
              <dd className="text-right text-sm font-medium text-text-primary">{entry.role}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-secondary/5 pb-2">
              <dt className="text-sm text-text-muted">Dipartimento</dt>
              <dd className="text-right text-sm font-medium text-text-primary">
                {entry.department}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-text-muted">Ultimo task</dt>
              <dd className="text-right text-sm font-medium text-text-primary">
                {entry.lastTaskAt ? formatDateTime(entry.lastTaskAt) : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <p className="mb-2 text-xs text-text-muted">Competenze</p>
            <div className="flex flex-wrap gap-1.5">
              {entry.skills.length === 0 ? (
                <span className="text-sm text-text-muted">Nessuna competenza dichiarata</span>
              ) : (
                entry.skills.map((skill) => (
                  <Badge key={skill} variant="default">
                    {skill}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs text-text-muted">Fasi</p>
            <div className="flex flex-wrap gap-1.5">
              {entry.stages.length === 0 ? (
                <span className="text-sm text-text-muted">Nessuna fase dichiarata</span>
              ) : (
                entry.stages.map((stage) => (
                  <Badge key={stage} variant="info">
                    {stage}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card
          header={<h2 className="text-base font-semibold text-text-primary">Task pipeline</h2>}
          bodyClassName="p-0"
        >
          {tasksQuery.isLoading ? (
            <div className="p-5">
              <Skeleton lines={4} />
            </div>
          ) : pipelineTasks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nessun task in pipeline"
                description="Non risultano task del pipeline assegnati a questo specialista."
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {pipelineTasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{task.title}</p>
                    <p className="text-xs text-text-muted">
                      {task.runTitle} · {task.runStage}
                      {task.startedAt ? ` · ${formatDateTime(task.startedAt)}` : ""}
                    </p>
                  </div>
                  <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "default"}>{task.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        header={<h2 className="text-base font-semibold text-text-primary">Task Builder</h2>}
        bodyClassName="p-0"
      >
        {builderTasksQuery.isLoading ? (
          <div className="p-5">
            <Skeleton lines={3} />
          </div>
        ) : builderTasks.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nessun task Builder"
              description="Non risultano task del Builder assegnati a questo agente."
              action={
                <Link to="/agents/create" className="text-sm font-medium text-secondary hover:underline">
                  Crea un task
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-secondary/10">
            {builderTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{task.title}</p>
                  <p className="text-xs text-text-muted">
                    {task.type} · {formatDateTime(task.created_at)} ·{" "}
                    {formatNumber(task.cost_credits)} crediti
                  </p>
                </div>
                <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "default"}>{task.status}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Elimina task ${task.title}`}
                  className="h-8 w-8 text-text-muted hover:text-error"
                  disabled={deleteBuilderTask.isPending}
                  onClick={() => void handleDeleteBuilderTask(task.id, task.title)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
