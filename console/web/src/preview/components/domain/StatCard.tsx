import {
  BarChart3,
  Bot,
  Coins,
  Share2,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import type { DashboardStat } from "@pv/lib/types";
import { Card } from "@pv/components/ui/Card";
import { cn } from "@pv/lib/utils";

export interface StatCardProps {
  stat: DashboardStat;
  className?: string;
}

const ICONS: Record<DashboardStat["icon"], typeof BarChart3> = {
  platforms: Share2,
  agents: Bot,
  tasks: BarChart3,
  credits: Coins,
};

/**
 * Card di KPI della dashboard (brief §3.4). Un solo componente per tutte le
 * metriche, differenziate dall'icona e dal trend.
 */
export function StatCard({ stat, className }: StatCardProps) {
  const Icon = ICONS[stat.icon];
  const TrendIcon =
    stat.trend === "up" ? TrendingUp : stat.trend === "down" ? TrendingDown : Minus;

  const trendClass =
    stat.trend === "up"
      ? "text-pv-success"
      : stat.trend === "down"
        ? "text-pv-error"
        : "text-pv-ink-3";

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pv-cyan/15">
          <Icon className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
        </span>
        {stat.delta && (
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", trendClass)}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Andamento: </span>
            {stat.delta}
          </span>
        )}
      </div>

      <div>
        <p className="font-display text-2xl font-semibold text-pv-ink">{stat.value}</p>
        <p className="text-sm text-pv-ink-2">{stat.label}</p>
      </div>
    </Card>
  );
}
