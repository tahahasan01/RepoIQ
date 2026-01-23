import { create } from 'zustand';
import apiClient from '@/lib/api';

export interface AnalysisResult {
  id: string;
  repository_id: string;
  overall_score: number;
  security_score: number;
  quality_score: number;
  architecture_score: number;
  testing_score?: number;
  documentation_score: number;
  issues: AnalysisIssue[];
  completed_at: string;
  created_at: string;
}

export interface AnalysisIssue {
  id: string;
  file_path: string;
  line_number: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
}

interface AnalysisState {
  // Current analysis results by repository ID
  results: Record<string, AnalysisResult>;
  
  // Analysis history by repository ID
  history: Record<string, AnalysisResult[]>;
  
  // Loading states
  loading: Record<string, boolean>;
  analyzing: Record<string, boolean>;
  
  // Error states
  errors: Record<string, string | null>;
  
  // Cache timestamps
  cacheTimestamps: Record<string, number>;
  
  // Actions
  setResult: (repoId: string, result: AnalysisResult) => void;
  setHistory: (repoId: string, history: AnalysisResult[]) => void;
  setLoading: (repoId: string, loading: boolean) => void;
  setAnalyzing: (repoId: string, analyzing: boolean) => void;
  setError: (repoId: string, error: string | null) => void;
  
  // Async actions
  loadAnalysis: (repoId: string, forceRefresh?: boolean) => Promise<void>;
  loadHistory: (repoId: string) => Promise<void>;
  startAnalysis: (repoId: string) => Promise<{ analysis_id: string } | null>;
  
  // Cache management
  clearCache: (repoId?: string) => void;
  getCachedResult: (repoId: string) => AnalysisResult | null;
}

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const CACHE_KEY = (repoId: string) => `repoiq_analysis_${repoId}`;
const HISTORY_CACHE_KEY = (repoId: string) => `repoiq_analysis_history_${repoId}`;

