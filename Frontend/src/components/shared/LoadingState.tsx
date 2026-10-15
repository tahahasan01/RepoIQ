import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Fixed widths, cycled. Random widths re-roll on every render, so the skeleton
 * shimmers into a new shape each time anything updates.
 */
export const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-5/6", "w-2/3", "w-3/5", "w-4/5"] as const;

export function skeletonWidth(index: number): string {
  return SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
}

interface LoadingStateProps {
  /**
   * list:  rows with a title line and a detail line.
   * lines: single lines (code, file trees).
   * tiles: a grid of stat tiles.
   */
  variant?: "list" | "lines" | "tiles";
  count?: number;
  /** What is loading, for screen readers. */
  label?: string;
  className?: string;
}

/**
 * Skeleton blocks in the shape of what is loading. Spinners belong inside the
 * button that started the work; a page or panel that is loading gets this.
 */
export function LoadingState({ variant = "list", count, label = "Loading", className }: LoadingStateProps) {
  const n = count ?? (variant === "tiles" ? 4 : variant === "lines" ? 8 : 4);
  const items = Array.from({ length: n }, (_, i) => i);

  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {variant === "tiles" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
          {items.map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-7 w-12" />
            </div>
          ))}
        </div>
      )}
      {variant === "list" && (
        <div className="space-y-3" aria-hidden="true">
          {items.map((i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className={cn("mt-2 h-3", skeletonWidth(i))} />
            </div>
          ))}
        </div>
      )}
      {variant === "lines" && (
        <div className="space-y-2" aria-hidden="true">
          {items.map((i) => (
            <Skeleton key={i} className={cn("h-4", skeletonWidth(i))} />
          ))}
        </div>
      )}
    </div>
  );
}

export default LoadingState;
