import { motion } from "framer-motion";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRepositoryStore } from "@/stores/repositoryStore";
import { useUIStore } from "@/stores/uiStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import {
  Search,
  Star,
  GitFork,
  Calendar,
  Filter,
  Zap,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import AnalysisHistoryModal from "@/components/AnalysisHistoryModal";

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
  const navigate = useNavigate();
  const auth = useAuth();
  
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
  } = useUIStore();
  
  // Analysis store
  const { startAnalysis } = useAnalysisStore();
  
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

  // Load repositories when page changes
  useEffect(() => {
    loadRepositories(currentPage);
  }, [currentPage, loadRepositories]);
  
  // Listen for analysis completion events
  useEffect(() => {
    const onAnalysisCompleted = () => {
      // Clear cache and reload current page
      useRepositoryStore.getState().clearCache();
      loadRepositories(currentPage, true);
    };
    
    window.addEventListener('analysisCompleted', onAnalysisCompleted);
    return () => {
      window.removeEventListener('analysisCompleted', onAnalysisCompleted);
    };
  }, [currentPage, loadRepositories]);

  // Batch analysis is handled by the repository store automatically
  // when repositories are loaded

  // Filter repos for search (searches within current page) - client-side filtering
  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (repo.description || '').toLowerCase().includes(debouncedSearch.toLowerCase())
  );
  
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
    
    try {
      console.log('[Repositories] Starting analysis for repo:', repoId);
      
      // Set loading state
      setAnalyzingRepo(repoIdStr, true);
      
      const result = await startAnalysis(repoIdStr);
      
      if (result && result.analysis_id) {
        console.log('[Repositories] ✅ Analysis started successfully:', result);
        
        // Keep loading state ON - it will be cleared when navigating away
        navigate(`/analyzing/${repoId}`, { 
          state: { analysisId: result.analysis_id } 
        });
      } else {
        // Clear loading state on error
        setAnalyzingRepo(repoIdStr, false);
        throw new Error('Failed to start analysis - no analysis ID returned');
      }
    } catch (err: any) {
      // Clear loading state
      setAnalyzingRepo(repoIdStr, false);
      
      console.error('[Repositories] ❌ Failed to start analysis:', err);
      
      const errorMessage = err?.message || 'Unknown error occurred';
      let errorDetail: string;
      
      // Check for CORS error first
      if ((err as any).isCorsError || errorMessage.includes('CORS Error') || errorMessage.includes('CORS')) {
        errorDetail = `CORS Error: ${errorMessage}\n\n` +
          'The backend is not allowing requests from this origin.\n\n' +
          'TO FIX THIS:\n' +
          '1. RESTART the backend server (Ctrl+C then run again)\n' +
          '2. The backend will log CORS configuration on startup\n' +
          '3. Verify it includes: ' + window.location.origin + '\n\n' +
          'If the problem persists, check backend .env file.';
      } 
      // Check for network error
      else if ((err as any).isNetworkError || errorMessage.includes('Network Error')) {
        errorDetail = `Network Error: ${errorMessage}\n\n` +
          'Unable to reach the backend server.\n' +
          'Please ensure:\n' +
          '1. Backend server is running on http://localhost:8000\n' +
          '2. No firewall is blocking the connection\n' +
          '3. Check browser console for more details';
      }
      // Check for HTTP status errors
      else if (errorMessage.includes('404')) {
        errorDetail = 'Repository not found. Please sync your repositories and try again.';
      } else if (errorMessage.includes('500')) {
        errorDetail = 'Server error. Please check if the backend is running and check backend logs for details.';
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorDetail = 'Authentication error. Please log in again.';
      } else if (errorMessage.includes('Failed to start')) {
        errorDetail = 'Analysis task failed to start. Check backend logs for details.';
      } else {
        errorDetail = errorMessage;
      }
      
      alert(`Failed to start analysis:\n\n${errorDetail}\n\nPlease check the console for more details.`);
    }
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
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
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
                    <div className="text-sm">{repo.lastScan}</div>
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
                <Button
                  variant="hero"
                  className="flex-1 gap-2 group"
                  onClick={() => {
                    console.log('[Repositories] Analyzing repo:', repo.name, 'ID:', repo.id);
                    handleAnalyze(repo.id);
                  }}
                  disabled={analyzingRepos.has(repo.id)}
                >
                  {analyzingRepos.has(repo.id) ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Starting Analysis...
                    </>
                  ) : (
                    <>
                      Analyze Now
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-[96px]"
                  onClick={() => {
                    console.log('[Repositories] Opening history for repo:', repo.name);
                    setSelectedRepo({ id: repo.id, name: repo.name || repo.full_name || '' });
                    setShowHistoryModal(true);
                  }}
                  disabled={analyzingRepos.has(repo.id)}
                >
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
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
