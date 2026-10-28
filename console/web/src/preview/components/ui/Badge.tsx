import type { ReactNode } from "react";
import { cn } from "@pv/lib/utils";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "accent";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-pv-hover text-pv-ink-2 border-pv-cyan/20",
  success: "bg-pv-success/15 text-pv-success border-pv-success/30",
  warning: "bg-pv-warning/15 text-pv-warning border-pv-warning/30",
  error: "bg-pv-error/15 text-pv-error border-pv-error/30",
  info: "bg-pv-cyan/15 text-pv-cyan border-pv-cyan/30",
  accent: "bg-pv-orange/15 text-pv-orange border-pv-orange/30",
};

export function Badge({ variant = "default", children, icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Badge numerico compatto per voci di menu (es. "12"). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pv-cyan/20 px-1.5 text-xs font-semibold text-pv-cyan",
        className,
      )}
      aria-label={`${count} elementi`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export interface StatusDotProps {
  color: string;
  label: string;
  animation?: string;
}

/** Punto di stato animato, riusato da StatusIndicator e dalle liste. */
export function StatusDot({ color, label, animation }: StatusDotProps) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", animation)}
      style={{ backgroundColor: color }}
      role="img"
      aria-label={label}
    />
  );
}
