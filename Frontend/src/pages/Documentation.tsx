import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import ReactMarkdown from 'react-markdown';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  Copy,
  Check,
  RefreshCw,
  GitBranch,
  Bug,
  FileDown,
  FileType,
  FileJson,
  Sparkles,
} from "lucide-react";
import { bugReportStorage, BugReport } from "@/services/scanService";
import { exportAsJSON, exportAsDOC, exportAsPDF } from "@/services/exportService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
const mockReadme = `# Dashboard

A modern dashboard with charts and analytics, built with TypeScript and Tailwind CSS.

## Features
- ⚡ Fast builds with Vite

## Getting Started

### Prerequisites
- npm or yarn

### Installation

git clone https://github.com/user/dashboard.git
cd dashboard
npm install
npm run dev

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/auth/login | POST | User login |
| /api/auth/logout | POST | User logout |
| /api/auth/refresh | POST | Refresh token |

### Users

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/users | GET | List users |
| /api/users/:id | GET | Get user by ID |
| /api/users | POST | Create user |

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE for details
`;

const architectureDiagram = `
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Components  │  │    Pages     │  │    Hooks     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│          │                │                 │                    │
│          └────────────────┼─────────────────┘                    │
│                           ▼                                      │
│                    ┌──────────────┐                              │
│                    │   Services   │                              │
│                    └──────────────┘                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │     Auth     │  │    Users     │  │     Data     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Database                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │    Users     │  │   Sessions   │  │   Analytics  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
`;

// Bug report will be handled in the Bug Report tab below

export default function Documentation() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"readme" | "architecture" | "bugreport">("readme");
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [readmePrompt, setReadmePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReadme, setGeneratedReadme] = useState(mockReadme);
  const [isLoadingReadme, setIsLoadingReadme] = useState(true);
  const params = useParams();
  const repoId = (params as any).repoId;
  const [architecture, setArchitecture] = useState(architectureDiagram);

  useEffect(() => {
    setBugReports(bugReportStorage.getReports());
    (window as any).__addBugReport = (r: { title: string; details: string; repoName?: string }) => {
      const newReport: BugReport = { id: Date.now(), title: r.title, details: r.details, timestamp: Date.now(), repoName: r.repoName || "Dashboard" };
      bugReportStorage.saveReport(newReport);
      setBugReports((prev) => [newReport, ...prev]);
      setActiveTab("bugreport");
    };
    let mounted = true;

    async function loadReadme() {
      setIsLoadingReadme(true);
      try {
        console.log('[Documentation] Loading README.md for repo:', repoId);
        const res = await apiClient.getFileContent(repoId as string, "README.md").catch(() => null);
        if (!mounted) return;
        if (res && typeof res === "string") {
          console.log('[Documentation] Loaded README (string):', res.substring(0, 100));
          setGeneratedReadme(res);
        } else if (res && res.content) {
          console.log('[Documentation] Loaded README (object):', res.content.substring(0, 100));
          setGeneratedReadme(res.content);
        } else {
          console.log('[Documentation] No README found, using mock');
        }
      } catch (err) {
        console.error('[Documentation] Failed to load README:', err);
      } finally {
        if (mounted) setIsLoadingReadme(false);
      }
    }

    loadReadme();

    return () => { try { delete (window as any).__addBugReport; } catch {} finally { mounted = false } };
  }, [repoId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedReadme);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateReadme = async () => {
    if (!readmePrompt.trim()) return;
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 1200));
    const custom = `# ${readmePrompt}\n\nGenerated README sample.`;
    setGeneratedReadme(custom);
    setIsGenerating(false);
    setReadmePrompt("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Documentation</h1>
            <p className="text-muted-foreground">Auto-generated documentation for your repository</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" />Regenerate</Button>
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />Export</Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-2 border-b border-border">
          {[{ id: "readme", label: "README", icon: FileText }, { id: "architecture", label: "Architecture", icon: GitBranch }, { id: "bugreport", label: "Bug Report", icon: Bug }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="h-4 w-4" />{tab.label}
            </button>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-xl overflow-hidden">
          {activeTab === "readme" && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">README.md</h3>
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleCopy}>{copied ? <><Check className="h-4 w-4 text-success" />Copied</> : <><Copy className="h-4 w-4" />Copy</>}</Button>
              </div>

              <div className="p-4 border-b border-border bg-muted/20">
                <div className="space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Generate Custom README</label>
                  <div className="flex gap-2">
                    <input type="text" value={readmePrompt} onChange={(e) => setReadmePrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !isGenerating) handleGenerateReadme(); }} placeholder="e.g., 'Create a README for a React TypeScript dashboard app'" className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background" disabled={isGenerating} />
                    <Button onClick={handleGenerateReadme} disabled={!readmePrompt.trim() || isGenerating} className="gap-2">{isGenerating ? <><RefreshCw className="h-4 w-4 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4" />Generate</>}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Describe what kind of README you want, and it will be generated for you.</p>
                </div>
              </div>

              <div className="p-6">
                {isLoadingReadme ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading README.md...</p>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        code: ({node, className, children, ...props}: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const inline = !className;
                          return !inline ? (
                            <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          ) : (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>
                              {children}
                            </code>
                          );
                        },
                        table: ({node, ...props}: any) => (
                          <div className="overflow-x-auto my-4">
                            <table className="min-w-full border border-border" {...props} />
                          </div>
                        ),
                        th: ({node, ...props}: any) => (
                          <th className="border border-border px-4 py-2 bg-muted font-semibold" {...props} />
                        ),
                        td: ({node, ...props}: any) => (
                          <td className="border border-border px-4 py-2" {...props} />
                        ),
                      }}
                    >
                      {generatedReadme}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "architecture" && (
            <>
              <div className="p-4 border-b border-border"><h3 className="font-semibold">Architecture Diagram</h3></div>
              <div className="p-6 flex justify-center"><pre className="text-sm font-mono bg-muted/30 p-6 rounded-lg overflow-x-auto">{architectureDiagram}</pre></div>
            </>
          )}

          {activeTab === "bugreport" && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Bug Report</h3>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2" disabled={bugReports.length === 0}><Download className="h-4 w-4" />Export Reports</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => exportAsPDF(bugReports)}><FileDown className="h-4 w-4 mr-2" />Export as PDF</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportAsDOC(bugReports)}><FileType className="h-4 w-4 mr-2" />Export as DOC</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportAsJSON(bugReports)}><FileJson className="h-4 w-4 mr-2" />Export as JSON</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  {bugReports.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      <h4 className="text-sm font-medium">Reports from last scan</h4>
                      <div className="space-y-3">
                        {bugReports.map((r) => {
                          const severity = r.severity || "medium";
                          const status = r.status || "open";
                          return (
                            <div key={r.id} className="p-4 bg-muted/30 rounded-lg border border-border/60">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-mono px-2 py-0.5 bg-primary/10 text-primary rounded">#{r.id}</span>
                                  <span className="text-xs px-2 py-0.5 bg-muted rounded flex items-center gap-1">
                                    <GitBranch className="h-3 w-3" />
                                    {r.repoName}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded-full border border-border capitalize">
                                    {status.replace("_", " ")}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${severity === "critical" ? "bg-destructive/15 text-destructive" : severity === "high" ? "bg-orange-500/15 text-orange-500" : severity === "medium" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
                                    {severity}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(r.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <strong className="text-sm">{r.title}</strong>
                              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.details}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">Bug reports are generated automatically by scans and will appear here.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