function getCachedAnalysis(repoId: string): AnalysisResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY(repoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed.timestamp || 0) > CACHE_DURATION) {
      sessionStorage.removeItem(CACHE_KEY(repoId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedAnalysis(repoId: string, data: AnalysisResult) {
  try {
    sessionStorage.setItem(CACHE_KEY(repoId), JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (err) {
    console.error('[AnalysisStore] Failed to cache analysis', err);
  }
}

function getCachedHistory(repoId: string): AnalysisResult[] | null {
  try {
    const raw = sessionStorage.getItem(HISTORY_CACHE_KEY(repoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed.timestamp || 0) > CACHE_DURATION) {
      sessionStorage.removeItem(HISTORY_CACHE_KEY(repoId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedHistory(repoId: string, data: AnalysisResult[]) {
  try {
    sessionStorage.setItem(HISTORY_CACHE_KEY(repoId), JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (err) {
    console.error('[AnalysisStore] Failed to cache history', err);
  }
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  results: {},
  history: {},
  loading: {},
  analyzing: {},
  errors: {},
  cacheTimestamps: {},

  setResult: (repoId, result) => {
    set((state) => ({
      results: { ...state.results, [repoId]: result },
      cacheTimestamps: { ...state.cacheTimestamps, [repoId]: Date.now() }
    }));
    setCachedAnalysis(repoId, result);
  },

  setHistory: (repoId, history) => {
    set((state) => ({
      history: { ...state.history, [repoId]: history }
    }));
    setCachedHistory(repoId, history);
  },

  setLoading: (repoId, loading) => {
    set((state) => ({
      loading: { ...state.loading, [repoId]: loading }
    }));
  },

  setAnalyzing: (repoId, analyzing) => {
    set((state) => ({
      analyzing: { ...state.analyzing, [repoId]: analyzing }
    }));
  },

  setError: (repoId, error) => {
    set((state) => ({
      errors: { ...state.errors, [repoId]: error }
    }));
  },

  loadAnalysis: async (repoId, forceRefresh = false) => {
    if (!repoId) return;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAnalysis(repoId);
      if (cached) {
        console.log('[AnalysisStore] Using cached analysis for', repoId);
        get().setResult(repoId, cached);
        get().setLoading(repoId, false);
        // Still fetch in background to update cache
        setTimeout(() => get().loadAnalysis(repoId, true), 500);
        return;
      }
    }

    get().setLoading(repoId, true);
    get().setError(repoId, null);

    try {
      const data = await apiClient.getAnalysisResults(repoId);
      
      const result: AnalysisResult = {
        id: data.id || data.analysis_id || '',
        repository_id: repoId,
        overall_score: data.overall_score || 0,
        security_score: data.security_score || 0,
        quality_score: data.quality_score || 0,
        architecture_score: data.architecture_score || 0,
        testing_score: data.testing_score || 0,
        documentation_score: data.documentation_score || 0,
        issues: data.issues || [],
        completed_at: data.completed_at || data.created_at || new Date().toISOString(),
        created_at: data.created_at || new Date().toISOString()
      };

      get().setResult(repoId, result);
      get().setLoading(repoId, false);
    } catch (err: any) {
      console.error('[AnalysisStore] Failed to load analysis', err);
      get().setError(repoId, err?.message || 'Failed to load analysis');
      get().setLoading(repoId, false);
    }
  },

  loadHistory: async (repoId) => {
    if (!repoId) return;

    // Check cache first
    const cached = getCachedHistory(repoId);
    if (cached) {
      get().setHistory(repoId, cached);
      // Still fetch in background
      setTimeout(() => {
        apiClient.getAnalysisHistory(repoId)
          .then((data) => {
            const history = Array.isArray(data) ? data : (data.history || []);
            get().setHistory(repoId, history);
          })
          .catch((err) => {
            console.error('[AnalysisStore] Failed to load history', err);
          });
      }, 500);
      return;
    }

    try {
      const data = await apiClient.getAnalysisHistory(repoId);
      const history = Array.isArray(data) ? data : (data.history || []);
      get().setHistory(repoId, history);
    } catch (err) {
      console.error('[AnalysisStore] Failed to load history', err);
    }
  },

  startAnalysis: async (repoId) => {
    get().setAnalyzing(repoId, true);
    get().setError(repoId, null);

    try {
      const response = await apiClient.startAnalysis(repoId);
      const analysisId = (response as any).analysis_id;
      
      if (!analysisId) {
        throw new Error('Failed to start analysis - no analysis ID returned');
      }
      
      // Clear cache for this repo
      get().clearCache(repoId);
      
      return { analysis_id: analysisId };
    } catch (err: any) {
      console.error('[AnalysisStore] Failed to start analysis', err);
      
      // Preserve original error message, especially for CORS errors
      const errorMessage = err?.message || 'Failed to start analysis';
      
      // If it's a CORS error, preserve the detailed message
      if ((err as any).isCorsError) {
        get().setError(repoId, errorMessage);
      } else {
        // For other errors, use the original message or a generic one
        get().setError(repoId, errorMessage);
      }
      
      // Re-throw to allow caller to handle it
      throw err;
    } finally {
      get().setAnalyzing(repoId, false);
    }
  },

  clearCache: (repoId) => {
    if (repoId) {
      sessionStorage.removeItem(CACHE_KEY(repoId));
      sessionStorage.removeItem(HISTORY_CACHE_KEY(repoId));
      set((state) => {
        const newResults = { ...state.results };
        const newHistory = { ...state.history };
        const newCacheTimestamps = { ...state.cacheTimestamps };
        delete newResults[repoId];
        delete newHistory[repoId];
        delete newCacheTimestamps[repoId];
        return {
          results: newResults,
          history: newHistory,
          cacheTimestamps: newCacheTimestamps
        };
      });
    } else {
      // Clear all caches
      try {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith('repoiq_analysis_')) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (err) {
        console.error('[AnalysisStore] Failed to clear all caches', err);
      }
      set({ results: {}, history: {}, cacheTimestamps: {} });
    }
  },

  getCachedResult: (repoId) => {
    return getCachedAnalysis(repoId);
  }
}));
