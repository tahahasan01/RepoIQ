import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Search,
  Star,
  GitFork,
  Calendar,
  Filter,
  Zap,
  ChevronRight,
  RefreshCw,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";

// Mock repositories data
const mockRepos = [
  {
    id: 1,
    name: "Dashboard",
    language: "TypeScript",
    stars: 1234,
    forks: 234,
    updatedAt: "2 hours ago",
    description: "A modern dashboard with charts and analytics",
    isPrivate: false,
    lastScan: "Yesterday",
    score: 87,
  },
  {
    id: 2,
    name: "api-gateway",
    language: "Go",
    stars: 892,
    forks: 156,
    updatedAt: "5 hours ago",
    description: "High-performance API gateway with rate limiting",
    isPrivate: true,
    lastScan: null,
    score: null,
  },
  {
    id: 3,
    name: "ml-pipeline",
    language: "Python",
    stars: 456,
    forks: 89,
    updatedAt: "1 day ago",
    description: "Machine learning data processing pipeline",
    isPrivate: false,
    lastScan: "3 days ago",
    score: 72,
  },
  {
    id: 4,
    name: "mobile-app",
    language: "Dart",
    stars: 321,
    forks: 45,
    updatedAt: "3 days ago",
    description: "Cross-platform mobile application",
    isPrivate: true,
    lastScan: null,
    score: null,
  },
  {
    id: 5,
    name: "design-system",
    language: "TypeScript",
    stars: 567,
    forks: 78,
    updatedAt: "1 week ago",
    description: "Company-wide design system and component library",
    isPrivate: false,
    lastScan: "1 week ago",
    score: 94,
  },
  {
    id: 6,
    name: "auth-service",
    language: "Rust",
    stars: 234,
    forks: 34,
    updatedAt: "2 weeks ago",
    description: "Authentication and authorization microservice",
    isPrivate: true,
    lastScan: "2 weeks ago",
    score: 81,
  },
];

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-500",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Dart: "bg-sky-400",
};

// Cache repositories in sessionStorage
const REPOS_CACHE_KEY = 'repoiq_repositories_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function isUuidLike(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

function getCachedRepos(): any[] | null {
  try {
    const cached = sessionStorage.getItem(REPOS_CACHE_KEY);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    
    if (age > CACHE_DURATION) {
      sessionStorage.removeItem(REPOS_CACHE_KEY);
      return null;
    }

    // If cache contains old numeric ids (GitHub ids), invalidate.
    // The backend expects repository UUIDs for /analysis/* routes.
    if (Array.isArray(data) && data.length > 0) {
      const bad = data.some((r: any) => !isUuidLike(String(r?.id)));
      if (bad) {
        console.warn('[Repositories] Invalidating cache: non-UUID repo ids detected');
        sessionStorage.removeItem(REPOS_CACHE_KEY);
        return null;
      }
    }
    
    console.log(`[Repositories] Using cached repos (${Math.round(age / 1000)}s old)`);
    return data;
  } catch {
    return null;
  }
}

function setCachedRepos(repos: any[]) {
  try {
    sessionStorage.setItem(REPOS_CACHE_KEY, JSON.stringify({
      data: repos,
      timestamp: Date.now()
    }));
  } catch (err) {
    console.error('[Repositories] Failed to cache repos', err);
  }
}

