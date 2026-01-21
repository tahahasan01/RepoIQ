import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
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

export default function Dashboard() {
  const { id: repoId } = useParams<{ id: string }>();
  const [recentIssues, setRecentIssues] = useState<ScanIssue[]>([]);
  const [issuesByType, setIssuesByType] = useState<{ name: string; value: number; color: string }[]>([]);
  const [stats, setStats] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  const [scores, setScores] = useState({
    overall: 0,
    security: 0,
    quality: 0,
    architecture: 0,
    testing: 0,
    documentation: 0
  });
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const loadAnalysisData = async () => {
      if (!repoId || repoId === 'undefined') {
        console.log('[Dashboard] Invalid repoId:', repoId);
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        console.log('[Dashboard] Loading analysis results for repo:', repoId);
        
        // Fetch analysis results from backend
        const results = await apiClient.getAnalysisResults(repoId).catch((err) => {
          console.log('[Dashboard] Failed to get analysis results:', err);
          return null;
        });
        
        // Fetch analysis history
        const historyData = await apiClient.getAnalysisHistory(repoId).catch(() => null);
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
        
        // Check if analysis is still in progress
        if (results && results.status === 'in_progress') {
          setAnalyzing(true);
          // Poll every 3 seconds until complete
          setTimeout(loadAnalysisData, 3000);
          return;
        }
        
        setAnalyzing(false);
        
        if (results && results.issues) {
          console.log('[Dashboard] Loaded analysis results:', results);
          
          // Set scores from backend
          setScores({
            overall: results.overall_score || 0,
            security: results.security_score || 0,
            quality: results.quality_score || 0,
            architecture: results.architecture_score || 0,
            testing: 0, // Not provided by backend yet
            documentation: results.documentation_score || 0
          });
          
          // Map backend issues to frontend format
          const mappedIssues = results.issues.map((issue: any) => ({
            id: issue.id,
            file: issue.file_path || issue.file,
            line: issue.line_number || issue.line,
            severity: issue.severity,
            type: issue.category || issue.type,
            message: issue.description || issue.message,
          }));
          
          setRecentIssues(mappedIssues.slice(0, 5));
          
          // Calculate stats
          const statsCalc = {
            critical: mappedIssues.filter((i: any) => i.severity === 'critical').length,
            high: mappedIssues.filter((i: any) => i.severity === 'high').length,
            medium: mappedIssues.filter((i: any) => i.severity === 'medium').length,
            low: mappedIssues.filter((i: any) => i.severity === 'low').length,
            total: mappedIssues.length,
          };
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
        } else {
          // No backend data available
          console.log('[Dashboard] No analysis results found for repo:', repoId);
          console.log('[Dashboard] This repository has not been analyzed yet.');
          // Reset all states to empty/zero
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
          
          // Fallback to local storage if available
          const latestScan = scanStorage.getLatestScan();
          if (latestScan) {
            console.log('[Dashboard] Using local storage scan as fallback');
            setRecentIssues(latestScan.issues.slice(0, 5));
            setStats(latestScan.stats);

            const typeMap: Record<string, number> = {};
            latestScan.issues.forEach((issue) => {
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
          }
        }
      } catch (error) {
        console.error('[Dashboard] Error loading analysis:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadAnalysisData();

    // Listen for new scans
    const handleScanCompleted = (event: CustomEvent<ScanResult>) => {
      setRecentIssues(event.detail.issues.slice(0, 5));
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

          {/* Issues by type */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Issues by Type</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={issuesByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {issuesByType.map((entry, index) => (
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
              {issuesByType.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="text-sm font-medium ml-auto">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
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
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
