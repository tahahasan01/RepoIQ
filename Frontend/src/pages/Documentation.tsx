import { useState, useMemo, type ReactNode } from "react";
import { useParams, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Download,
  Bug,
  AlertTriangle,
  Shield,
  Code,
  CheckCircle,
  FileDown,
  GitBranch,
  Map as MapIcon,
  Network,
  TrendingUp,
} from "lucide-react";
import type { BugReport } from "@/types/scan";
import { generateFullAnalysisReport, generateBugReportPDF, AnalysisReport } from "@/services/reportService";
import { useRepository, useAnalysisResults, useAnalysisById } from "@/hooks/useApiQueries";
import { useToast } from "@/hooks/use-toast";
import { RoadmapPanel } from "@/components/docs/RoadmapPanel";
import { ArchitecturePanel } from "@/components/docs/ArchitecturePanel";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatTile } from "@/components/shared/StatTile";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { FilePath } from "@/components/shared/FilePath";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { scoreBgClass } from "@/lib/scoreColor";
import { formatCategory } from "@/lib/findings";

type DocsTab = "report" | "bugreport" | "roadmap" | "architecture";

const TABS: { id: DocsTab; label: string; icon: typeof FileText }[] = [
  { id: "report", label: "Full analysis report", icon: FileText },
  { id: "bugreport", label: "Bug report", icon: Bug },
  { id: "roadmap", label: "Roadmap", icon: MapIcon },
  { id: "architecture", label: "Architecture", icon: Network },
];

/** The title bar of a tab's panel: heading, one line of description, and its action. */
function PanelHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Total plus one tile per severity. Total spans two columns on phones so no tile sits alone. */
function SeverityCounts({ total, counts }: { total: number; counts: Record<"critical" | "high" | "medium" | "low", number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <StatTile label="Total" value={total} className="col-span-2 md:col-span-1" />
      {(["critical", "high", "medium", "low"] as const).map((severity) => (
        <div key={severity} className="rounded-xl border border-border bg-card p-4">
          <SeverityBadge severity={severity} />
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{counts[severity]}</div>
        </div>
      ))}
    </div>
  );
}

