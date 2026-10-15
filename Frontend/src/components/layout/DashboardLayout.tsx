import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  AlertTriangle,
  FileCode,
  FileText,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  Play,
  GitBranch,
  Clock,
  Loader2,
  History,
  MessageSquare,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import NotificationBell from "@/components/NotificationBell";
import { useState, useEffect, lazy, Suspense } from "react";
import apiClient from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ScanResult } from "@/types/scan";
import { formatRelativeTime } from "@/lib/timeUtils";
import { useNotificationStore, startBackgroundAnalysisPolling } from "@/stores/notificationStore";
// role is owner-only now; no role hook needed here
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// The repository chat (and the markdown renderer it brings) is fetched when
// someone first opens it, not with every dashboard page.
const loadChatbot = () => import("@/components/Chatbot");
const Chatbot = lazy(() => loadChatbot().then((m) => ({ default: m.Chatbot })));

interface DashboardLayoutProps {
  children: ReactNode;
  repoName?: string;
  branch?: string;
  lastScan?: string;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { id: repoId } = useParams<{ id: string }>();
  
  // Start background analysis polling
  useEffect(() => {
    startBackgroundAnalysisPolling();
  }, []);

  // Generate sidebar links dynamically based on repoId
  const sidebarLinks = repoId ? [
    { href: `/dashboard/${repoId}`, icon: LayoutDashboard, label: "Overview" },
    { href: `/dashboard/${repoId}/issues`, icon: AlertTriangle, label: "Issues" },
    { href: `/dashboard/${repoId}/files`, icon: FileCode, label: "Files" },
    { href: `/dashboard/${repoId}/docs`, icon: FileText, label: "Documentation" },
    { href: `/dashboard/${repoId}/settings`, icon: Settings, label: "Settings" },
  ] : [];

