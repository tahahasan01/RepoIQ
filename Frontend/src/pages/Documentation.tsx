import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  RefreshCw,
  GitBranch,
  Bug,
  AlertTriangle,
  Shield,
  Code,
  CheckCircle,
  FileDown,
} from "lucide-react";
import { BugReport } from "@/services/scanService";
import { generateFullAnalysisReport, generateBugReportPDF, AnalysisReport } from "@/services/reportService";

export default function Documentation() {
  const [activeTab, setActiveTab] = useState<"report" | "architecture" | "bugreport">("report");
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [repoData, setRepoData] = useState<any>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  
  const params = useParams();
  const repoId = (params as any).id || (params as any).repoId;
  
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  
  // Architecture caching
  const ARCH_CACHE_KEY = (id: string) => `repoiq_architecture_${id}`;
  const getInitialArchitecture = () => {
    if (!repoId) return '';
    try {
      const raw = sessionStorage.getItem(ARCH_CACHE_KEY(repoId));
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      if (Date.now() - (parsed.timestamp || 0) > 30 * 60 * 1000) return '';
      return parsed.content || '';
    } catch {}
    return '';
  };
  const initialArchitecture = getInitialArchitecture();
  const [architecture, setArchitecture] = useState(initialArchitecture);
  const [isLoadingArchitecture, setIsLoadingArchitecture] = useState(!initialArchitecture);

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
    
    async function loadArchitecture() {
      if (!repoId) return;
      
      if (initialArchitecture) {
        setIsLoadingArchitecture(false);
      }
      
      try {
        const result = await apiClient.getArchitectureDiagram(repoId as string);
        if (!mounted) return;
        
        if (result && result.diagram) {
          setArchitecture(result.diagram);
          try {
            sessionStorage.setItem(
              ARCH_CACHE_KEY(repoId as string),
              JSON.stringify({ content: result.diagram, timestamp: Date.now() })
            );
          } catch {}
        }
      } catch (err) {
        console.error('[Documentation] Failed to load architecture:', err);
      } finally {
        if (mounted) setIsLoadingArchitecture(false);
      }
    }
    
    loadData();
    loadArchitecture();
    
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Reports & Documentation</h1>
            <p className="text-muted-foreground">Generate comprehensive reports for your repository analysis</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-2 border-b border-border">
          {[
            { id: "report", label: "Full Report", icon: FileText },
            { id: "architecture", label: "Architecture", icon: GitBranch },
            { id: "bugreport", label: "Bug Report", icon: Bug }
          ].map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />{tab.label}
            </button>
          ))}
        </motion.div>

        {/* Content */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-xl overflow-hidden">
          
          {/* FULL REPORT TAB */}
          {activeTab === "report" && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Comprehensive Analysis Report</h3>
                <Button 
                  onClick={handleDownloadReport} 
                  disabled={isLoadingReport || !analysisData}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download PDF Report
                </Button>
              </div>

              <div className="p-6">
                {isLoadingReport ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                    <p className="text-muted-foreground">Loading analysis data...</p>
                  </div>
                ) : !analysisData ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                    <p className="text-lg font-medium mb-2">No Analysis Data Available</p>
                    <p className="text-muted-foreground">Run an analysis first to generate reports.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Scores Overview */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-xl">
                      <h4 className="text-lg font-semibold mb-4 text-center">Analysis Scores</h4>
                      <div className="grid grid-cols-5 gap-4 text-center">
                        <div>
                          <div className="text-3xl font-bold">{analysisData?.overall_score || 0}</div>
                          <div className="text-xs opacity-80">Overall</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold">{analysisData?.security_score || 0}</div>
                          <div className="text-xs opacity-80">Security</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold">{analysisData?.quality_score || 0}</div>
                          <div className="text-xs opacity-80">Quality</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold">{analysisData?.architecture_score || 0}</div>
                          <div className="text-xs opacity-80">Architecture</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold">{analysisData?.documentation_score || 0}</div>
                          <div className="text-xs opacity-80">Documentation</div>
                        </div>
                      </div>
                    </div>

                    {/* Issue Summary */}
                    <div className="bg-muted/50 p-6 rounded-xl border">
                      <h4 className="text-lg font-semibold mb-4">Issues Summary</h4>
                      <div className="grid grid-cols-5 gap-4 text-center">
                        <div className="p-4 bg-background rounded-lg border">
                          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                          <div className="text-xs text-muted-foreground">Total</div>
                        </div>
                        <div className="p-4 bg-background rounded-lg border">
                          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                          <div className="text-xs text-muted-foreground">Critical</div>
                        </div>
                        <div className="p-4 bg-background rounded-lg border">
                          <div className="text-2xl font-bold text-orange-500">{stats.high}</div>
                          <div className="text-xs text-muted-foreground">High</div>
                        </div>
                        <div className="p-4 bg-background rounded-lg border">
                          <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
                          <div className="text-xs text-muted-foreground">Medium</div>
                        </div>
                        <div className="p-4 bg-background rounded-lg border">
                          <div className="text-2xl font-bold text-green-600">{stats.low}</div>
                          <div className="text-xs text-muted-foreground">Low</div>
                        </div>
                      </div>
                    </div>

                    {/* Report Contents Preview */}
                    <div className="border rounded-xl overflow-hidden">
                      <div className="p-4 bg-muted/50 border-b">
                        <h4 className="font-semibold">Report Contents</h4>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <Shield className="h-5 w-5 text-red-500" />
                          <span>Security Vulnerabilities</span>
                          <span className="ml-auto text-sm text-muted-foreground">
                            {analysisData?.issues?.filter((i: any) => i.agent_type === 'security' || i.category?.toLowerCase().includes('security')).length || 0} issues
                          </span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <Code className="h-5 w-5 text-blue-500" />
                          <span>Code Quality Issues</span>
                          <span className="ml-auto text-sm text-muted-foreground">
                            {analysisData?.issues?.filter((i: any) => i.agent_type === 'quality').length || 0} issues
                          </span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <GitBranch className="h-5 w-5 text-purple-500" />
                          <span>Architecture Issues</span>
                          <span className="ml-auto text-sm text-muted-foreground">
                            {analysisData?.issues?.filter((i: any) => i.agent_type === 'architecture').length || 0} issues
                          </span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span>Best Practice Suggestions</span>
                          <span className="ml-auto text-sm text-muted-foreground">
                            {analysisData?.issues?.filter((i: any) => i.category?.toLowerCase().includes('practice')).length || 0} suggestions
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      <p>Click "Download PDF Report" to generate a comprehensive report with all issues, suggestions, and recommendations.</p>
                      <p className="mt-1">The report is formatted for easy sharing with your development team.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ARCHITECTURE TAB */}
          {activeTab === "architecture" && (
            <>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold">Architecture Diagram</h3>
              </div>
              <div className="p-6 flex justify-center">
                {isLoadingArchitecture ? (
                  <div className="flex flex-col items-center gap-4 py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Generating architecture diagram from file structure...</p>
                  </div>
                ) : architecture ? (
                  <pre className="text-sm font-mono bg-muted/30 p-6 rounded-lg overflow-x-auto whitespace-pre-wrap max-w-full">{architecture}</pre>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No architecture diagram available.</p>
                    <p className="text-sm mt-2">Run an analysis to generate the diagram.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* BUG REPORT TAB */}
          {activeTab === "bugreport" && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Bug Report</h3>
                <Button 
                  onClick={handleDownloadBugReport}
                  disabled={bugReports.length === 0}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Download Bug Report PDF
                </Button>
              </div>

              <div className="p-6">
                {isLoadingReport ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                    <p className="text-muted-foreground">Loading bug reports...</p>
                  </div>
                ) : bugReports.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="text-lg font-medium mb-2">No Bugs Found!</p>
                    <p className="text-muted-foreground">Great job! Your code analysis found no issues.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Stats Bar */}
                    <div className="grid grid-cols-5 gap-4 mb-6">
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="text-2xl font-bold text-blue-600">{bugReports.length}</div>
                        <div className="text-xs text-muted-foreground">Total Bugs</div>
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                        <div className="text-xs text-muted-foreground">Critical</div>
                      </div>
                      <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <div className="text-2xl font-bold text-orange-500">{stats.high}</div>
                        <div className="text-xs text-muted-foreground">High</div>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                        <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
                        <div className="text-xs text-muted-foreground">Medium</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-2xl font-bold text-green-600">{stats.low}</div>
                        <div className="text-xs text-muted-foreground">Low</div>
                      </div>
                    </div>

                    {/* Bug List */}
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {bugReports.slice(0, 20).map((bug, index) => (
                        <div key={bug.id} className="border rounded-lg overflow-hidden">
                          <div className="p-3 bg-muted/50 border-b flex items-start justify-between gap-4">
                            <div>
                              <div className="font-medium text-sm">#{index + 1}: {bug.title}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {bug.file_path && <span>File: {bug.file_path}</span>}
                                {bug.line_number && <span className="ml-2">Line: {bug.line_number}</span>}
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                              bug.severity === 'critical' ? 'bg-red-600' :
                              bug.severity === 'high' ? 'bg-orange-500' :
                              bug.severity === 'medium' ? 'bg-yellow-600' : 'bg-green-600'
                            }`}>
                              {bug.severity?.toUpperCase()}
                            </span>
                          </div>
                          <div className="p-3 text-sm">
                            <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/30 p-3 rounded">{bug.details}</pre>
                          </div>
                        </div>
                      ))}
                      {bugReports.length > 20 && (
                        <div className="text-center text-sm text-muted-foreground py-4">
                          ... and {bugReports.length - 20} more bugs. Download the full report to see all.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
