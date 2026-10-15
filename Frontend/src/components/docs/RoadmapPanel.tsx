import { CalendarClock, Map as MapIcon, Rocket, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { FilePath } from "@/components/shared/FilePath";
import { useRoadmap } from "@/hooks/useApiQueries";
import { ApiRequestError } from "@/lib/apiErrors";
import { Link } from "react-router-dom";
import { AREA_LABELS, findingArea, formatCategory } from "@/lib/findings";
import type { RoadmapItem } from "@/types/assistant";

/** The improvement roadmap the latest analysis produced: what to fix, in which order. */
export function RoadmapPanel({ repoId }: { repoId: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useRoadmap(repoId);

  if (isLoading) {
    return <LoadingState variant="list" count={4} label="Loading roadmap" />;
  }

  const noAnalysis = error instanceof ApiRequestError && error.status === 404;
  if (noAnalysis) {
    return (
      <EmptyState
        icon={MapIcon}
        title="No roadmap yet"
        body="Run an analysis from the Overview page and RepoIQ will order its findings into a roadmap."
      />
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        variant="error"
        title="Couldn't load the roadmap"
        body="Check your connection and try again."
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  const impact = data.estimated_impact ?? {};
  const counts = [
    { severity: "critical", value: impact.critical_issues ?? 0 },
    { severity: "high", value: impact.high_issues ?? 0 },
    { severity: "medium", value: impact.medium_issues ?? 0 },
    { severity: "low", value: impact.low_issues ?? 0 },
  ];

  const quick = data.quick_wins ?? [];
  const medium = data.medium_term ?? [];
  const long = data.long_term ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h4 className="mb-3 text-base font-semibold text-foreground">Findings in the latest analysis</h4>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {counts.map((c) => (
            <div key={c.severity} className="flex flex-col-reverse gap-2 rounded-xl border border-border p-4">
              <dd className="text-2xl font-semibold tabular-nums text-foreground">{c.value}</dd>
              <dt>
                <SeverityBadge severity={c.severity} />
              </dt>
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
    <section className="flex flex-col rounded-xl border border-border" aria-label={title}>
      <header className="border-b border-border px-4 py-3">
        <h5 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {total}
          </span>
        </h5>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {items.map((item, i) => (
            <li key={`${item.issue}-${i}`} className="space-y-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground">{item.issue}</p>
                {item.severity && <SeverityBadge severity={item.severity} />}
              </div>
              {item.file_path && <FilePath path={item.file_path} line={item.line_number} />}
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                {item.area && (
                  <>
                    <span className="font-medium text-foreground/80">{AREA_LABELS[findingArea(item.area)]}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
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
