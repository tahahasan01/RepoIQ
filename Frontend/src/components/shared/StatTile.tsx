import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { scoreLabel, scoreTextClass } from "@/lib/scoreColor";

interface StatTileProps {
  label: string;
  /** A plain value. Ignored when `score` is given. */
  value?: ReactNode;
  /** A 0-100 score: rendered in its band's colour, with the band in words for screen readers. */
  score?: number | null;
  icon?: ComponentType<{ className?: string }>;
  /** A short line under the value. */
  hint?: ReactNode;
  className?: string;
}

/** One number on a plain surface: the label, the value, and optionally a hint. */
export function StatTile({ label, value, score, icon: Icon, hint, className }: StatTileProps) {
  const isScore = score !== undefined;
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      {isScore ? (
        <div
          className={cn("mt-2 text-2xl font-semibold tabular-nums", scoreTextClass(score))}
          title={scoreLabel(score)}
        >
          {score === null ? "–" : Math.round(score)}
          <span className="sr-only"> ({scoreLabel(score)})</span>
        </div>
      ) : (
        <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      )}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default StatTile;
