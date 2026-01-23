import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  Search,
  Filter,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  X,
} from "lucide-react";
import { scanStorage, ScanIssue } from "@/services/scanService";

const severityOrder = ["critical", "high", "medium", "low"];
const severityColors: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export default function Issues() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [copiedFix, setCopiedFix] = useState(false);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Issues caching functions
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

  const setCachedIssues = (repoId: string, issues: any[]) => {
    try {
      sessionStorage.setItem(
        ISSUES_CACHE_KEY(repoId),
        JSON.stringify({ issues, timestamp: Date.now() })
      );
    } catch {
      // Ignore storage errors
    }
  };

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
        // Keep showing cached data if available
        if (!issues.length) {
          setIssues([]);
        }
      } finally {
        setIsLoading(false);
      }
    }

    load();

    const handleScanCompleted = async (event: CustomEvent) => {
      // Clear cache on new scan
      if (repoId) {
        sessionStorage.removeItem(ISSUES_CACHE_KEY(repoId as string));
      }
      await load();
    };

    window.addEventListener("scanCompleted", handleScanCompleted as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("scanCompleted", handleScanCompleted as EventListener);
    };
  }, [repoId]);

  const severityOptions = ["critical", "high", "medium", "low"];
  const typeOptions = Array.from(new Set(issues.map((i) => i.type))).sort();

  const filteredIssues = issues.filter((issue) => {
    const matchesQuery =
      issue.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = selectedSeverities.length === 0
      ? true
      : selectedSeverities.includes(issue.severity);

    const matchesType = selectedTypes.length === 0
      ? true
      : selectedTypes.includes(issue.type);

    return matchesQuery && matchesSeverity && matchesType;
  });

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
            </div>
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

                <MultiSelectFilter
                  label="Type"
                  options={typeOptions}
                  selected={selectedTypes}
                  onChange={setSelectedTypes}
                />

                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </div>
            </div>
          </div>

          {/* Issues table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card/90 backdrop-blur">
                <tr className="border-b border-border text-left">
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    File
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Line
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground"></th>
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
                    <td className="p-3">
                      <code className="text-sm font-mono">{issue.file}</code>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {issue.line}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full border ${severityColors[issue.severity]}`}
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        {issue.type}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{issue.description}</td>
                    <td className="p-3">
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
            className="w-96 glass-panel rounded-xl overflow-hidden flex flex-col"
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
                  <span className="text-sm font-medium">
                    {selectedIssueData.description}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedIssueData.details}
                </p>
              </div>

              {/* Code fix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Suggested Fix</span>
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
                <pre className="p-4 bg-foreground/5 rounded-lg overflow-x-auto text-sm font-mono">
                  <code>{selectedIssueData.fix}</code>
                </pre>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border">
              <Button variant="outline" className="w-full">
                Ignore
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
