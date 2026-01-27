/**
 * React Query hooks for optimized data fetching.
 * 
 * Benefits:
 * - Automatic request deduplication
 * - Smart caching with configurable stale times
 * - Background refetching
 * - Built-in loading and error states
 * - Automatic garbage collection
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import apiClient from '@/lib/api';

// Query key factory for consistent cache keys
export const queryKeys = {
  // Auth
  currentUser: ['currentUser'] as const,
  
  // Repositories
  repositories: (page?: number, perPage?: number) => 
    ['repositories', page, perPage] as const,
  repository: (repoId: string) => 
    ['repository', repoId] as const,
  repositoryFiles: (repoId: string) => 
    ['repositoryFiles', repoId] as const,
  fileContent: (repoId: string, filePath: string) => 
    ['fileContent', repoId, filePath] as const,
  
  // Analysis
  analysisResults: (repoId: string) => 
    ['analysisResults', repoId] as const,
  analysisHistory: (repoId: string) => 
    ['analysisHistory', repoId] as const,
  analysisById: (analysisId: string) => 
    ['analysis', analysisId] as const,
  batchAnalysis: ['batchAnalysis'] as const,
  
  // Issues
  issues: (analysisId: string) => 
    ['issues', analysisId] as const,
  
  // Architecture
  architecture: (repoId: string) => 
    ['architecture', repoId] as const,
  
  // Roadmap
  roadmap: (repoId: string) => 
    ['roadmap', repoId] as const,
  
  // Chat
  chatHistory: (repoId: string) => 
    ['chatHistory', repoId] as const,
};

// ============================================
// USER QUERIES
// ============================================

export function useCurrentUser(options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => apiClient.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    ...options,
  });
}

// ============================================
// REPOSITORY QUERIES
// ============================================

export function useRepositories(page = 1, perPage = 30, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.repositories(page, perPage),
    queryFn: () => apiClient.getRepositories(page, perPage),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useRepository(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.repository(repoId),
    queryFn: () => apiClient.getRepository(repoId),
    staleTime: 10 * 60 * 1000,
    enabled: !!repoId,
    ...options,
  });
}

export function useRepositoryFiles(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.repositoryFiles(repoId),
    queryFn: () => apiClient.getRepositoryFiles(repoId),
    staleTime: 60 * 60 * 1000, // 60 minutes - files rarely change
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    enabled: !!repoId,
    ...options,
  });
}

export function useFileContent(repoId: string, filePath: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.fileContent(repoId, filePath),
    queryFn: () => apiClient.getFileContent(repoId, filePath),
    staleTime: 60 * 60 * 1000, // 60 minutes
    gcTime: 2 * 60 * 60 * 1000,
    enabled: !!repoId && !!filePath,
    ...options,
  });
}

// ============================================
// ANALYSIS QUERIES
// ============================================

export function useAnalysisResults(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.analysisResults(repoId),
    queryFn: () => apiClient.getAnalysisResults(repoId),
    staleTime: 5 * 60 * 1000, // 5 minutes - may need fresh data
    refetchOnWindowFocus: false,
    enabled: !!repoId,
    ...options,
  });
}

export function useAnalysisHistory(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.analysisHistory(repoId),
    queryFn: () => apiClient.getAnalysisHistory(repoId),
    staleTime: 5 * 60 * 1000,
    enabled: !!repoId,
    ...options,
  });
}

export function useAnalysisById(analysisId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.analysisById(analysisId),
    queryFn: () => apiClient.getAnalysisById(analysisId),
    staleTime: 60 * 60 * 1000, // 60 minutes - immutable once complete
    enabled: !!analysisId,
    ...options,
  });
}

export function useBatchAnalysisResults(options?: Partial<UseQueryOptions<{ results: Record<string, any> }>>) {
  return useQuery({
    queryKey: queryKeys.batchAnalysis,
    queryFn: () => apiClient.getBatchAnalysisResults(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================
// ISSUES QUERIES
// ============================================

export function useIssues(analysisId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.issues(analysisId),
    queryFn: () => apiClient.getIssues(analysisId),
    staleTime: 60 * 60 * 1000, // 60 minutes - immutable
    gcTime: 2 * 60 * 60 * 1000,
    enabled: !!analysisId,
    ...options,
  });
}

// ============================================
// ARCHITECTURE QUERIES
// ============================================

export function useArchitecture(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.architecture(repoId),
    queryFn: () => apiClient.getArchitectureDiagram(repoId),
    staleTime: 60 * 60 * 1000, // 60 minutes
    gcTime: 2 * 60 * 60 * 1000,
    enabled: !!repoId,
    ...options,
  });
}

// ============================================
// ROADMAP QUERIES
// ============================================

export function useRoadmap(repoId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.roadmap(repoId),
    queryFn: () => apiClient.getImprovementRoadmap(repoId),
    staleTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!repoId,
    ...options,
  });
}

// ============================================
// CHAT QUERIES
// ============================================

export function useChatHistory(repoId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.chatHistory(repoId),
    queryFn: () => apiClient.getChatHistory(repoId),
    staleTime: 60 * 1000, // 1 minute - chat updates frequently
    enabled: !!repoId,
    ...options,
  });
}

// ============================================
// MUTATIONS
// ============================================

export function useSyncRepositories() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => apiClient.syncRepositories(),
    onSuccess: () => {
      // Invalidate repositories cache
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
    },
  });
}

export function useStartAnalysis() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (repoId: string) => apiClient.startAnalysis(repoId),
    onSuccess: (_, repoId) => {
      // Invalidate analysis results for this repo
      queryClient.invalidateQueries({ queryKey: queryKeys.analysisResults(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analysisHistory(repoId) });
    },
  });
}

export function useCancelAnalysis() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (analysisId: string) => apiClient.cancelAnalysis(analysisId),
    onSuccess: () => {
      // Invalidate all analysis queries
      queryClient.invalidateQueries({ queryKey: ['analysisResults'] });
      queryClient.invalidateQueries({ queryKey: ['analysisHistory'] });
    },
  });
}

export function useAutoFixIssues() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ repoId, issueIds }: { repoId: string; issueIds: string[] }) => 
      apiClient.autoFixIssues(repoId, issueIds),
    onSuccess: (_, { repoId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.analysisResults(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.repository(repoId) });
    },
  });
}

export function useSendChatMessage(repoId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (message: string) => apiClient.sendChatMessage(repoId, message),
    onSuccess: () => {
      // Invalidate chat history
      queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory(repoId) });
    },
  });
}

export function useClearChatHistory(repoId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => apiClient.clearChatHistory(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory(repoId) });
    },
  });
}

// ============================================
// CACHE UTILITIES
// ============================================

export function useInvalidateAnalysis() {
  const queryClient = useQueryClient();
  
  return {
    invalidateRepo: (repoId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analysisResults(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analysisHistory(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.repository(repoId) });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisResults'] });
      queryClient.invalidateQueries({ queryKey: ['analysisHistory'] });
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
    },
  };
}

export function usePrefetchRepository() {
  const queryClient = useQueryClient();
  
  return {
    prefetch: (repoId: string) => {
      // Prefetch repository data when hovering over a repo
      queryClient.prefetchQuery({
        queryKey: queryKeys.repository(repoId),
        queryFn: () => apiClient.getRepository(repoId),
        staleTime: 10 * 60 * 1000,
      });
    },
    prefetchAnalysis: (repoId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.analysisResults(repoId),
        queryFn: () => apiClient.getAnalysisResults(repoId),
        staleTime: 5 * 60 * 1000,
      });
    },
  };
}
