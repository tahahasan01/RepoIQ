import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  FileCode,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Activity,
  Target,
  Clock,
  Users,
  FolderGit2,
  AlertCircle,
  ChevronRight,
  BarChart3,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from "recharts";
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function ExecutiveDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const [overview, setOverview] = useState<any>(null);
  const [riskScore, setRiskScore] = useState<any>(null);
  const [riskAreas, setRiskAreas] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [teamLeaderboard, setTeamLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (orgId) {
      loadData();
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [overviewData, riskData, riskAreasData, complianceData, leaderboardData] =
        await Promise.all([
          apiClient.getOrganizationOverview(orgId),
          apiClient.getBusinessRiskScore(orgId),
          apiClient.getTopRiskAreas(orgId, 10),
          apiClient.getComplianceStatus(orgId),
          apiClient.getTeamLeaderboard(orgId, "overall_score"),
        ]);
      setOverview(overviewData);
      setRiskScore(riskData);
      setRiskAreas(riskAreasData);
      setCompliance(complianceData);
      setTeamLeaderboard(leaderboardData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading executive dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "critical":
        return "text-red-500 bg-red-500/10";
      case "high":
        return "text-orange-500 bg-orange-500/10";
      case "medium":
        return "text-yellow-500 bg-yellow-500/10";
      case "low":
        return "text-green-500 bg-green-500/10";
      default:
        return "text-blue-500 bg-blue-500/10";
    }
  };

  const getRiskBadgeVariant = (level: string): "destructive" | "default" | "secondary" | "outline" => {
    switch (level?.toLowerCase()) {
      case "critical":
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "#22c55e";
    if (score >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const healthScore = overview?.overall_health_score || 0;
  const riskScoreValue = riskScore?.risk_score || 0;

  // Prepare gauge data
  const gaugeData = [
    {
      name: "Risk",
      value: riskScoreValue,
      fill: riskScoreValue <= 30 ? "#22c55e" : riskScoreValue <= 60 ? "#f59e0b" : "#ef4444",
    },
  ];

  const chartData = teamLeaderboard.slice(0, 5).map((team, idx) => ({
    name: team.team_name?.substring(0, 10) || `Team ${idx + 1}`,
    score: team.overall_score || 0,
    issues: team.total_issues || 0,
  }));

  // Compliance items for checklist
  const complianceItems = compliance
    ? [
        { label: "Security Standards", passed: compliance.security_compliant, icon: Shield },
        { label: "Code Quality", passed: compliance.code_quality_compliant, icon: FileCode },
        { label: "No Critical Vulnerabilities", passed: compliance.no_critical_vulnerabilities, icon: AlertTriangle },
      ]
    : [];

  const complianceScore = complianceItems.length > 0
    ? Math.round((complianceItems.filter((item) => item.passed).length / complianceItems.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to={`/organizations/${orgId}`}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-primary to-cyan-500 rounded-xl">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Executive Dashboard</h1>
                  <p className="text-muted-foreground">
                    High-level overview and business metrics
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            <Activity className="h-3 w-3 mr-1" />
            Live Data
          </Badge>
        </div>

        {/* Hero Metrics */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Health Score */}
            <Card className="relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  background: `linear-gradient(135deg, ${getHealthColor(healthScore)} 0%, transparent 60%)`,
                }}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overall Health
                </CardTitle>
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold" style={{ color: getHealthColor(healthScore) }}>
                    {healthScore}
                  </span>
                  <span className="text-lg text-muted-foreground">/100</span>
                </div>
                <div className="mt-2">
                  <Progress value={healthScore} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Total Issues */}
            <Card className="relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  background: `linear-gradient(135deg, #f59e0b 0%, transparent 60%)`,
                }}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Issues
                </CardTitle>
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{overview.total_issues || 0}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-red-500 font-medium">{overview.critical_issues || 0}</span> critical issues
                </p>
              </CardContent>
            </Card>

            {/* Security Risk */}
            <Card className="relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  background: `linear-gradient(135deg, #8b5cf6 0%, transparent 60%)`,
                }}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Security Risk
                </CardTitle>
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Shield className="h-4 w-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold capitalize">
                    {overview.security_risk_level || "Low"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Score: {overview.average_security_score || 100}
                </p>
              </CardContent>
            </Card>

            {/* Technical Debt */}
            <Card className="relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  background: `linear-gradient(135deg, #0ea5e9 0%, transparent 60%)`,
                }}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Technical Debt
                </CardTitle>
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{overview.technical_debt_hours || 0}</span>
                  <span className="text-lg text-muted-foreground">hrs</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Estimated to resolve
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Risk Score Card */}
        {riskScore && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Business Risk Assessment
                  </CardTitle>
                  <CardDescription>Overall risk score based on security, quality, and technical debt</CardDescription>
                </div>
                <Badge variant={getRiskBadgeVariant(riskScore.risk_level)} className="text-sm px-3 py-1">
                  {riskScore.risk_level || "Unknown"} Risk
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Gauge Chart */}
                <div className="flex flex-col items-center justify-center">
                  <div className="relative w-48 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="70%"
                        outerRadius="100%"
                        barSize={20}
                        data={gaugeData}
                        startAngle={180}
                        endAngle={0}
                      >
                        <RadialBar
                          background
                          dataKey="value"
                          cornerRadius={10}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-bold">{riskScoreValue}</span>
                      <span className="text-sm text-muted-foreground">Risk Score</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    Lower is better • Target: &lt;30
                  </p>
                </div>

                {/* Risk Factors */}
                <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-muted-foreground">Critical Issues</span>
                    </div>
                    <p className="text-2xl font-bold">{riskScore.factors?.critical_issues || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      <span className="text-sm text-muted-foreground">Security Score</span>
                    </div>
                    <p className="text-2xl font-bold">{riskScore.factors?.security_score || 100}</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Health Score</span>
                    </div>
                    <p className="text-2xl font-bold">{riskScore.factors?.health_score || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-muted-foreground">Tech Debt (hrs)</span>
                    </div>
                    <p className="text-2xl font-bold">{riskScore.factors?.technical_debt_hours || 0}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-background">
              <FolderGit2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="risks" className="data-[state=active]:bg-background">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Risk Areas
            </TabsTrigger>
            <TabsTrigger value="compliance" className="data-[state=active]:bg-background">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="teams" className="data-[state=active]:bg-background">
              <Users className="h-4 w-4 mr-2" />
              Team Performance
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {overview && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FolderGit2 className="h-5 w-5" />
                      Repositories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Repositories</span>
                        <span className="text-2xl font-bold">{overview.total_repositories || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Analyzed</span>
                        <span className="text-xl font-semibold text-green-500">{overview.analyzed_repositories || 0}</span>
                      </div>
                      <Progress
                        value={overview.total_repositories ? (overview.analyzed_repositories / overview.total_repositories) * 100 : 0}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {overview.total_repositories
                          ? Math.round((overview.analyzed_repositories / overview.total_repositories) * 100)
                          : 0}% analyzed
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Teams
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Teams</span>
                        <span className="text-2xl font-bold">{overview.total_teams || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Active Members</span>
                        <span className="text-xl font-semibold">{overview.total_members || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Risk Areas Tab */}
          <TabsContent value="risks" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Top Risk Areas</h2>
                <p className="text-muted-foreground">Repositories and files that need immediate attention</p>
              </div>
            </div>
            {riskAreas.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No High-Risk Areas</h3>
                  <p className="text-muted-foreground">Great job! No critical issues have been identified.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {riskAreas.map((area, idx) => (
                  <Card key={idx} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-lg ${area.critical_issues > 0 ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                            <AlertTriangle className={`h-5 w-5 ${area.critical_issues > 0 ? "text-red-500" : "text-orange-500"}`} />
                          </div>
                          <div>
                            <p className="font-semibold">{area.repository_name}</p>
                            <p className="text-sm text-muted-foreground">{area.file_path}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive">{area.critical_issues} critical</Badge>
                              <Badge variant="default">{area.high_issues} high</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {area.total_issues} total issues
                            </p>
                          </div>
                          <Link to={`/dashboard/${area.repository_id}`}>
                            <Button variant="ghost" size="icon">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Compliance Status</h2>
                <p className="text-muted-foreground">Track your organization's compliance with standards</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold">{complianceScore}%</span>
                <p className="text-sm text-muted-foreground">Compliant</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {complianceItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${item.passed ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          <item.icon className={`h-5 w-5 ${item.passed ? "text-green-500" : "text-red-500"}`} />
                        </div>
                        <span className="font-medium">{item.label}</span>
                      </div>
                      {item.passed ? (
                        <div className="flex items-center gap-2 text-green-500">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">Passed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-500">
                          <XCircle className="h-5 w-5" />
                          <span className="font-medium">Failed</span>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">Overall Status</span>
                      {compliance?.overall_compliant ? (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white px-4 py-1">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Compliant
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="px-4 py-1">
                          <XCircle className="h-4 w-4 mr-1" />
                          Non-Compliant
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Performance Tab */}
          <TabsContent value="teams" className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Team Performance</h2>
              <p className="text-muted-foreground">Compare team performance and identify top performers</p>
            </div>

            {teamLeaderboard.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Team Data</h3>
                  <p className="text-muted-foreground">Create teams and analyze repositories to see performance data.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Leaderboard */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500" />
                      Team Leaderboard
                    </CardTitle>
                    <CardDescription>Ranked by overall score</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {teamLeaderboard.slice(0, 5).map((team, idx) => (
                        <Link key={team.team_id} to={`/teams/${team.team_id}`}>
                          <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                                idx === 0 ? "bg-yellow-500" :
                                idx === 1 ? "bg-slate-400" :
                                idx === 2 ? "bg-amber-600" :
                                "bg-muted-foreground"
                              }`}>
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-semibold">{team.team_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {team.total_issues || 0} issues
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">{team.overall_score || 0}</p>
                              <p className="text-xs text-muted-foreground">score</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Comparison</CardTitle>
                    <CardDescription>Quality scores across teams</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData} layout="vertical">
                          <XAxis type="number" domain={[0, 100]} />
                          <YAxis type="category" dataKey="name" width={80} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar dataKey="score" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
