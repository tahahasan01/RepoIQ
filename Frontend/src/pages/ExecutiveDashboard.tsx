import type { ComponentType, ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  Shield,
  CheckCircle2,
  Activity,
  Target,
  Users,
  FolderGit2,
  AlertCircle,
  ChevronRight,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useOrganizationAlerts } from "@/hooks/useNotificationQueries";
import { Navbar } from "@/components/layout/Navbar";
import {
  useOrganization,
  useOrganizationOverview,
  useBusinessRiskScore,
  useTopRiskAreas,
  useTeamLeaderboard,
} from "@/hooks/useApiQueries";
import { scoreColor, scoreLabel } from "@/lib/scoreColor";
import { PageHeader } from "@/components/organizations/PageHeader";
import { ErrorState, LoadingCard, LoadingState } from "@/components/organizations/PageStates";

const NEUTRAL = "hsl(var(--muted-foreground))";

function getRiskBadgeVariant(level: string | undefined): "destructive" | "default" | "secondary" | "outline" {
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
}

/** Business risk runs the other way to a score: higher is worse. */
function riskColor(risk: number) {
  // Risk runs the other way from a score: higher is worse.
  if (risk >= 70) return "hsl(var(--sev-critical))";
  if (risk >= 50) return "hsl(var(--sev-high))";
  if (risk >= 30) return "hsl(var(--sev-medium))";
  return "hsl(var(--score-good))";
}

function securityLevelClass(level: string | undefined) {
  const l = level?.toLowerCase();
  return l === "critical" || l === "high" ? "text-destructive" : undefined;
}

