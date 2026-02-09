import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useApiQueries';
import apiClient from '@/lib/api';

/**
 * Hook to prefetch critical data immediately after login
 * This ensures instant loading when navigating to common pages
 */
export function usePrefetchOnLogin() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!currentUser?.id) return;

    console.log('[PrefetchOnLogin] 🚀 Starting background prefetch for user:', currentUser.id);

    // Prefetch repositories list (most common first page)
    queryClient.prefetchQuery({
      queryKey: ['repositories', 1, 30],
      queryFn: () => apiClient.getRepositories(1, 30),
      staleTime: 10 * 60 * 1000,
    }).catch(() => {});

    // Prefetch organizations (if user navigates to orgs page)
    queryClient.prefetchQuery({
      queryKey: ['organizations'],
      queryFn: () => apiClient.getOrganizations(),
      staleTime: 10 * 60 * 1000,
    }).catch(() => {});

    // Prefetch teams (if user navigates to teams page)
    queryClient.prefetchQuery({
      queryKey: ['teams'],
      queryFn: () => apiClient.getTeams(),
      staleTime: 10 * 60 * 1000,
    }).catch(() => {});

    // Small delay then prefetch batch analysis results (for dashboard scores)
    setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['batchAnalysis'],
        queryFn: () => apiClient.getBatchAnalysisResults(),
        staleTime: 5 * 60 * 1000,
      }).catch(() => {});
    }, 1000);

    console.log('[PrefetchOnLogin] ✅ Background prefetch started');
  }, [currentUser?.id, queryClient]);
}
