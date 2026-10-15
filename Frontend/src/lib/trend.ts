export interface TrendPoint {
  date: string;
  score: number;
}

interface HistoryItem {
  completed_at?: string | null;
  overall_score?: number | null;
}

/**
 * Score-trend points, oldest first, from analysis history (newest first).
 *
 * Labels are dates. When two runs share a day, every label carries the time
 * too - otherwise the axis read "Oct 15 ... Oct 15" and the points could not
 * be told apart.
 */
export function buildTrend(history: HistoryItem[]): TrendPoint[] {
  const runs = [...history].reverse();
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const days = runs.filter((r) => r.completed_at).map((r) => day(r.completed_at!));
  const sameDay = new Set(days).size !== days.length;

  return runs.map((item, index) => ({
    date: item.completed_at
      ? sameDay
        ? new Date(item.completed_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : day(item.completed_at)
      : `Run ${index + 1}`,
    score: item.overall_score || 0,
  }));
}
