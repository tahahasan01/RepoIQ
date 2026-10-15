import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api';
import { getErrorKind, type ApiErrorKind } from '@/lib/apiErrors';

export interface Repository {
  id: string;
  name: string;
  full_name?: string;
  language?: string;
  stars?: number;
  stargazers_count?: number;
  forks?: number;
  forks_count?: number;
  updatedAt?: string;
  updated_at?: string;
  description?: string;
  isPrivate?: boolean;
  private?: boolean;
  is_private?: boolean;
  /** Last activity on GitHub; null until a sync records it. */
  github_updated_at?: string | null;
  score?: number | null;
  lastScan?: string | null;
}

interface RepositoryState {
  repositories: Repository[];
  currentPage: number;
  reposPerPage: number;
  hasMorePages: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  searchQuery: string;
  lastSyncTime: number | null;
  error: string | null;
  /**
   * What kind of failure `error` is. Lets the page offer "Connect GitHub" or
   * "Install the GitHub App" when the list fails because GitHub access is
   * missing, instead of showing an empty list.
   */
  errorKind: ApiErrorKind | null;
  /** The name search the current list was loaded with ('' for none). */
  activeSearch: string;

  // Actions
  setRepositories: (repos: Repository[]) => void;
  setCurrentPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setHasMorePages: (hasMore: boolean) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  /**
   * Load one page. `search` filters by name across ALL repositories on the
   * server; omitted, the last search is kept (so a sync or refresh reloads
   * the same results).
   */
  loadRepositories: (page?: number, forceRefresh?: boolean, search?: string) => Promise<void>;
  backgroundRefresh: (page: number) => Promise<void>;
  syncRepositories: () => Promise<void>;
  refreshRepositories: () => Promise<void>;
  updateRepository: (repoId: string, updates: Partial<Repository>) => void;
  updateBatchAnalysis: (analysisResults: Record<string, { overall_score?: number; completed_at?: string }>) => void;
  
  // Cache management
  clearCache: () => void;
}

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const REPOS_CACHE_KEY = 'repoiq_repositories_cache';
const BATCH_ANALYSIS_CACHE_KEY = 'repoiq_batch_analysis_cache';

// Each load takes a number; a response that arrives after a newer load
// started is dropped, so typing quickly cannot leave stale results on screen.
let loadSequence = 0;

