import { useId, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { scoreColor, scoreLabel } from "@/lib/scoreColor";

export interface TrendPoint {
  date: string;
  score: number;
}

interface ScoreTrendChartProps {
  data: TrendPoint[];
  /** Name of the series in the tooltip, e.g. "Score" or "Average score". */
  seriesLabel?: string;
  /** Shown under the single score when there is only one point. */
  singlePointMessage: (point: TrendPoint) => ReactNode;
  /** Shown when there are no points at all. */
  emptyMessage: ReactNode;
  /** Accessible description of the chart. */
  ariaLabel?: string;
  /** Height utility for the chart area (default h-64). */
  heightClassName?: string;
  className?: string;
}

const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };

/**
 * A 0-100 score over time. A trend needs at least two points: with one, the
 * chart drew a single dot in an empty grid, which reads as broken rather than
 * as "not enough data yet", so one point is shown as the number itself.
 */
export function ScoreTrendChart({
  data,
  seriesLabel = "Score",
  singlePointMessage,
  emptyMessage,
  ariaLabel,
  heightClassName = "h-64",
  className,
}: ScoreTrendChartProps) {
  // useId gives ":r0:"; colons are not safe in an SVG url(#...) reference.
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (data.length < 2) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 text-center text-muted-foreground",
          heightClassName,
          className,
        )}
      >
        {data.length === 1 ? (
          <>
            <div
              className="text-4xl font-semibold tabular-nums"
              style={{ color: scoreColor(data[0].score) }}
              title={scoreLabel(data[0].score)}
            >
              {data[0].score}
            </div>
            <p className="max-w-xs text-sm">{singlePointMessage(data[0])}</p>
          </>
        ) : (
          <p className="max-w-xs text-sm">{emptyMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(heightClassName, className)}
      role="img"
      aria-label={ariaLabel ?? `${seriesLabel} over ${data.length} points`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={24} />
          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <Tooltip
            formatter={(value: number) => [value, seriesLabel]}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreTrendChart;
