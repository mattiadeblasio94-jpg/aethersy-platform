import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Layers, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import { realKeys, useBuilderTasks, useTasks } from "@/lib/platform-queries";
import { formatDateTime, formatNumber } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  running: "info",
  done: "success",
  completed: "success",
  approved: "success",
  failed: "error",
  error: "error",
  pending: "warning",
  queued: "warning",
  draft: "default",
};

export default function AgentLogs() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const droid = useQuery({
    queryKey: realKeys.droid(agentId),
    queryFn: () => platformApi.getDroid(agentId),
    enabled: Boolean(agentId),
  });
  const builderTasksQuery = useBuilderTasks();
  const tasksQuery = useTasks();

  const builderTasks = useMemo(
    () =>
      (builderTasksQuery.data ?? []).filter((task) => {
        const specAgent = typeof task.spec?.agent === "string" ? task.spec.agent : null;
        return specAgent === agentId || task.type === agentId;
      }),
    [builderTasksQuery.data, agentId],
  );

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return builderTasks;
    return builderTasks.filter(
      (task) =>
        task.title.toLowerCase().includes(needle) || task.type.toLowerCase().includes(needle),
    );
  }, [builderTasks, query]);

  const pipelineTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => task.droid === agentId),
    [tasksQuery.data, agentId],
  );

  useEffect(() => {
    if (selectedId && builderTasks.some((task) => task.id === selectedId)) return;
    setSelectedId(filteredTasks[0]?.id ?? null);
  }, [filteredTasks, builderTasks, selectedId]);

  const detail = useQuery({
    queryKey: ["real", "builder-task", selectedId],
    queryFn: () => platformApi.getBuilderTask(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const steps = detail.data?.steps ?? [];
  const artifacts = detail.data?.artifacts ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/agents/${agentId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {droid.data?.name ?? "Agente"}
      </Link>

      <PageHeader
        title="Log di esecuzione"
        description="Task reali del Builder con relativi step e artefatti, piu' i task del pipeline assegnati all'agente."
      />

      <Card>
        <Input
          type="search"
          placeholder="Cerca per titolo o tipo…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          className="sm:max-w-xs"
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Task Builder</h2>
              <span className="text-xs text-text-muted">{filteredTasks.length} task</span>
            </>
          }
          bodyClassName="p-0"
        >
          {builderTasksQuery.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : builderTasksQuery.isError ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title="Task non disponibili"
                description="Errore nel caricamento dei task del Builder."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => builderTasksQuery.refetch()}
                  >
                    Ricarica task
                  </Button>
                }
              />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title="Nessun task Builder"
                description="Non risultano task del Builder per questo agente."
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {filteredTasks.map((task) => {
                const active = task.id === selectedId;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      aria-pressed={active}
                      className={
                        active
                          ? "flex w-full flex-wrap items-center gap-3 bg-secondary/10 px-5 py-3 text-left"
                          : "flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-bg-hover"
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-primary">{task.title}</span>
                        <span className="block text-xs text-text-muted">
                          {task.type} · {formatDateTime(task.created_at)} ·{" "}
                          {formatNumber(task.cost_credits)} crediti
                        </span>
                      </span>
                      <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>{task.status}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            header={<h2 className="text-base font-semibold text-text-primary">Step del task</h2>}
            bodyClassName="p-0"
          >
            {!selectedId ? (
              <div className="p-5">
                <EmptyState
                  title="Nessun task selezionato"
                  description="Seleziona un task Builder per vedere step e artefatti reali."
                />
              </div>
            ) : detail.isLoading ? (
              <div className="p-5">
                <Skeleton lines={4} />
              </div>
            ) : steps.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Nessuno step registrato"
                  description="Il task selezionato non espone step eseguiti."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {steps.map((step) => (
                  <li key={step.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-hover text-xs font-semibold text-text-secondary">
                      {step.step_order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{step.agent}</span>
                      <span className="block text-xs text-text-muted">
                        {step.started_at ? formatDateTime(step.started_at) : "non avviato"}
                        {step.completed_at ? ` → ${formatDateTime(step.completed_at)}` : ""}
                      </span>
                      {step.error && (
                        <span className="mt-1 block text-xs text-error">{step.error}</span>
                      )}
                    </span>
                    <Badge variant={STATUS_VARIANT[step.status] ?? "default"}>{step.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={<h2 className="text-base font-semibold text-text-primary">Artefatti</h2>}
            bodyClassName="p-0"
          >
            {!selectedId ? (
              <div className="p-5">
                <EmptyState title="Nessun artefatto" description="Seleziona un task per elencarli." />
              </div>
            ) : artifacts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Layers className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun artefatto prodotto"
                  description="Il task selezionato non ha ancora prodotto deliverable."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{artifact.name}</span>
                      <span className="block text-xs text-text-muted">
                        {artifact.kind}
                        {typeof artifact.metadata?.size === "number"
                          ? ` · ${formatNumber(artifact.metadata.size)} B`
                          : ""}
                        {artifact.metadata?.content_truncated ? " · contenuto troncato" : ""}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted">{formatDateTime(artifact.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

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
              description="Non risultano task del pipeline assegnati a questo agente."
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
                    {task.finishedAt ? ` → ${formatDateTime(task.finishedAt)}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>{task.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