  const [repoName, setRepoName] = useState<string>("Loading...");
  const [branch, setBranch] = useState<string>("main");
  const [lastScan, setLastScan] = useState<string>("Never");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Below 768px the sidebar is a drawer: open from the menu button, closed
  // on navigation, Escape or a tap outside. It used to stay open at 240px,
  // leaving phones a ~150px column for the page.
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const collapsed = !isMobile && sidebarCollapsed;
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  // Mounted from the first open onwards, so the sheet can animate closed.
  const [chatMounted, setChatMounted] = useState(false);
  useEffect(() => {
    if (chatOpen) setChatMounted(true);
  }, [chatOpen]);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  // Function to load repo and history (will be reused for real-time updates)
  const loadRepoAndHistory = async () => {
      try {
        if (!repoId || repoId === 'undefined') {
          // No repo selected yet
          console.log('[DashboardLayout] No repoId in URL params, repoId:', repoId);
          setRepoName("Repository");
          setBranch("main");
          setScanHistory([]);
          setLastScan("Never");
          return;
        }

      console.log('[DashboardLayout] 🔄 Loading repo and history:', repoId);
        const repo = await apiClient.getRepository(repoId as string);
        setRepoName(repo?.name || repo?.full_name || "Repository");
        setBranch(repo?.default_branch || "main");

        const history = await apiClient.getAnalysisHistory(repoId as string);
        
        console.log('[DashboardLayout] 📊 Raw history response:', history);
        console.log('[DashboardLayout] 📊 History type:', typeof history);
        console.log('[DashboardLayout] 📊 Is array?', Array.isArray(history));
        
        // Ensure scanHistory is always an array - handle both array response and object with 'history' field
        let historyArray: any[] = [];
        if (Array.isArray(history)) {
          historyArray = history;
          console.log('[DashboardLayout] ✅ History is array, length:', historyArray.length);
        } else if (history && Array.isArray(history.history)) {
          historyArray = history.history;
          console.log('[DashboardLayout] ✅ History.history is array, length:', historyArray.length);
        } else if (history && typeof history === 'object') {
          console.log('[DashboardLayout] ⚠️ History is object but not array. Keys:', Object.keys(history));
        } else {
          console.log('[DashboardLayout] ⚠️ History is not an array or object:', history);
        }
        
        console.log('[DashboardLayout] 📊 historyArray contents:', historyArray);
        
        // Normalize history items into a consistent shape for the UI
        const scanItems = historyArray.map((item: any) => ({
          id: item.id || String(Date.now()),
          timestamp: new Date(item.completed_at || item.created_at || item.started_at || Date.now()).getTime(),
          repoName: repoName,
          branch: branch,
          issues: item.issues || [],
          stats: {
            total: item.total_issues ?? item.total ?? 0,
            critical: item.critical_issues ?? 0,
            high: item.high_issues ?? 0,
            medium: item.medium_issues ?? 0,
            low: item.low_issues ?? 0,
          }
        }));

        setScanHistory(scanItems);
        console.log('[DashboardLayout] ✅ Set scan history with', scanItems.length, 'items');
        console.log('[DashboardLayout] 📊 scanItems:', scanItems);

        // compute last scan from most recent completed analysis or repository.last_analyzed
        const latest = scanItems[0];
        console.log('[DashboardLayout] Latest scan item:', latest);
        console.log('[DashboardLayout] Repo last_analyzed:', repo?.last_analyzed);
        console.log('[DashboardLayout] Repo updated_at:', repo?.updated_at);
        
        // Try multiple timestamp fields in order of preference
        let scanTime = null;
        if (latest?.timestamp) {
          scanTime = latest.timestamp;
          console.log('[DashboardLayout] Using latest.timestamp:', scanTime);
        } else if (historyArray[0]?.completed_at) {
          scanTime = historyArray[0].completed_at;
          console.log('[DashboardLayout] Using history[0].completed_at:', scanTime);
        } else if (historyArray[0]?.updated_at) {
          scanTime = historyArray[0].updated_at;
          console.log('[DashboardLayout] Using history[0].updated_at:', scanTime);
        } else if (historyArray[0]?.created_at) {
          scanTime = historyArray[0].created_at;
          console.log('[DashboardLayout] Using history[0].created_at:', scanTime);
        } else if (repo?.last_analyzed) {
          scanTime = repo.last_analyzed;
          console.log('[DashboardLayout] Using repo.last_analyzed:', scanTime);
        } else if (repo?.updated_at) {
          scanTime = repo.updated_at;
          console.log('[DashboardLayout] Using repo.updated_at:', scanTime);
        }
        
        if (scanTime) {
          const formattedTime = new Date(scanTime).toLocaleString();
          setLastScan(formattedTime);
          console.log('[DashboardLayout] ✅ Last scan set to:', formattedTime);
        } else {
          setLastScan("Never");
          console.log('[DashboardLayout] ⚠️ No scan time found, setting to Never');
        }
      } catch (err) {
        console.error("Failed loading repo/history", err);
      }
    };

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (mounted) {
        await loadRepoAndHistory();
      }
    }

    load();
    
    // Refresh the sidebar history when an analysis of this repository
    // finishes. This listened for "scanCompleted", which only the removed mock
    // scanner dispatched (and checked a `repository_id` field it never had), so
    // the history never refreshed. The notification store's polling dispatches
    // "analysisCompleted" with `repoId`.
    const handleAnalysisCompleted = (event: Event) => {
      const completedRepoId = (event as CustomEvent<{ repoId?: string }>).detail?.repoId;
      if (repoId && String(completedRepoId) === String(repoId)) {
        loadRepoAndHistory();
      }
    };

    window.addEventListener('analysisCompleted', handleAnalysisCompleted);

    return () => {
      mounted = false;
      window.removeEventListener('analysisCompleted', handleAnalysisCompleted);
    };
  }, [repoId]);

  // Get notification store actions
  const { startBackgroundAnalysis, addNotification, backgroundAnalyses } = useNotificationStore();
  
  // Check if there's an active analysis for this repo
  const activeAnalysis = repoId ? backgroundAnalyses.get(repoId) : undefined;
  const isAnalysisRunning = activeAnalysis?.status === 'in_progress' || activeAnalysis?.status === 'prefetching';
  
  const handleRunScan = async () => {
    if (!repoId) {
      console.error('[DashboardLayout] Cannot run scan: no repoId');
      return;
    }
    
    // Don't start if already running
    if (isAnalysisRunning) {
      console.log('[DashboardLayout] Analysis already running');
      return;
    }
    
    setIsScanning(true);
    console.log('[DashboardLayout] Starting analysis for repo:', repoId);
    
    try {
      // Start the analysis
      const result = await apiClient.startAnalysis(repoId as string);
      console.log('[DashboardLayout] Analysis started:', result);
      
      if (result && result.analysis_id) {
        // Track in background analysis system for notifications
        startBackgroundAnalysis(repoId, repoName, result.analysis_id);
        
        addNotification({
          type: 'info',
          title: 'Analysis Started',
          message: `${repoName} analysis is running...`,
          repoId: repoId,
          repoName: repoName,
          analysisId: result.analysis_id,
        });
      }
      
      // The notification store's polling will handle completion and refresh
    } catch (error) {
      console.error("[DashboardLayout] Scan failed:", error);
      setIsScanning(false);
      addNotification({
        type: 'error',
        title: 'Analysis Failed',
        message: `Failed to start analysis: ${(error as any)?.message || 'Unknown error'}`,
        repoId: repoId,
        repoName: repoName,
      });
    }
  };
  
  // Sync scanning state with background analysis
  useEffect(() => {
    if (repoId) {
      const analysis = backgroundAnalyses.get(repoId);
      if (analysis?.status === 'in_progress' || analysis?.status === 'prefetching') {
        setIsScanning(true);
      } else {
        setIsScanning(false);
      }
    }
  }, [repoId, backgroundAnalyses]);

  // role toggle removed for owner-only app

  const drawerHidden = isMobile && !mobileNavOpen;

  return (
    <div className="min-h-screen bg-background flex">
      {isMobile && mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Sidebar */}
      <motion.aside
        id="dashboard-nav"
        initial={false}
        animate={
          drawerHidden
            ? {
                width: 240,
                x: -240,
                // Hidden once off-screen, so its links leave the tab order.
                visibility: "hidden",
                transition: { duration: 0.2, visibility: { delay: 0.2, duration: 0 } },
              }
            : { width: collapsed ? 64 : 240, x: 0, visibility: "visible", transition: { duration: 0.2 } }
        }
        aria-hidden={drawerHidden || undefined}
        className="fixed top-0 left-0 h-full bg-card border-r border-border z-50 flex flex-col"
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <Link to="/repos" className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 min-w-[32px] rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-bold text-lg whitespace-nowrap"
              >
                Repo<span className="gradient-text">IQ</span>
              </motion.span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {sidebarLinks.map((link) => {
            const isActive = location.pathname === link.href;
            return (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="h-5 w-5 min-w-[20px]" />
                {!collapsed && (
                  <span className="text-sm font-medium">{link.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Back to repos */}
        <div className="p-3 border-t border-border">
          <Link to="/repos">
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3",
                collapsed && "justify-center"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              {!collapsed && <span>All Repos</span>}
            </Button>
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-20 -right-3 w-6 h-6 rounded-full bg-card border border-border hidden md:flex items-center justify-center hover:bg-muted transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </motion.aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 min-w-0 transition-all duration-300",
          collapsed ? "md:ml-16" : "md:ml-60"
        )}
      >
        {/* Top bar */}
        {/* The left side gives way (repo name truncates) and the button labels
            shorten below 2xl: at 1280px the full header was ~75px wider than
            the content column, so the whole page scrolled sideways. */}
        <header className="sticky top-0 z-30 glass-panel border-b h-16 flex items-center justify-between gap-2 sm:gap-4 px-4 md:px-6">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0 -ml-2"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              aria-controls="dashboard-nav"
              aria-expanded={mobileNavOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-semibold truncate" title={repoName}>{repoName}</h1>
              <span className="hidden sm:flex shrink-0 items-center gap-1 text-sm text-muted-foreground px-2 py-1 bg-muted rounded-md">
                <GitBranch className="h-3 w-3" />
                {branch}
              </span>
            </div>
            <span className="hidden xl:flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
              <Clock className="h-3 w-3" />
              Last scan: {formatRelativeTime(lastScan === "Never" ? null : lastScan)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 xl:gap-3">
            {/* Scan history dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 hidden sm:inline-flex" aria-label={`Scan history (${scanHistory.length})`}>
                  <History className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden 2xl:inline">History</span>
                  <span>({scanHistory.length})</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Recent Scans</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!Array.isArray(scanHistory) || scanHistory.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No scans yet
                  </div>
                ) : (
                  scanHistory.slice(0, 5).map((scan) => (
                    <DropdownMenuItem key={scan.id} className="flex flex-col items-start">
                      <div className="text-xs text-muted-foreground">
                        {scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'Unknown'}
                      </div>
                      <div className="text-sm font-medium">
                        {(scan.stats && typeof scan.stats.total === 'number') ? `${scan.stats.total} issues found` : 'No data'}
                      </div>
                      <div className="text-xs">
                        {scan.stats && scan.stats.critical > 0 && (
                          <span className="text-destructive mr-2">
                            {scan.stats.critical} critical
                          </span>
                        )}
                        {scan.stats && scan.stats.high > 0 && (
                          <span className="text-orange-500 mr-2">
                            {scan.stats.high} high
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Run Scan button - only show on dashboard overview page */}
            {location.pathname === `/dashboard/${repoId}` && (
            <Button 
              variant="hero" 
              size="sm" 
              className="gap-2" 
              onClick={handleRunScan}
              disabled={isScanning || isAnalysisRunning}
            >
              {isScanning || isAnalysisRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">
                    {activeAnalysis?.status === 'prefetching'
                      ? 'Loading...'
                      : `Analyzing... ${activeAnalysis?.elapsedSeconds || 0}s`}
                  </span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Run Scan</span>
                </>
              )}
            </Button>
            )}

            {/* Role toggle removed: app is owner-only */}

            {repoId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setChatOpen(true)}
                // Start the download on intent, ahead of the click.
                onPointerEnter={() => void loadChatbot()}
                onFocus={() => void loadChatbot()}
                aria-haspopup="dialog"
                aria-label="Ask about this repo"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline 2xl:hidden">Ask</span>
                <span className="hidden 2xl:inline">Ask about this repo</span>
              </Button>
            )}

            <NotificationBell />
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <AccountDropdown />
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 md:p-6">{children}</div>
      </main>

      {repoId && chatMounted && (
        <Suspense fallback={null}>
          <Chatbot
            repoId={repoId}
            repoName={repoName === "Loading..." ? "this repository" : repoName}
            open={chatOpen}
            onOpenChange={setChatOpen}
          />
        </Suspense>
      )}
    </div>
  );
}
