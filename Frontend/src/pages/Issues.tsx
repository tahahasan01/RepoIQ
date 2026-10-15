import { motion } from "framer-motion";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { AREA_LABELS, FINDING_AREAS, findingArea, formatCategory } from "@/lib/findings";
import { Checkbox } from "@/components/ui/checkbox";
import { AutofixSheet } from "@/components/autofix/AutofixSheet";
import { GitHubAccessNotice } from "@/components/GitHubAccessNotice";
import { useAutoFixIssues, useAutofixRun } from "@/hooks/useApiQueries";
import {
  MAX_AUTOFIX_ISSUES,
  isAutofixInProgress,
  isFixableIssueId,
  selectIssues,
  toggleIssueSelection,
} from "@/lib/autofix";
import { isGitHubAccessError } from "@/lib/apiErrors";
import {
  Search,
  SearchX,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  X,
  Loader2,
  Wand2,
} from "lucide-react";
import type { ScanIssue } from "@/types/scan";
import { FindingRow } from "@/components/shared/FindingRow";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";

// Issues caching functions. Module scope: they read nothing from the
// component, and the load effect below can then depend on repoId alone.
const ISSUES_CACHE_KEY = (repoId: string) => `repoiq_issues_${repoId}`;
const ANALYSIS_CACHE_KEY = (repoId: string) => `repoiq_analysis_${repoId}`; // Dashboard's cache

