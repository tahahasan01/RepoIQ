import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
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
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  X,
  Loader2,
  Wand2,
} from "lucide-react";
import type { ScanIssue } from "@/types/scan";

const severityColors: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

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
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
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

  const selectedIssueData = issues.find(
    (issue) => issue.id === selectedIssue
  );

  const handleCopyFix = () => {
    if (selectedIssueData) {
      navigator.clipboard.writeText(selectedIssueData.fix);
      setCopiedFix(true);
      setTimeout(() => setCopiedFix(false), 2000);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* Issues list */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold">Issues</h2>
              <span className="text-sm text-muted-foreground">
                {isLoading ? 'Loading...' : `${filteredIssues.length} found`}
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
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
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
                <GitHubAccessNotice
                  kind={startFix.error.kind}
                  message={startFix.error.message}
                  className="mb-4"
                />
              ) : (
                <div
                  role="alert"
                  className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
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

          {/* Issues table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card/90 backdrop-blur">
                <tr className="border-b border-border text-left">
                  <th className="w-10 p-3">
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
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    File
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Finding
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue, index) => (
                  <motion.tr
                    key={issue.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => setSelectedIssue(issue.id)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selectedIssue === issue.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="w-10 p-3 align-top" onClick={(e) => e.stopPropagation()}>
                      {isFixableIssueId(String(issue.id)) && (
                        <Checkbox
                          checked={fixSelection.includes(String(issue.id))}
                          onCheckedChange={() => toggleFix(String(issue.id))}
                          aria-label={`Select ${issue.file} line ${issue.line} to fix with AI`}
                        />
                      )}
                    </td>
                    <td className="p-3 align-top w-[12rem] max-w-[14rem]" title={`${issue.file}:${issue.line}`}>
                      <div className="font-mono text-sm font-medium truncate">
                        {issue.file.split("/").pop()}
                        <span className="text-muted-foreground font-normal">:{issue.line}</span>
                      </div>
                      {issue.file.includes("/") && (
                        <div className="font-mono text-xs text-muted-foreground truncate">
                          {issue.file.slice(0, issue.file.lastIndexOf("/"))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <span
                        className={`text-xs px-2 py-1 rounded-full border ${severityColors[issue.severity]}`}
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td className="p-3 align-top text-sm min-w-[16rem]">
                      <p>{issue.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{AREA_LABELS[issue.area ?? "quality"]}</span>
                        <span aria-hidden="true">/</span>
                        <span>{formatCategory(issue.type)}</span>
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary"
                      >
                        <Sparkles className="h-3 w-3" />
                          Suggestions
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

          {/* Suggestions panel */}
        {selectedIssueData && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="fixed inset-y-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] shadow-2xl bg-card xl:bg-transparent xl:static xl:inset-auto xl:z-auto xl:w-96 xl:shadow-none glass-panel rounded-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Suggestions</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedIssue(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Issue info */}
              <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      selectedIssueData.severity === "critical"
                        ? "text-destructive"
                        : selectedIssueData.severity === "high"
                        ? "text-orange-500"
                        : selectedIssueData.severity === "medium"
                        ? "text-warning"
                        : "text-success"
                    }`}
                  />
                  <span className="text-xs font-medium capitalize">{selectedIssueData.severity}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {AREA_LABELS[selectedIssueData.area ?? "quality"]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {formatCategory(selectedIssueData.type)}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {selectedIssueData.file}:{selectedIssueData.line}
                </p>
                <p className="text-sm">{selectedIssueData.description}</p>
              </div>

              {/* Code fix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">How to fix</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyFix}
                  >
                    {copiedFix ? (
                      <>
                        <Check className="h-3 w-3 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                {/* The suggestion is prose from the reviewer, not code, so it is
                    set as text; it used to be a monospace block that scrolled
                    sideways and repeated the paragraph above it. */}
                <p className="p-3 bg-foreground/5 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedIssueData.fix}
                </p>
              </div>
            </div>

          </motion.div>
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
