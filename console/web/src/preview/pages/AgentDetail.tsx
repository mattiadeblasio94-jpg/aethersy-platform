// =============================================================================
// Dettaglio agente (brief §3.2) — rotta /agents/:agentId. Stato, metriche,
// configurazione, attivita' recente e link ai log.
// =============================================================================

import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  FileText,
  Gauge,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Timer,
} from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { useToast } from "@pv/components/ui/Toast";
import { StatusIndicator } from "@pv/components/domain/StatusIndicator";
import { EmptyState, KpiCard, PageHeader, ProgressBar } from "@pv/components/common/PageElements";
import { useActivateAgent, useAgentDetail, usePauseAgent, useUpdateAgent } from "@pv/lib/queries";
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  platformLabel,
} from "@pv/lib/utils";

const ACTIVITY_TONE: Record<string, "success" | "info" | "warning" | "error"> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "error",
};

export default function AgentDetailPage() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const detail = useAgentDetail(agentId);
  const activateAgent = useActivateAgent();
  const pauseAgent = usePauseAgent();
  const updateAgent = useUpdateAgent();

  async function handleActivate() {
    try {
      await activateAgent.mutateAsync(agentId);
      toast({ kind: "success", title: "Agente attivato" });
    } catch {
      toast({ kind: "error", title: "Attivazione non riuscita" });
    }
  }

  async function handlePause() {
    try {
      await pauseAgent.mutateAsync(agentId);
      toast({ kind: "info", title: "Agente messo in pausa" });
    } catch {
      toast({ kind: "error", title: "Operazione non riuscita" });
    }
  }

  async function handleEdit() {
    try {
      await updateAgent.mutateAsync(agentId);
      toast({ kind: "success", title: "Configurazione salvata" });
    } catch {
      toast({ kind: "error", title: "Salvataggio non riuscito" });
    }
  }

  if (detail.isLoading) {
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

  if (!detail.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Agente non trovato" />
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Agente inesistente"
          description={`Nessun agente con id "${agentId}".`}
          action={
            <Link to="/preview/agents" className="text-sm font-medium text-pv-cyan hover:underline">
              Torna agli Agenti
            </Link>
          }
        />
      </div>
    );
  }

  const { agent, successRate, avgDurationMs, model, config, activity, tasksCompleted } =
    detail.data;
  const isActive = agent.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/preview/agents"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-pv-ink-3 transition-colors hover:text-pv-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Agenti
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-pv-cyan/15 bg-pv-indigo/60">
            <Bot className="h-6 w-6 text-pv-cyan" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-pv-ink">{agent.name}</h1>
            <div className="mt-1.5">
              <StatusIndicator status={agent.status} />
            </div>
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
            loading={updateAgent.isPending}
            leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            onClick={handleEdit}
          >
            Modifica
          </Button>
          {isActive ? (
            <Button
              variant="secondary"
              loading={pauseAgent.isPending}
              leftIcon={<Pause className="h-4 w-4" aria-hidden="true" />}
              onClick={handlePause}
            >
              Pausa
            </Button>
          ) : (
            <Button
              variant={agent.status === "error" ? "danger" : "primary"}
              loading={activateAgent.isPending}
              leftIcon={
                agent.status === "error" ? (
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )
              }
              onClick={handleActivate}
            >
              {agent.status === "error" ? "Riprova" : "Attiva"}
            </Button>
          )}
        </div>
      </div>

      <p className="max-w-3xl text-sm text-pv-ink-2">{agent.description}</p>

      <section aria-label="Metriche agente" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Task completati"
          value={formatNumber(tasksCompleted)}
          icon={<Bot className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
        />
        <KpiCard
          label="Tasso di successo"
          value={formatPercent(successRate, 0)}
          icon={<Gauge className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
          delta="+1,4 pt"
          trend="up"
        />
        <KpiCard
          label="Tempo medio"
          value={formatDuration(avgDurationMs)}
          icon={<Timer className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
        />
        <KpiCard
          label="Ultima esecuzione"
          value={formatRelative(agent.lastRun)}
          icon={<Play className="h-5 w-5 text-pv-cyan" aria-hidden="true" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Configurazione */}
        <Card header={<h2 className="text-base font-semibold text-pv-ink">Configurazione</h2>}>
          <dl className="flex flex-col gap-3">
            {config.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 border-b border-pv-cyan/5 pb-2 last:border-0">
                <dt className="text-sm text-pv-ink-3">{item.label}</dt>
                <dd className="text-right text-sm font-medium text-pv-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <p className="mb-2 text-xs text-pv-ink-3">Modello attivo</p>
            <Badge variant="info">{model}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {agent.targetPlatforms.map((id) => (
              <Badge key={id} variant="default">
                {platformLabel(id)}
              </Badge>
            ))}
          </div>
          <div className="mt-5">
            <ProgressBar value={successRate} label="Affidabilita' complessiva" />
          </div>
        </Card>

        {/* Attivita' recente */}
        <Card
          header={<h2 className="text-base font-semibold text-pv-ink">Attivita' recente</h2>}
          bodyClassName="p-0"
        >
          {activity.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nessuna attivita'" description="L'agente non ha ancora eseguito operazioni." />
            </div>
          ) : (
            <ul className="divide-y divide-pv-cyan/10">
              {activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Badge variant={ACTIVITY_TONE[item.kind] ?? "default"}>{item.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-pv-ink">{item.label}</p>
                    <p className="text-xs text-pv-ink-3">{formatRelative(item.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