function MetricCard({
  title,
  icon: Icon,
  iconColor,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4" style={{ color: iconColor ?? NEUTRAL }} aria-hidden="true" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function ExecutiveDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: openAlerts = [] } = useOrganizationAlerts(orgId, false);
  const { data: organization } = useOrganization(orgId || "");

  // Use React Query for instant loading with cached data
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    isFetching: overviewFetching,
  } = useOrganizationOverview(orgId || "", {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false, // Don't refetch if we have cached data
  });
  const {
    data: riskScore,
    isLoading: riskLoading,
    error: riskError,
    refetch: refetchRisk,
    isFetching: riskFetching,
  } = useBusinessRiskScore(orgId || "", {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
  });
  const {
    data: riskAreas = [],
    isLoading: riskAreasLoading,
    error: riskAreasError,
    refetch: refetchRiskAreas,
    isFetching: riskAreasFetching,
  } = useTopRiskAreas(orgId || "", 10, {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
  });
  const {
    data: teamLeaderboard = [],
    isLoading: leaderboardLoading,
    error: leaderboardError,
    refetch: refetchLeaderboard,
    isFetching: leaderboardFetching,
  } = useTeamLeaderboard(orgId || "", "overall_score", {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
  });

  const orgName = organization?.name || "Organization";
  const header = (
    <PageHeader
      breadcrumb={[
        { label: "Organizations", to: "/organizations" },
        { label: orgName, to: `/organizations/${orgId}` },
        { label: "Executive dashboard" },
      ]}
      title="Executive dashboard"
      description="Health, risk and team performance across the organization"
      actions={
        // Alerts are managed on the organization page; this is the count.
        openAlerts.length > 0 ? (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to={`/organizations/${orgId}?tab=alerts`}>
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
              {openAlerts.length} open alert{openAlerts.length === 1 ? "" : "s"}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  // Show loading only if we have NO cached data at all
  const loading = (overviewLoading || riskLoading) && !overview && !riskScore;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
          {header}
          <LoadingState label="Loading executive dashboard…" className="min-h-[50vh]" />
        </main>
      </div>
    );
  }

  const retryHeadline = () => {
    refetchOverview();
    refetchRisk();
  };
  const headlineFailed = (overviewError && !overview) || (riskError && !riskScore);

  // An organization with nothing analyzed reports a health of 0 and "low" risk.
  // Neither is a measurement, so show them as not scored rather than as a red 0.
  const analyzed = (overview?.analyzed_repositories ?? 0) > 0;
  const healthScore: number | null = analyzed ? overview?.overall_health_score ?? null : null;
  const riskScoreValue = riskScore?.risk_score ?? 0;

  const chartData = teamLeaderboard.slice(0, 5).map((team, idx) => ({
    name: team.team_name?.substring(0, 10) || `Team ${idx + 1}`,
    score: team.overall_score || 0,
    issues: team.total_issues || 0,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        {header}

        {headlineFailed && (
          <div className="mb-8">
            <ErrorState
              title="Couldn't load the organization's health and risk figures"
              error={overviewError || riskError}
              onRetry={retryHeadline}
              retrying={overviewFetching || riskFetching}
            />
          </div>
        )}

        {/* Headline metrics */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <MetricCard
              title="Overall health"
              icon={Activity}
              iconColor={healthScore === null ? undefined : scoreColor(healthScore)}
            >
              <div className="flex items-baseline gap-2">
                {healthScore === null ? (
                  <span className="text-4xl font-bold text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor(healthScore) }}>
                      {Math.round(healthScore)}
                    </span>
                    <span className="text-lg text-muted-foreground">/100</span>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {healthScore === null ? "No repository analyzed yet" : scoreLabel(healthScore)}
              </p>
              {healthScore !== null && <Progress value={healthScore} className="h-2 mt-2" aria-label="Overall health" />}
            </MetricCard>

            <MetricCard title="Total issues" icon={AlertTriangle}>
              <span className="text-4xl font-bold tabular-nums">{overview.total_issues ?? 0}</span>
              <p className="text-sm text-muted-foreground mt-1">
                <span className={(overview.critical_issues ?? 0) > 0 ? "text-destructive font-medium" : "font-medium"}>
                  {overview.critical_issues ?? 0}
                </span>{" "}
                critical
              </p>
            </MetricCard>

            <MetricCard title="Security risk" icon={Shield}>
              {analyzed ? (
                <>
                  <span className={`text-4xl font-bold capitalize ${securityLevelClass(overview.security_risk_level) ?? ""}`}>
                    {overview.security_risk_level || "Unknown"}
                  </span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Average security score {overview.average_security_score ?? "—"}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-4xl font-bold text-muted-foreground">—</span>
                  <p className="text-sm text-muted-foreground mt-1">No repository analyzed yet</p>
                </>
              )}
            </MetricCard>
          </div>
        )}

        {/* Business risk */}
        {riskScore && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    Business risk assessment
                  </CardTitle>
                  <CardDescription>From critical findings, the security score and overall health</CardDescription>
                </div>
                <Badge variant={getRiskBadgeVariant(riskScore.risk_level)} className="text-sm px-3 py-1 capitalize">
                  {riskScore.risk_level || "Unknown"} risk
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* The score on its 0-100 scale, with the "low risk" boundary marked. */}
                <div className="flex flex-col justify-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold tabular-nums">{Math.round(riskScoreValue)}</span>
                    <span className="text-lg text-muted-foreground">/ 100</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Risk score. Lower is better; under 30 is low risk.</p>
                  <div
                    className="relative mt-4 h-2.5 rounded-full bg-muted"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(riskScoreValue)}
                    aria-label="Risk score"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(100, riskScoreValue))}%`,
                        backgroundColor: riskColor(riskScoreValue),
                      }}
                    />
                    <div className="absolute inset-y-[-4px] w-px bg-foreground/40" style={{ left: "30%" }} aria-hidden="true" />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
                    <span>0</span>
                    <span style={{ marginLeft: "22%" }}>30</span>
                    <span className="ml-auto">100</span>
                  </div>
                </div>

                {/* Risk factors */}
                <dl className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
                  <div className="p-4 border rounded-lg">
                    <dt className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                      <AlertCircle
                        className={`h-4 w-4 ${(riskScore.factors?.critical_issues ?? 0) > 0 ? "text-destructive" : ""}`}
                        aria-hidden="true"
                      />
                      Critical issues
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">{riskScore.factors?.critical_issues ?? 0}</dd>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <dt className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                      <Shield className="h-4 w-4" aria-hidden="true" />
                      Security score
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {analyzed && riskScore.factors?.security_score != null ? (
                        <span style={{ color: scoreColor(riskScore.factors.security_score) }}>
                          {riskScore.factors.security_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <dt className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                      <Activity className="h-4 w-4" aria-hidden="true" />
                      Health score
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {analyzed && riskScore.factors?.health_score != null ? (
                        <span style={{ color: scoreColor(riskScore.factors.health_score) }}>
                          {riskScore.factors.health_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">
              <FolderGit2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="risks">
              <AlertTriangle className="h-4 w-4 mr-2" aria-hidden="true" />
              Risk areas
            </TabsTrigger>
            <TabsTrigger value="teams">
              <Users className="h-4 w-4 mr-2" aria-hidden="true" />
              Team performance
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            {overview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FolderGit2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      Repositories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total repositories</span>
                        <span className="text-2xl font-bold tabular-nums">{overview.total_repositories ?? 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Analyzed</span>
                        <span className="text-xl font-semibold tabular-nums">{overview.analyzed_repositories ?? 0}</span>
                      </div>
                      <Progress
                        value={
                          overview.total_repositories
                            ? (overview.analyzed_repositories / overview.total_repositories) * 100
                            : 0
                        }
                        className="h-2"
                        aria-label="Share of repositories analyzed"
                      />
                      <p className="text-xs text-muted-foreground">
                        {overview.total_repositories
                          ? Math.round((overview.analyzed_repositories / overview.total_repositories) * 100)
                          : 0}
                        % analyzed
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      Teams
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total teams</span>
                        <span className="text-2xl font-bold tabular-nums">{overview.total_teams ?? 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Active members</span>
                        <span className="text-xl font-semibold tabular-nums">{overview.total_members ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              !headlineFailed && <LoadingCard label="Loading overview…" />
            )}
          </TabsContent>

          {/* Risk areas */}
          <TabsContent value="risks" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Top risk areas</h2>
              <p className="text-sm text-muted-foreground">Repositories and files that need immediate attention</p>
            </div>
            {/* Loading first: the empty state below reads as a real answer. */}
            {riskAreasLoading && riskAreas.length === 0 ? (
              <LoadingCard label="Loading risk areas…" />
            ) : riskAreasError && riskAreas.length === 0 ? (
              <ErrorState
                title="Couldn't load risk areas"
                error={riskAreasError}
                onRetry={() => refetchRiskAreas()}
                retrying={riskAreasFetching}
              />
            ) : riskAreas.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">No critical findings</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    No repository in this organization has a critical finding. Lower-severity findings are on each
                    repository's Issues page.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-3">
                {riskAreas.map((area, idx) => (
                  <li key={idx}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <AlertTriangle
                              className={`h-5 w-5 shrink-0 ${area.critical_issues > 0 ? "text-destructive" : "text-muted-foreground"}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{area.repository_name}</p>
                              <p className="text-sm text-muted-foreground font-mono truncate">{area.file_path}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">{area.critical_issues} critical</Badge>
                                <Badge variant="outline">{area.high_issues} high</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{area.total_issues} total issues</p>
                            </div>
                            <Button variant="ghost" size="icon" asChild>
                              <Link
                                to={`/dashboard/${area.repository_id}`}
                                aria-label={`Open ${area.repository_name} dashboard`}
                              >
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* Team performance */}
          <TabsContent value="teams" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Team performance</h2>
              <p className="text-sm text-muted-foreground">Compare teams and find the ones that need help</p>
            </div>

            {/* Loading first: the empty state below reads as a real answer. */}
            {leaderboardLoading && teamLeaderboard.length === 0 ? (
              <LoadingCard label="Loading team performance…" />
            ) : leaderboardError && teamLeaderboard.length === 0 ? (
              <ErrorState
                title="Couldn't load team performance"
                error={leaderboardError}
                onRetry={() => refetchLeaderboard()}
                retrying={leaderboardFetching}
              />
            ) : teamLeaderboard.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Users className="h-8 w-8 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">No team data</h3>
                  <p className="text-sm text-muted-foreground">
                    Create teams and analyze repositories to see performance data.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      Team leaderboard
                    </CardTitle>
                    <CardDescription>Ranked by overall score</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-3">
                      {teamLeaderboard.slice(0, 5).map((team, idx) => (
                        <li key={team.team_id}>
                          <Link
                            to={`/teams/${team.team_id}`}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground"
                                aria-label={`Rank ${idx + 1}`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{team.team_name}</p>
                                <p className="text-xs text-muted-foreground">{team.total_issues || 0} issues</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className="text-lg font-bold tabular-nums"
                                style={{ color: scoreColor(team.overall_score) }}
                                title={scoreLabel(team.overall_score)}
                              >
                                {team.overall_score ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">score</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Team comparison</CardTitle>
                    <CardDescription>Quality scores across teams</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {chartData.length > 0 ? (
                      <div role="img" aria-label={`Overall score for the top ${chartData.length} teams`}>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData} layout="vertical">
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tick={{ fill: NEUTRAL, fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={80}
                              tick={{ fill: NEUTRAL, fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: "hsl(var(--muted))" }}
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                color: "hsl(var(--foreground))",
                              }}
                            />
                            <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
