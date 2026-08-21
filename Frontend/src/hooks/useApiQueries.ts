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
  
  // Organizations
  organizations: ['organizations'] as const,
  organization: (orgId: string) => 
    ['organization', orgId] as const,
  organizationTeams: (orgId: string) => 
    ['organizationTeams', orgId] as const,
  organizationRepositories: (orgId: string) => 
    ['organizationRepositories', orgId] as const,
  
  // Teams
  teams: (orgId?: string) => 
    ['teams', orgId] as const,
  team: (teamId: string) => 
    ['team', teamId] as const,
  teamMembers: (teamId: string) => 
    ['teamMembers', teamId] as const,
  teamRepositories: (teamId: string) => 
    ['teamRepositories', teamId] as const,
  
  // Executive Dashboard
  organizationOverview: (orgId: string) => 
    ['organizationOverview', orgId] as const,
  businessRiskScore: (orgId: string) => 
    ['businessRiskScore', orgId] as const,
  topRiskAreas: (orgId: string, limit?: number) => 
    ['topRiskAreas', orgId, limit] as const,
  complianceStatus: (orgId: string) => 
    ['complianceStatus', orgId] as const,
  teamLeaderboard: (orgId: string, metric?: string) => 
    ['teamLeaderboard', orgId, metric] as const,
};

// ============================================
// USER QUERIES
// ============================================

export function useCurrentUser(options?: Partial<UseQueryOptions<any>>) {
  // Only ask who the user is when there is a token to ask with.
  //
  // This hook runs from usePrefetchOnLogin, which is mounted app-wide - so on
  // the landing and login pages it fired GET /auth/me with no credentials,
  // collected a 403, retried, and logged "Session expired. Please log in again."
  // twice in the console of a page where being logged out is the expected
  // state. Wasted round trips, and console noise that hides real errors.
  let hasToken = false;
  try {
    hasToken = Boolean(localStorage.getItem('token'));
  } catch {
    hasToken = false;
  }

  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => apiClient.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    enabled: hasToken,
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

// ============================================
// ORGANIZATION QUERIES
// ============================================

export function useOrganizations(options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: () => apiClient.listOrganizations(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes - keep longer
    placeholderData: (previousData) => previousData,
    refetchInterval: false, // Don't auto-refetch
    ...options,
  });
}

