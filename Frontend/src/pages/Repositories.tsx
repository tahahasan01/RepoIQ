import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  History,
  X,
  Loader2,
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppHeader, MAIN_CONTENT_ID } from "@/components/layout/AppHeader";
import AnalysisHistoryModal from "@/components/AnalysisHistoryModal";
import type { Repository } from "@/stores/repositoryStore";
import { scoreColor, scoreLabel } from '@/lib/scoreColor';
import { isGitHubAccessError, isGitHubAccessKind } from '@/lib/apiErrors';
import GitHubAccessNotice from "@/components/GitHubAccessNotice";

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

type SortKey = "updated" | "analyzed" | "score";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Recently updated",
  analyzed: "Last analyzed",
  score: "Lowest score",
};

const time = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0);

/**
 * GET /github/repositories has no sort parameter and returns no total; it
 * orders by last GitHub activity. So the other orders sort the loaded page
 * client-side, with repositories that have no value last.
 */
function sortRepositories(repos: Repository[], key: SortKey): Repository[] {
  if (key === "updated") return repos;
  const sorted = [...repos];
  if (key === "analyzed") {
    sorted.sort((a, b) => time(b.lastScan) - time(a.lastScan));
  } else {
    sorted.sort((a, b) => {
      if (a.score == null) return b.score == null ? 0 : 1;
      if (b.score == null) return -1;
      return a.score - b.score;
    });
  }
  return sorted;
}