function getCachedReposForPage(page: number): Repository[] | null {
  try {
    const cached = sessionStorage.getItem(`${REPOS_CACHE_KEY}_page_${page}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    if (age > CACHE_DURATION) {
      sessionStorage.removeItem(`${REPOS_CACHE_KEY}_page_${page}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedReposForPage(page: number, repos: Repository[]) {
  try {
    sessionStorage.setItem(`${REPOS_CACHE_KEY}_page_${page}`, JSON.stringify({
      data: repos,
      timestamp: Date.now()
    }));
  } catch (err) {
    console.error('[RepositoryStore] Failed to cache repos for page', err);
  }
}

function getCachedBatchAnalysis(): Record<string, any> | null {
  try {
    const cached = sessionStorage.getItem(BATCH_ANALYSIS_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    if (age > CACHE_DURATION) {
      sessionStorage.removeItem(BATCH_ANALYSIS_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedBatchAnalysis(data: Record<string, any>) {
  try {
    sessionStorage.setItem(BATCH_ANALYSIS_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (err) {
    console.error('[RepositoryStore] Failed to cache batch analysis', err);
  }
}

export const useRepositoryStore = create<RepositoryState>()(
  persist(
    (set, get) => ({
      repositories: [],
      currentPage: 1,
      reposPerPage: 6,
      hasMorePages: true,
      isLoading: false,
      isSyncing: false,
      searchQuery: '',
      lastSyncTime: null,
      error: null,
      errorKind: null,
      activeSearch: '',

      setRepositories:(repos) => set({ repositories: repos }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setLoading: (loading) => set({ isLoading: loading }),
      setSyncing: (syncing) => set({ isSyncing: syncing }),
      setHasMorePages: (hasMore) => set({ hasMorePages: hasMore }),
      setError: (error) => set({ error, errorKind: null }),

      loadRepositories: async (page?: number, forceRefresh = false, search?: string) => {
        const state = get();
        const targetPage = page ?? state.currentPage;
        const term = (search ?? state.activeSearch).trim();
        const requestId = ++loadSequence;

        // Check cache first (unless force refresh) - BEFORE setting loading state.
        // Only unsearched pages are cached.
        if (!forceRefresh && !term) {
          const cached = getCachedReposForPage(targetPage);
          const cachedAnalysis = getCachedBatchAnalysis();
          
          if (cached && cached.length > 0) {
            console.log(`[RepositoryStore] ⚡ INSTANT load from cache - page ${targetPage}`);
            
            // Apply cached analysis data immediately
            let reposWithAnalysis = cached;
            if (cachedAnalysis) {
              reposWithAnalysis = cached.map((repo) => {
                const analysis = cachedAnalysis[String(repo.id)];
                if (analysis && analysis.overall_score != null) {
                  return { ...repo, score: analysis.overall_score, lastScan: analysis.completed_at };
                }
                return repo;
              });
            }
            
            // Set repos IMMEDIATELY without loading state
            set({
              repositories: reposWithAnalysis,
              currentPage: targetPage,
              activeSearch: '',
              isLoading: false, // Explicitly set to false for instant display
              hasMorePages: cached.length === state.reposPerPage
            });
            
            // Only refresh if cache is stale (> 10 minutes old) - longer cache for instant feel
            try {
              const cacheEntry = sessionStorage.getItem(`${REPOS_CACHE_KEY}_page_${targetPage}`);
              if (cacheEntry) {
                const { timestamp } = JSON.parse(cacheEntry);
                const cacheAge = Date.now() - timestamp;
                if (cacheAge > 10 * 60 * 1000) {
                  // Background refresh after 1 second (non-blocking)
                  setTimeout(() => {
                    get().backgroundRefresh(targetPage);
                  }, 1000);
                }
              }
            } catch (e) {
              // Ignore cache parsing errors
            }
            return; // Exit early - repos already displayed
          }
        }

        // Only set loading if we don't have cache
        set({ isLoading: true, error: null, errorKind: null, activeSearch: term });

        try {
          // Fetch repos and batch analysis IN PARALLEL for speed
          const [data, batchResults] = await Promise.all([
            apiClient.getRepositories(targetPage, state.reposPerPage, term || undefined),
            apiClient.getBatchAnalysisResults().catch(() => null) // Don't fail if batch fails
          ]);
          if (requestId !== loadSequence) return; // superseded by a newer load
          
          let reposList: Repository[] = [];
          if (Array.isArray(data)) {
            reposList = data;
          } else if (data && (data as any).repositories) {
            reposList = (data as any).repositories;
          }

          // Apply analysis data to repos
          if (batchResults?.results) {
            setCachedBatchAnalysis(batchResults.results);
            reposList = reposList.map((repo) => {
              const analysis = batchResults.results[String(repo.id)];
              if (analysis && analysis.overall_score != null) {
                return { ...repo, score: analysis.overall_score, lastScan: analysis.completed_at };
              }
              return repo;
            });
          }

          if (!term) setCachedReposForPage(targetPage, reposList);

          set({
            repositories: reposList,
            currentPage: targetPage,
            isLoading: false,
            hasMorePages: reposList.length === state.reposPerPage,
            error: null,
            errorKind: null
          });
        } catch (err: any) {
          if (requestId !== loadSequence) return;
          console.error('[RepositoryStore] Failed to load repos', err);
          set({
            isLoading: false, 
            error: err?.message || 'Failed to load repositories',
            errorKind: getErrorKind(err),
            repositories: []
          });
        }
      },
      
      // Background refresh without showing loading state
      backgroundRefresh: async (page: number) => {
        try {
          const state = get();
          const [data, batchResults] = await Promise.all([
            apiClient.getRepositories(page, state.reposPerPage),
            apiClient.getBatchAnalysisResults().catch(() => null)
          ]);
          
          let reposList: Repository[] = [];
          if (Array.isArray(data)) {
            reposList = data;
          } else if (data && (data as any).repositories) {
            reposList = (data as any).repositories;
          }

          if (batchResults?.results) {
            setCachedBatchAnalysis(batchResults.results);
            reposList = reposList.map((repo) => {
              const analysis = batchResults.results[String(repo.id)];
              if (analysis && analysis.overall_score != null) {
                return { ...repo, score: analysis.overall_score, lastScan: analysis.completed_at };
              }
              return repo;
            });
          }

          // Only update if we're still on the same page
          if (get().currentPage === page) {
            setCachedReposForPage(page, reposList);
            set({ repositories: reposList, hasMorePages: reposList.length === state.reposPerPage });
          }
        } catch (err) {
          console.log('[RepositoryStore] Background refresh failed (non-critical):', err);
        }
      },

      syncRepositories: async () => {
        set({ isSyncing: true, error: null, errorKind: null });

        try {
          // Clear caches
          get().clearCache();

          await apiClient.syncRepositories();

          // Reload current page. Any error it records is kept: clearing it here
          // used to hide a failed reload behind an empty list.
          await get().loadRepositories(get().currentPage, true);

          set({
            isSyncing: false,
            lastSyncTime: Date.now()
          });
        } catch (err: any) {
          console.error('[RepositoryStore] Failed to sync repos', err);
          set({
            isSyncing: false,
            error: err?.message || 'Failed to sync repositories',
            errorKind: getErrorKind(err)
          });
        }
      },

      refreshRepositories: async () => {
        await get().loadRepositories(get().currentPage, true);
      },

      updateRepository: (repoId, updates) => {
        set((state) => ({
          repositories: state.repositories.map((repo) =>
            repo.id === repoId ? { ...repo, ...updates } : repo
          )
        }));
      },

      updateBatchAnalysis: (analysisResults) => {
        setCachedBatchAnalysis(analysisResults);
        
        set((state) => ({
          repositories: state.repositories.map((repo) => {
            const analysis = analysisResults[String(repo.id)];
            if (analysis && analysis.overall_score != null) {
              return {
                ...repo,
                score: analysis.overall_score,
                lastScan: analysis.completed_at
              };
            }
            return repo;
          })
        }));
      },

      refreshBatchAnalysis: async () => {
        try {
          const batchResults = await apiClient.getBatchAnalysisResults();
          if (batchResults && batchResults.results) {
            get().updateBatchAnalysis(batchResults.results);
          }
        } catch (err) {
          console.log('[RepositoryStore] Failed to fetch batch analysis:', err);
        }
      },

      clearCache: () => {
        try {
          // Clear all page caches
          for (let i = 1; i <= 20; i++) {
            sessionStorage.removeItem(`${REPOS_CACHE_KEY}_page_${i}`);
          }
          sessionStorage.removeItem(REPOS_CACHE_KEY);
          sessionStorage.removeItem(BATCH_ANALYSIS_CACHE_KEY);
        } catch (err) {
          console.error('[RepositoryStore] Failed to clear cache', err);
        }
      }
    }),
    {
      name: 'repository-store',
      partialize: (state) => ({
        currentPage: state.currentPage,
        reposPerPage: state.reposPerPage,
        lastSyncTime: state.lastSyncTime
      })
    }
  )
);