export default function Repositories() {
  const [searchQuery, setSearchQuery] = useState("");
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    let mounted = true;
    async function loadRepos() {
      // Check cache first
      const cached = getCachedRepos();
      if (cached && cached.length > 0) {
        setRepos(cached);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const data = await apiClient.getRepositories(1, 100);
        console.log('[Repositories] API returned:', data);
        if (!mounted) return;
        
        let reposList: any[] = [];
        if (Array.isArray(data)) {
          console.log(`[Repositories] Loaded ${data.length} repositories`);
          if (data.length > 0) {
            console.log('[Repositories] First repo ID:', data[0].id, 'Type:', typeof data[0].id);
          }
          reposList = data;
        } else if (data && data.repositories) {
          console.log(`[Repositories] Loaded ${data.repositories.length} repositories from nested object`);
          reposList = data.repositories;
        } else {
          console.warn('[Repositories] Unexpected API response format:', data);
          reposList = [];
        }
        
        setRepos(reposList);
        setCachedRepos(reposList);
      } catch (err) {
        console.error("[Repositories] Failed to load repos", err);
        if (mounted) setRepos([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadRepos();
    // reload repos when an analysis completes elsewhere
    const onAnalysisCompleted = (e: Event) => {
      try {
        // Clear cache and reload list
        sessionStorage.removeItem(REPOS_CACHE_KEY);
        loadRepos();
      } catch (err) {
        console.error('[Repositories] failed to reload after analysisCompleted', err);
      }
    };
    window.addEventListener('analysisCompleted', onAnalysisCompleted as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('analysisCompleted', onAnalysisCompleted as EventListener);
    };
  }, []);

  // When repos load, fetch latest analysis for each repo and attach score/lastScan
  useEffect(() => {
    let mounted = true;
    let attempted = false;

    async function attachAnalyses() {
      if (!repos || repos.length === 0 || attempted) return;
      attempted = true;

      console.log(`[Repositories] Fetching analysis for ${repos.length} repos`);

      // Fetch each repo's analysis individually with timeout, update UI as results come in
      repos.forEach(async (r) => {
        setLoadingMap((m) => ({ ...m, [String(r.id)]: true }));
        
        try {
          // Add 3 second timeout per request
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          );
          
          const res = await Promise.race([
            apiClient.getAnalysisResults(String(r.id)),
            timeoutPromise
          ]) as any;
          
          if (!mounted) return;
          
          if (res && res.status === 'completed' && res.overall_score != null) {
            console.log(`[Repositories] Got score ${res.overall_score} for repo ${r.name} (${r.id})`);
            // Update this specific repo immediately
            setRepos((prev) =>
              prev.map((p) =>
                String(p.id) === String(r.id)
                  ? { ...p, score: res.overall_score, lastScan: res.completed_at }
                  : p
              )
            );
          } else if (res && res.status === 'in_progress') {
            console.log(`[Repositories] Analysis in progress for repo ${r.name}`);
          } else if (res && res.status === 'failed') {
            console.log(`[Repositories] Analysis failed for repo ${r.name}:`, res.error_message);
          } else {
            console.log(`[Repositories] No completed analysis for repo ${r.name}, status:`, res?.status);
          }
        } catch (e: any) {
          if (e?.message !== 'Timeout') {
            console.log(`[Repositories] No analysis for repo ${r.name} (${r.id})`);
          } else {
            console.log(`[Repositories] Timeout fetching analysis for repo ${r.name}`);
          }
        } finally {
          if (mounted) {
            setLoadingMap((m) => {
              const updated = { ...m };
              delete updated[String(r.id)];
              return updated;
            });
          }
        }
      });
    }

    attachAnalyses();

    return () => {
      mounted = false;
    };
  }, [repos.length]);

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAnalyze = async (repoId: string | number) => {
    try {
      console.log('[Repositories] Starting analysis for repo:', repoId);
      
      // Navigate to loading page IMMEDIATELY (don't wait for API)
      navigate(`/analyzing/${repoId}`);
      
      // Start analysis in background
      const response = await apiClient.startAnalysis(String(repoId));
      console.log('[Repositories] Analysis started:', response);
    } catch (err) {
      console.error('[Repositories] Failed to start analysis:', err);
      // Stay on analyzing page even if start fails - polling will handle it
    }
  };

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      await apiClient.syncRepositories();
      const data = await apiClient.getRepositories(1, 100);
      console.log('[Repositories] Sync returned:', data);
      if (Array.isArray(data)) {
        setRepos(data);
      } else if (data && data.repositories) {
        setRepos(data.repositories);
      } else {
        setRepos([]);
      }
    } catch (err) {
      console.error("[Repositories] Failed to sync repos", err);
    } finally {
      setIsSyncing(false);
    }
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
            <div className="flex items-center gap-2">
              {auth.user?.avatar_url ? (
                <img 
                  src={auth.user.avatar_url} 
                  alt={auth.user.name || auth.user.full_name || auth.user.github_username || "User"}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center text-xs font-bold">
                  {(auth.user?.name || auth.user?.full_name || auth.user?.github_username || "U").slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">{auth.user?.name || auth.user?.full_name || auth.user?.github_username || "Account"}</span>
            </div>
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
              {loadingMap[String(repo.id)] ? (
                <div className="flex items-center gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                  <span className="text-sm text-muted-foreground">Checking latest analysis...</span>
                </div>
              ) : repo.score !== null ? (
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
                  variant={repo.score ? "outline" : "hero"}
                  className="flex-1 gap-2 group"
                  onClick={() => {
                    if (typeof repo.score === 'number' && repo.score !== null) {
                      console.log('[Repositories] Viewing analysis for repo:', repo.name, 'ID:', repo.id, 'Score:', repo.score);
                      navigate(`/dashboard/${repo.id}`);
                    } else {
                      console.log('[Repositories] Analyzing repo:', repo.name, 'ID:', repo.id);
                      handleAnalyze(repo.id);
                    }
                  }}
                >
                  {typeof repo.score === 'number' && repo.score !== null ? "View Analysis" : "Analyze Now"}
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-[96px]"
                  onClick={() => {
                    console.log('[Repositories] Navigating to dashboard:', repo.id);
                    navigate(`/dashboard/${repo.id}`);
                  }}
                >
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
        )}
      </main>
    </div>
  );
}
