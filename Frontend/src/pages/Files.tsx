import { useState, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  AlertTriangle,
  Info,
  RefreshCw,
  Copy,
  Check,
  Code,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams, useLocation } from "react-router-dom";
import { useRepositoryFiles, useFileContent, useAnalysisResults, useAnalysisById } from "@/hooks/useApiQueries";
import { BLOCKED_FILE_MESSAGE, getErrorKind, isGitHubAccessKind } from "@/lib/apiErrors";
import GitHubAccessNotice from "@/components/GitHubAccessNotice";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";

// Helper function to build a file tree from a flat list of file paths
function buildFileTree(files: any[]): any[] {
  const tree: any = {};
  
  files.forEach((file) => {
    const path = typeof file === 'string' ? file : (file.path || file.name);
    if (!path) return;
    
    const parts = path.split('/');
    let current = tree;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: index === parts.length - 1 ? 'file' : 'folder',
          children: {},
        };
      }
      if (index < parts.length - 1) {
        current = current[part].children;
      }
    });
  });
  
  function objectToArray(obj: any): any[] {
    return Object.values(obj).map((item: any) => ({
      ...item,
      children: item.type === 'folder' ? objectToArray(item.children) : undefined,
    }));
  }
  
  return objectToArray(tree);
}

// Normalize path for consistent matching
function normalizePath(p: string): string {
  return p.replace(/^\/+/, '').replace(/\/+/g, '/').toLowerCase();
}

/**
 * How many findings sit in a tree item: for a folder, every finding in a file
 * under it; for a file, findings whose path matches it (exactly, by suffix, or
 * by file name and parent folder, since the analysis and the file list do not
 * always agree on the root).
 */
function countIssues(item: any, issuesByFile: Record<string, number>): number {
  const isFolder = item.type === "folder";
  const normalizedItemPath = normalizePath(item.path || item.name || '');
  return Object.entries(issuesByFile).reduce((count, [filePath, num]) => {
    const normalizedIssuePath = normalizePath(filePath);

    if (isFolder) {
      if (normalizedIssuePath.startsWith(normalizedItemPath + '/')) return count + num;
      return count;
    }

    if (normalizedIssuePath === normalizedItemPath) return count + num;
    if (normalizedIssuePath.endsWith('/' + normalizedItemPath) || normalizedItemPath.endsWith('/' + normalizedIssuePath)) return count + num;
    const issueFile = normalizedIssuePath.split('/').pop() || '';
    const itemFile = normalizedItemPath.split('/').pop() || '';
    if (issueFile && issueFile === itemFile) {
      const issueParent = normalizedIssuePath.split('/').slice(-2, -1)[0] || '';
      const itemParent = normalizedItemPath.split('/').slice(-2, -1)[0] || '';
      if (issueParent === itemParent || !issueParent || !itemParent) return count + num;
    }
    return count;
  }, 0);
}

/** The tree with only the files that have findings, and the folders that hold them. */
function pruneToFindings(items: any[], issuesByFile: Record<string, number>): any[] {
  return items.flatMap((item) => {
    if (item.type === "folder") {
      const children = pruneToFindings(item.children || [], issuesByFile);
      return children.length > 0 ? [{ ...item, children }] : [];
    }
    return countIssues(item, issuesByFile) > 0 ? [item] : [];
  });
}

/**
 * Arrow-key movement between the tree's visible items: Up/Down move, Home/End
 * jump. (Left/Right collapse and expand a folder, handled on the item.)
 */
function handleTreeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-tree-item]"));
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  let next = index;
  if (e.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
  if (e.key === "ArrowUp") next = Math.max(0, index - 1);
  if (e.key === "Home") next = 0;
  if (e.key === "End") next = items.length - 1;
  e.preventDefault();
  items[next]?.focus();
}

interface FileTreeItemProps {
  item: any;
  depth?: number;
  onSelect: (path: string) => void;
  selectedFile: string | null;
  issuesByFile: Record<string, number>;
  /** Start expanded (every folder, when the tree is filtered to findings). */
  expandAll?: boolean;
}

