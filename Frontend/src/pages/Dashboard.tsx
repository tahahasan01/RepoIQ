import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Shield, Code2, GitBranch, FileText, TrendingUp, CheckCircle2, Info } from "lucide-react";
import apiClient from "@/lib/api";
import { scoreTextClass } from "@/lib/scoreColor";
import { buildTrend } from "@/lib/trend";
import { findingArea, type FindingArea } from "@/lib/findings";
import { StatTile } from "@/components/shared/StatTile";
import { FindingRow } from "@/components/shared/FindingRow";
import { ScoreTrendChart } from "@/components/shared/ScoreTrendChart";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";

interface DashboardIssue {
  id: number | string;
  file: string;
  line: number;
  severity: string;
  type: string;
  area: FindingArea;
  description: string;
}

/** An API finding in the shape the dashboard lists. */
const toDashboardIssue = (issue: any): DashboardIssue => ({
  id: issue.id,
  file: issue.file_path || issue.file,
  line: issue.line_number || issue.line,
  severity: issue.severity,
  type: issue.category || issue.type,
  area: findingArea(issue.agent_type),
  description: issue.description || issue.message || '',
});

// sessionStorage cache of the latest analysis per repository. Module scope so
// the loader below can be memoised without depending on them.
const CACHE_KEY = (id: string) => `repoiq_analysis_${id}`;

