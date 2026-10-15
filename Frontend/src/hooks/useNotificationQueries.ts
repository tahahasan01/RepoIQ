/**
 * React Query hooks for notification settings, team invitations, organization
 * alerts and webhooks. Cache keys live in queryKeys (useApiQueries.ts).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import apiClient, {
  type Alert,
  type NotificationSettings,
  type NotificationSettingsUpdate,
  type TeamInvitation,
} from '@/lib/api';
import { ApiRequestError } from '@/lib/apiErrors';
import { queryKeys } from '@/hooks/useApiQueries';

function hasToken(): boolean {
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    return false;
  }
}

/** A 403/404 means "not yours to see"; asking again will not change that. */
export function isAccessDenied(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}

// ============================================
// NOTIFICATION SETTINGS
// ============================================

const SETTINGS_MUTATION_KEY = ['updateNotificationSettings'] as const;

export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => apiClient.getNotificationSettings(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Undo one failed change without undoing the others.
 *
 * Several changes can be in flight at once (two switches flipped quickly).
 * Restoring the snapshot taken before the failed one would also revert a
 * later change that may well succeed, so only the fields this change set are
 * restored, and only where they still hold the value this change put there.
 */
export function rollbackSettings(
  current: NotificationSettings,
  changes: NotificationSettingsUpdate,
  previous: NotificationSettings
): NotificationSettings {
  const next = { ...current };
  (Object.keys(changes) as (keyof NotificationSettingsUpdate)[]).forEach((field) => {
    if (current[field] === changes[field]) {
      (next as Record<string, unknown>)[field] = previous[field];
    }
  });
  return next;
}

/** Save a partial change, showing it at once and undoing it if the save fails. */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const key = queryKeys.notificationSettings;

  return useMutation({
    mutationKey: SETTINGS_MUTATION_KEY,
    mutationFn: (changes: NotificationSettingsUpdate) => apiClient.updateNotificationSettings(changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      if (previous) {
        queryClient.setQueryData<NotificationSettings>(key, { ...previous, ...changes });
      }
      return { previous };
    },
    onError: (_error, changes, context) => {
      const current = queryClient.getQueryData<NotificationSettings>(key);
      if (context?.previous && current) {
        queryClient.setQueryData(key, rollbackSettings(current, changes, context.previous));
      }
    },
    onSuccess: (saved, changes) => {
      // While another change is still in flight, its optimistic value must not
      // be overwritten by this response; take only the fields this change set.
      const othersPending = queryClient.isMutating({ mutationKey: SETTINGS_MUTATION_KEY }) > 1;
      if (!othersPending) {
        queryClient.setQueryData(key, saved);
        return;
      }
      queryClient.setQueryData<NotificationSettings>(key, (current) => {
        if (!current) return saved;
        const next = { ...current, updated_at: saved.updated_at };
        (Object.keys(changes) as (keyof NotificationSettingsUpdate)[]).forEach((field) => {
          (next as Record<string, unknown>)[field] = saved[field];
        });
        return next;
      });
    },
  });
}

// ============================================
// TEAM INVITATIONS
// ============================================

/** The signed-in user's pending invitations. Polled so the bell stays current. */
export function useMyInvitations() {
  return useQuery({
    queryKey: queryKeys.myInvitations,
    queryFn: () => apiClient.getMyInvitations(),
    enabled: hasToken(),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** After joining a team, every list of teams and organizations is out of date. */
export function invalidateMembershipQueries(queryClient: QueryClient) {
  ['teams', 'organizationTeams', 'organizations', 'organization', 'team', 'teamSummary', 'teamMembers'].forEach(
    (root) => queryClient.invalidateQueries({ queryKey: [root] })
  );
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invitation, accept }: { invitation: TeamInvitation; accept: boolean }) =>
      accept ? apiClient.acceptInvitation(invitation.id) : apiClient.declineInvitation(invitation.id),
    onSuccess: (_result, { invitation, accept }) => {
      queryClient.setQueryData<TeamInvitation[]>(queryKeys.myInvitations, (old) =>
        old?.filter((i) => i.id !== invitation.id)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations });
      if (accept) invalidateMembershipQueries(queryClient);
    },
    onError: (error) => {
      // 404/409: already answered, revoked, or not addressed to us. The list
      // is stale either way.
      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 409)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations });
      }
    },
  });
}

/** A team's pending invitations; only its managers may read them (403 otherwise). */
export function useTeamInvitations(teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamInvitations(teamId || ''),
    queryFn: () => apiClient.getTeamInvitations(teamId!),
    enabled: !!teamId,
    staleTime: 60 * 1000,
    retry: (failureCount, error) => !isAccessDenied(error) && failureCount < 2,
  });
}

export function useRevokeInvitation(teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => apiClient.revokeInvitation(teamId, invitationId),
    onSuccess: (_result, invitationId) => {
      queryClient.setQueryData<TeamInvitation[]>(queryKeys.teamInvitations(teamId), (old) =>
        old?.filter((i) => i.id !== invitationId)
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.teamInvitations(teamId) }),
  });
}

// ============================================
// ORGANIZATION ALERTS
// ============================================

export const ALERT_WINDOW_DAYS = 7;

export function useOrganizationAlerts(orgId: string | undefined, includeAcknowledged: boolean) {
  return useQuery({
    queryKey: queryKeys.organizationAlerts(orgId || '', includeAcknowledged),
    queryFn: () => apiClient.getOrganizationAlerts(orgId!, ALERT_WINDOW_DAYS, includeAcknowledged),
    enabled: !!orgId,
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
    retry: (failureCount, error) => !isAccessDenied(error) && failureCount < 2,
  });
}

export function useAcknowledgeAlert(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) => apiClient.acknowledgeAlert(alertId),
    onSuccess: (updated) => {
      // Both cached views: the full list shows it as acknowledged, the
      // open-only list drops it.
      queryClient.setQueriesData<Alert[]>({ queryKey: ['organizationAlerts', orgId] }, (old) => old?.map((a) => (a.id === updated.id ? updated : a)));
      queryClient.setQueryData<Alert[]>(queryKeys.organizationAlerts(orgId, false), (old) =>
        old?.filter((a) => a.id !== updated.id)
      );
    },
  });
}

export function useCheckAlerts(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.checkAlerts(orgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizationAlerts', orgId] }),
  });
}

// ============================================
// WEBHOOKS
// ============================================

export const DELIVERIES_PAGE_SIZE = 20;

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks,
    queryFn: async () => (await apiClient.listWebhooks()).webhooks,
    staleTime: 60 * 1000,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { url: string; events: string[]; secret: string }) => apiClient.createWebhook(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.webhooks }),
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhookId: string) => apiClient.deleteWebhook(webhookId),
    onSuccess: (_result, webhookId) => {
      queryClient.removeQueries({ queryKey: queryKeys.webhookDeliveries(webhookId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks });
    },
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhookId: string) => apiClient.testWebhook(webhookId),
    // A test is recorded in the delivery history whether or not it got through.
    onSettled: (_result, _error, webhookId) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.webhookDeliveries(webhookId) }),
  });
}

export function useWebhookDeliveries(webhookId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.webhookDeliveries(webhookId),
    queryFn: ({ pageParam }) => apiClient.getWebhookDeliveries(webhookId, DELIVERIES_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.limit : undefined),
    enabled,
    staleTime: 30 * 1000,
  });
}
