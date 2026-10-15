import { describe, it, expect } from "vitest";
import {
  MAX_AUTOFIX_ISSUES,
  isAutofixFinished,
  isAutofixInProgress,
  isFixableIssueId,
  nextAutofixPollDelay,
  selectIssues,
  toggleIssueSelection,
} from "@/lib/autofix";
import type { AutofixStatus } from "@/types/assistant";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("issue selection", () => {
  it("adds and removes an issue", () => {
    expect(toggleIssueSelection([], "a")).toEqual({ selected: ["a"], limitReached: false });
    expect(toggleIssueSelection(["a", "b"], "a")).toEqual({ selected: ["b"], limitReached: false });
  });

  it(`refuses a ${MAX_AUTOFIX_ISSUES + 1}st issue but still allows removing one`, () => {
    const full = ids(MAX_AUTOFIX_ISSUES);
    const refused = toggleIssueSelection(full, "extra");
    expect(refused.limitReached).toBe(true);
    expect(refused.selected).toHaveLength(MAX_AUTOFIX_ISSUES);
    expect(refused.selected).not.toContain("extra");

    const removed = toggleIssueSelection(full, "id-0");
    expect(removed.limitReached).toBe(false);
    expect(removed.selected).toHaveLength(MAX_AUTOFIX_ISSUES - 1);
  });

  it("select-all fills up to the limit, keeps order and skips duplicates", () => {
    const result = selectIssues(["id-3"], ids(30));
    expect(result.selected).toHaveLength(MAX_AUTOFIX_ISSUES);
    expect(result.selected[0]).toBe("id-3");
    expect(new Set(result.selected).size).toBe(MAX_AUTOFIX_ISSUES);
    expect(result.limitReached).toBe(true);

    expect(selectIssues([], ids(5))).toEqual({ selected: ids(5), limitReached: false });
  });

  it("only real (UUID) issue ids can be fixed", () => {
    expect(isFixableIssueId("3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b")).toBe(true);
    expect(isFixableIssueId("issue-3")).toBe(false);
    expect(isFixableIssueId(7)).toBe(false);
  });
});

describe("run polling", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const run = (status: AutofixStatus, secondsAgo = 5) => ({
    status,
    created_at: new Date(now - secondsAgo * 1000).toISOString(),
  });

  it("polls while the backend is working", () => {
    for (const status of ["pending", "running", "publishing"] as const) {
      expect(nextAutofixPollDelay(run(status), false, now)).toBe(2000);
      expect(isAutofixInProgress(status)).toBe(true);
    }
  });

  it("stops at ready (waiting for the user) and at every final state", () => {
    for (const status of ["ready", "completed", "failed", "discarded"] as const) {
      expect(nextAutofixPollDelay(run(status), false, now)).toBe(false);
    }
    expect(isAutofixFinished("ready")).toBe(false);
    expect(isAutofixFinished("completed")).toBe(true);
  });

  it("stops when the request fails, and polls before the first response", () => {
    expect(nextAutofixPollDelay(run("running"), true, now)).toBe(false);
    expect(nextAutofixPollDelay(undefined, false, now)).toBe(2000);
  });

  it("slows down after the first minute", () => {
    expect(nextAutofixPollDelay(run("running", 90), false, now)).toBe(5000);
  });
});
