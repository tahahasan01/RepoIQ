import { motion } from "framer-motion";
import { useState, useEffect } from "react";
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

  useEffect(() => {
    setBugReports(bugReportStorage.getReports());
    (window as any).__addBugReport = (r: { title: string; details: string; repoName?: string }) => {
      const newReport: BugReport = { id: Date.now(), title: r.title, details: r.details, timestamp: Date.now(), repoName: r.repoName || "Dashboard" };
      bugReportStorage.saveReport(newReport);
      setBugReports((prev) => [newReport, ...prev]);
      setActiveTab("bugreport");
    };
    return () => { try { delete (window as any).__addBugReport; } catch {} };
  }, []);

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
                <div className="prose prose-sm dark:prose-invert max-w-none"><pre className="text-sm whitespace-pre-wrap font-sans">{generatedReadme}</pre></div>
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
                      <div className="space-y-2">{bugReports.map((r) => (<div key={r.id} className="p-3 bg-muted/20 rounded border border-border/50"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="text-xs font-mono px-2 py-0.5 bg-primary/10 text-primary rounded">#{r.id}</span><span className="text-xs px-2 py-0.5 bg-muted rounded flex items-center gap-1"><GitBranch className="h-3 w-3" />{r.repoName}</span></div><span className="text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleString()}</span></div><strong className="text-sm">{r.title}</strong><p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.details}</p></div>))}</div>
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
