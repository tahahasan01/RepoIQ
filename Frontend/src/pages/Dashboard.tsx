import { motion } from "framer-motion";
import { useState, useEffect } from "react";
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
import { scanStorage, ScanResult, ScanIssue } from "@/services/scanService";

// Mock data
const scoreData = [
  {
    name: "Overall",
    score: 87,
    icon: TrendingUp,
    change: 5,
    color: "#06b6d4",
  },
  { name: "Security", score: 92, icon: Shield, change: 3, color: "#22c55e" },
  { name: "Quality", score: 78, icon: Code2, change: -2, color: "#3b82f6" },
  {
    name: "Architecture",
    score: 85,
    icon: GitBranch,
    change: 8,
    color: "#8b5cf6",
  },
  { name: "Testing", score: 72, icon: TestTube, change: 12, color: "#f59e0b" },
  { name: "Docs", score: 65, icon: FileText, change: 0, color: "#ec4899" },
];

const trendData = [
  { date: "Jan", score: 65 },
  { date: "Feb", score: 68 },
  { date: "Mar", score: 72 },
  { date: "Apr", score: 75 },
  { date: "May", score: 78 },
  { date: "Jun", score: 82 },
  { date: "Jul", score: 87 },
];

const issuesByType = [
  { name: "Security", value: 12, color: "#ef4444" },
  { name: "Quality", value: 34, color: "#f59e0b" },
  { name: "Architecture", value: 8, color: "#8b5cf6" },
  { name: "Documentation", value: 15, color: "#3b82f6" },
];

const recentIssues = [
  {
    id: 1,
    file: "src/api/auth.ts",
    line: 45,
    severity: "critical",
    type: "Security",
    message: "Potential SQL injection vulnerability",
  },
  {
    id: 2,
    file: "src/utils/helpers.ts",
    line: 23,
    severity: "medium",
    type: "Quality",
    message: "Function complexity exceeds threshold",
  },
  {
    id: 3,
    file: "src/components/Form.tsx",
    line: 112,
    severity: "low",
    type: "Naming",
    message: "Variable name does not follow conventions",
  },
  {
    id: 4,
    file: "src/services/data.ts",
    line: 78,
    severity: "high",
    type: "Security",
    message: "Sensitive data exposed in logs",
  },
];

const severityColors: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export default function Dashboard() {
  const [recentIssues, setRecentIssues] = useState<ScanIssue[]>([]);
  const [issuesByType, setIssuesByType] = useState<{ name: string; value: number; color: string }[]>([]);
  const [stats, setStats] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });

  useEffect(() => {
    // Load latest scan data
    const latestScan = scanStorage.getLatestScan();
    if (latestScan) {
      setRecentIssues(latestScan.issues.slice(0, 5));
      setStats(latestScan.stats);

      // Calculate issues by type
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

    // Listen for new scans
    const handleScanCompleted = (event: CustomEvent<ScanResult>) => {
      setRecentIssues(event.detail.issues.slice(0, 5));
      setStats(event.detail.stats);
    };

    window.addEventListener("scanCompleted", handleScanCompleted as EventListener);
    return () => {
      window.removeEventListener("scanCompleted", handleScanCompleted as EventListener);
    };
  }, []);
  return (
    <DashboardLayout>
      <div className="space-y-6">
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

        {/* Recent issues */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Issues</h3>
            <a href="/dashboard/1/issues" className="text-sm text-primary hover:underline">
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
