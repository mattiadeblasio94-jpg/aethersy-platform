import type { Agent } from "@pv/lib/types";
import { AgentCard } from "./AgentCard";
import { SkeletonCardGrid } from "@pv/components/ui/Skeleton";
import { cn } from "@pv/lib/utils";

export interface AgentListProps {
  agents: Agent[];
  loading?: boolean;
  /** Id dell'agente con una mutazione in corso. */
  pendingAgentId?: string | null;
  onActivate?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onOpen?: (agentId: string) => void;
  emptyMessage?: string;
  className?: string;
}

/** Griglia/lista di Agenti (brief §3.2). */
export function AgentList({
  agents,
  loading = false,
  pendingAgentId = null,
  onActivate,
  onPause,
  onOpen,
  emptyMessage = "Nessun agente configurato.",
  className,
}: AgentListProps) {
  if (loading) {
    return <SkeletonCardGrid count={4} className={className} />;
  }

  if (agents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-pv-cyan/20 bg-pv-card/50 px-4 py-10 text-center text-sm text-pv-ink-3">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          loading={pendingAgentId === agent.id}
          onActivate={onActivate}
          onPause={onPause}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
