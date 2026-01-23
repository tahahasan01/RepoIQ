import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api';

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

  // Actions
  setRepositories: (repos: Repository[]) => void;
  setCurrentPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setHasMorePages: (hasMore: boolean) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  loadRepositories: (page?: number, forceRefresh?: boolean) => Promise<void>;
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

      setRepositories: (repos) => set({ repositories: repos }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setLoading: (loading) => set({ isLoading: loading }),
      setSyncing: (syncing) => set({ isSyncing: syncing }),
      setHasMorePages: (hasMore) => set({ hasMorePages: hasMore }),
      setError: (error) => set({ error }),

      loadRepositories: async (page?: number, forceRefresh = false) => {
        const state = get();
        const targetPage = page ?? state.currentPage;
        
        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = getCachedReposForPage(targetPage);
          if (cached && cached.length > 0) {
            console.log(`[RepositoryStore] Loading page ${targetPage} from cache`);
            set({ 
              repositories: cached, 
              currentPage: targetPage,
              isLoading: false,
              hasMorePages: cached.length === state.reposPerPage
            });
            // Still fetch in background to update cache
            get().loadRepositories(targetPage, true);
            return;
          }
        }

        set({ isLoading: true, error: null });

        try {
          const data = await apiClient.getRepositories(targetPage, state.reposPerPage);
          
          let reposList: Repository[] = [];
          if (Array.isArray(data)) {
            reposList = data;
          } else if (data && (data as any).repositories) {
            reposList = (data as any).repositories;
          }

          setCachedReposForPage(targetPage, reposList);
          
          set({
            repositories: reposList,
            currentPage: targetPage,
            isLoading: false,
            hasMorePages: reposList.length === state.reposPerPage,
            error: null
          });

          // Fetch batch analysis in background
          get().refreshBatchAnalysis();
        } catch (err: any) {
          console.error('[RepositoryStore] Failed to load repos', err);
          set({ 
            isLoading: false, 
            error: err?.message || 'Failed to load repositories',
            repositories: []
          });
        }
      },

      syncRepositories: async () => {
        set({ isSyncing: true, error: null });
        
        try {
          // Clear caches
          get().clearCache();
          
          await apiClient.syncRepositories();
          
          // Reload current page
          await get().loadRepositories(get().currentPage, true);
          
          set({ 
            isSyncing: false, 
            lastSyncTime: Date.now(),
            error: null 
          });
        } catch (err: any) {
          console.error('[RepositoryStore] Failed to sync repos', err);
          set({ 
            isSyncing: false, 
            error: err?.message || 'Failed to sync repositories' 
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
