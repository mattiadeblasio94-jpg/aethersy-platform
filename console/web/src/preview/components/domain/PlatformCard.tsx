import { Loader2 } from "lucide-react";
import type { Platform } from "@pv/lib/types";
import { Card } from "@pv/components/ui/Card";
import { Button } from "@pv/components/ui/Button";
import { StatusIndicator } from "./StatusIndicator";
import { cn, formatCompactNumber } from "@pv/lib/utils";

export interface PlatformCardProps {
  platform: Platform;
  onConnect: (platformId: Platform["id"]) => void;
  onDisconnect?: (platformId: Platform["id"]) => void;
  loading?: boolean;
  className?: string;
}

/**
 * Card di una piattaforma social (brief §3.1). Mostra icona, stato della
 * connessione e statistiche; il CTA cambia in base allo stato.
 */
export function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
  loading = false,
  className,
}: PlatformCardProps) {
  const isConnected = platform.status === "connected";
  const isPending = platform.status === "pending";

  return (
    <Card
      variant={isConnected ? "elevated" : "default"}
      interactive
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pv-cyan/15 bg-pv-indigo/60"
          style={{ boxShadow: `0 0 20px ${platform.color}22` }}
        >
          <img
            src={platform.icon}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6"
            style={{ color: platform.color }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-pv-ink">
            {platform.name}
          </h3>
          <p className="truncate text-sm text-pv-ink-3">
            {platform.accountName ?? "Nessun account collegato"}
          </p>
        </div>
      </div>

      <StatusIndicator status={platform.status} />

      {isConnected && (
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-pv-indigo/40 px-3 py-2">
            <dt className="text-xs text-pv-ink-3">Follower</dt>
            <dd className="text-sm font-semibold text-pv-ink">
              {formatCompactNumber(platform.stats.followers)}
            </dd>
          </div>
          <div className="rounded-lg bg-pv-indigo/40 px-3 py-2">
            <dt className="text-xs text-pv-ink-3">Post</dt>
            <dd className="text-sm font-semibold text-pv-ink">
              {formatCompactNumber(platform.stats.posts)}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-auto">
        {isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={() => onDisconnect?.(platform.id)}
          >
            Disconnetti
          </Button>
        ) : (
          <Button
            variant={isPending ? "secondary" : "primary"}
            size="sm"
            fullWidth
            loading={loading}
            onClick={() => onConnect(platform.id)}
            leftIcon={isPending ? <Loader2 className="h-4 w-4" aria-hidden="true" /> : undefined}
          >
            {isPending ? "Completa collegamento" : "Connetti"}
          </Button>
        )}
      </div>
    </Card>
  );
}