export function useOrganization(orgId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.organization(orgId),
    queryFn: () => apiClient.getOrganization(orgId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useOrganizationTeams(orgId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.organizationTeams(orgId),
    queryFn: () => {
      if (!orgId || orgId === 'undefined' || orgId === 'null') {
        throw new Error('Invalid organization ID');
      }
      return apiClient.listOrganizationTeams(orgId);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!orgId && orgId !== 'undefined' && orgId !== 'null',
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useOrganizationRepositories(orgId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.organizationRepositories(orgId),
    queryFn: () => {
      if (!orgId || orgId === 'undefined' || orgId === 'null') {
        throw new Error('Invalid organization ID');
      }
      return apiClient.getOrganizationRepositories(orgId);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!orgId && orgId !== 'undefined' && orgId !== 'null',
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

// ============================================
// TEAM QUERIES
// ============================================

export function useTeams(orgId?: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.teams(orgId),
    queryFn: async () => {
      if (orgId && orgId !== 'undefined') {
        return apiClient.listOrganizationTeams(orgId);
      } else {
        // Load teams from all organizations
        const orgs = await apiClient.listOrganizations();
        const teamsArrays = await Promise.all(
          orgs
            .filter(org => org.id && org.id !== 'undefined') // Filter out invalid orgs
            .map(org => 
              apiClient.listOrganizationTeams(org.id).catch(() => [])
            )
        );
        return teamsArrays.flat();
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes - keep longer
    placeholderData: (previousData) => previousData,
    refetchInterval: false, // Don't auto-refetch
    enabled: orgId !== 'undefined', // Don't run if orgId is the string "undefined"
    ...options,
  });
}

export function useTeam(teamId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.team(teamId),
    queryFn: () => apiClient.getTeam(teamId),
    staleTime: 10 * 60 * 1000, // 10 minutes - data considered fresh
    gcTime: 60 * 60 * 1000, // 60 minutes - keep in cache longer
    enabled: !!teamId,
    // Use cached data immediately if available
    placeholderData: (previousData) => previousData,
    // Don't refetch on mount if data exists (use cached data)
    refetchOnMount: options?.refetchOnMount ?? false,
    // Don't refetch in background - use cached data until explicitly invalidated
    refetchInterval: false,
    ...options,
  });
}

export function useTeamMembers(teamId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.teamMembers(teamId),
    queryFn: () => apiClient.getTeamMembers(teamId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!teamId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    refetchInterval: false,
    ...options,
  });
}

export function useTeamRepositories(teamId: string, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.teamRepositories(teamId),
    queryFn: () => apiClient.getTeamRepositories(teamId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!teamId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    refetchInterval: false,
    ...options,
  });
}

// ============================================
// PREFETCH HOOKS
// ============================================

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

export function usePrefetchTeam() {
  const queryClient = useQueryClient();
  
  return {
    prefetch: (teamId: string) => {
      // Prefetch team data when hovering over "View Team" button
      queryClient.prefetchQuery({
        queryKey: queryKeys.team(teamId),
        queryFn: () => apiClient.getTeam(teamId),
        staleTime: 10 * 60 * 1000,
      });
      // Also prefetch members and repositories in parallel
      queryClient.prefetchQuery({
        queryKey: queryKeys.teamMembers(teamId),
        queryFn: () => apiClient.getTeamMembers(teamId),
        staleTime: 10 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.teamRepositories(teamId),
        queryFn: () => apiClient.getTeamRepositories(teamId),
        staleTime: 10 * 60 * 1000,
      });
    },
  };
}

export function usePrefetchOrganization() {
  const queryClient = useQueryClient();
  
  return {
    prefetch: (orgId: string) => {
      // Validate orgId before prefetching
      if (!orgId || orgId === 'undefined' || orgId === 'null') {
        console.warn('[usePrefetchOrganization] ⚠️ Skipping prefetch for invalid orgId:', orgId);
        return;
      }
      
      queryClient.prefetchQuery({
        queryKey: queryKeys.organization(orgId),
        queryFn: () => apiClient.getOrganization(orgId),
        staleTime: 10 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.organizationTeams(orgId),
        queryFn: () => apiClient.listOrganizationTeams(orgId),
        staleTime: 10 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.organizationRepositories(orgId),
        queryFn: () => apiClient.getOrganizationRepositories(orgId),
        staleTime: 10 * 60 * 1000,
      });
    },
  };
}

// ============================================
// EXECUTIVE DASHBOARD QUERIES
// ============================================

export function useOrganizationOverview(orgId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.organizationOverview(orgId),
    queryFn: () => apiClient.getOrganizationOverview(orgId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useBusinessRiskScore(orgId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.businessRiskScore(orgId),
    queryFn: () => apiClient.getBusinessRiskScore(orgId),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useTopRiskAreas(orgId: string, limit: number = 10, options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.topRiskAreas(orgId, limit),
    queryFn: () => apiClient.getTopRiskAreas(orgId, limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useComplianceStatus(orgId: string, options?: Partial<UseQueryOptions<any>>) {
  return useQuery({
    queryKey: queryKeys.complianceStatus(orgId),
    queryFn: () => apiClient.getComplianceStatus(orgId),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}

export function useTeamLeaderboard(orgId: string, metric: string = 'overall_score', options?: Partial<UseQueryOptions<any[]>>) {
  return useQuery({
    queryKey: queryKeys.teamLeaderboard(orgId, metric),
    queryFn: () => apiClient.getTeamLeaderboard(orgId, metric),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    refetchOnMount: options?.refetchOnMount ?? false,
    ...options,
  });
}
