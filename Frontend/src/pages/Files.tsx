import { motion } from "framer-motion";
import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams, useLocation } from "react-router-dom";
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

// Cache helper functions at module scope for instant access
const FILES_CACHE_KEY = (id: string) => `repoiq_files_${id}`;

function getCachedFiles(id: string) {
  try {
    const raw = sessionStorage.getItem(FILES_CACHE_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache for 30 minutes
    if (Date.now() - (parsed.timestamp || 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(FILES_CACHE_KEY(id));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedFiles(id: string, data: any) {
  try {
    sessionStorage.setItem(FILES_CACHE_KEY(id), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

const FILE_CONTENT_CACHE_KEY = (repoId: string, filePath: string) => 
  `repoiq_file_content_${repoId}_${encodeURIComponent(filePath)}`;

function getCachedFileContent(repoId: string, filePath: string) {
  try {
    // Normalize path for consistent cache lookups
    const normalizedPath = filePath.replace(/^\/+/, '').replace(/\/+/g, '/');
    const cacheKey = FILE_CONTENT_CACHE_KEY(repoId, normalizedPath);
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache for 30 minutes
    if (Date.now() - (parsed.timestamp || 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.content;
  } catch {
    return null;
  }
}

function setCachedFileContent(repoId: string, filePath: string, content: string) {
  try {
    // Normalize path for consistent cache storage
    const normalizedPath = filePath.replace(/^\/+/, '').replace(/\/+/g, '/');
    const cacheKey = FILE_CONTENT_CACHE_KEY(repoId, normalizedPath);
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({ content, timestamp: Date.now() })
    );
  } catch (err) {
    // Storage quota might be exceeded - log but don't break
    console.warn('[Files] Failed to cache file content:', err);
  }
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
  const issueCount = issuesByFile[item.path] || issuesByFile[item.name] || 0;
  
  // Debug log for files with issues
  if (!isFolder && issueCount > 0 && depth === 0) {
    console.log('[Files] 🔴 File has', issueCount, 'issues:', item.path || item.name);
  }

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
  const params = useParams();
  // routes may provide :id or :repoId depending on the router setup
  const repoId = (params as any).id || (params as any).repoId;
  
  // Extract analysis_id from query params for historical analysis viewing
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const analysisId = queryParams.get('analysis_id');
  
  // Initialize from cache for INSTANT loading on first render
  const cachedFiles = repoId ? getCachedFiles(repoId) : null;
  const hasCache = cachedFiles && Array.isArray(cachedFiles) && cachedFiles.length > 0;
  
  const [filesList, setFilesList] = useState<any[] | null>(cachedFiles);
  const [fileTree, setFileTree] = useState<any[]>(hasCache ? buildFileTree(cachedFiles) : []);
  const [loading, setLoading] = useState(!hasCache); // false if we have cache - instant display!
  const initialSelectedFile = hasCache ? (cachedFiles[0]?.path || cachedFiles[0]?.name || cachedFiles[0]) : null;
  const [selectedFile, setSelectedFile] = useState<string | null>(initialSelectedFile);
  
  // Also try to get cached file content for instant display
  const initialFileContent = (repoId && initialSelectedFile) 
    ? getCachedFileContent(repoId, initialSelectedFile.replace(/^\/+/, '').replace(/\/+/g, '/')) 
    : '';
  const [fileContent, setFileContent] = useState<string>(initialFileContent || '');
  const [issuesByFile, setIssuesByFile] = useState<Record<string, number>>({});
  const [fileIssues, setFileIssues] = useState<any[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadFilesAndIssues() {
      if (!repoId) {
        console.warn('[Files] No repoId in URL params');
        setLoading(false);
        return;
      }
      
      // Check if we already displayed cache on initial render
      const cached = getCachedFiles(repoId as string);
      const hasCachedFiles = cached && Array.isArray(cached) && cached.length > 0;
      
      if (hasCachedFiles) {
        console.log('[Files] ⚡ INSTANT: Already showing', cached.length, 'cached files');
        // Don't show loading spinner - cached data is already displayed!
        // Continue to fetch fresh data in background...
      } else {
        // No files cached - try to get from analysis cache
        const ANALYSIS_CACHE_KEY = `repoiq_analysis_${repoId}`;
        try {
          const cachedAnalysis = sessionStorage.getItem(ANALYSIS_CACHE_KEY);
          if (cachedAnalysis) {
            const parsed = JSON.parse(cachedAnalysis);
            const cacheAge = Date.now() - (parsed.timestamp || 0);
            if (cacheAge < 30 * 60 * 1000) { // 30 min cache
              if (parsed.data?.issues && Array.isArray(parsed.data.issues)) {
                const uniqueFiles = new Set<string>();
                parsed.data.issues.forEach((issue: any) => {
                  const filePath = issue.file_path || issue.file;
                  if (filePath) uniqueFiles.add(filePath);
                });
                
                if (uniqueFiles.size > 0) {
                  const files = Array.from(uniqueFiles).map(path => ({ 
                    path, 
                    name: path.split('/').pop() || path 
                  }));
                  console.log('[Files] ⚡ INSTANT from analysis cache:', files.length, 'files');
                  setFilesList(files);
                  const firstFile = files[0];
                  setSelectedFile(
                    typeof firstFile === 'string' ? firstFile : (firstFile?.path || firstFile?.name || '')
                  );
                  setFileTree(buildFileTree(files));
                  
                  // Build issue counts
                  const issueCount: Record<string, number> = {};
                  parsed.data.issues.forEach((issue: any) => {
                    const filePath = issue.file_path || issue.file;
                    if (filePath) issueCount[filePath] = (issueCount[filePath] || 0) + 1;
                  });
                  setIssuesByFile(issueCount);
                  (window as any).__allFileIssues = parsed.data.issues;
                  
                  setLoading(false);
                  // Continue to fetch fresh data in background...
                }
              }
            }
          }
        } catch (err) {
          console.log('[Files] No cached analysis available');
        }
        
        // Only show loading if we have NO cached data at all
        if (!hasCachedFiles && filesList === null) {
          setLoading(true);
        }
      }
      
      try {
        console.log('[Files] 🔄 Loading files for repo:', repoId);
        
        // FIXED: Increased timeout to 15s - backend can take 10+ seconds for large repos
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 15000)
        );

        // Try files endpoint first (with short timeout)
        const filesPromise = apiClient.getRepositoryFiles(repoId as string).catch((err) => {
          console.log('[Files] ⚠️ Files endpoint not available:', err?.message);
          return null;
        });
        
        const filesRes = await Promise.race([filesPromise, timeoutPromise]).catch((err) => {
          console.log('[Files] ⏱️ Files endpoint timeout or error:', err?.message);
          return null;
        });
        
        // Debug: Log what we received from the API
        console.log('[Files] 📦 Files API response:', filesRes ? 'received' : 'null/error');
        if (filesRes) {
          console.log('[Files] 📦 Response type:', typeof filesRes);
          console.log('[Files] 📦 Is array?', Array.isArray(filesRes));
          console.log('[Files] 📦 Has .files?', filesRes?.files ? `yes (${filesRes.files.length} items)` : 'no');
        }
        
        // ALWAYS load analysis (for issues and as fallback for files) - WITH TIMEOUT
        console.log('[Files] 📊 Loading analysis results...');
        console.log('[Files] Analysis data:', analysisId ? `specific (${analysisId})` : 'latest');
        const analysisTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), 20000) // Increased from 5s to 20s
        );
        
        // Use specific analysis if analysis_id provided, otherwise get latest
        const analysisPromise = (analysisId 
          ? apiClient.getAnalysisById(analysisId)
          : apiClient.getAnalysisResults(repoId as string)
        ).catch((err) => {
          console.error('[Files] ❌ Failed to fetch analysis:', err);
          return null;
        });
        
        const analysisRes = await Promise.race([analysisPromise, analysisTimeout]).catch((err) => {
          console.error('[Files] ⏱️ Analysis request timeout:', err);
          return null;
        });
        
        console.log('[Files] 📦 Analysis response:', analysisRes ? 'Success' : 'Failed');
        
        if (!mounted) return;
        
        // Process files with multiple fallback strategies
        let files: any[] = [];
        
        // DEBUG: Log the raw response structure
        console.log('[Files] 🔍 Processing files response...');
        console.log('[Files] 🔍 filesRes type:', typeof filesRes);
        console.log('[Files] 🔍 filesRes is null/undefined?', filesRes == null);
        if (filesRes) {
          console.log('[Files] 🔍 filesRes keys:', Object.keys(filesRes));
          console.log('[Files] 🔍 filesRes.files exists?', 'files' in filesRes);
          console.log('[Files] 🔍 filesRes.files is array?', Array.isArray(filesRes?.files));
          console.log('[Files] 🔍 filesRes.files length:', filesRes?.files?.length);
        }
        
        // Strategy 1: Direct files array response
        if (filesRes && Array.isArray(filesRes) && filesRes.length > 0) {
          files = filesRes;
          console.log('[Files] ✅ Strategy 1: Loaded', files.length, 'files from direct array');
        }
        // Strategy 2: Files in nested object (Backend returns {"files": [...]})
        else if (filesRes && filesRes.files && Array.isArray(filesRes.files) && filesRes.files.length > 0) {
          files = filesRes.files;
          console.log('[Files] ✅ Strategy 2: Loaded', files.length, 'files from nested object');
        }
        // Strategy 3: Extract from analysis issues (PRIMARY METHOD - most reliable!)
        else if (analysisRes && analysisRes.issues && Array.isArray(analysisRes.issues)) {
          const uniqueFiles = new Set<string>();
          analysisRes.issues.forEach((issue: any) => {
            const filePath = issue.file_path || issue.file;
            if (filePath) uniqueFiles.add(filePath);
          });
          if (uniqueFiles.size > 0) {
            files = Array.from(uniqueFiles).map(path => ({ 
              path, 
              name: path.split('/').pop() || path 
            }));
            console.log('[Files] ✅ Strategy 3 (PRIMARY): Extracted', files.length, 'files from issues');
          } else {
            console.log('[Files] ⚠️ Analysis has', analysisRes.issues.length, 'issues but no file paths');
          }
        }
        
        // Strategy 4: LAST RESORT - If analysis has any data at all
        if (files.length === 0 && analysisRes) {
          console.log('[Files] 🔍 Trying last resort - checking analysis object structure');
          console.log('[Files] 📋 Analysis keys:', analysisRes ? Object.keys(analysisRes) : 'none');
          
          // Check if there are any files mentioned anywhere in the analysis
          const analysisStr = JSON.stringify(analysisRes);
          const filePathMatches = analysisStr.match(/["']([^"']*\.(py|js|ts|tsx|jsx|java|go|rb|php|css|html|md)[^"']*)["']/gi);
          if (filePathMatches && filePathMatches.length > 0) {
            const uniquePaths = new Set(filePathMatches.map(m => m.replace(/['"]/g, '')));
            files = Array.from(uniquePaths).slice(0, 50).map(path => ({
              path,
              name: path.split('/').pop() || path
            }));
            console.log('[Files] ✅ Strategy 4 (EXTRACTED): Found', files.length, 'files from analysis text');
          }
        }
        
        // If we got files, update the UI
        if (files.length > 0) {
          console.log('[Files] 📁 Processing', files.length, 'files...');
          setFilesList(files);
          
          // Only set selected file if we don't have a cached selection
          if (!cached || !selectedFile) {
            const firstFile = files[0]?.path || files[0]?.name || files[0];
            setSelectedFile(firstFile);
            console.log('[Files] 📄 Selected first file:', firstFile);
          }
          
          // Build file tree from flat list
          const tree = buildFileTree(files);
          setFileTree(tree);
          console.log('[Files] 🌳 Built file tree with', tree.length, 'root nodes');
          
          // Cache for instant loading next time
          try { 
            setCachedFiles(repoId as string, files); 
            console.log('[Files] 💾 Cached', files.length, 'files for instant future loads');
          } catch (err) {
            console.warn('[Files] ⚠️ Failed to cache files:', err);
          }
        } 
        // No files found anywhere
        else {
          console.warn('[Files] ⚠️ No files found from any strategy');
          if (!cached || !filesList || filesList.length === 0) {
            setFilesList([]);
            setFileTree([]);
            console.log('[Files] 📭 Set empty file list');
          }
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
          console.log('[Files] ✅ Built issue counts for', Object.keys(issueCount).length, 'files');
          console.log('[Files] 📊 Issue counts by file:', issueCount);
          console.log('[Files] 📁 Files in tree:', files.map(f => f.path || f.name));
          
          // Store all issues for filtering by file later
          if (mounted && analysisRes.issues) {
            (window as any).__allFileIssues = analysisRes.issues;
            console.log('[Files] 💾 Stored', analysisRes.issues.length, 'total issues for file filtering');
          }
        } else {
          console.log('[Files] ⚠️ No issues found in analysis results');
        }
        
        // BACKGROUND PRE-FETCH: Load content for first 5 files to cache them
        if (files.length > 0 && mounted) {
          console.log('[Files] 🚀 Background pre-fetching content for first 5 files...');
          const filesToPrefetch = files.slice(0, 5);
          
          // Pre-fetch in background (don't await - fire and forget)
          filesToPrefetch.forEach(async (file, index) => {
            setTimeout(async () => {
              const filePath = typeof file === 'string' ? file : (file.path || file.name || file);
              const normalizedPath = filePath.replace(/^\/+/, '').replace(/\/+/g, '/');
              
              // Skip if already cached
              const cached = getCachedFileContent(repoId as string, normalizedPath);
              if (cached) {
                console.log(`[Files] ⚡ File ${index + 1}/5 already cached:`, filePath);
                return;
              }
              
              try {
                const content = await apiClient.getFileContent(repoId as string, filePath).catch(() => null);
                if (content && typeof content === 'string') {
                  setCachedFileContent(repoId as string, normalizedPath, content);
                  console.log(`[Files] ✅ Pre-cached ${index + 1}/5:`, filePath);
                } else if (content && content.content) {
                  setCachedFileContent(repoId as string, normalizedPath, content.content);
                  console.log(`[Files] ✅ Pre-cached ${index + 1}/5:`, filePath);
                }
              } catch (err) {
                console.log(`[Files] ⚠️ Pre-fetch failed for ${index + 1}/5:`, filePath);
              }
            }, index * 500); // Stagger requests by 500ms each
          });
        }
      } catch (err) {
        console.error('[Files] ❌ Critical error loading files:', err);
        // Ensure UI shows something even on critical error
        if (mounted && (!filesList || filesList.length === 0)) {
          setFilesList([]);
          setFileTree([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          console.log('[Files] ✅ Loading complete (success or failure)');
        }
      }
    }

    loadFilesAndIssues();
    return () => { mounted = false };
  }, [repoId]);

  useEffect(() => {
    let mounted = true;
    async function loadContent() {
      if (!selectedFile) return;
      
      // Normalize file path for consistent cache keys
      const normalizedPath = selectedFile.replace(/^\/+/, '').replace(/\/+/g, '/');
      
      // Check cache FIRST synchronously to avoid loading flicker
      const cached = getCachedFileContent(repoId as string, normalizedPath);
      
      if (cached) {
        // INSTANT load from cache - no spinner needed
        console.log('[Files] ⚡ INSTANT load from cache:', selectedFile);
        setFileContent(cached);
        setLoadingFile(false);
        
        // Filter issues for this specific file
        const allIssues = (window as any).__allFileIssues || [];
        const filteredIssues = allIssues.filter((issue: any) => {
          const filePath = issue.file_path || issue.file;
          return filePath === selectedFile || filePath === normalizedPath;
        }).map((issue: any) => ({
          line: issue.line_number || issue.line || 0,
          type: (issue.severity === 'critical' || issue.severity === 'high') ? 'error' : 
                (issue.severity === 'medium') ? 'warning' : 'info',
          message: issue.description || issue.message || '',
          fix: issue.suggestion || issue.fix || '',
        }));
        setFileIssues(filteredIssues);
        console.log('[Files] ⚡ Loaded', filteredIssues.length, 'issues for file from cache');
        return;
      }
      
      // No cache - show loading spinner and fetch from API with timeout
      setLoadingFile(true);
      setFileContent(''); // Clear previous content
      console.log('[Files] 🔄 Fetching from API (first load, will cache):', selectedFile);
      
      try {
        const startTime = Date.now();
        
        // Add 10s timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('File content timeout')), 10000)
        );
        
        const contentPromise = apiClient.getFileContent(repoId as string, selectedFile).catch(() => null);
        const res = await Promise.race([contentPromise, timeoutPromise]).catch((err) => {
          console.error('[Files] ⏱️ File content timeout:', err);
          return null;
        });
        
        const loadTime = Date.now() - startTime;
        
        if (!mounted) return;
        
        let content = '';
        if (res && typeof res === 'string') {
          content = res;
        } else if (res && res.content) {
          content = res.content;
        }
        
        setFileContent(content);
        
        // Cache the content for instant future loads
        if (content) {
          setCachedFileContent(repoId as string, normalizedPath, content);
          console.log(`[Files] ✅ Fetched and cached in ${loadTime}ms. Next load will be instant!`);
        } else {
          console.log(`[Files] ⚠️ No content received for ${selectedFile}`);
        }
        
        // Filter issues for this specific file
        const allIssues = (window as any).__allFileIssues || [];
        const filteredIssues = allIssues.filter((issue: any) => {
          const filePath = issue.file_path || issue.file;
          return filePath === selectedFile || filePath === normalizedPath;
        }).map((issue: any) => ({
          line: issue.line_number || issue.line || 0,
          type: (issue.severity === 'critical' || issue.severity === 'high') ? 'error' : 
                (issue.severity === 'medium') ? 'warning' : 'info',
          message: issue.description || issue.message || '',
          fix: issue.suggestion || issue.fix || '',
        }));
        setFileIssues(filteredIssues);
        console.log('[Files] ✅ Loaded', filteredIssues.length, 'issues for file');
      } catch (err) {
        console.error('[Files] ❌ Failed to load file content:', err);
      } finally {
        if (mounted) setLoadingFile(false);
      }
    }

    loadContent();
    return () => { mounted = false };
  }, [selectedFile, repoId]);

  const lines = fileContent.split("\n");
  
  // Log issue summary when rendering
  const totalFilesWithIssues = Object.keys(issuesByFile).length;
  const totalIssues = Object.values(issuesByFile).reduce((sum, count) => sum + count, 0);
  if (totalFilesWithIssues > 0) {
    console.log(`[Files] 🎯 Rendering tree: ${totalFilesWithIssues} files with ${totalIssues} total issues`);
  }

  return (
    <DashboardLayout>
      <div className="flex gap-4 h-[calc(100vh-8rem)] overflow-hidden">
        {/* File tree */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-56 glass-panel rounded-xl overflow-hidden flex flex-col flex-shrink-0"
        >
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Files</h3>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" style={{ paddingLeft: `${(i % 3) * 12 + 8}px` }} />
                ))}
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
              <div className="text-center text-muted-foreground py-12 px-4">
                <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium mb-1">No files found</p>
                <p className="text-xs mb-4">The repository may be empty or files couldn't be loaded</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="gap-2"
                >
                  <Loader2 className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Code viewer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col min-w-0"
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
            {loadingFile ? (
              <div className="p-4 space-y-2">
                {[...Array(15)].map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-12 h-5 bg-muted/50 rounded animate-pulse" />
                    <div className="flex-1 h-5 bg-muted/30 rounded animate-pulse" style={{ width: `${Math.random() * 40 + 60}%` }} />
                  </div>
                ))}
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
            )}
          </div>
        </motion.div>

        {/* Analysis panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="w-80 glass-panel rounded-xl overflow-hidden flex flex-col flex-shrink-0"
        >
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">Analysis</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnalysisCollapsed(!analysisCollapsed)}
              className="h-7 w-7 p-0"
            >
              {analysisCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {!analysisCollapsed && (
            <div className="flex-1 overflow-auto p-3 space-y-3">
              {fileIssues.length > 0 ? (
                fileIssues.map((item, index) => (
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
              ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">No issues found in this file</p>
                </div>
              )}

              {/* AI Suggestions */}
              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-medium mb-3">AI Suggestions</h4>
                {fileIssues.length > 0 ? (
                  <div className="space-y-2">
                    {fileIssues.slice(0, 3).map((issue, idx) => {
                      // Extract fix/suggestion from the issue
                      const allIssues = (window as any).__allFileIssues || [];
                      const fullIssue = allIssues.find((i: any) => 
                        (i.file_path || i.file) === selectedFile && 
                        (i.line_number || i.line) === issue.line
                      );
                      const suggestion = fullIssue?.suggestion || fullIssue?.fix || issue.message;
                      
                      return (
                        <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-start gap-2 mb-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              issue.type === 'error' ? 'bg-destructive/20 text-destructive' :
                              issue.type === 'warning' ? 'bg-warning/20 text-warning' :
                              'bg-primary/20 text-primary'
                            }`}>
                              Line {issue.line}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {issue.message}
                          </p>
                          {suggestion && suggestion !== issue.message && (
                            <div className="mt-2 p-2 bg-background/50 rounded text-xs">
                              <div className="font-medium text-primary mb-1">Suggestion:</div>
                              <div className="text-muted-foreground">{suggestion}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No suggestions for this file
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