const getCachedAnalysis = (id: string) => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // expire after 30 minutes (increased from 5 for better UX)
    if (Date.now() - (parsed.timestamp || 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(CACHE_KEY(id));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const setCachedAnalysis = (id: string, data: unknown) => {
  try {
    sessionStorage.setItem(CACHE_KEY(id), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Storage full or blocked (private mode): the cache is only a speed-up.
  }
};

export default function Dashboard() {
  const { id: repoId } = useParams<{ id: string }>();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  // Load initial state from cache IMMEDIATELY to prevent flash of zeros
  const getInitialState = () => {
    // The cache holds the latest analysis; a specific one (?analysis_id) is
    // never cached, so it must not start out showing the latest.
    if (!repoId || analysisId) return { scores: null, stats: null, issues: [], history: [], trend: [] };
    const cached = getCachedAnalysis(repoId);
    if (!cached) return { scores: null, stats: null, issues: [], history: [], trend: [] };

    const scores = {
      overall: cached.overall_score || 0,
      security: cached.security_score || 0,
      quality: cached.quality_score || 0,
      architecture: cached.architecture_score || 0,
      documentation: cached.documentation_score || 0,
    };

    const mappedIssues = (cached.issues || []).map(toDashboardIssue);

    const stats = {
      critical: mappedIssues.filter((i: any) => i.severity === 'critical').length,
      high: mappedIssues.filter((i: any) => i.severity === 'high').length,
      medium: mappedIssues.filter((i: any) => i.severity === 'medium').length,
      low: mappedIssues.filter((i: any) => i.severity === 'low').length,
      total: mappedIssues.length,
    };

    return { scores, stats, issues: mappedIssues.slice(0, 5), history: cached.history || [], trend: [] };
  };

  const initialState = getInitialState();
  const [stats, setStats] = useState(initialState.stats || { critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  // How much of the repository the scores describe. An analysis reviews up to
  // ANALYSIS_MAX_FILES files, so a large repository is scored from a sample;
  // without this the page presented a 14-of-216-file sample as the whole repo.
  const [coverage, setCoverage] = useState<{ analyzed: number | null; eligible: number | null; commit: string | null }>(
    { analyzed: null, eligible: null, commit: null }
  );
  const [scores, setScores] = useState(initialState.scores || {
    overall: 0,
    security: 0,
    quality: 0,
    architecture: 0,
    documentation: 0
  });
  const [recentIssues, setRecentIssues] = useState<DashboardIssue[]>(initialState.issues);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>(initialState.history);
  const [trendData, setTrendData] = useState<any[]>(initialState.trend);
  // Only show loading spinner if we have NO cached data - otherwise show cached data instantly
  const hasInitialData = initialState.scores !== null;
  const [loading, setLoading] = useState(!hasInitialData);
  const [analyzing, setAnalyzing] = useState(false);

  // Pending "still in progress" re-poll, cleared when the repository or
  // analysis changes or the page unmounts so it cannot keep polling (and
  // setting state for) a repository that is no longer on screen.
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadAnalysisData = useCallback(async (forceRefresh: boolean = false) => {
      if (!repoId || repoId === 'undefined') {
        console.log('[Dashboard] Invalid repoId:', repoId);
        setLoading(false);
        return;
      }
      
      try {
        // Try cached analysis first for instant UI (unless force refresh)
        // The cache holds the latest analysis only; skip it for a specific one.
        const cached = !forceRefresh && !analysisId ? getCachedAnalysis(repoId) : null;
        
        // Only show loading if we don't have cached data
        if (!cached) {
          setLoading(true);
        }
        console.log('[Dashboard] Loading analysis results for repo:', repoId, 'forceRefresh:', forceRefresh, 'hasCached:', !!cached);
        if (cached) {
          console.log('[Dashboard] Using cached analysis data');
          console.log('[Dashboard] Cached issues count:', cached.issues?.length || 0);
          console.debug('[Dashboard] cached object keys:', Object.keys(cached));
          setCoverage({
            analyzed: cached.files_analyzed ?? null,
            eligible: cached.files_eligible ?? null,
            commit: cached.commit_sha ?? null,
          });
          if (cached.issues && cached.issues.length > 0) {
            setScores({
              overall: cached.overall_score || 0,
              security: cached.security_score || 0,
              quality: cached.quality_score || 0,
              architecture: cached.architecture_score || 0,
              documentation: cached.documentation_score || 0,
            });

            const mappedIssues = cached.issues.map(toDashboardIssue);
            setRecentIssues(mappedIssues.slice(0, 5));

            const statsCalc = {
              critical: mappedIssues.filter((i: any) => i.severity === 'critical').length,
              high: mappedIssues.filter((i: any) => i.severity === 'high').length,
              medium: mappedIssues.filter((i: any) => i.severity === 'medium').length,
              low: mappedIssues.filter((i: any) => i.severity === 'low').length,
              total: mappedIssues.length,
            };
            setStats(statsCalc);

            console.log('[Dashboard] Set stats from cache:', statsCalc);
          } else {
            console.warn('[Dashboard] Cached data has no issues array or is empty');
          }

          if (cached.history) {
            setAnalysisHistory(cached.history);
            setTrendData(buildTrend(cached.history));
          }
        }

        // Fetch analysis results from backend (fresh)
        console.log('[Dashboard] Fetching fresh analysis from API...');
        console.log('[Dashboard] analysis_id from URL:', analysisId || 'none (using latest)');
        
        // Use specific analysis if analysis_id provided, otherwise get latest
        const results = analysisId 
          ? await apiClient.getAnalysisById(analysisId).catch((err) => {
              console.error('[Dashboard] ❌ Failed to get specific analysis:', analysisId, err);
              return null;
            })
          : await apiClient.getAnalysisResults(repoId).catch((err) => {
              console.error('[Dashboard] ❌ API ERROR - Failed to get analysis results:', err);
              if (err?.message?.includes('404') || err?.message?.includes('not found')) {
                console.log('[Dashboard] No analysis found for this repository yet');
              }
              return null;
            });
        console.log('[Dashboard] API response received:', results ? 'Success' : 'No data');
        console.log('[Dashboard] Full results object:', results);
        console.log('[Dashboard] Results keys:', results ? Object.keys(results) : 'null');
        console.log('[Dashboard] Analysis ID used:', analysisId || 'latest');
        
        // Fetch analysis history
        const historyData = await apiClient.getAnalysisHistory(repoId).catch(() => null);
        
        // Check if analysis is still in progress
        if (results && results.status === 'in_progress') {
          setAnalyzing(true);
          // Poll every 3 seconds until complete
          clearTimeout(pollTimer.current);
          pollTimer.current = setTimeout(() => loadAnalysisData(), 3000);
          return;
        }
        
        setAnalyzing(false);
        
        // Check if we have analysis results (even if no issues)
        if (results && (results.status === 'completed' || results.overall_score != null)) {
          console.log('[Dashboard] Loaded analysis results:', results);
          console.log('[Dashboard] Analysis status:', results.status);
          console.log('[Dashboard] Scores:', {
            overall: results.overall_score,
            security: results.security_score,
            quality: results.quality_score,
            architecture: results.architecture_score,
            documentation: results.documentation_score
          });
          console.log('[Dashboard] Issues count:', results.issues?.length || 0);
          console.log('[Dashboard] First few issues:', results.issues?.slice(0, 3));
          
          // Set scores from backend with fallbacks for different naming conventions
          const scoresData = {
            overall: results.overall_score ?? results.overallScore ?? 0,
            security: results.security_score ?? results.securityScore ?? 0,
            quality: results.quality_score ?? results.qualityScore ?? 0,
            architecture: results.architecture_score ?? results.architectureScore ?? 0,
            documentation: results.documentation_score ?? results.documentationScore ?? 0
          };
          
          console.log('[Dashboard] Setting scores:', scoresData);
          setScores(scoresData);
          setCoverage({
            analyzed: results.files_analyzed ?? null,
            eligible: results.files_eligible ?? null,
            commit: results.commit_sha ?? null,
          });
          
          // Map backend issues to frontend format (may be empty array)
          const mappedIssues = (results.issues || []).map(toDashboardIssue);
          
          setRecentIssues(mappedIssues.slice(0, 5));
          console.log('[Dashboard] Mapped issues count:', mappedIssues.length);
          console.log('[Dashboard] recentIssues set to:', mappedIssues.slice(0,5));
          
          // Calculate stats
          const statsCalc = {
            critical: mappedIssues.filter((i: any) => i.severity === 'critical').length,
            high: mappedIssues.filter((i: any) => i.severity === 'high').length,
            medium: mappedIssues.filter((i: any) => i.severity === 'medium').length,
            low: mappedIssues.filter((i: any) => i.severity === 'low').length,
            total: mappedIssues.length,
          };
          
          console.log('[Dashboard] Calculated stats:', statsCalc);
          console.log('[Dashboard] Mapped issues count:', mappedIssues.length);
          setStats(statsCalc);

          
          // cache results for faster subsequent loads
          // (Only the latest: caching a historical analysis under the repository
          // key would show it as the latest on the next visit.)
          if (!analysisId) {
            setCachedAnalysis(repoId, { ...results, history: historyData?.history || historyData || null });
          }
        } else if (!cached) {
          // Only reset if we have NO cached data and NO fresh data
          console.log('[Dashboard] No analysis results found for repo:', repoId);
          console.log('[Dashboard] This repository has not been analyzed yet.');
          setScores({
            overall: 0,
            security: 0,
            quality: 0,
            architecture: 0,
            documentation: 0
          });
          setRecentIssues([]);
          setStats({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
        } else {
          // We have cached data and no fresh data - keep cached data
          console.log('[Dashboard] Using cached data (API returned no results)');
        }
        
        // Update history if we got fresh data
        if (historyData && historyData.history) {
          console.log('[Dashboard] Loaded analysis history:', historyData.history.length, 'runs');
          setAnalysisHistory(historyData.history);
          
          setTrendData(buildTrend(historyData.history));
        }
      } catch (error) {
        console.error('[Dashboard] Error loading analysis:', error);
      } finally {
        setLoading(false);
      }
  }, [repoId, analysisId]);

  useEffect(() => {
    loadAnalysisData();

    // Listen for analysis completion to refresh data. (A "scanCompleted"
    // listener that read a mock scan result used to sit here; nothing has
    // dispatched that event since the mock scanner was replaced by the API.)
    const handleAnalysisCompleted = (event: CustomEvent) => {
      console.log('[Dashboard] Analysis completed event received:', event.detail);
      if (event.detail?.repoId === repoId) {
        console.log('[Dashboard] Reloading data after analysis completion');
        loadAnalysisData(true); // Force refresh
      }
    };
    
    // Listen for dashboard refresh events
    const handleDashboardRefresh = (event: CustomEvent) => {
      console.log('[Dashboard] Dashboard refresh event received:', event.detail);
      if (event.detail?.repoId === repoId) {
        loadAnalysisData(true); // Force refresh
      }
    };

    window.addEventListener("analysisCompleted", handleAnalysisCompleted as EventListener);
    window.addEventListener("dashboardRefresh", handleDashboardRefresh as EventListener);
    
    return () => {
      window.removeEventListener("analysisCompleted", handleAnalysisCompleted as EventListener);
      window.removeEventListener("dashboardRefresh", handleDashboardRefresh as EventListener);
      clearTimeout(pollTimer.current);
    };
    // loadAnalysisData changes with analysisId as well: picking a past run in
    // the history modal only changes ?analysis_id, and with [repoId] alone this
    // page kept showing the run that was already on screen.
  }, [repoId, loadAnalysisData]);

  // Build score data from state.
  //
  // The "Testing" tile that used to sit here was hardcoded to 0 - the backend
  // has no testing dimension, so it always rendered "Testing 0" in warning
  // orange. Every user saw a permanent zero for something never measured, and
  // it was the worst-looking number on the page. A metric you do not compute
  // should not be displayed.
  const scoreData = [
    // Overall spans two columns on phones and tablets so no tile sits alone
    // in a row (2 + 2 + 1, or 3 + 2, otherwise).
    { name: "Overall", score: scores.overall, icon: TrendingUp, className: "col-span-2 lg:col-span-1" },
    { name: "Security", score: scores.security, icon: Shield },
    { name: "Quality", score: scores.quality, icon: Code2 },
    { name: "Architecture", score: scores.architecture, icon: GitBranch },
    { name: "Docs", score: scores.documentation, icon: FileText },
  ];

  const severityData = [
    { name: 'Critical', value: stats.critical, color: 'hsl(var(--sev-critical))' },
    { name: 'High', value: stats.high, color: 'hsl(var(--sev-high))' },
    { name: 'Medium', value: stats.medium, color: 'hsl(var(--sev-medium))' },
    { name: 'Low', value: stats.low, color: 'hsl(var(--sev-low))' },
  ];

  const issuesHref = `/dashboard/${repoId}/issues`;

  if (loading && !analyzing) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <LoadingState variant="tiles" count={5} label="Loading analysis" />
          <LoadingState variant="list" count={3} label="Loading recent issues" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* No analysis banner */}
        {!analyzing && scores.overall === 0 && recentIssues.length === 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium text-foreground">No analysis yet</div>
              <div className="text-sm text-muted-foreground">
                This repository hasn't been analyzed yet. Use Run Scan to start the first analysis.
              </div>
            </div>
          </div>
        )}

        {/* Analyzing banner */}
        {analyzing && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            <div>
              <div className="font-medium text-foreground">Analyzing repository</div>
              <div className="text-sm text-muted-foreground">
                AI agents are reviewing your code. This can take a few minutes.
              </div>
            </div>
          </div>
        )}

        {/* Score tiles */}
        <div className="space-y-2">
          {coverage.analyzed != null && coverage.analyzed > 0 && (
            <p className="text-sm text-muted-foreground">
              {coverage.eligible != null && coverage.eligible > coverage.analyzed ? (
                <>
                  Scores are based on the <span className="font-medium text-foreground">{coverage.analyzed}</span> most
                  important of <span className="font-medium text-foreground">{coverage.eligible}</span> source files
                </>
              ) : (
                <>
                  Scores are based on all <span className="font-medium text-foreground">{coverage.analyzed}</span> source
                  files
                </>
              )}
              {coverage.commit && (
                <>
                  {" "}at commit <code className="font-mono text-xs">{coverage.commit.slice(0, 7)}</code>
                </>
              )}
              .
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {scoreData.map((item) => (
              <StatTile
                key={item.name}
                label={item.name}
                score={item.score}
                icon={item.icon}
                className={item.className}
              />
            ))}
          </div>
          <Link to="/docs#scores" className="inline-block text-sm text-link hover:underline">
            About scores
          </Link>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Trend chart */}
          <section className="glass-panel rounded-xl p-6 lg:col-span-2" aria-labelledby="score-trend-heading">
            <h3 id="score-trend-heading" className="mb-4 text-lg font-semibold">
              Score trend
            </h3>
            <ScoreTrendChart
              data={trendData}
              seriesLabel="Overall score"
              ariaLabel={`Overall score over the last ${trendData.length} analyses`}
              singlePointMessage={(point) => `First scan on ${point.date}. Run another to see the trend.`}
              emptyMessage="No analysis history yet. Run your first analysis to start the trend."
            />
          </section>

          {/* Issues by severity */}
          <section className="glass-panel rounded-xl p-6" aria-labelledby="severity-heading">
            <h3 id="severity-heading" className="mb-4 text-lg font-semibold">
              Issues by severity
            </h3>
            {/* A donut shows proportion. With only one severity present it drew
                a complete ring - visually "100% critical", which is alarming and
                says nothing. Below two categories, the count is the honest
                rendering. */}
            {stats.total > 0 && severityData.filter(d => d.value > 0).length < 2 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-1">
                {severityData.filter(d => d.value > 0).map((item) => (
                  <div key={item.name} className="flex flex-col items-center">
                    <div className="text-5xl font-semibold tabular-nums" style={{ color: item.color }}>
                      {item.value}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {item.name.toLowerCase()} {item.value === 1 ? 'issue' : 'issues'}
                    </div>
                  </div>
                ))}
              </div>
            ) : stats.total > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {severityData.filter(d => d.value > 0).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No issues found" className="h-48 py-0" />
            )}
            {stats.total > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {severityData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <dt className="text-muted-foreground">{item.name}</dt>
                    <dd className="ml-auto font-medium tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        {/* Analysis history */}
        {analysisHistory.length > 0 && (
          <section className="glass-panel rounded-xl p-6" aria-labelledby="history-heading">
            <h3 id="history-heading" className="mb-4 text-lg font-semibold">
              Analysis history
            </h3>
            <ol className="space-y-2">
              {analysisHistory.slice(0, 5).map((analysis, index) => (
                <li key={analysis.id}>
                  <Link
                    to={`/dashboard/${repoId}?analysis_id=${analysis.id}`}
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">
                        {analysis.completed_at
                          ? new Date(analysis.completed_at).toLocaleString()
                          : 'In progress'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Run {analysisHistory.length - index}
                      </span>
                    </div>
                    <HistoryScores analysis={analysis} />
                  </Link>
                </li>
              ))}
            </ol>
            {analysisHistory.length > 5 && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Showing 5 of {analysisHistory.length} analyses
              </p>
            )}
          </section>
        )}

        {/* Recent issues */}
        <section className="glass-panel rounded-xl p-6" aria-labelledby="recent-heading">
          <div className="mb-4 flex items-center justify-between">
            <h3 id="recent-heading" className="text-lg font-semibold">
              Recent issues
            </h3>
            <Link to={issuesHref} className="text-sm text-link hover:underline">
              View all
            </Link>
          </div>
          {recentIssues.length > 0 ? (
            <ul className="space-y-2">
              {recentIssues.map((issue) => (
                <li key={issue.id}>
                  <FindingRow
                    variant="compact"
                    finding={issue}
                    href={`${issuesHref}?finding=${encodeURIComponent(String(issue.id))}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recent issues" body="Findings from the latest analysis appear here." className="py-8" />
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

const HISTORY_SCORES: { key: string; label: string }[] = [
  { key: "overall_score", label: "Overall" },
  { key: "security_score", label: "Security" },
  { key: "quality_score", label: "Quality" },
  { key: "architecture_score", label: "Architecture" },
];

/** "Overall 72 · Security 75 · Quality 79 · Architecture 80 · 12 issues", each score in its band's colour. */
function HistoryScores({ analysis }: { analysis: Record<string, any> }) {
  const issues = analysis.total_issues || 0;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      {HISTORY_SCORES.map(({ key, label }) => {
        const value = analysis[key];
        return (
          <span key={key} className="whitespace-nowrap">
            {label}{" "}
            <span className={`font-medium tabular-nums ${scoreTextClass(value)}`}>{value ?? "–"}</span>
            <span aria-hidden="true" className="ml-1.5">·</span>
          </span>
        );
      })}
      <span className="whitespace-nowrap">
        {issues} {issues === 1 ? 'issue' : 'issues'}
      </span>
    </p>
  );
}
