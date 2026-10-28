import { Bot, Pause, Play, RotateCw } from "lucide-react";
import type { Agent } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusIndicator } from "./StatusIndicator";
import { agentTypeLabel, cn, formatNumber, formatRelative, platformLabel } from "@/lib/utils";

export interface AgentCardProps {
  agent: Agent;
  onActivate?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onOpen?: (agentId: string) => void;
  loading?: boolean;
  className?: string;
}

/**
 * Card di un agente AI (brief §3.2). Mostra stato, descrizione, metriche e le
 * azioni contestuali (attiva / pausa / riprova).
 */
export function AgentCard({
  agent,
  onActivate,
  onPause,
  onOpen,
  loading = false,
  className,
}: AgentCardProps) {
  const isActive = agent.status === "active";
  const isError = agent.status === "error";

  return (
    <Card
      variant={isActive ? "elevated" : "default"}
      interactive
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex items-start gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-secondary/15 bg-primary/60">
          <Bot className="h-5 w-5 text-secondary" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-text-primary">
            {agent.name}
          </h3>
          <p className="text-sm text-text-muted">{agentTypeLabel(agent.type)}</p>
        </div>

        <StatusIndicator status={agent.status} withLabel={false} />
      </div>

      <p className="line-clamp-2 text-sm text-text-secondary">{agent.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {agent.targetPlatforms.map((platformId) => (
          <Badge key={platformId} variant="default">
            {platformLabel(platformId)}
          </Badge>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Task completati</dt>
          <dd className="font-semibold text-text-primary">
            {formatNumber(agent.tasksCompleted)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Ultima esecuzione</dt>
          <dd className="font-medium text-text-secondary">
            {formatRelative(agent.lastRun)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center gap-2">
        {onOpen && (
          <Button variant="ghost" size="sm" onClick={() => onOpen(agent.id)}>
            Dettagli
          </Button>
        )}
        <div className="ml-auto">
          {isActive ? (
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              onClick={() => onPause?.(agent.id)}
              leftIcon={<Pause className="h-4 w-4" aria-hidden="true" />}
            >
              Pausa
            </Button>
          ) : (
            <Button
              variant={isError ? "danger" : "primary"}
              size="sm"
              loading={loading}
              onClick={() => onActivate?.(agent.id)}
              leftIcon={
                isError ? (
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )
              }
            >
              {isError ? "Riprova" : "Attiva"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
