import { cn } from "@pv/lib/utils";

export interface SkeletonProps {
  className?: string;
  /** Numero di righe da renderizzare in sequenza. */
  lines?: number;
}

export function Skeleton({ className, lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-4 animate-pulse rounded bg-pv-hover/70",
              index === lines - 1 && "w-2/3",
              className,
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("h-4 w-full animate-pulse rounded bg-pv-hover/70", className)}
    />
  );
}

/** Placeholder per una griglia di card in fase di caricamento. */
export function SkeletonCardGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl border border-pv-cyan/10 bg-pv-card p-5"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="mt-2 h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder per una lista verticale. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-xl border border-pv-cyan/10 bg-pv-card p-4"
        >
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1">
            <Skeleton lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}
