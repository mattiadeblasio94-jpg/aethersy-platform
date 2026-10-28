import type { Platform, PlatformId } from "@/lib/types";
import { PlatformCard } from "./PlatformCard";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export interface PlatformGridProps {
  platforms: Platform[];
  loading?: boolean;
  /** Id della piattaforma attualmente in fase di collegamento. */
  connectingId?: PlatformId | null;
  onConnect: (platformId: PlatformId) => void;
  onDisconnect?: (platformId: PlatformId) => void;
  emptyMessage?: string;
  className?: string;
}

/** Griglia responsive di PlatformCard (brief §3.1). */
export function PlatformGrid({
  platforms,
  loading = false,
  connectingId = null,
  onConnect,
  onDisconnect,
  emptyMessage = "Nessuna piattaforma disponibile.",
  className,
}: PlatformGridProps) {
  if (loading) {
    return <SkeletonCardGrid count={6} className={className} />;
  }

  if (platforms.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-secondary/20 bg-bg-card/50 px-4 py-10 text-center text-sm text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {platforms.map((platform) => (
        <PlatformCard
          key={platform.id}
          platform={platform}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          loading={connectingId === platform.id}
        />
      ))}
    </div>
  );
}
