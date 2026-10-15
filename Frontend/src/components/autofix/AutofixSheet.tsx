import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileCode,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DiffViewer } from "@/components/autofix/DiffViewer";
import {
  queryKeys,
  useApproveAutofix,
  useAutofixRun,
  useAutofixRuns,
  useDiscardAutofix,
} from "@/hooks/useApiQueries";
import { AUTOFIX_STATUS_LABEL, isAutofixFinished, isAutofixInProgress } from "@/lib/autofix";
import { safeUrl } from "@/lib/safeUrl";
import { formatRelativeTime } from "@/lib/timeUtils";
import { cn } from "@/lib/utils";
import type { AutofixRun, AutofixSkipped, AutofixStatus } from "@/types/assistant";

interface AutofixSheetProps {
  repoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The run shown in detail; null shows only the recent runs. */
  activeRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  /** Issue id -> a readable label, to say which issues a fix addresses. */
  issueLabels: Record<string, string>;
}

/**
 * Auto-fix runs for a repository: the run in progress (polled until it is
 * ready for review or finished), its proposed diffs with approve/discard,
 * and the recent runs.
 *
 * The polling hook lives outside the sheet's content so a run keeps being
 * tracked while the panel is closed.
 */
export function AutofixSheet({ repoId, open, onOpenChange, activeRunId, onSelectRun, issueLabels }: AutofixSheetProps) {
  const queryClient = useQueryClient();
  const run = useAutofixRun(activeRunId);
  const runs = useAutofixRuns(repoId, { enabled: !!repoId && open });

  // Refresh the recent-runs list whenever the tracked run changes state.
  const status = run.data?.status;
  const lastStatus = useRef<AutofixStatus | undefined>(undefined);
  useEffect(() => {
    if (status && status !== lastStatus.current) {
      lastStatus.current = status;
      queryClient.invalidateQueries({ queryKey: queryKeys.autofixRuns(repoId) });
    }
  }, [status, repoId, queryClient]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Fix with AI
          </SheetTitle>
          <SheetDescription className="text-xs">
            RepoIQ proposes changes for you to review. Nothing is pushed until you approve; then it opens a draft
            pull request on a new branch. It never changes your existing branches.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {activeRunId && (
            <section aria-labelledby="autofix-current">
              <h3 id="autofix-current" className="sr-only">
                Selected fix
              </h3>
              <RunDetail
                repoId={repoId}
                runId={activeRunId}
                run={run.data}
                isLoading={run.isLoading}
                isError={run.isError}
                errorMessage={run.error instanceof Error ? run.error.message : null}
                onRetry={() => run.refetch()}
                issueLabels={issueLabels}
              />
            </section>
          )}

          <section aria-labelledby="autofix-recent">
            <h3 id="autofix-recent" className="mb-2 text-sm font-semibold">
              Recent fixes
            </h3>
            {runs.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading recent fixes…
              </p>
            ) : runs.isError ? (
              <p className="text-sm text-muted-foreground">
                Couldn't load recent fixes.{" "}
                <button type="button" className="font-medium text-primary underline" onClick={() => runs.refetch()}>
                  Try again
                </button>
              </p>
            ) : !runs.data || runs.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fixes yet. Select issues in the list and choose Fix with AI.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {runs.data.map((r) => (
                  <li
                    key={r.id}
                    className={cn("flex flex-wrap items-center gap-3 px-3 py-2 text-sm", r.id === activeRunId && "bg-primary/5")}
                  >
                    <StatusBadge status={r.status} />
                    <span className="text-muted-foreground">
                      {r.issue_ids?.length ?? 0} {r.issue_ids?.length === 1 ? "issue" : "issues"} ·{" "}
                      {formatRelativeTime(r.created_at)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {r.pr_url && <PullRequestLink url={r.pr_url} number={r.pr_number} compact />}
                      {r.id !== activeRunId && (
                        <Button variant="ghost" size="sm" onClick={() => onSelectRun(r.id)}>
                          {r.status === "ready" ? "Review" : "View"}
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const STATUS_STYLE: Record<AutofixStatus, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  running: "border-primary/30 bg-primary/10 text-primary",
  ready: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  publishing: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  discarded: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: AutofixStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", STATUS_STYLE[status])}>
      {isAutofixInProgress(status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {AUTOFIX_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function PullRequestLink({ url, number, compact }: { url: string; number?: number | null; compact?: boolean }) {
  // The URL comes from GitHub via the backend; still, only ever link to http(s).
  const href = safeUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? (number ? `#${number}` : "Pull request") : `View draft pull request${number ? ` #${number}` : ""}`}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">(opens GitHub in a new tab)</span>
    </a>
  );
}

interface RunDetailProps {
  repoId: string;
  runId: string;
  run: AutofixRun | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  issueLabels: Record<string, string>;
}

function RunDetail({ repoId, runId, run, isLoading, isError, errorMessage, onRetry, issueLabels }: RunDetailProps) {
  const approve = useApproveAutofix(repoId);
  const discard = useDiscardAutofix(repoId);

  if (isLoading && !run) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading fix…
      </p>
    );
  }

  if (isError || !run) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn't load this fix</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{errorMessage || "Check your connection and try again."}</span>
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const label = (id: string) => issueLabels[id] ?? "An issue from an earlier analysis";
  const decisionError = approve.error ?? discard.error;
  const deciding = approve.isPending || discard.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <StatusBadge status={run.status} />
        <span className="text-xs text-muted-foreground">
          {run.issue_ids?.length ?? 0} selected {run.issue_ids?.length === 1 ? "issue" : "issues"} · started{" "}
          {formatRelativeTime(run.created_at)}
        </span>
      </div>

      {(run.status === "pending" || run.status === "running") && (
        <Progress
          title={run.status === "pending" ? "Waiting to start" : "Generating fixes"}
          body="RepoIQ is reading the affected files and drafting changes. This usually takes under a minute. You can close this panel; the fix keeps going."
        />
      )}

      {run.status === "publishing" && (
        <Progress
          title="Opening a draft pull request"
          body="Pushing the approved changes to a new branch and opening a draft pull request."
        />
      )}

      {run.status === "ready" && (
        <>
          {(run.proposals ?? []).length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm">
                Review the proposed changes. Approving opens a draft pull request with exactly these diffs.
              </p>
              {(run.proposals ?? []).map((proposal) => (
                <article key={proposal.file_path} className="space-y-2 rounded-lg border border-border p-3">
                  <header className="space-y-1">
                    <h4 className="flex items-center gap-1.5 break-all font-mono text-sm font-medium">
                      <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {proposal.file_path}
                    </h4>
                    {proposal.summary && <p className="text-sm text-muted-foreground">{proposal.summary}</p>}
                    {proposal.issue_ids?.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-muted-foreground">
                        {proposal.issue_ids.map((id) => (
                          <li key={id}>{label(id)}</li>
                        ))}
                      </ul>
                    )}
                  </header>
                  <DiffViewer diff={proposal.diff} label={`Proposed changes to ${proposal.file_path}`} />
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No changes were proposed.</p>
          )}

          <SkippedList skipped={run.skipped} />

          {decisionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {decisionError instanceof Error ? decisionError.message : "That didn't work. Try again."}
              </AlertDescription>
            </Alert>
          )}

          <div className="sticky bottom-0 -mx-5 flex flex-wrap justify-end gap-2 border-t border-border bg-background px-5 py-3">
            <DiscardButton onConfirm={() => discard.mutate(runId)} disabled={deciding} pending={discard.isPending} />
            {(run.proposals ?? []).length > 0 && (
              <Button onClick={() => approve.mutate(runId)} disabled={deciding} className="gap-1.5">
                {approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                )}
                Open pull request
              </Button>
            )}
          </div>
        </>
      )}

      {run.status === "completed" &&
        (run.pr_url ? (
          <Alert className="border-emerald-500/40" role="status">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle>Draft pull request opened</AlertTitle>
            <AlertDescription className="space-y-3">
              <PullRequestLink url={run.pr_url} number={run.pr_number} />
              {run.branch && (
                <p className="text-xs text-muted-foreground">
                  Branch <code className="font-mono">{run.branch}</code>
                </p>
              )}
              {(run.fixed_issue_ids ?? []).length > 0 && (
                <div>
                  <p className="text-sm font-medium">Addresses</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                    {(run.fixed_issue_ids ?? []).map((id) => (
                      <li key={id}>{label(id)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Review and merge it on GitHub. These issues are marked fixed after the next analysis of the merged
                code.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert role="status">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Nothing could be fixed safely</AlertTitle>
            <AlertDescription>
              RepoIQ didn't find a change it could make with confidence, so no pull request was opened.
            </AlertDescription>
          </Alert>
        ))}

      {run.status === "completed" && <SkippedList skipped={run.skipped} />}

      {run.status === "failed" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>The fix failed</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {run.error_message || "Something went wrong while preparing the fix. Try again with fewer issues."}
          </AlertDescription>
        </Alert>
      )}

      {run.status === "discarded" && (
        <p className="text-sm text-muted-foreground" role="status">
          Discarded. Nothing was pushed to GitHub.
        </p>
      )}

      {isAutofixFinished(run.status) && run.completed_at && (
        <p className="text-xs text-muted-foreground">Finished {formatRelativeTime(run.completed_at)}</p>
      )}
    </div>
  );
}

function Progress({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4" role="status">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function SkippedList({ skipped }: { skipped?: AutofixSkipped[] | null }) {
  if (!skipped || skipped.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium">Not changed</p>
      <ul className="mt-1 space-y-1 text-sm">
        {skipped.map((s, i) => (
          <li key={`${s.file_path}-${i}`} className="text-muted-foreground">
            <code className="break-all font-mono text-xs text-foreground">{s.file_path}</code>: {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiscardButton({ onConfirm, disabled, pending }: { onConfirm: () => void; disabled: boolean; pending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className="gap-1.5">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Discard
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard these changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The proposed changes are thrown away and nothing is pushed to GitHub. To try again, start a new fix.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Discard changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default AutofixSheet;