function FileTreeItem({
  item,
  depth = 0,
  onSelect,
  selectedFile,
  issuesByFile,
  expandAll = false,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(expandAll || depth === 0);
  const isFolder = item.type === "folder";
  const isSelected = selectedFile === item.path || selectedFile === item.name;
  const issueCount = countIssues(item, issuesByFile);

  const activate = () => {
    if (isFolder) setIsOpen((open) => !open);
    else onSelect(item.path || item.name);
  };

  return (
    <div>
      <button
        type="button"
        data-tree-item
        onClick={activate}
        onKeyDown={(e) => {
          if (!isFolder) return;
          if (e.key === "ArrowRight" && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          } else if (e.key === "ArrowLeft" && isOpen) {
            e.preventDefault();
            setIsOpen(false);
          }
        }}
        aria-expanded={isFolder ? isOpen : undefined}
        aria-current={!isFolder && isSelected ? "true" : undefined}
        aria-label={
          issueCount > 0
            ? `${item.name}, ${issueCount} finding${issueCount === 1 ? "" : "s"}`
            : undefined
        }
        title={item.path || item.name}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSelected
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </>
        )}
        <span className="flex-1 truncate text-sm">{item.name}</span>
        {issueCount > 0 && (
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-foreground"
            aria-hidden="true"
          >
            {issueCount}
          </span>
        )}
      </button>
      {isFolder && isOpen && item.children && (
        <div role="group">
          {item.children.map((child: any) => (
            <FileTreeItem
              key={child.path}
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
              issuesByFile={issuesByFile}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Code fix suggestion component
function CodeFixSuggestion({ issue, fileContent }: { issue: any; fileContent: string }) {
  const [copied, setCopied] = useState(false);

  const suggestion = issue.suggestion || issue.fix || '';
  const lines = fileContent.split('\n');
  const lineNum = issue.line_number || issue.line || 0;

  const startLine = Math.max(0, lineNum - 2);
  const endLine = Math.min(lines.length - 1, lineNum + 1);
  const codeContext = lines.slice(startLine, endLine + 1);

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border p-3">
      {/* Issue header */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={issue.severity} />
        {lineNum > 0 && <span className="font-mono text-xs text-muted-foreground">Line {lineNum}</span>}
      </div>

      {/* Issue description */}
      <p className="mb-2 text-sm leading-relaxed text-foreground">{issue.message}</p>

      {/* Current code (problematic) */}
      {lineNum > 0 && codeContext.length > 0 && fileContent && (
        <div className="mb-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Current code</div>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
            {codeContext.map((line, i) => (
              <div key={i} className={cn(
                "flex",
                startLine + i + 1 === lineNum && "-mx-2 bg-sev-critical/10 px-2"
              )}>
                <span className="mr-2 w-6 shrink-0 select-none text-right text-muted-foreground">{startLine + i + 1}</span>
                <span className="break-all">{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Fix suggestion */}
      {suggestion && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Wrench className="h-3 w-3" aria-hidden="true" />
              Suggested fix
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleCopy}>
              {copied ? (
                <><Check className="h-3 w-3" aria-hidden="true" /> Copied</>
              ) : (
                <><Copy className="h-3 w-3" aria-hidden="true" /> Copy</>
              )}
            </Button>
          </div>
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm leading-relaxed text-foreground">
            {suggestion}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Files() {
  const params = useParams();
  const repoId = (params as any).id || (params as any).repoId;
  
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);
  const [onlyWithFindings, setOnlyWithFindings] = useState(false);

  // ── React Query: file list (persists across navigations) ──
  const { data: filesData, isLoading: loadingFiles, error: filesError } = useRepositoryFiles(repoId || '', {
    enabled: !!repoId,
  });
  
  // ── React Query: analysis data for issues ──
  const { data: analysisById } = useAnalysisById(analysisId || '', {
    enabled: !!analysisId,
  });
  const { data: analysisLatest } = useAnalysisResults(repoId || '', {
    enabled: !!repoId && !analysisId,
  });
  const analysisData = analysisId ? analysisById : analysisLatest;

  // Helper to validate a file entry is actually a real file (not garbage like "... and 33 more items")
  const isValidFile = (file: any): boolean => {
    const path = typeof file === 'string' ? file : (file?.path || file?.name || '');
    if (!path || typeof path !== 'string') return false;
    // Filter out non-file entries (pagination messages, empty strings, etc.)
    if (path.startsWith('...') || path.includes(' and ') || path.includes(' more ')) return false;
    if (path.length < 2) return false;
    return true;
  };

  // ── Process files from multiple sources ──
  const files = useMemo(() => {
    let rawFiles: any[] = [];
    
    if (filesData) {
      if (Array.isArray(filesData) && filesData.length > 0) rawFiles = filesData;
      else if (filesData.files && Array.isArray(filesData.files) && filesData.files.length > 0) rawFiles = filesData.files;
    }
    
    // Fallback: Extract unique files from analysis issues
    if (rawFiles.length === 0 && analysisData?.issues && Array.isArray(analysisData.issues)) {
      const uniqueFiles = new Set<string>();
      analysisData.issues.forEach((issue: any) => {
        const filePath = issue.file_path || issue.file;
        if (filePath) uniqueFiles.add(filePath);
      });
      if (uniqueFiles.size > 0) {
        rawFiles = Array.from(uniqueFiles).map(path => ({
          path,
          name: path.split('/').pop() || path,
        }));
      }
    }
    
    // Filter out invalid entries
    return rawFiles.filter(isValidFile);
  }, [filesData, analysisData]);

  // ── Build file tree ──
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  // ── Auto-select first file that has issues (or just the first file) ──
  const effectiveSelectedFile = useMemo(() => {
    if (selectedFile) return selectedFile;
    if (files.length === 0) return null;
    
    // Try to select the first file that has issues for better UX
    if (analysisData?.issues && Array.isArray(analysisData.issues)) {
      const issueFilePaths = new Set(
        analysisData.issues.map((i: any) => normalizePath(i.file_path || i.file || ''))
      );
      const fileWithIssue = files.find((f: any) => {
        const p = normalizePath(typeof f === 'string' ? f : (f.path || f.name || ''));
        return issueFilePaths.has(p);
      });
      if (fileWithIssue) {
        return typeof fileWithIssue === 'string' ? fileWithIssue : (fileWithIssue.path || fileWithIssue.name);
      }
    }
    
    // Fallback to first file
    const first = files[0];
    return typeof first === 'string' ? first : (first?.path || first?.name || null);
  }, [selectedFile, files, analysisData]);

  // ── React Query: file content ──
  // placeholderData: undefined → clears old content immediately when switching files
  const { data: fileContentRaw, isLoading: loadingFile, isFetching: fetchingFile, error: fileError } = useFileContent(
    repoId || '', 
    effectiveSelectedFile || '',
    { 
      enabled: !!repoId && !!effectiveSelectedFile,
      placeholderData: undefined,
    }
  );

  // Normalize file content
  const fileContent = useMemo(() => {
    if (!fileContentRaw) return '';
    if (typeof fileContentRaw === 'string') return fileContentRaw;
    if (fileContentRaw.content) return fileContentRaw.content;
    return '';
  }, [fileContentRaw]);

  // ── Issue counts by file ──
  const issuesByFile = useMemo(() => {
    const counts: Record<string, number> = {};
    if (analysisData?.issues && Array.isArray(analysisData.issues)) {
      analysisData.issues.forEach((issue: any) => {
        const filePath = issue.file_path || issue.file;
        if (filePath) counts[filePath] = (counts[filePath] || 0) + 1;
      });
    }
    return counts;
  }, [analysisData]);

  // ── Issues for the currently selected file ──
  const fileIssues = useMemo(() => {
    if (!effectiveSelectedFile || !analysisData?.issues || !Array.isArray(analysisData.issues)) return [];
    const normalizedSelected = normalizePath(effectiveSelectedFile);
    const selectedFileName = normalizedSelected.split('/').pop() || '';
    
    return analysisData.issues
      .filter((issue: any) => {
        const filePath = issue.file_path || issue.file;
        if (!filePath) return false;
        const normalizedIssue = normalizePath(filePath);
        const issueFileName = normalizedIssue.split('/').pop() || '';
        
        // Exact match
        if (normalizedIssue === normalizedSelected) return true;
        // One path is a suffix of the other (handles missing/different root prefixes)
        if (normalizedIssue.endsWith(normalizedSelected) || normalizedSelected.endsWith(normalizedIssue)) return true;
        // Same filename in same parent folder
        if (selectedFileName && issueFileName === selectedFileName) {
          // Check that at least the parent folder matches to avoid false positives
          const issueParts = normalizedIssue.split('/');
          const selectedParts = normalizedSelected.split('/');
          if (issueParts.length >= 2 && selectedParts.length >= 2) {
            return issueParts[issueParts.length - 2] === selectedParts[selectedParts.length - 2];
          }
          // If no parent folder, just match filename
          return issueParts.length === 1 || selectedParts.length === 1;
        }
        return false;
      })
      .map((issue: any) => ({
        line: issue.line_number || issue.line || 0,
        type: (issue.severity === 'critical' || issue.severity === 'high') ? 'error' : 
              (issue.severity === 'medium') ? 'warning' : 'info',
        severity: issue.severity || 'low',
        message: issue.description || issue.message || '',
        suggestion: issue.suggestion || issue.fix || '',
        category: issue.category || '',
        line_number: issue.line_number || issue.line || 0,
      }));
  }, [effectiveSelectedFile, analysisData]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  const lines = fileContent.split("\n");
  const loading = loadingFiles && files.length === 0;
  // Show loading when switching files (no data yet for the new file)
  const showFileLoading = (loadingFile || fetchingFile) && !fileContent && !fileError;
  // A 403 on file content is a blocked sensitive file type (.env, .pem, ...)
  // or missing GitHub access - it used to log the user out.
  const fileErrorKind = getErrorKind(fileError);
  const filesErrorKind = getErrorKind(filesError);

  const visibleTree = useMemo(
    () => (onlyWithFindings ? pruneToFindings(fileTree, issuesByFile) : fileTree),
    [onlyWithFindings, fileTree, issuesByFile]
  );
  const hasFindings = Object.keys(issuesByFile).length > 0;

  return (
    <DashboardLayout>
      {/* Negative margin to reclaim parent padding for full-width layout */}
      <div className="overflow-x-hidden md:overflow-visible md:-mx-3 md:-mt-3">
        <div className="flex flex-col md:flex-row gap-1.5 md:h-[calc(100vh-5.5rem)] w-full md:overflow-hidden md:px-1.5">
          {/* File tree - compact, can shrink */}
          <section
            aria-label="Files"
            className="w-full max-h-80 md:max-h-none md:w-60 lg:w-64 md:min-w-[200px] glass-panel rounded-xl overflow-hidden flex flex-col shrink-0"
          >
          <div className="space-y-2 border-b border-border p-3">
            <h3 className="text-sm font-semibold">Files</h3>
            <div className="flex items-center gap-2">
              <Switch
                id="only-with-findings"
                checked={onlyWithFindings}
                onCheckedChange={setOnlyWithFindings}
                disabled={!hasFindings}
              />
              <Label htmlFor="only-with-findings" className="text-xs font-normal text-muted-foreground">
                Only files with findings
              </Label>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            {loading ? (
              <LoadingState variant="lines" count={8} label="Loading files" className="p-1.5" />
            ) : isGitHubAccessKind(filesErrorKind) ? (
              <GitHubAccessNotice
                kind={filesErrorKind}
                message={filesError instanceof Error ? filesError.message : null}
                className="text-xs"
              />
            ) : visibleTree.length > 0 ? (
              // Remounted when the filter changes, so the filtered tree opens
              // every folder and the full tree goes back to top level only.
              <div key={String(onlyWithFindings)} onKeyDown={handleTreeKeyDown}>
                {visibleTree.map((item) => (
                  <FileTreeItem
                    key={item.path}
                    item={item}
                    onSelect={handleSelectFile}
                    selectedFile={effectiveSelectedFile}
                    issuesByFile={issuesByFile}
                    expandAll={onlyWithFindings}
                  />
                ))}
              </div>
            ) : onlyWithFindings ? (
              <EmptyState
                title="No files with findings"
                action={
                  <Button variant="outline" size="sm" onClick={() => setOnlyWithFindings(false)}>
                    Show all files
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <EmptyState
                icon={File}
                title="No files found"
                className="py-8"
                action={
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Retry
                  </Button>
                }
              />
            )}
          </div>
        </section>

        {/* Code viewer - takes remaining space */}
        <section
          aria-label="File content"
          className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col min-w-0 h-[70vh] md:h-auto"
        >
          {/* Header */}
          <div className="p-3 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="truncate font-mono text-xs font-medium" title={effectiveSelectedFile || undefined}>
                {effectiveSelectedFile || 'No file selected'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
              {fileIssues.length > 0 && (
                <span className="rounded-full border border-border px-1.5 text-foreground">
                  {fileIssues.length} finding{fileIssues.length !== 1 ? 's' : ''}
                </span>
              )}
              <span>{fileContent ? lines.length : 0} lines</span>
            </div>
          </div>

          {/* Code */}
          <div className="flex-1 overflow-auto">
            {showFileLoading ? (
              <LoadingState variant="lines" count={15} label="Loading file" className="p-4" />
            ) : fileError && !fileContent ? (
              isGitHubAccessKind(fileErrorKind) ? (
                <div className="p-4">
                  <GitHubAccessNotice
                    kind={fileErrorKind}
                    message={fileError instanceof Error ? fileError.message : null}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={File}
                  className="h-full"
                  title={
                    fileErrorKind === "blocked_file"
                      ? BLOCKED_FILE_MESSAGE
                      : fileError instanceof Error
                        ? fileError.message
                        : "Couldn't load this file."
                  }
                  body={
                    fileErrorKind === "blocked_file"
                      ? "Files that can hold secrets (.env, keys, certificates) are not shown."
                      : undefined
                  }
                />
              )
            ) : !fileContent ? (
              <EmptyState icon={File} className="h-full" title="Select a file to view its content" />
            ) : (
              <pre className="text-sm font-mono">
                {lines.map((line, index) => {
                  const lineNumber = index + 1;
                  const analysis = fileIssues.find(
                    (a) => a.line === lineNumber
                  );
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex group hover:bg-muted/30 transition-colors",
                        analysis?.type === "error" && "bg-sev-critical/5",
                        analysis?.type === "warning" && "bg-sev-medium/5"
                      )}
                    >
                      <span className="w-10 text-right pr-3 text-muted-foreground select-none py-0.5 border-r border-border text-xs shrink-0">
                        {lineNumber}
                      </span>
                      <span
                        className="w-6 flex items-center justify-center shrink-0"
                        title={analysis ? `${analysis.severity} finding` : undefined}
                      >
                        {analysis?.type === "error" && (
                          <AlertTriangle className="h-3 w-3 text-sev-critical" aria-hidden="true" />
                        )}
                        {analysis?.type === "warning" && (
                          <AlertTriangle className="h-3 w-3 text-sev-medium" aria-hidden="true" />
                        )}
                        {analysis?.type === "info" && (
                          <Info className="h-3 w-3 text-sev-low" aria-hidden="true" />
                        )}
                      </span>
                      <code className="flex-1 py-0.5 pl-1 whitespace-pre">{line || " "}</code>
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        </section>

        {/* Analysis panel - compact, can shrink */}
        <section
          aria-label="Analysis"
          className="w-full max-h-[70vh] md:max-h-none md:w-64 xl:w-80 md:min-w-[240px] glass-panel rounded-xl overflow-hidden flex flex-col shrink-0"
        >
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Analysis</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnalysisCollapsed(!analysisCollapsed)}
              className="h-7 w-7 p-0"
              aria-expanded={!analysisCollapsed}
              aria-label={analysisCollapsed ? "Show analysis" : "Hide analysis"}
            >
              {analysisCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>

          {!analysisCollapsed && (
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {/* One card per finding: line, severity, message, the code and the fix. */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-sm font-medium">Findings in this file</h4>
                  {fileIssues.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums">
                      {fileIssues.length}
                    </span>
                  )}
                </div>
                {fileIssues.length > 0 ? (
                  <div className="space-y-2">
                    {fileIssues.map((issue, idx) => (
                      <CodeFixSuggestion
                        key={idx}
                        issue={issue}
                        fileContent={fileContent}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Code} title="No findings in this file" className="py-6" />
                )}
              </div>
            </div>
          )}
        </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
