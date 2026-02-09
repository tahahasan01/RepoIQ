import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Copy,
  Check,
  Lightbulb,
  Code,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams, useLocation } from "react-router-dom";
import { useRepositoryFiles, useFileContent, useAnalysisResults, useAnalysisById } from "@/hooks/useApiQueries";

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

interface FileTreeItemProps {
  item: any;
  depth?: number;
  onSelect: (path: string) => void;
  selectedFile: string | null;
  issuesByFile: Record<string, number>;
}

function FileTreeItem({
  item,
  depth = 0,
  onSelect,
  selectedFile,
  issuesByFile,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const isFolder = item.type === "folder";
  const isSelected = selectedFile === item.path || selectedFile === item.name;
  
  // Calculate issue count: for files match exact path, for folders sum all nested issues
  const normalizedItemPath = normalizePath(item.path || item.name || '');
  const issueCount = Object.entries(issuesByFile).reduce((count, [filePath, num]) => {
    const normalizedIssuePath = normalizePath(filePath);
    
    if (isFolder) {
      // For folders: count all issues in files that are inside this folder
      if (normalizedIssuePath.startsWith(normalizedItemPath + '/')) return count + num;
      return count;
    }
    
    // For files: exact or suffix match
    if (normalizedIssuePath === normalizedItemPath) return count + num;
    if (normalizedIssuePath.endsWith('/' + normalizedItemPath) || normalizedItemPath.endsWith('/' + normalizedIssuePath)) return count + num;
    // Same filename + same parent folder
    const issueFile = normalizedIssuePath.split('/').pop() || '';
    const itemFile = normalizedItemPath.split('/').pop() || '';
    if (issueFile && issueFile === itemFile) {
      const issueParent = normalizedIssuePath.split('/').slice(-2, -1)[0] || '';
      const itemParent = normalizedItemPath.split('/').slice(-2, -1)[0] || '';
      if (issueParent === itemParent || !issueParent || !itemParent) return count + num;
    }
    return count;
  }, 0);

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(item.path || item.name);
          }
        }}
        className={cn(
          "flex items-center gap-1.5 py-1.5 px-1.5 rounded-md cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className="h-3.5 w-3.5 shrink-0" />
          </>
        )}
        <span className="text-xs flex-1 truncate">{item.name}</span>
        {issueCount > 0 && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium",
            isFolder 
              ? "bg-amber-500/15 text-amber-500" 
              : "bg-destructive/15 text-destructive"
          )}>
            {issueCount}
          </span>
        )}
      </div>
      {isFolder && isOpen && item.children && (
        <div>
          {item.children.map((child: any, index: number) => (
            <FileTreeItem
              key={index}
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
              issuesByFile={issuesByFile}
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
    <div className="p-2.5 bg-muted/30 rounded-lg border border-border/50">
      {/* Issue header */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          issue.type === 'error' ? 'bg-destructive/20 text-destructive' :
          issue.type === 'warning' ? 'bg-warning/20 text-warning' :
          'bg-primary/20 text-primary'
        }`}>
          Line {lineNum}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          issue.type === 'error' ? 'bg-destructive/10 text-destructive' :
          issue.type === 'warning' ? 'bg-warning/10 text-warning' :
          'bg-primary/10 text-primary'
        }`}>
          {issue.severity || issue.type}
        </span>
      </div>
      
      {/* Issue description */}
      <p className="text-xs text-foreground mb-2 leading-relaxed">{issue.message}</p>
      
      {/* Current code (problematic) */}
      {lineNum > 0 && codeContext.length > 0 && fileContent && (
        <div className="mb-2">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-medium text-destructive">Current Code</span>
          </div>
          <pre className="text-[11px] bg-destructive/5 border border-destructive/20 rounded p-2 overflow-x-auto font-mono leading-relaxed">
            {codeContext.map((line, i) => (
              <div key={i} className={cn(
                "flex",
                startLine + i + 1 === lineNum && "bg-destructive/10 -mx-2 px-2"
              )}>
                <span className="text-muted-foreground w-6 text-right mr-2 select-none shrink-0">{startLine + i + 1}</span>
                <span className="break-all">{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
      
      {/* Fix suggestion */}
      {suggestion && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Wrench className="h-3 w-3 text-green-500" />
              <span className="text-[10px] font-medium text-green-500">Suggested Fix</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={handleCopy}
            >
              {copied ? (
                <><Check className="h-2.5 w-2.5 mr-0.5" /> Copied</>
              ) : (
                <><Copy className="h-2.5 w-2.5 mr-0.5" /> Copy</>
              )}
            </Button>
          </div>
          <div className="text-[11px] bg-green-500/5 border border-green-500/20 rounded p-2 overflow-x-auto">
            <pre className="font-mono whitespace-pre-wrap text-foreground leading-relaxed break-words">{suggestion}</pre>
          </div>
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

  // ── React Query: file list (persists across navigations) ──
  const { data: filesData, isLoading: loadingFiles } = useRepositoryFiles(repoId || '', {
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
  const { data: fileContentRaw, isLoading: loadingFile, isFetching: fetchingFile } = useFileContent(
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
  const showFileLoading = (loadingFile || fetchingFile) && !fileContent;

  return (
    <DashboardLayout>
      {/* Negative margin to reclaim parent padding for full-width layout */}
      <div className="-mx-3 -mt-3">
        <div className="flex gap-1.5 h-[calc(100vh-5.5rem)] w-full overflow-hidden px-1.5">
          {/* File tree - compact, can shrink */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-44 min-w-[160px] glass-panel rounded-xl overflow-hidden flex flex-col shrink-0"
          >
          <div className="p-2.5 border-b border-border">
            <h3 className="font-semibold text-xs">Files</h3>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            {loading ? (
              <div className="space-y-1.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-7 bg-muted/50 rounded animate-pulse" style={{ paddingLeft: `${(i % 3) * 10 + 6}px` }} />
                ))}
              </div>
            ) : fileTree.length > 0 ? (
              fileTree.map((item, index) => (
                <FileTreeItem
                  key={index}
                  item={item}
                  onSelect={handleSelectFile}
                  selectedFile={effectiveSelectedFile}
                  issuesByFile={issuesByFile}
                />
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8 px-2">
                <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium mb-1">No files found</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="gap-1 text-xs h-7 mt-2"
                >
                  <Loader2 className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Code viewer - takes remaining space */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col min-w-0"
        >
          {/* Header */}
          <div className="p-2.5 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium truncate">{effectiveSelectedFile || 'No file selected'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {fileIssues.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                  {fileIssues.length} issue{fileIssues.length !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {fileContent ? lines.length : 0} lines
              </span>
            </div>
          </div>

          {/* Code */}
          <div className="flex-1 overflow-auto">
            {showFileLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(15)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-10 h-5 bg-muted/50 rounded animate-pulse" />
                    <div className="flex-1 h-5 bg-muted/30 rounded animate-pulse" style={{ width: `${Math.random() * 40 + 40}%` }} />
                  </div>
                ))}
              </div>
            ) : !fileContent ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <File className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a file to view its content</p>
                </div>
              </div>
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
                        analysis?.type === "error" && "bg-destructive/5",
                        analysis?.type === "warning" && "bg-warning/5"
                      )}
                    >
                      <span className="w-10 text-right pr-3 text-muted-foreground select-none py-0.5 border-r border-border text-xs shrink-0">
                        {lineNumber}
                      </span>
                      <span className="w-6 flex items-center justify-center shrink-0">
                        {analysis?.type === "error" && (
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        )}
                        {analysis?.type === "warning" && (
                          <AlertTriangle className="h-3 w-3 text-warning" />
                        )}
                        {analysis?.type === "info" && (
                          <Info className="h-3 w-3 text-primary" />
                        )}
                      </span>
                      <code className="flex-1 py-0.5 pl-1 whitespace-pre">{line || " "}</code>
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        </motion.div>

        {/* Analysis + AI Suggestions panel - compact, can shrink */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="w-60 min-w-[220px] glass-panel rounded-xl overflow-hidden flex flex-col shrink-0"
        >
          <div className="p-2.5 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-xs">Analysis</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnalysisCollapsed(!analysisCollapsed)}
              className="h-6 w-6 p-0"
            >
              {analysisCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          
          {!analysisCollapsed && (
            <div className="flex-1 overflow-auto p-2.5 space-y-2">
              {/* Issues list */}
              {fileIssues.length > 0 ? (
                fileIssues.map((item, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-2.5 rounded-lg",
                      item.type === "error" && "bg-destructive/10",
                      item.type === "warning" && "bg-warning/10",
                      item.type === "info" && "bg-primary/10"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {item.type === "error" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      {item.type === "warning" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      )}
                      {item.type === "info" && (
                        <Info className="h-3.5 w-3.5 text-primary" />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        Line {item.line}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed">{item.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-6">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                  <p className="text-xs">No issues found in this file</p>
                </div>
              )}

              {/* AI Suggestions with Code Fixes */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  <h4 className="text-xs font-medium">AI Suggestions</h4>
                  {fileIssues.length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full">
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
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    <Code className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
                    <p>No suggestions for this file</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
