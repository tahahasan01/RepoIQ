import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams } from "react-router-dom";
import apiClient from "@/lib/api";

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
  
  // Convert tree object to array
  function objectToArray(obj: any): any[] {
    return Object.values(obj).map((item: any) => ({
      ...item,
      children: item.type === 'folder' ? objectToArray(item.children) : undefined,
    }));
  }
  
  return objectToArray(tree);
}

const codeAnalysis = [
  {
    line: 11,
    type: "error",
    message: "SQL Injection vulnerability: User input directly in query",
  },
  {
    line: 27,
    type: "warning",
    message: "Sensitive data (password) being logged",
  },
  {
    line: 1,
    type: "info",
    message: 'Consider adding "use strict" directive',
  },
  {
    line: 8,
    type: "info",
    message: "Missing JSDoc documentation for function",
  },
];

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
  const issueCount = issuesByFile[item.path] || 0;

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
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-primary" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4" />
          </>
        )}
        <span className="text-sm flex-1">{item.name}</span>
        {!isFolder && issueCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
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

export default function Files() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [filesList, setFilesList] = useState<any[] | null>(null);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [issuesByFile, setIssuesByFile] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const params = useParams();
  // routes may provide :id or :repoId depending on the router setup
  const repoId = (params as any).id || (params as any).repoId;

  useEffect(() => {
    let mounted = true;
    async function loadFilesAndIssues() {
      if (!repoId) {
        console.warn('[Files] No repoId in URL params');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        console.log('[Files] Loading files for repo:', repoId);
        
        // Load files from repository
        const filesRes = await apiClient.getRepositoryFiles(repoId as string).catch((err) => {
          console.log('[Files] Failed to fetch files:', err?.message || err);
          return null;
        });
        
        // Load issues from analysis to build file list from issues if files endpoint fails
        const analysisRes = await apiClient.getAnalysisResults(repoId as string).catch(() => null);
        
        if (!mounted) return;
        
        // Process files
        let files: any[] = [];
        if (filesRes && Array.isArray(filesRes)) {
          files = filesRes;
          console.log('[Files] Loaded', files.length, 'files from API');
        } else if (filesRes && filesRes.files) {
          files = filesRes.files;
          console.log('[Files] Loaded', files.length, 'files from API');
        } else if (analysisRes && analysisRes.issues) {
          // Fallback: extract unique file paths from issues
          const uniqueFiles = new Set<string>();
          analysisRes.issues.forEach((issue: any) => {
            const filePath = issue.file_path || issue.file;
            if (filePath) uniqueFiles.add(filePath);
          });
          files = Array.from(uniqueFiles).map(path => ({ path, name: path.split('/').pop() }));
          console.log('[Files] Extracted', files.length, 'files from issues');
        }
        
        if (files.length > 0) {
          setFilesList(files);
          setSelectedFile(files[0]?.path || files[0]?.name || files[0]);
          
          // Build file tree from flat list
          const tree = buildFileTree(files);
          setFileTree(tree);
        } else {
          console.log('[Files] No files found');
        }
        
        // Process issues by file
        if (analysisRes && analysisRes.issues) {
          const issueCount: Record<string, number> = {};
          analysisRes.issues.forEach((issue: any) => {
            const filePath = issue.file_path || issue.file;
            if (filePath) {
              issueCount[filePath] = (issueCount[filePath] || 0) + 1;
            }
          });
          setIssuesByFile(issueCount);
          console.log('[Files] Issue counts by file:', issueCount);
        }
      } catch (err) {
        console.error('[Files] Failed to load files/issues:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadFilesAndIssues();
    return () => { mounted = false };
  }, [repoId]);

  useEffect(() => {
    let mounted = true;
    async function loadContent() {
      if (!selectedFile) return;
      try {
        console.log('[Files] Loading content for:', selectedFile);
        const res = await apiClient.getFileContent(repoId as string, selectedFile).catch(() => null);
        if (!mounted) return;
        if (res && typeof res === 'string') {
          setFileContent(res);
        } else if (res && res.content) {
          setFileContent(res.content);
        }
      } catch (err) {
        // keep mock
      }
    }

    loadContent();
    return () => { mounted = false };
  }, [selectedFile, repoId]);

  const lines = fileContent.split("\n");

  return (
    <DashboardLayout>
      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* File tree */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-64 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Files</h3>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">Loading files...</p>
              </div>
            ) : fileTree.length > 0 ? (
              fileTree.map((item, index) => (
                <FileTreeItem
                  key={index}
                  item={item}
                  onSelect={setSelectedFile}
                  selectedFile={selectedFile}
                  issuesByFile={issuesByFile}
                />
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">No files found</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Code viewer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">src/api/{selectedFile}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {lines.length} lines
              </span>
            </div>
          </div>

          {/* Code */}
          <div className="flex-1 overflow-auto">
            <pre className="text-sm font-mono">
              {lines.map((line, index) => {
                const lineNumber = index + 1;
                const analysis = codeAnalysis.find(
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
                    {/* Line number */}
                    <span className="w-12 text-right pr-4 text-muted-foreground select-none py-0.5 border-r border-border">
                      {lineNumber}
                    </span>
                    {/* Issue indicator */}
                    <span className="w-8 flex items-center justify-center">
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
                    {/* Code */}
                    <code className="flex-1 py-0.5 pl-2">{line || " "}</code>
                  </div>
                );
              })}
            </pre>
          </div>
        </motion.div>

        {/* Analysis panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="w-80 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Analysis</h3>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {codeAnalysis.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg",
                  item.type === "error" && "bg-destructive/10",
                  item.type === "warning" && "bg-warning/10",
                  item.type === "info" && "bg-primary/10"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {item.type === "error" && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  {item.type === "warning" && (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                  {item.type === "info" && (
                    <Info className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    Line {item.line}
                  </span>
                </div>
                <p className="text-sm">{item.message}</p>
              </div>
            ))}

            {/* Suggestions */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-3">AI Suggestions</h4>
              <div className="space-y-2">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Use parameterized queries to prevent SQL injection.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2 gap-1">
                    Apply fix
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Add JSDoc comments for better documentation.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2 gap-1">
                    Generate docs
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