const getCachedIssues = (repoId: string) => {
  try {
    // First, try to get issues from Dashboard's analysis cache (most likely to exist)
    const analysisRaw = sessionStorage.getItem(ANALYSIS_CACHE_KEY(repoId));
    if (analysisRaw) {
      const analysisParsed = JSON.parse(analysisRaw);
      if (Date.now() - (analysisParsed.timestamp || 0) <= 30 * 60 * 1000) {
        if (analysisParsed.data?.issues && Array.isArray(analysisParsed.data.issues)) {
          console.log('[Issues] Found issues in Dashboard cache:', analysisParsed.data.issues.length);
          return analysisParsed.data.issues;
        }
      }
    }

    // Fallback to Issues-specific cache
    const issuesRaw = sessionStorage.getItem(ISSUES_CACHE_KEY(repoId));
    if (!issuesRaw) return null;
    const parsed = JSON.parse(issuesRaw);
    // Cache for 30 minutes (same as Dashboard)
    if (Date.now() - (parsed.timestamp || 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(ISSUES_CACHE_KEY(repoId));
      return null;
    }
    return parsed.issues;
  } catch {
    return null;
  }
};

const setCachedIssues = (repoId: string, issues: unknown[]) => {
  try {
    sessionStorage.setItem(
      ISSUES_CACHE_KEY(repoId),
      JSON.stringify({ issues, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage errors
  }
};

export default function Issues() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  // The open finding lives in the URL (?finding=<id>), so the dashboard and
  // anywhere else can link straight to one and the panel opens on arrival.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIssue = searchParams.get("finding");
  const openIssue = useCallback(
    (id: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("finding", id);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const closeIssue = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("finding");
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const [copiedFix, setCopiedFix] = useState(false);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Auto-fix: the issues picked for a fix, and the run being followed.
  const [fixSelection, setFixSelection] = useState<string[]>([]);
  const [limitNotice, setLimitNotice] = useState(false);
  const [autofixOpen, setAutofixOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // owner-only app: no role checks

  const params = useParams();
  // routes may provide :id or :repoId depending on the router setup
  const repoId = (params as any).id || (params as any).repoId;
  
  // Clear any stale mock data from localStorage on component mount
  useEffect(() => {
    // Clear old mock data keys
    const keysToRemove = ['repoiq_scans', 'repoiq_bug_reports'];
    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        console.log('[Issues] 🗑️ Clearing stale mock data:', key);
        localStorage.removeItem(key);
      }
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        if (!repoId) {
          console.warn('[Issues] No repoId in URL params');
          setIsLoading(false);
          return;
        }
        
        // INSTANT LOAD: Check cache first for immediate display
        const cachedIssues = getCachedIssues(repoId as string);
        if (cachedIssues && Array.isArray(cachedIssues) && cachedIssues.length > 0) {
          console.log('[Issues] ⚡ INSTANT: Showing', cachedIssues.length, 'cached issues');
          // Map cached issues to correct format
          const cachedMapped = cachedIssues.map((issue: any, idx: number) => ({
            id: issue.id || `issue-${idx}`,
            file: issue.file_path || issue.file || 'unknown',
            line: issue.line_number || issue.line || 1,
            severity: issue.severity || 'low',
            type: issue.category || issue.type || 'unknown',
            area: findingArea(issue.agent_type),
            description: issue.description || issue.message || 'No description',
            details: issue.suggestion || issue.details || '',
            fix: issue.suggestion || issue.fix || 'No fix available',
          }));
          setIssues(cachedMapped);
          setIsLoading(false); // Don't show loading - we have cached data!
          // Continue to fetch fresh data in background...
        } else {
          // No cache - show loading spinner
          setIsLoading(true);
        }
        
        console.log('[Issues] 🔄 Fetching fresh data from API...');
        // Fetch analysis results which includes issues
        const results = await apiClient.getAnalysisResults(repoId as string).catch((err) => {
          console.error('[Issues] ❌ API call failed:', err);
          return null;
        });
        if (!mounted) return;
        
        // Debug logging (reduced verbosity)
        if (results) {
          console.log('[Issues] 📦 API returned:', results.issues?.length || 0, 'issues');
        } else {
          console.log('[Issues] 📦 API returned null');
        }
        let issuesList: any[] = [];
        if (results && results.issues && Array.isArray(results.issues)) {
          console.log('[Issues] Found', results.issues.length, 'issues in results');
          // Backend returns issues with different field names - map them to frontend format
          issuesList = results.issues.map((issue: any, idx: number) => ({
            id: issue.id || `issue-${idx}`,
            file: issue.file_path || issue.file || 'unknown',
            line: issue.line_number || issue.line || 1,
            severity: issue.severity || 'low',
            type: issue.category || issue.type || 'unknown',
            area: findingArea(issue.agent_type),
            description: issue.description || issue.message || 'No description',
            details: issue.suggestion || issue.details || '',
            fix: issue.suggestion || issue.fix || 'No fix available',
          }));
            console.debug('[Issues] Mapped issues:', issuesList.slice(0, 10));
          } else if (results && (!results.issues || results.issues.length === 0) && results.id) {
            // If results.issues is missing or empty, always try the dedicated issues endpoint as a fallback.
            console.log('[Issues] results.issues empty or missing — attempting fallback to /analysis/{id}/issues for analysis id:', results.id);
            const issuesRes = await apiClient.getIssues(results.id).catch((e) => {
              console.warn('[Issues] Fallback issues endpoint failed:', e);
              return null;
            });
            if (issuesRes && Array.isArray(issuesRes)) {
              console.log('[Issues] Fallback returned', issuesRes.length, 'issues');
              issuesList = issuesRes.map((issue: any, idx: number) => ({
                id: issue.id || `issue-${idx}`,
                file: issue.file_path || issue.file || 'unknown',
                line: issue.line_number || issue.line || 1,
                severity: issue.severity || 'low',
                type: issue.category || issue.type || 'unknown',
                area: findingArea(issue.agent_type),
                description: issue.description || issue.message || 'No description',
                details: issue.suggestion || issue.details || '',
                fix: issue.suggestion || issue.fix || 'No fix available',
              }));
              console.debug('[Issues] Mapped fallback issues:', issuesList.slice(0, 10));
            } else {
              console.log('[Issues] Fallback did not return issues. issuesRes:', issuesRes);
          }
        } else if (!results) {
          // No API results - repository likely hasn't been analyzed yet
          console.log('[Issues] ℹ️ No analysis results found - please run an analysis first');
          issuesList = [];
        } else {
          console.log('[Issues] Results exist but no issues array:', results);
          console.log('[Issues] This could mean: 1) Analysis not completed, 2) No issues found');
        }

        // Update with fresh API data
        if (issuesList.length > 0) {
          console.log('[Issues] ✅ Updated with', issuesList.length, 'fresh issues');
          setIssues(issuesList);
          // Cache for instant loading on next visit
          setCachedIssues(repoId as string, issuesList);
        } else if (!cachedIssues || cachedIssues.length === 0) {
          // Only clear if we had no cached data either
          console.log('[Issues] ℹ️ No issues found (analysis may not be complete)');
          setIssues([]);
        }
        // If we had cached data and API returned empty, keep showing cached data
      } catch (err) {
        console.error("[Issues] ❌ API error:", err);
        // Keep showing cached data if available. (This used to check
        // `issues.length` here, but that was the value from the render that
        // started the effect - always [] - so an error wiped the cached list
        // that load() had just put on screen.)
      } finally {
        setIsLoading(false);
      }
    }

    load();

    // Reload when an analysis of this repository finishes. This listened for
    // "scanCompleted", which only the removed mock scanner ever dispatched, so
    // the list never refreshed; the notification store's polling dispatches
    // "analysisCompleted" with the repository id.
    const handleAnalysisCompleted = async (event: Event) => {
      const completedRepoId = (event as CustomEvent<{ repoId?: string }>).detail?.repoId;
      if (!repoId || String(completedRepoId) !== String(repoId)) return;
      sessionStorage.removeItem(ISSUES_CACHE_KEY(repoId as string));
      await load();
    };

    window.addEventListener("analysisCompleted", handleAnalysisCompleted);
    return () => {
      mounted = false;
      window.removeEventListener("analysisCompleted", handleAnalysisCompleted);
    };
  }, [repoId]);

  const severityOptions = ["critical", "high", "medium", "low"];
  const typeOptions = Array.from(new Set(issues.map((i) => i.type))).sort();

  const filteredIssues = issues.filter((issue) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      issue.file.toLowerCase().includes(query) ||
      issue.description.toLowerCase().includes(query) ||
      formatCategory(issue.type).toLowerCase().includes(query);

    const matchesSeverity = selectedSeverities.length === 0
      ? true
      : selectedSeverities.includes(issue.severity);

    const matchesType = selectedTypes.length === 0
      ? true
      : selectedTypes.includes(issue.type);

    const matchesArea = selectedAreas.length === 0
      ? true
      : selectedAreas.includes(issue.area ?? "quality");

    return matchesQuery && matchesSeverity && matchesType && matchesArea;
  });

  // ── Auto-fix selection ──
  const startFix = useAutoFixIssues();
  const activeRun = useAutofixRun(activeRunId);
  const fixInProgress = isAutofixInProgress(activeRun.data?.status);

  const visibleFixableIds = filteredIssues.map((i) => String(i.id)).filter(isFixableIssueId);
  const visibleSelected = visibleFixableIds.filter((id) => fixSelection.includes(id)).length;
  const headerChecked: boolean | "indeterminate" =
    visibleSelected === 0 ? false : visibleSelected === visibleFixableIds.length ? true : "indeterminate";

  const issueLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const i of issues) labels[String(i.id)] = `${i.description} (${i.file}:${i.line})`;
    return labels;
  }, [issues]);

  const toggleFix = (id: string) => {
    const result = toggleIssueSelection(fixSelection, id);
    setFixSelection(result.selected);
    setLimitNotice(result.limitReached);
  };

  const toggleAllVisible = () => {
    if (visibleSelected > 0) {
      setFixSelection((current) => current.filter((id) => !visibleFixableIds.includes(id)));
      setLimitNotice(false);
      return;
    }
    const result = selectIssues(fixSelection, visibleFixableIds);
    setFixSelection(result.selected);
    setLimitNotice(result.limitReached);
  };

  const handleStartFix = () => {
    if (!repoId || fixSelection.length === 0) return;
    startFix.mutate(
      { repoId: String(repoId), issueIds: fixSelection },
      {
        onSuccess: (res) => {
          setActiveRunId(res.run_id);
          setAutofixOpen(true);
          setFixSelection([]);
          setLimitNotice(false);
        },
      }
    );
  };

  const selectedIssueData = selectedIssue
    ? issues.find((issue) => String(issue.id) === selectedIssue)
    : undefined;

  const handleCopyFix = () => {
    if (selectedIssueData) {
      navigator.clipboard.writeText(selectedIssueData.fix);
      setCopiedFix(true);
      setTimeout(() => setCopiedFix(false), 2000);
    }
  };

  const filtersActive =
    searchQuery !== "" || selectedSeverities.length > 0 || selectedTypes.length > 0 || selectedAreas.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedSeverities([]);
    setSelectedTypes([]);
    setSelectedAreas([]);
  };

  const issueCheckbox = (issue: ScanIssue) =>
    isFixableIssueId(String(issue.id)) ? (
      <Checkbox
        checked={fixSelection.includes(String(issue.id))}
        onCheckedChange={() => toggleFix(String(issue.id))}
        aria-label={`Select ${issue.file} line ${issue.line} to fix with AI`}
      />
    ) : null;

  const suggestionsButton = (issue: ScanIssue) => (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-link"
      onClick={() => openIssue(String(issue.id))}
      aria-label={`Suggestions for ${issue.file} line ${issue.line}`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      Suggestions
    </Button>
  );

  const selectVisibleCheckbox = (
    <Checkbox
      checked={headerChecked}
      onCheckedChange={toggleAllVisible}
      disabled={visibleFixableIds.length === 0}
      aria-label={
        visibleSelected > 0
          ? "Clear the selection of visible issues"
          : `Select visible issues to fix (up to ${MAX_AUTOFIX_ISSUES})`
      }
    />
  );

  return (
    <DashboardLayout>
      <div className="flex gap-6 md:h-[calc(100vh-8rem)]">
        {/* Issues list */}
        <section
          aria-label="Findings"
          className="flex min-w-0 flex-1 flex-col glass-panel rounded-xl md:overflow-hidden"
        >
          {/* Header */}
          <div className="space-y-4 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-xl font-semibold">Issues</h2>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {isLoading ? "Loading…" : `${filteredIssues.length} found`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-2"
                onClick={() => setAutofixOpen(true)}
                aria-haspopup="dialog"
              >
                {fixInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                )}
                {fixInProgress ? "AI fix in progress" : activeRun.data?.status === "ready" ? "Review AI fix" : "AI fixes"}
              </Button>
            </div>
            {fixSelection.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium" aria-live="polite">
                  {fixSelection.length} of {MAX_AUTOFIX_ISSUES} selected
                </span>
                {limitNotice && (
                  <span className="text-xs text-muted-foreground" role="status">
                    You can fix up to {MAX_AUTOFIX_ISSUES} issues at a time.
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFixSelection([]);
                      setLimitNotice(false);
                      startFix.reset();
                    }}
                  >
                    Clear selection
                  </Button>
                  <Button size="sm" className="gap-2" onClick={handleStartFix} disabled={startFix.isPending}>
                    {startFix.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    Fix with AI
                  </Button>
                </div>
              </div>
            )}
            {startFix.isError &&
              (isGitHubAccessError(startFix.error) ? (
                <GitHubAccessNotice kind={startFix.error.kind} message={startFix.error.message} />
              ) : (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <span>
                    Couldn't start the fix.{" "}
                    {startFix.error instanceof Error && startFix.error.message
                      ? startFix.error.message
                      : "Try again in a moment."}
                  </span>
                  <button
                    type="button"
                    onClick={() => startFix.reset()}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative w-full md:flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  placeholder="Search issues…"
                  aria-label="Search issues"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelectFilter
                  label="Severity"
                  options={severityOptions}
                  selected={selectedSeverities}
                  onChange={setSelectedSeverities}
                />

                {/* Which score a finding counts against. Replaces a "Filter"
                    button that did nothing. */}
                <MultiSelectFilter
                  label="Area"
                  options={FINDING_AREAS}
                  selected={selectedAreas}
                  onChange={setSelectedAreas}
                  formatOption={(area) => AREA_LABELS[area as keyof typeof AREA_LABELS] ?? area}
                />

                <MultiSelectFilter
                  label="Type"
                  options={typeOptions}
                  selected={selectedTypes}
                  onChange={setSelectedTypes}
                  formatOption={formatCategory}
                />
              </div>
            </div>
          </div>

          {/* Findings: a table at md+, stacked cards on phones (the table used
              to scroll sideways there). */}
          <div className="md:flex-1 md:overflow-auto">
            {isLoading && issues.length === 0 ? (
              <div className="p-4">
                <LoadingState variant="list" count={6} label="Loading issues" />
              </div>
            ) : issues.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No findings"
                body="This repository hasn't been analyzed yet, or its latest analysis found nothing to fix."
              />
            ) : filteredIssues.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No findings match these filters"
                body="Try a different search, or clear the filters to see every finding."
                action={
                  filtersActive ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <table className="hidden w-full md:table">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border text-left">
                      <th className="w-10 p-3">{selectVisibleCheckbox}</th>
                      <th className="p-3 text-sm font-medium text-muted-foreground">File</th>
                      <th className="p-3 text-sm font-medium text-muted-foreground">Severity</th>
                      <th className="p-3 text-sm font-medium text-muted-foreground">Finding</th>
                      <th className="p-3 text-sm font-medium text-muted-foreground">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => (
                      <FindingRow
                        key={issue.id}
                        variant="row"
                        finding={issue}
                        selected={selectedIssue === String(issue.id)}
                        onOpen={() => openIssue(String(issue.id))}
                        checkbox={issueCheckbox(issue)}
                        actions={suggestionsButton(issue)}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="space-y-3 p-3 md:hidden">
                  <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                    {selectVisibleCheckbox}
                    <span aria-hidden="true">Select visible</span>
                  </div>
                  <ul className="space-y-2">
                    {filteredIssues.map((issue) => (
                      <FindingRow
                        key={issue.id}
                        variant="card"
                        finding={issue}
                        selected={selectedIssue === String(issue.id)}
                        onOpen={() => openIssue(String(issue.id))}
                        checkbox={issueCheckbox(issue)}
                        actions={suggestionsButton(issue)}
                      />
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Suggestions panel */}
        {selectedIssueData && (
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            aria-label="Suggestions"
            onKeyDown={(e) => {
              if (e.key === "Escape") closeIssue();
            }}
            className="fixed inset-y-4 right-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden glass-panel rounded-xl shadow-2xl xl:static xl:inset-auto xl:z-auto xl:w-96 xl:shadow-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">Suggestions</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={closeIssue} aria-label="Close suggestions">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-4 overflow-auto p-4">
              {/* Issue info */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={selectedIssueData.severity} />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {AREA_LABELS[selectedIssueData.area ?? "quality"]}
                    </span>
                    {" · "}
                    {formatCategory(selectedIssueData.type)}
                  </span>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {selectedIssueData.file}:{selectedIssueData.line}
                </p>
                <p className="text-sm">{selectedIssueData.description}</p>
              </div>

              {/* Code fix */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">How to fix</span>
                  <Button variant="ghost" size="sm" className="gap-2" onClick={handleCopyFix}>
                    {copiedFix ? (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                {/* The suggestion is prose from the reviewer, not code, so it is
                    set as text; it used to be a monospace block that scrolled
                    sideways and repeated the paragraph above it. */}
                <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                  {selectedIssueData.fix}
                </p>
              </div>
            </div>
          </motion.aside>
        )}
      </div>
      {repoId && (
        <AutofixSheet
          repoId={String(repoId)}
          open={autofixOpen}
          onOpenChange={setAutofixOpen}
          activeRunId={activeRunId}
          onSelectRun={setActiveRunId}
          issueLabels={issueLabels}
        />
      )}
    </DashboardLayout>
  );
}
