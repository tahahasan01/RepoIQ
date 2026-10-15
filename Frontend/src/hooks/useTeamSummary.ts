import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';

export const teamSummaryKey = (teamId: string) => ['teamSummary', teamId] as const;

/** Everything the team page shows, scoped to the team's assigned repositories. */
export function useTeamSummary(teamId: string | undefined) {
  return useQuery({
    queryKey: teamSummaryKey(teamId || ''),
    queryFn: () => apiClient.getTeamSummary(teamId!),
    enabled: !!teamId,
    staleTime: 60 * 1000,
  });
}
