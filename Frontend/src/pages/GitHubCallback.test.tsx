import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  githubCallback: vi.fn(),
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
  getRepositories: vi.fn(async () => []),
  getBatchAnalysisResults: vi.fn(async () => ({ results: {} })),
  syncRepositories: vi.fn(async () => []),
  clearLocalSession: vi.fn(),
}));
const startGitHubFlow = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/api", () => ({ default: api, apiClient: api, signOut: vi.fn() }));
vi.mock("@/lib/githubAuth", () => ({ startGitHubFlow }));

import GitHubCallback from "@/pages/GitHubCallback";
import { rememberPostLoginRedirect } from "@/lib/redirect";

function token(sub: string) {
  return `${btoa("{}")}.${btoa(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
}

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderCallback(search: string) {
  window.history.replaceState({}, "", `/auth/github/callback${search}`);
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/auth/github/callback${search}`]}>
        <Routes>
          <Route path="/auth/github/callback" element={<GitHubCallback />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("GitHubCallback", () => {
  it("processes the code even when a session already exists", async () => {
    // A signed-in user returning from re-authorising or installing the app.
    localStorage.setItem("token", token("user-1"));
    rememberPostLoginRedirect("/dashboard/7/settings");
    api.githubCallback.mockResolvedValue({
      access_token: token("user-1"),
      refresh_token: "r2",
      user: { id: "user-1" },
    });

    renderCallback("?code=abc&state=s1&installation_id=99&setup_action=update");

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/dashboard/7/settings"));
    expect(api.githubCallback).toHaveBeenCalledWith("abc", "s1", "99");
    // The URL is scrubbed so a reload cannot replay the single-use code.
    expect(window.location.search).toBe("");
  });

  it("sends an installation-only return back through sign-in", async () => {
    renderCallback("?installation_id=99&setup_action=install");

    await waitFor(() => expect(startGitHubFlow).toHaveBeenCalledWith("signin"));
    expect(api.githubCallback).not.toHaveBeenCalled();
  });

  it("does not loop if sign-in comes back without a code again", async () => {
    sessionStorage.setItem("repoiq_github_setup_resume", String(Date.now()));

    renderCallback("?installation_id=99&setup_action=install");

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login?error=no_code"));
    expect(startGitHubFlow).not.toHaveBeenCalled();
  });

  it("redirects to the install page on the 409 'not installed' answer", async () => {
    const { ApiRequestError } = await import("@/lib/apiErrors");
    const assign = vi.fn();
    const original = window.location;
    // jsdom cannot navigate; stand in a location that records assign().
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: original.origin, pathname: "/auth/github/callback", search: "?code=abc&state=s1", assign },
    });
    api.githubCallback.mockRejectedValue(
      new ApiRequestError("Install RepoIQ", 409, "http", {
        message: "Install RepoIQ",
        action: "install",
        install_url: "https://github.com/apps/repoiq/installations/new?state=s2",
      })
    );

    try {
      renderCallback("?code=abc&state=s1");
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith("https://github.com/apps/repoiq/installations/new?state=s2")
      );
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("maps an expired login link to auth_expired", async () => {
    const { ApiRequestError } = await import("@/lib/apiErrors");
    api.githubCallback.mockRejectedValue(
      new ApiRequestError(
        "This login link is no longer valid. Please start a new GitHub login.",
        400,
        "http",
        "This login link is no longer valid. Please start a new GitHub login."
      )
    );

    renderCallback("?code=abc&state=stale");

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login?error=auth_expired"));
    expect(localStorage.getItem("token")).toBeNull();
  });
});
