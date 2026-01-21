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
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState, useEffect } from "react";
import apiClient from "@/lib/api";
import { cn } from "@/lib/utils";
import { runScan, scanStorage, ScanResult } from "@/services/scanService";
// role is owner-only now; no role hook needed here
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface DashboardLayoutProps {
  children: ReactNode;
  repoName?: string;
  branch?: string;
  lastScan?: string;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { id: repoId } = useParams<{ id: string }>();

  // Generate sidebar links dynamically based on repoId
  const sidebarLinks = repoId ? [
    { href: `/dashboard/${repoId}`, icon: LayoutDashboard, label: "Overview" },
    { href: `/dashboard/${repoId}/issues`, icon: AlertTriangle, label: "Issues" },
    { href: `/dashboard/${repoId}/files`, icon: FileCode, label: "Files" },
    { href: `/dashboard/${repoId}/docs`, icon: FileText, label: "Documentation" },
    { href: `/dashboard/${repoId}/settings`, icon: Settings, label: "Settings" },
  ] : [];

  const [repoName, setRepoName] = useState<string>("Dashboard");
  const [branch, setBranch] = useState<string>("main");
  const [lastScan, setLastScan] = useState<string>("Never");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const location = useLocation();

  useEffect(() => {
    // Load repository + analysis history from backend
    let mounted = true;

    async function load() {
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

        console.log('[DashboardLayout] Loading repo:', repoId);
        const repo = await apiClient.getRepository(repoId as string);
        if (!mounted) return;
        setRepoName(repo?.name || repo?.full_name || "Repository");
        setBranch(repo?.default_branch || "main");

        const history = await apiClient.getAnalysisHistory(repoId as string);
        if (!mounted) return;
        
        console.log('[DashboardLayout] History response:', history);
        
        // Ensure scanHistory is always an array - handle both array response and object with 'history' field
        let historyArray: any[] = [];
        if (Array.isArray(history)) {
          historyArray = history;
        } else if (history && Array.isArray(history.history)) {
          historyArray = history.history;
        }
        
        // Normalize history items into a consistent shape for the UI
        const scanItems = historyArray.map((item: any) => ({
          id: item.id,
          // Prefer completed_at, fall back to created_at/started_at
          timestamp: item.completed_at || item.created_at || item.started_at || null,
          stats: {
            total: item.total_issues ?? item.total ?? 0,
            critical: item.critical_issues ?? 0,
            high: item.high_issues ?? 0,
            medium: item.medium_issues ?? 0,
            low: item.low_issues ?? 0,
          }
        }));

        setScanHistory(scanItems);
        console.log('[DashboardLayout] Set scan history with', scanItems.length, 'items');

        // compute last scan from most recent completed analysis or repository.last_analyzed
        const latest = scanItems[0];
        if (latest?.timestamp) {
          setLastScan(new Date(latest.timestamp).toLocaleString());
        } else if (repo?.last_analyzed) {
          setLastScan(new Date(repo.last_analyzed).toLocaleString());
        } else {
          setLastScan("Never");
        }
      } catch (err) {
        console.error("Failed loading repo/history", err);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [repoId]);

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      await apiClient.startAnalysis(repoId as string);
      // Refresh history after starting scan
      const history = await apiClient.getAnalysisHistory(repoId as string);
      setScanHistory(history || []);
      const latest = (history || [])[0];
      if (latest?.completed_at) {
        setLastScan(new Date(latest.completed_at).toLocaleString());
      }
      window.dispatchEvent(new CustomEvent("scanCompleted", { detail: { repository_id: repoId } }));
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setIsScanning(false);
    }
  };

  // role toggle removed for owner-only app

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 64 : 240 }}
        className="fixed top-0 left-0 h-full bg-card border-r border-border z-40 flex flex-col"
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 min-w-[32px] rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
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
                {!sidebarCollapsed && (
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
                sidebarCollapsed && "justify-center"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              {!sidebarCollapsed && <span>All Repos</span>}
            </Button>
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute top-20 -right-3 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
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
          "flex-1 transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-60"
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 glass-panel border-b h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link to="/repos" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Repos
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{repoName}</h1>
              <span className="flex items-center gap-1 text-sm text-muted-foreground px-2 py-1 bg-muted rounded-md">
                <GitBranch className="h-3 w-3" />
                {branch}
              </span>
            </div>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last scan: {lastScan}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Scan history dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <History className="h-4 w-4" />
                  History ({scanHistory.length})
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

            {/* Run Scan button */}
            <Button 
              variant="hero" 
              size="sm" 
              className="gap-2" 
              onClick={handleRunScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isScanning ? "Scanning..." : "Run Scan"}
            </Button>

            {/* Role toggle removed: app is owner-only */}

            <ThemeToggle />
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan-400" />
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
