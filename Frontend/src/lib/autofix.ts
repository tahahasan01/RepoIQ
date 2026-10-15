/**
 * Auto-fix rules shared by the Issues page and its tests: which issues can be
 * selected, the selection limit, and when to keep polling a run.
 */
import type { AutofixRun, AutofixStatus } from "@/types/assistant";

/** The backend accepts at most this many issues per run (autofix.MAX_ISSUES_PER_RUN). */
export const MAX_AUTOFIX_ISSUES = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Only issues stored by the backend can be fixed. The Issues page gives rows
 * without an id a placeholder like "issue-3"; sending one would fail the
 * whole run with "Issue ids must be UUIDs".
 */
export function isFixableIssueId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

export interface SelectionResult {
  selected: string[];
  /** True when the change was refused because the limit is reached. */
  limitReached: boolean;
}

/** Add or remove one issue, refusing to go past the limit. */
export function toggleIssueSelection(
  selected: readonly string[],
  id: string,
  max: number = MAX_AUTOFIX_ISSUES
): SelectionResult {
  if (selected.includes(id)) {
    return { selected: selected.filter((s) => s !== id), limitReached: false };
  }
  if (selected.length >= max) {
    return { selected: [...selected], limitReached: true };
  }
  return { selected: [...selected, id], limitReached: false };
}

/**
 * Add the given (visible) issues to the selection, in order, until the limit.
 * `limitReached` is true when some of them did not fit.
 */
export function selectIssues(
  selected: readonly string[],
  ids: readonly string[],
  max: number = MAX_AUTOFIX_ISSUES
): SelectionResult {
  const next = [...selected];
  let limitReached = false;
  for (const id of ids) {
    if (next.includes(id)) continue;
    if (next.length >= max) {
      limitReached = true;
      break;
    }
    next.push(id);
  }
  return { selected: next, limitReached };
}

/** Statuses where the backend is still working and the run must be polled. */
const IN_PROGRESS: ReadonlySet<AutofixStatus> = new Set(["pending", "running", "publishing"]);

export function isAutofixInProgress(status: AutofixStatus | undefined | null): boolean {
  return !!status && IN_PROGRESS.has(status);
}

/** Final states: nothing will change without a new run. */
export function isAutofixFinished(status: AutofixStatus | undefined | null): boolean {
  return status === "completed" || status === "failed" || status === "discarded";
}

const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 5000;
const FAST_POLL_WINDOW_MS = 60 * 1000;

/**
 * How long to wait before polling a run again, or false to stop.
 *
 * Polling stops at `ready` (waiting for the user, not the server), at any
 * final state, and when the request itself fails (a 404 will not fix itself
 * and the error is shown instead). It slows down after the first minute.
 */
export function nextAutofixPollDelay(
  run: Pick<AutofixRun, "status" | "created_at"> | undefined,
  hasError: boolean,
  now: number = Date.now()
): number | false {
  if (hasError) return false;
  if (!run) return FAST_POLL_MS;
  if (!isAutofixInProgress(run.status)) return false;
  const started = Date.parse(run.created_at);
  if (Number.isFinite(started) && now - started > FAST_POLL_WINDOW_MS) return SLOW_POLL_MS;
  return FAST_POLL_MS;
}

export const AUTOFIX_STATUS_LABEL: Record<AutofixStatus, string> = {
  pending: "Queued",
  running: "Generating fixes",
  ready: "Ready for review",
  publishing: "Opening pull request",
  completed: "Completed",
  failed: "Failed",
  discarded: "Discarded",
};
