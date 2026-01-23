import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Shield,
  Code2,
  GitBranch,
  FileText,
  TestTube,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import apiClient from "@/lib/api";
import { scanStorage, ScanResult, ScanIssue } from "@/services/scanService";

const severityColors: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

interface DashboardIssue {
  id: number | string;
  file: string;
  line: number;
  severity: string;
  type: string;
  message: string;
}

export default function Dashboard() {
  const { id: repoId } = useParams<{ id: string }>();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  const [issuesByType, setIssuesByType] = useState<{ name: string; value: number; color: string }[]>([]);
  // Helper functions defined outside useEffect for reusability
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

  const setCachedAnalysis = (id: string, data: any) => {
    try {
      sessionStorage.setItem(CACHE_KEY(id), JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  };

  // Load initial state from cache IMMEDIATELY to prevent flash of zeros
  const getInitialState = () => {
    if (!repoId) return { scores: null, stats: null, issues: [], history: [], trend: [] };
    const cached = getCachedAnalysis(repoId);
    if (!cached) return { scores: null, stats: null, issues: [], history: [], trend: [] };

    const scores = {
      overall: cached.overall_score || 0,
      security: cached.security_score || 0,
      quality: cached.quality_score || 0,
      architecture: cached.architecture_score || 0,
      testing: 0,
      documentation: cached.documentation_score || 0,
    };

    const mappedIssues = (cached.issues || []).map((issue: any) => ({
      id: issue.id,
      file: issue.file_path || issue.file,
      line: issue.line_number || issue.line,
      severity: issue.severity,
      type: issue.category || issue.type,
      message: issue.description || issue.message,
    }));

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
  const [scores, setScores] = useState(initialState.scores || {
    overall: 0,
    security: 0,
    quality: 0,
    architecture: 0,
    testing: 0,
    documentation: 0
  });
  const [recentIssues, setRecentIssues] = useState<DashboardIssue[]>(initialState.issues);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>(initialState.history);
  const [trendData, setTrendData] = useState<any[]>(initialState.trend);
  // Only show loading spinner if we have NO cached data - otherwise show cached data instantly
  const hasInitialData = initialState.scores !== null;
  const [loading, setLoading] = useState(!hasInitialData);
  const [analyzing, setAnalyzing] = useState(false);

  const loadAnalysisData = async (forceRefresh: boolean = false) => {
      if (!repoId || repoId === 'undefined') {
        console.log('[Dashboard] Invalid repoId:', repoId);
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        console.log('[Dashboard] Loading analysis results for repo:', repoId, 'forceRefresh:', forceRefresh);
        
        // Try cached analysis first for instant UI (unless force refresh)
        const cached = !forceRefresh ? getCachedAnalysis(repoId) : null;
        if (cached) {
          console.log('[Dashboard] Using cached analysis data');
          console.log('[Dashboard] Cached issues count:', cached.issues?.length || 0);
          console.debug('[Dashboard] cached object keys:', Object.keys(cached));
          if (cached.issues && cached.issues.length > 0) {
            setScores({
              overall: cached.overall_score || 0,
              security: cached.security_score || 0,
              quality: cached.quality_score || 0,
              architecture: cached.architecture_score || 0,
              testing: 0,
              documentation: cached.documentation_score || 0,
            });

            const mappedIssues = cached.issues.map((issue: any) => ({
              id: issue.id,
              file: issue.file_path || issue.file,
              line: issue.line_number || issue.line,
              severity: issue.severity,
              type: issue.category || issue.type,
              message: issue.description || issue.message,
            }));
            setRecentIssues(mappedIssues.slice(0, 5));

            const statsCalc = {
              critical: mappedIssues.filter((i: any) => i.severity === 'critical').length,
              high: mappedIssues.filter((i: any) => i.severity === 'high').length,
              medium: mappedIssues.filter((i: any) => i.severity === 'medium').length,
              low: mappedIssues.filter((i: any) => i.severity === 'low').length,
              total: mappedIssues.length,
            };
            setStats(statsCalc);

            const typeMap: Record<string, number> = {};
            mappedIssues.forEach((issue: any) => {
              typeMap[issue.type] = (typeMap[issue.type] || 0) + 1;
            });
            const colors: Record<string, string> = {
              Security: "#ef4444",
              Quality: "#f59e0b",
              Architecture: "#8b5cf6",
              Naming: "#3b82f6",
              Performance: "#22c55e",
            };
            setIssuesByType(
              Object.entries(typeMap).map(([name, value]) => ({ name, value, color: colors[name] || "#6b7280" }))
            );
            console.log('[Dashboard] Set stats from cache:', statsCalc, 'issuesByType count:', Object.keys(typeMap).length);
          } else {
            console.warn('[Dashboard] Cached data has no issues array or is empty');
          }

          if (cached.history) {
            setAnalysisHistory(cached.history);
            const trend = [...cached.history].reverse().map((item: any, index: number) => ({
              date: item.completed_at ? new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Run ${index + 1}`,
              score: item.overall_score || 0,
            }));
            setTrendData(trend);
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
          setTimeout(loadAnalysisData, 3000);
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
            testing: 0, // Not provided by backend yet
            documentation: results.documentation_score ?? results.documentationScore ?? 0
          };
          
          console.log('[Dashboard] Setting scores:', scoresData);
          setScores(scoresData);
          
          // Map backend issues to frontend format (may be empty array)
          const mappedIssues = (results.issues || []).map((issue: any) => ({
            id: issue.id,
            file: issue.file_path || issue.file,
            line: issue.line_number || issue.line,
            severity: issue.severity,
            type: issue.category || issue.type,
            message: issue.description || issue.message,
          }));
          
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

          // Calculate issues by type
          const typeMap: Record<string, number> = {};
          mappedIssues.forEach((issue: any) => {
            typeMap[issue.type] = (typeMap[issue.type] || 0) + 1;
          });

          const colors: Record<string, string> = {
            Security: "#ef4444",
            Quality: "#f59e0b",
            Architecture: "#8b5cf6",
            Naming: "#3b82f6",
            Performance: "#22c55e",
          };

          setIssuesByType(
            Object.entries(typeMap).map(([name, value]) => ({
              name,
              value,
              color: colors[name] || "#6b7280",
            }))
          );
          console.debug('[Dashboard] issuesByType set to:', Object.entries(typeMap));
          
          // cache results for faster subsequent loads
          try { setCachedAnalysis(repoId, { ...results, history: historyData?.history || historyData || null }); } catch {}
        } else if (!cached) {
          // Only reset if we have NO cached data and NO fresh data
          console.log('[Dashboard] No analysis results found for repo:', repoId);
          console.log('[Dashboard] This repository has not been analyzed yet.');
          setScores({
            overall: 0,
            security: 0,
            quality: 0,
            architecture: 0,
            testing: 0,
            documentation: 0
          });
          setRecentIssues([]);
          setStats({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
          setIssuesByType([]);
        } else {
          // We have cached data and no fresh data - keep cached data
          console.log('[Dashboard] Using cached data (API returned no results)');
        }
        
        // Update history if we got fresh data
        if (historyData && historyData.history) {
          console.log('[Dashboard] Loaded analysis history:', historyData.history.length, 'runs');
          setAnalysisHistory(historyData.history);
          
          // Build trend data from history (reverse to show oldest to newest)
          const trend = [...historyData.history].reverse().map((item: any, index: number) => ({
            date: item.completed_at 
              ? new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : `Run ${index + 1}`,
            score: item.overall_score || 0,
          }));
          setTrendData(trend);
        }
      } catch (error) {
        console.error('[Dashboard] Error loading analysis:', error);
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    loadAnalysisData();

    // Listen for new scans
    const handleScanCompleted = (event: CustomEvent<ScanResult>) => {
      const mappedIssues = event.detail.issues.map((issue) => ({
        id: issue.id,
        file: issue.file,
        line: issue.line,
        severity: issue.severity,
        type: issue.type,
        message: issue.description
      }));
      setRecentIssues(mappedIssues.slice(0, 5));
      setStats(event.detail.stats);
    };

    window.addEventListener("scanCompleted", handleScanCompleted as EventListener);
    return () => {
      window.removeEventListener("scanCompleted", handleScanCompleted as EventListener);
    };
  }, [repoId]);

  // Build score data from state
  const scoreData = [
    {
      name: "Overall",
      score: scores.overall,
      icon: TrendingUp,
      change: 0,
      color: "#06b6d4",
    },
    { name: "Security", score: scores.security, icon: Shield, change: 0, color: "#22c55e" },
    { name: "Quality", score: scores.quality, icon: Code2, change: 0, color: "#3b82f6" },
    {
      name: "Architecture",
      score: scores.architecture,
      icon: GitBranch,
      change: 0,
      color: "#8b5cf6",
    },
    { name: "Testing", score: scores.testing, icon: TestTube, change: 0, color: "#f59e0b" },
    { name: "Docs", score: scores.documentation, icon: FileText, change: 0, color: "#ec4899" },
  ];

  const severityData = [
    { name: 'Critical', value: stats.critical, color: '#ef4444' },
    { name: 'High', value: stats.high, color: '#f97316' },
    { name: 'Medium', value: stats.medium, color: '#f59e0b' },
    { name: 'Low', value: stats.low, color: '#10b981' },
  ];

  const handleForceRefresh = () => {
    if (!repoId) return;
    // Clear cache
    const CACHE_KEY = `repoiq_analysis_${repoId}`;
    try {
      sessionStorage.removeItem(CACHE_KEY);
      console.log('[Dashboard] Cache cleared, forcing refresh...');
    } catch {}
    // Reload with force refresh
    loadAnalysisData(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* No analysis banner */}
        {!loading && !analyzing && scores.overall === 0 && recentIssues.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-xl p-6 bg-yellow-500/10 border-yellow-500/20"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <div>
                <div className="font-semibold text-yellow-500">No Analysis Data Found</div>
                <div className="text-sm text-muted-foreground">
                  This repository hasn't been analyzed yet. Click "Run Scan" to start your first analysis.
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Analyzing banner */}
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-xl p-4 bg-blue-500/10 border-blue-500/20"
          >
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <div>
                <div className="font-semibold text-blue-500">Analyzing Repository</div>
                <div className="text-sm text-muted-foreground">
                  AI agents are analyzing your code. This may take a few minutes...
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Score cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {scoreData.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-panel rounded-xl p-4 hover:shadow-lg transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <item.icon
                    className="h-5 w-5"
                    style={{ color: item.color }}
                  />
                </div>
                {item.change !== 0 && (
                  <div
                    className={`flex items-center gap-1 text-xs font-medium ${
                      item.change > 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {item.change > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(item.change)}%
                  </div>
                )}
              </div>
              <div className="text-2xl font-bold" style={{ color: item.color }}>
                {item.score}
              </div>
              <div className="text-sm text-muted-foreground">{item.name}</div>
            </motion.div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 glass-panel rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Score Trend</h3>
            {trendData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient
                        id="colorScore"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop
                          offset="95%"
                          stopColor="#06b6d4"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No analysis history yet. Run your first analysis!</p>
              </div>
            )}
          </motion.div>

          {/* Issues by severity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Issues by Severity</h3>
            {stats.total > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData.filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {severityData.filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {severityData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                      <span className="text-sm font-medium ml-auto">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500/50" />
                  <p className="text-sm">No issues found</p>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Analysis History */}
        {analysisHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass-panel rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Analysis History</h3>
            <div className="space-y-3">
              {analysisHistory.slice(0, 5).map((analysis, index) => (
                <div
                  key={analysis.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium">
                        {analysis.completed_at
                          ? new Date(analysis.completed_at).toLocaleString()
                          : 'In progress'}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        Run #{analysisHistory.length - index}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Overall:</span>
                        <span className="font-medium" style={{ color: '#06b6d4' }}>
                          {analysis.overall_score || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-green-500" />
                        <span className="font-medium">{analysis.security_score || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Code2 className="h-3 w-3 text-blue-500" />
                        <span className="font-medium">{analysis.quality_score || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3 text-purple-500" />
                        <span className="font-medium">{analysis.architecture_score || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        <span className="font-medium">{analysis.total_issues || 0} issues</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {analysisHistory.length > 5 && (
              <div className="text-center mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing 5 of {analysisHistory.length} analyses
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Recent issues */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Issues</h3>
            <a href={`/dashboard/${repoId}/issues`} className="text-sm text-primary hover:underline">
              View all
            </a>
          </div>
          <div className="space-y-3">
            {recentIssues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div
                  className={`p-2 rounded-lg ${
                    issue.severity === "critical" || issue.severity === "high"
                      ? "bg-destructive/10"
                      : "bg-warning/10"
                  }`}
                >
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      issue.severity === "critical"
                        ? "text-destructive"
                        : issue.severity === "high"
                        ? "text-orange-500"
                        : issue.severity === "medium"
                        ? "text-warning"
                        : "text-success"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">
                      {issue.file}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Line {issue.line}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {issue.message}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${severityColors[issue.severity]}`}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    {issue.type}
                  </span>
                </div>
              </div>
            ))}
              {recentIssues.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No recent issues found for this repository.</p>
                </div>
              )}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
