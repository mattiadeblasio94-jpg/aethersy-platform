// =============================================================================
// Elementi condivisi dello Stadio B: intestazione pagina, KPI card riusabile,
// selettore intervallo date, stato vuoto e barra di avanzamento.
// =============================================================================

import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { cn } from "@pv/lib/utils";

// --- PageHeader ------------------------------------------------------------

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/** Intestazione standard delle pagine dell'area autenticata. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="font-display text-2xl font-semibold text-pv-ink lg:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-pv-ink-2">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// --- KpiCard ---------------------------------------------------------------

export interface KpiCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Delta formattato, es. "+12,4%". */
  delta?: string;
  trend?: "up" | "down" | "flat";
  /** true se un trend "down" e' positivo (es. bounce rate). */
  inverse?: boolean;
  hint?: string;
  className?: string;
}

/**
 * Card KPI con freccia di trend. Piu' flessibile di StatCard (che resta legata
 * ai tipi della dashboard): qui il trend e' derivato dal segno del delta.
 */
export function KpiCard({
  label,
  value,
  icon,
  delta,
  trend,
  inverse = false,
  hint,
  className,
}: KpiCardProps) {
  const resolvedTrend = trend ?? "flat";
  const positive =
    resolvedTrend === "flat" ? null : inverse ? resolvedTrend === "down" : resolvedTrend === "up";
  const TrendIcon =
    resolvedTrend === "up" ? TrendingUp : resolvedTrend === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        {icon ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pv-cyan/15">
            {icon}
          </span>
        ) : (
          <span />
        )}
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              positive === null
                ? "text-pv-ink-3"
                : positive
                  ? "text-pv-success"
                  : "text-pv-error",
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Andamento: </span>
            {delta}
          </span>
        )}
      </div>

      <div>
        <p className="font-display text-2xl font-semibold text-pv-ink">{value}</p>
        <p className="text-sm text-pv-ink-2">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-pv-ink-3">{hint}</p>}
      </div>
    </Card>
  );
}

// --- RangeSelector ---------------------------------------------------------

export interface RangeOption {
  value: string;
  label: string;
}

export interface RangeSelectorProps {
  options: RangeOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}

/** Selettore segmentato accessibile (radiogroup) usato per gli intervalli date. */
export function RangeSelector({
  options,
  value,
  onChange,
  label,
  className,
}: RangeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-xl border border-pv-cyan/10 bg-pv-indigo/40 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-[40px] rounded-lg px-3.5 text-sm font-medium transition-colors",
              selected
                ? "bg-pv-cyan/15 text-pv-cyan"
                : "text-pv-ink-2 hover:text-pv-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// --- EmptyState ------------------------------------------------------------

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Stato vuoto condiviso, coerente con il design system. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-pv-cyan/20 bg-pv-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pv-cyan/10 text-pv-cyan">
          {icon}
        </span>
      )}
      <div>
        <p className="text-base font-semibold text-pv-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-pv-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// --- ProgressBar -----------------------------------------------------------

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  className?: string;
}

/** Barra di avanzamento accessibile (progressbar con valore percentuale). */
export function ProgressBar({
  value,
  max = 100,
  label,
  color = "#00D4FF",
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <p className="text-xs text-pv-ink-3">{label}</p>}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-pv-hover"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
