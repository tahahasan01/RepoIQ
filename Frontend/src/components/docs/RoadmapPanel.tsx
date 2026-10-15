import { AlertTriangle, CalendarClock, Map as MapIcon, RefreshCw, Rocket, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoadmap } from "@/hooks/useApiQueries";
import { ApiRequestError } from "@/lib/apiErrors";
import { Link } from "react-router-dom";
import { AREA_LABELS, findingArea, formatCategory } from "@/lib/findings";
import type { RoadmapItem } from "@/types/assistant";

/** The improvement roadmap the latest analysis produced: what to fix, in which order. */
export function RoadmapPanel({ repoId }: { repoId: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useRoadmap(repoId);

  if (isLoading) {
    return (
      <div className="py-16 text-center" role="status">
        <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading roadmap…</p>
      </div>
    );
  }

  const noAnalysis = error instanceof ApiRequestError && error.status === 404;
  if (noAnalysis) {
    return (
      <div className="py-16 text-center">
        <MapIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-base font-medium text-foreground">No roadmap yet</p>
        <p className="text-sm text-muted-foreground">
          Run an analysis from the Overview page and RepoIQ will order its findings into a roadmap.
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-base font-medium text-foreground">Couldn't load the roadmap</p>
        <p className="mb-4 text-sm text-muted-foreground">Check your connection and try again.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  const impact = data.estimated_impact ?? {};
  const counts = [
    { label: "Critical", value: impact.critical_issues ?? 0, color: "text-red-600 dark:text-red-400" },
    { label: "High", value: impact.high_issues ?? 0, color: "text-orange-600 dark:text-orange-400" },
    { label: "Medium", value: impact.medium_issues ?? 0, color: "text-amber-600 dark:text-amber-400" },
    { label: "Low", value: impact.low_issues ?? 0, color: "text-emerald-600 dark:text-emerald-400" },
  ];

  const quick = data.quick_wins ?? [];
  const medium = data.medium_term ?? [];
  const long = data.long_term ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 text-base font-semibold text-foreground">Findings in the latest analysis</h3>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {counts.map((c) => (
            <div key={c.label} className="rounded-lg border border-border p-5 text-center">
              <dd className={`mb-1 text-2xl font-bold ${c.color}`}>{c.value}</dd>
              <dt className="text-xs font-medium text-muted-foreground">{c.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {quick.length + medium.length + long.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          The latest analysis found nothing to fix.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <RoadmapColumn
            icon={Zap}
            title="Fix first"
            hint="Critical and high severity, security first."
            items={quick}
            total={impact.fix_first_total ?? quick.length}
            empty="Nothing critical or high."
            repoId={repoId}
          />
          <RoadmapColumn
            icon={CalendarClock}
            title="Next"
            hint="Medium severity."
            items={medium}
            total={impact.next_total ?? medium.length}
            empty="Nothing of medium severity."
            repoId={repoId}
          />
          <RoadmapColumn
            icon={Rocket}
            title="Later"
            hint="Low severity, and architecture changes that take longer."
            items={long}
            total={impact.later_total ?? long.length}
            empty="Nothing left after the above."
            repoId={repoId}
          />
        </div>
      )}
    </div>
  );
}

function RoadmapColumn({
  icon: Icon,
  title,
  hint,
  items,
  total,
  empty,
  repoId,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  items: RoadmapItem[];
  total: number;
  empty: string;
  repoId: string;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border" aria-label={title}>
      <header className="border-b border-border bg-muted/30 px-4 py-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {total}
          </span>
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {items.map((item, i) => (
            <li key={`${item.issue}-${i}`} className="px-4 py-3">
              <p className="text-sm text-foreground">{item.issue}</p>
              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {item.file_path && (
                  <code className="font-mono" title={item.file_path}>
                    {item.file_path.split("/").pop()}
                    {item.line_number ? `:${item.line_number}` : ""}
                  </code>
                )}
                {item.severity && <span className="capitalize">{item.severity}</span>}
                {item.area && <span>{AREA_LABELS[findingArea(item.area)]}</span>}
                <span>{formatCategory(item.category)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
      {total > items.length && (
        <Link
          to={`/dashboard/${repoId}/issues`}
          className="border-t border-border px-4 py-2 text-xs font-medium text-link hover:underline"
        >
          {total - items.length} more in Issues
        </Link>
      )}
    </section>
  );
}

export default RoadmapPanel;
