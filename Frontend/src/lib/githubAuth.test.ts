import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({ getGitHubAuthUrl: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));

import { consumeOAuthState, rememberOAuthState, startGitHubFlow } from "@/lib/githubAuth";

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("startGitHubFlow", () => {
  it("stores the backend-issued state before leaving for GitHub", async () => {
    api.getGitHubAuthUrl.mockResolvedValue({
      auth_url: "https://github.com/login/oauth/authorize?state=srv-1",
      install_url: "https://github.com/apps/repoiq/installations/new?state=srv-1",
      state: "srv-1",
      mode: "app",
    });
    const navigate = vi.fn();

    await startGitHubFlow("install", { navigate });

    expect(navigate).toHaveBeenCalledWith("https://github.com/apps/repoiq/installations/new?state=srv-1");
    expect(consumeOAuthState("srv-1")).toBe(true);
  });

  it("uses the sign-in URL when there is no install URL", async () => {
    api.getGitHubAuthUrl.mockResolvedValue({ auth_url: "https://github.com/login/oauth/authorize", state: "x", mode: "oauth" });
    const navigate = vi.fn();

    await startGitHubFlow("install", { navigate });

    expect(navigate).toHaveBeenCalledWith("https://github.com/login/oauth/authorize");
  });
});

describe("consumeOAuthState", () => {
  it("accepts the stored state exactly once", () => {
    rememberOAuthState("s");
    expect(consumeOAuthState("s")).toBe(true);
    expect(consumeOAuthState("s")).toBe(false);
  });

  it("rejects a different, missing or absent state, and burns the stored one", () => {
    rememberOAuthState("s");
    expect(consumeOAuthState("other")).toBe(false);
    expect(consumeOAuthState("s")).toBe(false);
    expect(consumeOAuthState(null)).toBe(false);
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    rememberOAuthState("s");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeOAuthState("s")).toBe(false);
    vi.useRealTimers();
  });
});
