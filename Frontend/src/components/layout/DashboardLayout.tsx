import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState, useEffect } from "react";
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

const sidebarLinks = [
  { href: "/dashboard/1", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/1/issues", icon: AlertTriangle, label: "Issues" },
  { href: "/dashboard/1/files", icon: FileCode, label: "Files" },
  { href: "/dashboard/1/docs", icon: FileText, label: "Documentation" },
  { href: "/dashboard/1/settings", icon: Settings, label: "Settings" },
];

export function DashboardLayout({
  children,
  repoName = "Dashboard",
  branch = "main",
  lastScan = "2 hours ago",
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const location = useLocation();

  useEffect(() => {
    // Load scan history
    setScanHistory(scanStorage.getScans());
  }, []);

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      const result = await runScan(repoName, branch);
      setScanHistory([result, ...scanHistory]);
      // Trigger a custom event to notify Issues page
      window.dispatchEvent(new CustomEvent("scanCompleted", { detail: result }));
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
                {scanHistory.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No scans yet
                  </div>
                ) : (
                  scanHistory.slice(0, 5).map((scan) => (
                    <DropdownMenuItem key={scan.id} className="flex flex-col items-start">
                      <div className="text-xs text-muted-foreground">
                        {new Date(scan.timestamp).toLocaleString()}
                      </div>
                      <div className="text-sm font-medium">
                        {scan.stats.total} issues found
                      </div>
                      <div className="text-xs">
                        {scan.stats.critical > 0 && (
                          <span className="text-destructive mr-2">
                            {scan.stats.critical} critical
                          </span>
                        )}
                        {scan.stats.high > 0 && (
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
