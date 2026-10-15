import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Alert, NotificationSettings } from "@/lib/api";

const api = vi.hoisted(() => ({
  updateNotificationSettings: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("@/stores/repositoryStore", () => ({ useRepositoryStore: { getState: () => ({}), setState: () => {} } }));

import { queryKeys } from "@/hooks/useApiQueries";
import {
  rollbackSettings,
  useAcknowledgeAlert,
  useRespondToInvitation,
  useUpdateNotificationSettings,
} from "@/hooks/useNotificationQueries";

const saved: NotificationSettings = {
  email_notifications: true,
  security_alerts: true,
  weekly_digest: false,
  alert_score_threshold: 60,
  auto_analyze_new_repos: false,
  updated_at: null,
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rollbackSettings", () => {
  it("restores only the fields the failed change still holds", () => {
    const current = { ...saved, weekly_digest: true, alert_score_threshold: 80 };
    // The failed change set weekly_digest; a later change set the threshold.
    const next = rollbackSettings(current, { weekly_digest: true }, saved);
    expect(next.weekly_digest).toBe(false);
    expect(next.alert_score_threshold).toBe(80);
  });

  it("leaves a field alone once a later change has overwritten it", () => {
    const current = { ...saved, alert_score_threshold: 40 };
    const next = rollbackSettings(current, { alert_score_threshold: 70 }, saved);
    expect(next.alert_score_threshold).toBe(40);
  });
});

describe("useUpdateNotificationSettings", () => {
  it("shows the change at once and puts the old value back when the save fails", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.notificationSettings, saved);
    const request = deferred<NotificationSettings>();
    api.updateNotificationSettings.mockReturnValue(request.promise);

    const { result } = renderHook(() => useUpdateNotificationSettings(), { wrapper });
    act(() => result.current.mutate({ weekly_digest: true }));

    await waitFor(() =>
      expect(queryClient.getQueryData<NotificationSettings>(queryKeys.notificationSettings)?.weekly_digest).toBe(true)
    );

    await act(async () => {
      request.reject(new Error("Failed to save settings"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.notificationSettings)).toEqual(saved);
  });

  it("keeps the server's answer when the save succeeds", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.notificationSettings, saved);
    const fromServer = { ...saved, alert_score_threshold: 75, updated_at: "2026-10-15T10:00:00Z" };
    api.updateNotificationSettings.mockResolvedValue(fromServer);

    const { result } = renderHook(() => useUpdateNotificationSettings(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ alert_score_threshold: 75 });
    });

    expect(api.updateNotificationSettings).toHaveBeenCalledWith({ alert_score_threshold: 75 });
    expect(queryClient.getQueryData(queryKeys.notificationSettings)).toEqual(fromServer);
  });
});

describe("useRespondToInvitation", () => {
  const invitation = {
    id: "inv-1",
    team_id: "team-1",
    invited_user_id: "me",
    invited_by: "boss",
    role: "member" as const,
    status: "pending" as const,
    created_at: "2026-10-14T10:00:00Z",
    responded_at: null,
    team: { id: "team-1", name: "Platform", organization_id: "org-1" },
    organization: { id: "org-1", name: "Acme" },
    invitee: null,
    inviter: null,
  };

  it("accepting removes the invitation and refreshes teams and organizations", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.myInvitations, [invitation]);
    api.acceptInvitation.mockResolvedValue({ invitation: { ...invitation, status: "accepted" }, membership: {} });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRespondToInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ invitation, accept: true });
    });

    expect(api.acceptInvitation).toHaveBeenCalledWith("inv-1");
    expect(queryClient.getQueryData(queryKeys.myInvitations)).toEqual([]);
    const roots = invalidate.mock.calls.map(([filters]) => (filters?.queryKey as unknown[])?.[0]);
    expect(roots).toEqual(expect.arrayContaining(["teams", "organizations", "organizationTeams", "myInvitations"]));
  });

  it("declining does not touch team or organization caches", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.myInvitations, [invitation]);
    api.declineInvitation.mockResolvedValue({ invitation: { ...invitation, status: "declined" } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRespondToInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ invitation, accept: false });
    });

    expect(api.declineInvitation).toHaveBeenCalledWith("inv-1");
    const roots = invalidate.mock.calls.map(([filters]) => (filters?.queryKey as unknown[])?.[0]);
    expect(roots).not.toContain("teams");
    expect(roots).not.toContain("organizations");
  });
});

describe("useAcknowledgeAlert", () => {
  const alert: Alert = {
    id: "alert-1",
    organization_id: "org-1",
    repository_id: "repo-1",
    alert_type: "critical_issues",
    severity: "critical",
    message: "3 critical issues in the latest analysis of api",
    details: { repository_name: "api" },
    acknowledged: false,
    acknowledged_at: null,
    acknowledged_by: null,
    created_at: "2026-10-15T09:00:00Z",
  };

  it("marks the alert acknowledged in the full list and drops it from the open list", async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.organizationAlerts("org-1", true), [alert]);
    queryClient.setQueryData(queryKeys.organizationAlerts("org-1", false), [alert]);
    const acknowledged = { ...alert, acknowledged: true, acknowledged_at: "2026-10-15T10:00:00Z", acknowledged_by: "me" };
    api.acknowledgeAlert.mockResolvedValue(acknowledged);

    const { result } = renderHook(() => useAcknowledgeAlert("org-1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("alert-1");
    });

    expect(queryClient.getQueryData(queryKeys.organizationAlerts("org-1", true))).toEqual([acknowledged]);
    expect(queryClient.getQueryData(queryKeys.organizationAlerts("org-1", false))).toEqual([]);
  });
});