export default function Documentation() {
  const [activeTab, setActiveTab] = useState<DocsTab>("report");
  const { toast } = useToast();

  const params = useParams();
  const repoId = (params as any).id || (params as any).repoId;

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');

  // Use React Query hooks — data persists across navigations
  const { data: repoData } = useRepository(repoId || '', { enabled: !!repoId });

  // Fetch analysis by specific ID or latest for the repo
  const { data: analysisById, isLoading: isLoadingById } = useAnalysisById(analysisId || '', {
    enabled: !!analysisId
  });
  const { data: analysisLatest, isLoading: isLoadingLatest } = useAnalysisResults(repoId || '', {
    enabled: !!repoId && !analysisId
  });

  const analysisData = analysisId ? analysisById : analysisLatest;
  const isLoadingReport = analysisId ? isLoadingById : isLoadingLatest;

  // Derive bug reports from analysis data (memoized so it doesn't recompute on every render)
  const bugReports = useMemo<BugReport[]>(() => {
    if (!analysisData?.issues || !Array.isArray(analysisData.issues)) return [];
    return analysisData.issues.map((issue: any, index: number) => ({
      id: issue.id || `${Date.now()}-${index}`,
      title: issue.description || issue.message || 'Issue detected',
      details: `File: ${issue.file_path || issue.file || 'N/A'}\nLine: ${issue.line_number || issue.line || 'N/A'}\n\n${issue.suggestion || issue.fix || 'No details available'}`,
      timestamp: analysisData.completed_at ? new Date(analysisData.completed_at).getTime() : Date.now(),
      repoName: repoData?.name || analysisData.repository_name || 'Repository',
      severity: issue.severity || 'medium',
      status: 'open' as const,
      category: issue.category || 'general',
      file_path: issue.file_path || issue.file,
      line_number: issue.line_number || issue.line,
    }));
  }, [analysisData, repoData]);

  // Generate comprehensive PDF report
  const handleDownloadReport = () => {
    if (!analysisData || !repoData) {
      toast({ title: "The analysis is still loading", description: "Try again in a moment." });
      return;
    }

    const report: AnalysisReport = {
      repository: {
        name: repoData?.name || 'Repository',
        fullName: repoData?.full_name || repoData?.name || 'Repository',
        language: repoData?.language,
        branch: repoData?.default_branch || 'main',
        lastAnalyzed: analysisData?.completed_at,
      },
      scores: {
        overall: analysisData?.overall_score || 0,
        security: analysisData?.security_score || 0,
        quality: analysisData?.quality_score || 0,
        architecture: analysisData?.architecture_score || 0,
        documentation: analysisData?.documentation_score || 0,
      },
      summary: {
        totalIssues: analysisData?.total_issues || analysisData?.issues?.length || 0,
        criticalCount: analysisData?.issues?.filter((i: any) => i.severity === 'critical').length || 0,
        highCount: analysisData?.issues?.filter((i: any) => i.severity === 'high').length || 0,
        mediumCount: analysisData?.issues?.filter((i: any) => i.severity === 'medium').length || 0,
        lowCount: analysisData?.issues?.filter((i: any) => i.severity === 'low').length || 0,
        filesAnalyzed: analysisData?.files_analyzed || 0,
      },
      issues: (analysisData?.issues || []).map((issue: any) => ({
        id: issue.id,
        file: issue.file_path || issue.file || 'unknown',
        line: issue.line_number || issue.line || 0,
        severity: issue.severity || 'medium',
        category: issue.category || 'general',
        description: issue.description || issue.message || '',
        suggestion: issue.suggestion || issue.fix || '',
        agentType: issue.agent_type,
      })),
      securityVulnerabilities: [],
      qualityIssues: [],
      architectureIssues: [],
      bestPractices: [],
    };

    generateFullAnalysisReport(report);
  };

  // Generate bug report PDF
  const handleDownloadBugReport = () => {
    if (bugReports.length === 0) {
      toast({ title: "No bugs to export", description: "The latest analysis found no issues." });
      return;
    }
    generateBugReportPDF(bugReports, repoData?.name || 'Repository');
  };

  // Calculate stats for display
  const stats = {
    total: analysisData?.issues?.length || 0,
    critical: analysisData?.issues?.filter((i: any) => i.severity === 'critical').length || 0,
    high: analysisData?.issues?.filter((i: any) => i.severity === 'high').length || 0,
    medium: analysisData?.issues?.filter((i: any) => i.severity === 'medium').length || 0,
    low: analysisData?.issues?.filter((i: any) => i.severity === 'low').length || 0,
  };

  const scoreItems = [
    { label: "Overall", score: analysisData?.overall_score || 0, icon: TrendingUp, className: "col-span-2 lg:col-span-1" },
    { label: "Security", score: analysisData?.security_score || 0, icon: Shield },
    { label: "Quality", score: analysisData?.quality_score || 0, icon: Code },
    { label: "Architecture", score: analysisData?.architecture_score || 0, icon: GitBranch },
    { label: "Documentation", score: analysisData?.documentation_score || 0, icon: FileText },
  ];

  const contents = [
    {
      label: "Security vulnerabilities",
      count: analysisData?.issues?.filter((i: any) => i.agent_type === 'security' || i.category?.toLowerCase().includes('security')).length || 0,
      icon: Shield,
    },
    {
      label: "Code quality issues",
      count: analysisData?.issues?.filter((i: any) => i.agent_type === 'quality').length || 0,
      icon: Code,
    },
    {
      label: "Architecture issues",
      count: analysisData?.issues?.filter((i: any) => i.agent_type === 'architecture').length || 0,
      icon: GitBranch,
    },
    {
      label: "Best practice suggestions",
      count: analysisData?.issues?.filter((i: any) => i.category?.toLowerCase().includes('practice')).length || 0,
      icon: CheckCircle,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* The layout already renders the repository name as the page's h1. */}
        <PageHeader
          as="h2"
          title="Reports & documentation"
          description="PDF reports for stakeholder review, the improvement roadmap, and the repository's architecture."
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DocsTab)}>
          <div className="overflow-x-auto">
            <TabsList className="h-auto">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  <tab.icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* FULL REPORT TAB */}
          <TabsContent value="report" className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <PanelHeader
              title="Full analysis report"
              description="Scores, issue counts and every finding from the analysis."
              action={
                <Button onClick={handleDownloadReport} disabled={isLoadingReport || !analysisData} className="gap-2" size="sm">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download PDF
                </Button>
              }
            />

            <div className="p-4 sm:p-6">
              {isLoadingReport ? (
                <LoadingState variant="tiles" count={5} label="Loading analysis data" />
              ) : !analysisData ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="No analysis yet"
                  body="Run an analysis first to generate reports."
                />
              ) : (
                <div className="space-y-8">
                  <section>
                    <h4 className="mb-3 text-base font-semibold text-foreground">Scores</h4>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                      {scoreItems.map((item) => (
                        <StatTile
                          key={item.label}
                          label={item.label}
                          score={item.score}
                          icon={item.icon}
                          className={item.className}
                          hint={
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <div className={`h-full ${scoreBgClass(item.score)}`} style={{ width: `${item.score}%` }} />
                            </div>
                          }
                        />
                      ))}
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-3 text-base font-semibold text-foreground">Issues summary</h4>
                    <SeverityCounts total={stats.total} counts={stats} />
                  </section>

                  <section>
                    <h4 className="mb-3 text-base font-semibold text-foreground">Report contents</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {contents.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                          <div className="flex items-center gap-3">
                            <item.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            <div>
                              <div className="text-sm font-medium text-foreground">{item.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.count === 1 ? '1 issue' : `${item.count} issues`}
                              </div>
                            </div>
                          </div>
                          <div className="text-xl font-semibold tabular-nums text-foreground" aria-hidden="true">
                            {item.count}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ROADMAP TAB */}
          <TabsContent value="roadmap" className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <PanelHeader
              title="Improvement roadmap"
              description="The latest analysis' findings, ordered by what to fix first."
            />
            <div className="p-4 sm:p-6">{repoId && <RoadmapPanel repoId={repoId} />}</div>
          </TabsContent>

          {/* ARCHITECTURE TAB - Radix mounts a tab's content only while it is
              open, which matters here: generating the diagram is a model call. */}
          <TabsContent value="architecture" className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <PanelHeader
              title="Architecture"
              description="How the repository is organised, drawn from its file layout."
            />
            <div className="p-4 sm:p-6">{repoId && <ArchitecturePanel repoId={repoId} />}</div>
          </TabsContent>

          {/* BUG REPORT TAB */}
          <TabsContent value="bugreport" className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <PanelHeader
              title="Bug report"
              description="Every finding as a bug, with its severity, location and suggested fix."
              action={
                <Button onClick={handleDownloadBugReport} disabled={bugReports.length === 0} className="gap-2" size="sm">
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Download PDF
                </Button>
              }
            />

            <div className="p-4 sm:p-6">
              {isLoadingReport ? (
                <LoadingState variant="list" count={4} label="Loading bug reports" />
              ) : bugReports.length === 0 ? (
                <EmptyState
                  icon={CheckCircle}
                  title="No bugs found"
                  body="The analysis completed with no issues detected."
                />
              ) : (
                <div className="space-y-8">
                  <section>
                    <h4 className="mb-3 text-base font-semibold text-foreground">Bug statistics</h4>
                    <SeverityCounts total={bugReports.length} counts={stats} />
                  </section>

                  <section>
                    <h4 className="mb-3 text-base font-semibold text-foreground">Bug details</h4>
                    <ol className="max-h-[500px] space-y-3 overflow-y-auto">
                      {bugReports.slice(0, 20).map((bug, index) => (
                        <li key={bug.id} className="overflow-hidden rounded-lg border border-border">
                          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="text-sm font-medium text-foreground">
                                {index + 1}. {bug.title}
                              </div>
                              {bug.file_path && <FilePath path={bug.file_path} line={bug.line_number} />}
                              {bug.category && (
                                <div className="text-xs text-muted-foreground">{formatCategory(bug.category)}</div>
                              )}
                            </div>
                            <SeverityBadge severity={bug.severity} />
                          </div>
                          <div className="p-4">
                            <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs text-foreground">
                              {bug.details}
                            </pre>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {bugReports.length > 20 && (
                      <p className="mt-4 text-center text-sm text-muted-foreground">
                        Showing 20 of {bugReports.length} bugs. Download the full report to see all of them.
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