export default function Repositories() {
  // Repository store
  const {
    repositories: repos,
    currentPage,
    isLoading,
    isSyncing,
    error: repoError,
    errorKind: repoErrorKind,
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
  }, [setAnalyzingRepo]); // Only on mount: zustand actions never change identity

  // Load repositories when the page or the search changes. A search runs on
  // the server across every repository, starting from page 1.
  useEffect(() => {
    if (searchQuery && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    loadRepositories(currentPage, false, searchQuery);
  }, [currentPage, searchQuery, loadRepositories, setCurrentPage]);
  
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
      
      if (isGitHubAccessError(err)) {
        // The backend's own explanation ("GitHub is disconnected...", "GitHub
        // App is not installed...") is the actionable message. This used to be
        // reported as "Authentication error. Please log in again."
        errorDetail = `${err.message} You can reconnect GitHub in Settings.`;
      } else if ((err as any).isNetworkError) {
        errorDetail = errorMessage;
      } else if (errorMessage.includes('404')) {
        errorDetail = 'Repository not found. Please sync your repositories.';
      } else if (errorMessage.includes('500')) {
        errorDetail = 'Server error. Check backend logs for details.';
      } else if (err?.status === 401) {
        errorDetail = 'Your session has expired. Please log in again.';
      } else {
        errorDetail = errorMessage;
      }
      
      addNotification({
        type: 'error',
        title: 'Analysis failed',
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

  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const visibleRepos = sortRepositories(filteredRepos, sortKey);
  const paginated = currentPage > 1 || hasMorePages;
  const countLabel = `${visibleRepos.length} ${visibleRepos.length === 1 ? "repository" : "repositories"}${
    paginated ? ` on page ${currentPage}` : ""
  }`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="container mx-auto px-4 py-8 focus:outline-none">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Repositories</h1>
          <p className="text-muted-foreground">
            Analyze a repository, or open its dashboard to see findings from the last analysis.
          </p>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search repositories"
              placeholder="Search repositories"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <DropdownMenu open={showFilters} onOpenChange={setShowFilters}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 relative"
                  aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold"
                      aria-hidden="true"
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Filter repositories</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Language</DropdownMenuLabel>
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
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No languages on this page</div>
                  )}
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Analysis status</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={analysisStatus} onValueChange={(value) => setAnalysisStatus(value as any)}>
                  <DropdownMenuRadioItem value="all">All repositories</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="analyzed">Analyzed</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="not_analyzed">Not analyzed</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="has_issues">Score below 70</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="no_issues">Score 70 or above</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Last scan</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={lastScanFilter} onValueChange={(value) => setLastScanFilter(value as any)}>
                  <DropdownMenuRadioItem value="all">Any time</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="today">Today</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="week">Last 7 days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="month">Last 30 days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="older">Older</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters} className="text-destructive">
                      <X className="h-4 w-4 mr-2" aria-hidden="true" />
                      Clear all filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isSyncing ? 'Syncing…' : 'Sync from GitHub'}
            </Button>
          </div>
        </div>

        {/* GitHub access missing: say so and offer the fix, instead of an
            empty list (or, before, a forced logout). */}
        {!isLoading && isGitHubAccessKind(repoErrorKind) && (
          <GitHubAccessNotice kind={repoErrorKind} message={repoError} className="mb-6" />
        )}

        {/* Repository grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20" role="status">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading repositories</span>
          </div>
        ) : visibleRepos.length === 0 && isGitHubAccessKind(repoErrorKind) ? null : visibleRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground mb-4">
              {repoError
                || (searchQuery || activeFilterCount > 0
                  ? searchQuery
                    ? `No repositories match "${searchQuery}"${activeFilterCount > 0 ? " with these filters" : ""}.`
                    : "No repositories on this page match these filters."
                  : "No repositories yet. Sync to bring them in from GitHub.")}
            </p>
            {!repoError && (searchQuery || activeFilterCount > 0) ? (
              <Button
                variant="outline"
                onClick={() => {
                  clearFilters();
                  setSearchInput("");
                }}
              >
                Clear search and filters
              </Button>
            ) : (
              <Button onClick={handleRefresh} disabled={isSyncing} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {isSyncing ? 'Syncing…' : 'Sync from GitHub'}
              </Button>
            )}
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">{countLabel}</p>
          <div className="flex items-center gap-2">
            <Label htmlFor="repo-sort" className="text-sm text-muted-foreground font-normal">
              Sort by
            </Label>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger id="repo-sort" className="w-44 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleRepos.map((repo) => {
            const displayName = repo.name || repo.full_name || "Repository";
            const dashboardHref = `/dashboard/${repo.id}`;
            const analyzed = repo.score != null;
            const stars = repo.stars || repo.stargazers_count || 0;
            const forks = repo.forks || repo.forks_count || 0;
            const bgAnalysis = backgroundAnalyses.get(String(repo.id));
            const isAnalyzing =
              analyzingRepos.has(repo.id) || bgAnalysis?.status === 'in_progress' || bgAnalysis?.status === 'prefetching';

            return (
            // flex column + mt-auto on the actions: descriptions vary from one
            // line to three, so the buttons sat at different heights.
            <li key={repo.id} className="glass-panel rounded-xl p-6 flex flex-col h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-h-5">
                  {repo.language && (
                    <>
                      <div
                        className={`w-3 h-3 rounded-full ${languageColors[repo.language] || "bg-gray-500"}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-muted-foreground">{repo.language}</span>
                    </>
                  )}
                </div>
                {(repo.is_private || repo.isPrivate) && (
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Private</span>
                )}
              </div>

              <h2 className="text-lg font-semibold mb-2 break-words">
                {analyzed ? (
                  <Link
                    to={dashboardHref}
                    className="rounded-sm hover:text-primary hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {displayName}
                  </Link>
                ) : (
                  displayName
                )}
              </h2>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {repo.description || 'No description'}
              </p>

              {(stars > 0 || forks > 0 || repo.github_updated_at) && (
                <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                  {stars > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Stars:</span>
                      {stars}
                    </div>
                  )}
                  {forks > 0 && (
                    <div className="flex items-center gap-1">
                      <GitFork className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Forks:</span>
                      {forks}
                    </div>
                  )}
                  {repo.github_updated_at && (
                    <div
                      className="flex items-center gap-1"
                      title={`Last updated on GitHub ${new Date(repo.github_updated_at).toLocaleString()}`}
                    >
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Updated</span>
                      {new Date(repo.github_updated_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}

              {/* `!= null` catches both null and undefined: a never-analysed
                  repository used to render an empty score and "Scanned N/A". */}
              {analyzed ? (
                // Same destination as the name link, so keyboard and screen
                // reader users skip it; it is a larger target for the mouse.
                <Link
                  to={dashboardHref}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <span className="text-xs text-muted-foreground">Last score</span>
                    <div
                      className="text-2xl font-bold tabular-nums"
                      style={{ color: scoreColor(repo.score as number) }}
                      title={scoreLabel(repo.score as number)}
                    >
                      {repo.score}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Scanned</span>
                    <div className="text-sm">{formatRelativeTime(repo.lastScan)}</div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">Not analyzed yet</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-auto">
                {isAnalyzing ? (
                  <>
                    <div
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20"
                      role="status"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium text-primary truncate">
                        {bgAnalysis?.status === 'prefetching'
                          ? 'Loading results…'
                          : `Analyzing… ${bgAnalysis?.elapsedSeconds || 0}s`}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={dashboardHref}>View progress</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancelAnalysis(repo.id)}
                      aria-label={`Cancel analysis of ${displayName}`}
                      title="Cancel analysis"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : analyzed ? (
                  <>
                    <Button className="flex-1 gap-2" asChild>
                      <Link to={dashboardHref}>
                        Open dashboard
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button variant="ghost" onClick={() => handleAnalyze(repo.id)}>
                      Analyze again
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedRepo({ id: repo.id, name: displayName });
                        setShowHistoryModal(true);
                      }}
                      aria-label={`Analysis history for ${displayName}`}
                      title="Analysis history"
                    >
                      <History className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button className="flex-1 gap-2" onClick={() => handleAnalyze(repo.id)}>
                    Analyze
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
            );
          })}
        </ul>

        {/* The API returns no total, so pagination is Previous / Next. */}
        {paginated && (
          <nav aria-label="Pagination" className="flex items-center justify-center gap-4 mt-8 pb-8">
            <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1} className="gap-2">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {currentPage}</span>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!hasMorePages} className="gap-2">
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </nav>
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
