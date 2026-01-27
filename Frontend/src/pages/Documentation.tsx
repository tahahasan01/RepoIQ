import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  RefreshCw,
  Bug,
  AlertTriangle,
  Shield,
  Code,
  CheckCircle,
  FileDown,
  GitBranch,
} from "lucide-react";
import { BugReport } from "@/services/scanService";
import { generateFullAnalysisReport, generateBugReportPDF, AnalysisReport } from "@/services/reportService";

export default function Documentation() {
  const [activeTab, setActiveTab] = useState<"report" | "bugreport">("report");
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [repoData, setRepoData] = useState<any>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  
  const params = useParams();
  const repoId = (params as any).id || (params as any).repoId;
  
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  

  useEffect(() => {
    let mounted = true;
    
    async function loadData() {
      if (!repoId) return;
      setIsLoadingReport(true);
      
      try {
        // Load repository info
        const repo = await apiClient.getRepository(repoId as string);
        if (!mounted) return;
        setRepoData(repo);
        
        // Load analysis results
        const analysis = analysisId
          ? await apiClient.getAnalysisById(analysisId)
          : await apiClient.getAnalysisResults(repoId as string);
        
        if (!mounted) return;
        
        if (analysis) {
          setAnalysisData(analysis);
          
          // Create bug reports from issues
          if (analysis.issues && Array.isArray(analysis.issues)) {
            const reports: BugReport[] = analysis.issues.map((issue: any, index: number) => ({
              id: issue.id || `${Date.now()}-${index}`,
              title: issue.description || issue.message || 'Issue detected',
              details: `File: ${issue.file_path || issue.file || 'N/A'}\nLine: ${issue.line_number || issue.line || 'N/A'}\n\n${issue.suggestion || issue.fix || 'No details available'}`,
              timestamp: analysis.completed_at ? new Date(analysis.completed_at).getTime() : Date.now(),
              repoName: repo?.name || analysis.repository_name || 'Repository',
              severity: issue.severity || 'medium',
              status: 'open',
              category: issue.category || 'general',
              file_path: issue.file_path || issue.file,
              line_number: issue.line_number || issue.line,
            }));
            setBugReports(reports);
          }
        }
      } catch (err) {
        console.error('[Documentation] Failed to load data:', err);
      } finally {
        if (mounted) setIsLoadingReport(false);
      }
    }
    
    loadData();
    
    return () => { mounted = false; };
  }, [repoId, analysisId]);

  // Generate comprehensive PDF report
  const handleDownloadReport = () => {
    if (!analysisData || !repoData) {
      alert('Please wait for analysis data to load');
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
      alert('No bugs to export');
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-1">Reports & Documentation</h1>
            <p className="text-sm text-muted-foreground">Generate professional PDF reports for stakeholder review and team collaboration</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { id: "report", label: "Full Analysis Report", icon: FileText },
            { id: "bugreport", label: "Bug Report", icon: Bug }
          ].map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          
          {/* FULL REPORT TAB */}
          {activeTab === "report" && (
            <>
              <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Full Analysis Report</h2>
                  <p className="text-xs text-muted-foreground mt-1">Comprehensive code quality assessment with detailed findings</p>
                </div>
                <Button 
                  onClick={handleDownloadReport} 
                  disabled={isLoadingReport || !analysisData}
                  className="gap-2"
                  size="sm"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              <div className="p-8">
                {isLoadingReport ? (
                  <div className="text-center py-16">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading analysis data...</p>
                  </div>
                ) : !analysisData ? (
                  <div className="text-center py-16">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-base font-medium mb-1 text-foreground">No Analysis Data Available</p>
                    <p className="text-sm text-muted-foreground">Run an analysis first to generate reports.</p>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {/* Scores Overview */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4 uppercase tracking-wide">Analysis Scores</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {[
                          { label: "Overall", score: analysisData?.overall_score || 0, icon: CheckCircle },
                          { label: "Security", score: analysisData?.security_score || 0, icon: Shield },
                          { label: "Quality", score: analysisData?.quality_score || 0, icon: Code },
                          { label: "Architecture", score: analysisData?.architecture_score || 0, icon: GitBranch },
                          { label: "Documentation", score: analysisData?.documentation_score || 0, icon: FileText },
                        ].map((item) => {
                          const Icon = item.icon;
                          const scoreColor = item.score >= 80 ? "text-green-600" : item.score >= 60 ? "text-amber-600" : "text-red-600";
                          const borderColor = item.score >= 80 ? "border-green-200" : item.score >= 60 ? "border-amber-200" : "border-red-200";
                          const bgColor = item.score >= 80 ? "bg-green-50 dark:bg-green-950/20" : item.score >= 60 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20";
                          
                          return (
                            <div
                              key={item.label}
                              className={`p-5 border ${borderColor} ${bgColor} rounded-lg`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.label}</span>
                                <Icon className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className={`text-3xl font-bold mb-2 ${scoreColor}`}>
                                {item.score}
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    item.score >= 80 ? "bg-green-600" : 
                                    item.score >= 60 ? "bg-amber-600" : 
                                    "bg-red-600"
                                  }`}
                                  style={{ width: `${item.score}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Issue Summary */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4 uppercase tracking-wide">Issues Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                          { label: "Total Issues", count: stats.total, color: "text-blue-600", border: "border-blue-200", bg: "bg-blue-50 dark:bg-blue-950/20" },
                          { label: "Critical", count: stats.critical, color: "text-red-600", border: "border-red-200", bg: "bg-red-50 dark:bg-red-950/20" },
                          { label: "High", count: stats.high, color: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50 dark:bg-orange-950/20" },
                          { label: "Medium", count: stats.medium, color: "text-amber-600", border: "border-amber-200", bg: "bg-amber-50 dark:bg-amber-950/20" },
                          { label: "Low", count: stats.low, color: "text-green-600", border: "border-green-200", bg: "bg-green-50 dark:bg-green-950/20" },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className={`p-5 border ${stat.border} ${stat.bg} rounded-lg text-center`}
                          >
                            <div className={`text-2xl font-bold mb-1 ${stat.color}`}>
                              {stat.count}
                            </div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Report Contents */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4 uppercase tracking-wide">Report Contents</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { 
                            label: "Security Vulnerabilities", 
                            count: analysisData?.issues?.filter((i: any) => i.agent_type === 'security' || i.category?.toLowerCase().includes('security')).length || 0,
                            icon: Shield
                          },
                          { 
                            label: "Code Quality Issues", 
                            count: analysisData?.issues?.filter((i: any) => i.agent_type === 'quality').length || 0,
                            icon: Code
                          },
                          { 
                            label: "Architecture Issues", 
                            count: analysisData?.issues?.filter((i: any) => i.agent_type === 'architecture').length || 0,
                            icon: GitBranch
                          },
                          { 
                            label: "Best Practice Suggestions", 
                            count: analysisData?.issues?.filter((i: any) => i.category?.toLowerCase().includes('practice')).length || 0,
                            icon: CheckCircle
                          },
                        ].map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.label}
                              className="p-5 border border-border rounded-lg hover:border-primary/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded bg-muted">
                                    <Icon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-semibold text-foreground">{item.label}</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {item.count === 1 ? '1 issue' : `${item.count} issues`}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-xl font-bold text-foreground">
                                  {item.count}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Download Section */}
                    <div className="pt-6 border-t border-border">
                      <div className="flex items-center justify-between p-6 bg-muted/50 rounded-lg border border-border">
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-1">Ready to Download</p>
                          <p className="text-xs text-muted-foreground">
                            Generate a professional PDF report formatted for stakeholder review and team collaboration.
                          </p>
                        </div>
                        <Button 
                          onClick={handleDownloadReport}
                          className="gap-2"
                          size="sm"
                        >
                          <Download className="h-4 w-4" />
                          Download Report
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* BUG REPORT TAB */}
          {activeTab === "bugreport" && (
            <>
              <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Bug Report</h2>
                  <p className="text-xs text-muted-foreground mt-1">Detailed bug tracking report with severity classification</p>
                </div>
                <Button 
                  onClick={handleDownloadBugReport}
                  disabled={bugReports.length === 0}
                  className="gap-2"
                  size="sm"
                >
                  <FileDown className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              <div className="p-8">
                {isLoadingReport ? (
                  <div className="text-center py-16">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading bug reports...</p>
                  </div>
                ) : bugReports.length === 0 ? (
                  <div className="text-center py-16">
                    <CheckCircle className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-base font-medium mb-1 text-foreground">No Bugs Found</p>
                    <p className="text-sm text-muted-foreground">Code analysis completed with no issues detected.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Stats Bar */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4 uppercase tracking-wide">Bug Statistics</h3>
                      <div className="grid grid-cols-5 gap-4">
                        {[
                          { label: "Total", count: bugReports.length, color: "text-blue-600", border: "border-blue-200", bg: "bg-blue-50 dark:bg-blue-950/20" },
                          { label: "Critical", count: stats.critical, color: "text-red-600", border: "border-red-200", bg: "bg-red-50 dark:bg-red-950/20" },
                          { label: "High", count: stats.high, color: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50 dark:bg-orange-950/20" },
                          { label: "Medium", count: stats.medium, color: "text-amber-600", border: "border-amber-200", bg: "bg-amber-50 dark:bg-amber-950/20" },
                          { label: "Low", count: stats.low, color: "text-green-600", border: "border-green-200", bg: "bg-green-50 dark:bg-green-950/20" },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className={`p-5 border ${stat.border} ${stat.bg} rounded-lg text-center`}
                          >
                            <div className={`text-2xl font-bold mb-1 ${stat.color}`}>
                              {stat.count}
                            </div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bug List */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-4 uppercase tracking-wide">Bug Details</h3>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {bugReports.slice(0, 20).map((bug, index) => (
                          <div key={bug.id} className="border border-border rounded-lg overflow-hidden">
                            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="font-medium text-sm text-foreground mb-1">
                                  #{index + 1}: {bug.title}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {bug.file_path && <span className="font-mono">{bug.file_path}</span>}
                                  {bug.line_number && <span className="ml-2">Line {bug.line_number}</span>}
                                  {bug.category && <span className="ml-2">• {bug.category}</span>}
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 rounded text-xs font-semibold text-white whitespace-nowrap ${
                                bug.severity === 'critical' ? 'bg-red-600' :
                                bug.severity === 'high' ? 'bg-orange-600' :
                                bug.severity === 'medium' ? 'bg-amber-600' : 'bg-green-600'
                              }`}>
                                {bug.severity?.toUpperCase()}
                              </span>
                            </div>
                            <div className="p-4">
                              <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/50 p-3 rounded border border-border text-foreground">{bug.details}</pre>
                            </div>
                          </div>
                        ))}
                        {bugReports.length > 20 && (
                          <div className="text-center text-sm text-muted-foreground py-4 border-t border-border pt-6">
                            Showing 20 of {bugReports.length} bugs. Download the full report to see all issues.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Download Section */}
                    <div className="pt-6 border-t border-border">
                      <div className="flex items-center justify-between p-6 bg-muted/50 rounded-lg border border-border">
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-1">Ready to Download</p>
                          <p className="text-xs text-muted-foreground">
                            Generate a professional bug report PDF for your development team.
                          </p>
                        </div>
                        <Button 
                          onClick={handleDownloadBugReport}
                          className="gap-2"
                          size="sm"
                        >
                          <FileDown className="h-4 w-4" />
                          Download Report
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
