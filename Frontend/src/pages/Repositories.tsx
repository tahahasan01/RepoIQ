import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRepositoryStore } from "@/stores/repositoryStore";
import { useUIStore } from "@/stores/uiStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useNotificationStore, startBackgroundAnalysisPolling } from "@/stores/notificationStore";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { formatRelativeTime } from "@/lib/timeUtils";
import {
  Search,
  Star,
  GitFork,
  Calendar,
  Filter,
  Zap,
  ChevronRight,
  ChevronLeft,
  FlaskConical,
  RefreshCw,
  History,
  X,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import AnalysisHistoryModal from "@/components/AnalysisHistoryModal";
import NotificationBell from "@/components/NotificationBell";

// Language colors for repository cards (used with real GitHub data)
const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-500",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Dart: "bg-sky-400",
  Java: "bg-red-500",
  Ruby: "bg-pink-500",
  PHP: "bg-purple-500",
  "C++": "bg-indigo-500",
  C: "bg-gray-500",
  Swift: "bg-orange-400",
  Kotlin: "bg-violet-500",
};

// Cache management is now handled by the repository store

export default function Repositories() {
  const auth = useAuth();
  const navigate = useNavigate();
  
  // Repository store
  const {
    repositories: repos,
    currentPage,
    isLoading,
    isSyncing,
    hasMorePages,
    loadRepositories,
    syncRepositories,
    setCurrentPage,
  } = useRepositoryStore();
  
  // UI store
  const {
    searchQuery,
    setSearchQuery,
    showHistoryModal,
    setShowHistoryModal,
    selectedRepo,
    setSelectedRepo,
    analyzingRepos,
    setAnalyzingRepo,
    selectedLanguages,
    setSelectedLanguages,
    analysisStatus,
    setAnalysisStatus,
    lastScanFilter,
    setLastScanFilter,
    showFilters,
    setShowFilters,
    clearFilters,
  } = useUIStore();
  
  // Analysis store
  const { startAnalysis } = useAnalysisStore();
  
  // Notification store for background analysis
  const { 
    startBackgroundAnalysis, 
    addNotification, 
    cancelBackgroundAnalysis,
    backgroundAnalyses 
  } = useNotificationStore();
  
  // Start background polling on mount
  useEffect(() => {
    startBackgroundAnalysisPolling();
  }, []);
  
  // Debounced search - filters repos client-side after 300ms delay
  const [searchInput, setSearchInput, debouncedSearch] = useDebouncedSearch(
    searchQuery,
    300
  );
  
  // Update UI store when debounced search changes
  useEffect(() => {
    if (debouncedSearch !== searchQuery) {
      setSearchQuery(debouncedSearch);
    }
  }, [debouncedSearch, searchQuery, setSearchQuery]);

  // Sync analyzing states with background analyses on mount
  useEffect(() => {
    // Sync UI state with actual background analyses
    const { analyzingRepos } = useUIStore.getState();
    const bgAnalyses = useNotificationStore.getState().backgroundAnalyses;
    
    // Clear analyzing states that don't have a matching background analysis
    analyzingRepos.forEach((repoId) => {
      const bgAnalysis = bgAnalyses.get(repoId);
      if (!bgAnalysis || bgAnalysis.status === 'completed' || bgAnalysis.status === 'failed') {
        console.log('[Repositories] Clearing stale analyzing state for:', repoId);
        setAnalyzingRepo(repoId, false);
      }
    });
    
    // Set analyzing state for any in-progress background analyses
    bgAnalyses.forEach((analysis, repoId) => {
      if (analysis.status === 'in_progress' || analysis.status === 'prefetching') {
        setAnalyzingRepo(repoId, true);
      }
    });
  }, []); // Only on mount

  // Load repositories when page changes
  useEffect(() => {
    loadRepositories(currentPage);
  }, [currentPage, loadRepositories]);
  
  // Listen for analysis completion events
  useEffect(() => {
    const onAnalysisCompleted = (event: Event) => {
      // Clear analyzing state for the completed repo
      const customEvent = event as CustomEvent;
      const repoId = customEvent?.detail?.repoId;
      if (repoId) {
        console.log('[Repositories] Analysis completed for repo:', repoId);
        setAnalyzingRepo(String(repoId), false);
      }
      
      // Clear cache and reload current page
      useRepositoryStore.getState().clearCache();
      loadRepositories(currentPage, true);
    };
    
    window.addEventListener('analysisCompleted', onAnalysisCompleted);
    return () => {
      window.removeEventListener('analysisCompleted', onAnalysisCompleted);
    };
  }, [currentPage, loadRepositories, setAnalyzingRepo]);

  // Batch analysis is handled by the repository store automatically
  // when repositories are loaded

  // Get unique languages from repos
  const availableLanguages = Array.from(new Set(repos.map(r => r.language).filter(Boolean))) as string[];
  
  // Filter repos based on search and filters
  const filteredRepos = repos.filter((repo) => {
    // Search filter
    const matchesSearch = !debouncedSearch || 
      repo.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (repo.description || '').toLowerCase().includes(debouncedSearch.toLowerCase());
    
    // Language filter
    const matchesLanguage = selectedLanguages.length === 0 || 
      (repo.language && selectedLanguages.includes(repo.language));
    
    // Analysis status filter
    let matchesAnalysisStatus = true;
    if (analysisStatus !== 'all') {
      const hasScore = repo.score !== null && repo.score !== undefined;
      const hasScan = repo.lastScan !== null && repo.lastScan !== undefined;
      
      switch (analysisStatus) {
        case 'analyzed':
          matchesAnalysisStatus = hasScore || hasScan;
          break;
        case 'not_analyzed':
          matchesAnalysisStatus = !hasScore && !hasScan;
          break;
        case 'has_issues':
          matchesAnalysisStatus = hasScore && repo.score !== null && repo.score < 70;
          break;
        case 'no_issues':
          matchesAnalysisStatus = hasScore && repo.score !== null && repo.score >= 70;
          break;
      }
    }
    
    // Last scan filter
    let matchesLastScan = true;
    if (lastScanFilter !== 'all' && repo.lastScan) {
      const scanDate = new Date(repo.lastScan);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - scanDate.getTime()) / (1000 * 60 * 60 * 24));
      
      switch (lastScanFilter) {
        case 'today':
          matchesLastScan = daysDiff === 0;
          break;
        case 'week':
          matchesLastScan = daysDiff <= 7;
          break;
        case 'month':
          matchesLastScan = daysDiff <= 30;
          break;
        case 'older':
          matchesLastScan = daysDiff > 30;
          break;
      }
    } else if (lastScanFilter !== 'all' && !repo.lastScan) {
      matchesLastScan = lastScanFilter === 'older';
    }
    
    return matchesSearch && matchesLanguage && matchesAnalysisStatus && matchesLastScan;
  });
  
  // Count active filters
  const activeFilterCount = 
    (selectedLanguages.length > 0 ? 1 : 0) +
    (analysisStatus !== 'all' ? 1 : 0) +
    (lastScanFilter !== 'all' ? 1 : 0);
  
  // Pagination handlers
  const handleNextPage = () => {
    if (hasMorePages) {
      setCurrentPage(currentPage + 1);
      setSearchQuery(""); // Clear search when changing pages
      setSearchInput(""); // Clear input too
    }
  };
  
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      setSearchQuery(""); // Clear search when changing pages
      setSearchInput(""); // Clear input too
    }
  };
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSearchQuery(""); // Clear search when changing pages
    setSearchInput(""); // Clear input too
  };
  
  const handleAnalyze = async (repoId: string | number) => {
    const repoIdStr = String(repoId);
    const repo = repos.find(r => String(r.id) === repoIdStr);
    const repoName = repo?.name || repo?.full_name || 'Repository';
    
    try {
      console.log('[Repositories] Starting analysis for repo:', repoId);
      
      // Set loading state
      setAnalyzingRepo(repoIdStr, true);
      
      const result = await startAnalysis(repoIdStr);
      
      if (result && result.analysis_id) {
        console.log('[Repositories] Analysis started successfully:', result);
        
        // Start background tracking - this will poll and auto-navigate when complete
        startBackgroundAnalysis(repoIdStr, repoName, result.analysis_id);
        
        // DON'T navigate - stay on page, let background polling handle completion
        // The notificationStore will auto-navigate to dashboard when analysis completes
        // and all data is prefetched
        
      } else {
        setAnalyzingRepo(repoIdStr, false);
        throw new Error('Failed to start analysis - no analysis ID returned');
      }
    } catch (err: any) {
      setAnalyzingRepo(repoIdStr, false);
      
      console.error('[Repositories] Failed to start analysis:', err);
      
      const errorMessage = err?.message || 'Unknown error occurred';
      let errorDetail: string;
      
      if ((err as any).isCorsError || errorMessage.includes('CORS')) {
        errorDetail = 'CORS Error. Please restart the backend server.';
      } else if ((err as any).isNetworkError || errorMessage.includes('Network Error')) {
        errorDetail = 'Network Error. Please check if the backend is running.';
      } else if (errorMessage.includes('404')) {
        errorDetail = 'Repository not found. Please sync your repositories.';
      } else if (errorMessage.includes('500')) {
        errorDetail = 'Server error. Check backend logs for details.';
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorDetail = 'Authentication error. Please log in again.';
      } else {
        errorDetail = errorMessage;
      }
      
      addNotification({
        type: 'error',
        title: 'Analysis Failed',
        message: errorDetail,
        repoId: repoIdStr,
        repoName: repoName,
      });
    }
  };
  
  // Handle cancel analysis
  const handleCancelAnalysis = async (repoId: string | number) => {
    const repoIdStr = String(repoId);
    setAnalyzingRepo(repoIdStr, false);
    await cancelBackgroundAnalysis(repoIdStr);
  };
  
  const handleRefresh = async () => {
    await syncRepositories();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">
              Repo<span className="gradient-text">IQ</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle />
            <AccountDropdown />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Your Repositories</h1>
          <p className="text-muted-foreground">
            Select a repository to analyze or view previous scan results.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate("/explore/data-science")}
            >
              <FlaskConical className="h-4 w-4 text-primary" />
              Explore Top Data Science Profiles
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        {/* Search and filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-4 mb-8"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <DropdownMenu open={showFilters} onOpenChange={setShowFilters}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 relative">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Filter Repositories</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Language Filter */}
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                  Language
                </DropdownMenuLabel>
                <div className="max-h-48 overflow-y-auto">
                  {availableLanguages.length > 0 ? (
                    availableLanguages.map((lang) => (
                      <DropdownMenuCheckboxItem
                        key={lang}
                        checked={selectedLanguages.includes(lang)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLanguages([...selectedLanguages, lang]);
                          } else {
                            setSelectedLanguages(selectedLanguages.filter(l => l !== lang));
                          }
                        }}
                      >
                        {lang}
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No languages available</div>
                  )}
                </div>
                
                <DropdownMenuSeparator />
                
                {/* Analysis Status Filter */}
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                  Analysis Status
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={analysisStatus} onValueChange={(value) => setAnalysisStatus(value as any)}>
                  <DropdownMenuRadioItem value="all">All Repositories</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="analyzed">Analyzed</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="not_analyzed">Not Analyzed</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="has_issues">Has Issues</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="no_issues">No Issues</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                
                <DropdownMenuSeparator />
                
                {/* Last Scan Filter */}
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                  Last Scan
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={lastScanFilter} onValueChange={(value) => setLastScanFilter(value as any)}>
                  <DropdownMenuRadioItem value="all">All Time</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="today">Today</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="week">Last 7 Days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="month">Last 30 Days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="older">Older</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters} className="text-destructive">
                      <X className="h-4 w-4 mr-2" />
                      Clear All Filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </Button>
          </div>
        </motion.div>

        {/* Repository grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground mb-4">No repositories found. Click Refresh to sync from GitHub.</p>
            <Button onClick={handleRefresh} disabled={isSyncing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Repositories'}
            </Button>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRepos.map((repo, index) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="glass-panel rounded-xl p-6 hover:shadow-lg transition-all duration-300 group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      languageColors[repo.language] || "bg-gray-500"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {repo.language}
                  </span>
                </div>
                {repo.isPrivate && (
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    Private
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {repo.name || repo.full_name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {repo.description || 'No description'}
              </p>

              {/* Stats */}
              <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {repo.stars || repo.stargazers_count || 0}
                </div>
                <div className="flex items-center gap-1">
                  <GitFork className="h-4 w-4" />
                  {repo.forks || repo.forks_count || 0}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {repo.updatedAt || (repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'N/A')}
                </div>
              </div>

              {/* Score or Scan status */}
              {repo.score !== null ? (
                <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground">Last Score</span>
                    <div className="text-2xl font-bold gradient-text">{repo.score}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Scanned</span>
                    <div className="text-sm">{formatRelativeTime(repo.lastScan)}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">Not analyzed yet</span>
                </div>
              )}

              {/* Action */}
              <div className="flex gap-2">
                {(() => {
                  const bgAnalysis = backgroundAnalyses.get(String(repo.id));
                  const isAnalyzing = analyzingRepos.has(repo.id) || bgAnalysis?.status === 'in_progress' || bgAnalysis?.status === 'prefetching';
                  
                  if (isAnalyzing) {
                    const elapsed = bgAnalysis?.elapsedSeconds || 0;
                    const statusText = bgAnalysis?.status === 'prefetching' 
                      ? 'Loading dashboard...' 
                      : `Analyzing... ${elapsed}s`;
                    
                    return (
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm font-medium text-primary">{statusText}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelAnalysis(repo.id);
                          }}
                          title="Cancel analysis"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <Button
                        variant="hero"
                        className="flex-1 gap-2 group"
                        onClick={() => handleAnalyze(repo.id)}
                      >
                        Analyze Now
                        <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-w-[96px]"
                        onClick={() => {
                          setSelectedRepo({ id: repo.id, name: repo.name || repo.full_name || '' });
                          setShowHistoryModal(true);
                        }}
                      >
                        <History className="h-4 w-4 mr-2" />
                        History
                      </Button>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* Pagination Controls */}
        {!isLoading && filteredRepos.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-8 pb-8">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage}
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasMorePages}
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        </>
        )}
      </main>

      {/* Analysis History Modal */}
      {selectedRepo && (
        <AnalysisHistoryModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedRepo(null);
          }}
          repoId={selectedRepo.id}
          repoName={selectedRepo.name}
        />
      )}
    </div>
  );
}
