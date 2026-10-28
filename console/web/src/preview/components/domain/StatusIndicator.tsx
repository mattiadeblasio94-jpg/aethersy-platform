import { cn } from "@pv/lib/utils";
import { StatusDot } from "@pv/components/ui/Badge";
import type { AgentStatus, ConnectionStatus, TaskStatus } from "@pv/lib/types";

export type StatusKind = AgentStatus | ConnectionStatus | TaskStatus;

interface StatusConfig {
  label: string;
  color: string;
  animation?: string;
  textClass: string;
}

/**
 * Mappa semantica di tutti gli stati in un'unica fonte di verita', cosi'
 * badge, dot e liste restano coerenti fra loro.
 */
export const STATUS_CONFIG: Record<string, StatusConfig> = {
  // Piattaforme
  connected: { label: "Connesso", color: "#00E676", textClass: "text-pv-success" },
  disconnected: { label: "Non connesso", color: "#6B6585", textClass: "text-pv-ink-3" },
  pending: {
    label: "In attesa",
    color: "#FFD740",
    animation: "animate-pulse-slow",
    textClass: "text-pv-warning",
  },
  // Agenti
  active: {
    label: "Attivo",
    color: "#00E676",
    animation: "animate-pulse-slow",
    textClass: "text-pv-success",
  },
  paused: { label: "In pausa", color: "#6B6585", textClass: "text-pv-ink-3" },
  error: {
    label: "Errore",
    color: "#FF5252",
    animation: "animate-pulse-fast",
    textClass: "text-pv-error",
  },
  // Task
  running: {
    label: "In corso",
    color: "#00D4FF",
    animation: "animate-pulse-glow",
    textClass: "text-pv-cyan",
  },
  completed: { label: "Completato", color: "#00E676", textClass: "text-pv-success" },
  failed: { label: "Fallito", color: "#FF5252", textClass: "text-pv-error" },
  scheduled: { label: "Programmato", color: "#FF9F1C", textClass: "text-pv-orange" },
};

export interface StatusIndicatorProps {
  status: StatusKind | string;
  /** Mostra anche il testo, non solo il punto. */
  withLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusIndicator({
  status,
  withLabel = true,
  size = "md",
  className,
}: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "#6B6585",
    textClass: "text-pv-ink-3",
  };

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <StatusDot color={config.color} label={config.label} animation={config.animation} />
      {withLabel && (
        <span
          className={cn(
            size === "sm" ? "text-xs" : "text-sm",
            "font-medium",
            config.textClass,
          )}
        >
          {config.label}
        </span>
      )}
    </span>
  );
}
