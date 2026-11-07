import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CyberTone = "neutral" | "active" | "attention" | "idle";

const TONE_RING: Record<CyberTone, string> = {
  neutral: "border-secondary/20",
  active: "border-success/40",
  attention: "border-warning/50",
  idle: "border-secondary/10",
};

const TONE_DOT: Record<CyberTone, string> = {
  neutral: "bg-secondary",
  active: "bg-success",
  attention: "bg-warning",
  idle: "bg-text-muted",
};

export interface CyberPanelProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  tone?: CyberTone;
  scan?: boolean;
  brackets?: boolean;
  padded?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

/**
 * Pannello "cyber": griglia tecnica, angoli rinforzati, aura e linea di scansione.
 * Usato per dashboard e superfici operative (Pulse, Studio).
 */
export function CyberPanel({
  label,
  tone = "neutral",
  scan = false,
  brackets = true,
  padded = true,
  header,
  footer,
  className,
  children,
  ...rest
}: CyberPanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-bg-card border backdrop-blur-sm transition-colors duration-200",
        TONE_RING[tone],
        className,
      )}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(var(--aethersy-secondary) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--aethersy-secondary) / 0.35) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at top, black 0%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 0%, transparent 78%)",
        }}
      />
      {scan && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scanline bg-gradient-to-b from-transparent via-secondary/10 to-transparent"
        />
      )}
      {brackets && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-secondary/50" />
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-secondary/50" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-secondary/50" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-secondary/50" />
        </>
      )}

      {(label || header) && (
        <div className="relative flex items-center justify-between gap-3 border-b border-secondary/10 px-4 py-2.5">
          {label && (
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone], tone === "active" && "animate-pulse-fast")} />
              {label}
            </span>
          )}
          {header}
        </div>
      )}

      <div className={cn("relative", padded && "p-4")}>{children}</div>

      {footer && <div className="relative border-t border-secondary/10 px-4 py-2.5">{footer}</div>}
    </div>
  );
}

export interface CyberStatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: CyberTone;
  icon?: ReactNode;
  className?: string;
}

/** Cifra chiave: valore in monospace, etichetta tecnica, tono di stato. */
export function CyberStat({ label, value, hint, tone = "neutral", icon, className }: CyberStatProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-secondary/10 bg-bg-primary/40 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</span>
        {icon && <span className="text-secondary/70">{icon}</span>}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-semibold tabular-nums",
          tone === "active" && "text-success",
          tone === "attention" && "text-warning",
          tone === "neutral" && "text-text-primary",
          tone === "idle" && "text-text-muted",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-text-muted">{hint}</div>}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-secondary/40 to-transparent" />
    </div>
  );
}

export interface CyberBarProps {
  value: number;
  max?: number;
  tone?: CyberTone;
  label?: string;
  className?: string;
}

/** Barra di avanzamento su valori reali (0..max). */
export function CyberBar({ value, max = 100, tone = "active", label, className }: CyberBarProps) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const fill =
    tone === "attention"
      ? "bg-warning"
      : tone === "idle"
        ? "bg-text-muted"
        : tone === "neutral"
          ? "bg-secondary"
          : "bg-gradient-to-r from-secondary to-success";
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/10">
        <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface CyberStatusProps {
  label: string;
  tone?: CyberTone;
  pulse?: boolean;
  className?: string;
}

/** Etichetta di stato con indicatore pulsante. */
export function CyberStatus({ label, tone = "neutral", pulse = false, className }: CyberStatusProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-secondary/15 bg-bg-primary/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone], pulse && "animate-pulse-fast")} />
      {label}
    </span>
  );
}
