import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import apiClient, { signOut } from "@/lib/api";
import { ApiRequestError, BLOCKED_FILE_MESSAGE } from "@/lib/apiErrors";

function makeToken(sub = "user-1"): string {
  const encode = (value: object) => btoa(JSON.stringify(value));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: "HS256" })}.${encode({ sub, exp })}.signature`;
}

type MockResponse = { status: number; body?: unknown };

function jsonResponse({ status, body }: MockResponse) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

/** fetch that answers each call with the next response in order. */
function mockFetch(...responses: MockResponse[]) {
  const queue = [...responses];
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return jsonResponse(next);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fetchedUrl(fn: ReturnType<typeof vi.fn>, call = 0): string {
  return String(fn.mock.calls[call][0]);
}

async function captureError(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiRequestError;
  }
  throw new Error("Expected the request to fail");
}

let authExpired: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("token", makeToken());
  localStorage.setItem("refresh_token", "refresh-1");
  localStorage.setItem("user", JSON.stringify({ id: "user-1" }));
  authExpired = vi.fn();
  window.addEventListener("authExpired", authExpired);
});

afterEach(() => {
  window.removeEventListener("authExpired", authExpired);
  vi.unstubAllGlobals();
});

function expectSignedIn() {
  expect(localStorage.getItem("token")).not.toBeNull();
  expect(authExpired).not.toHaveBeenCalled();
}

function expectSignedOut() {
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("refresh_token")).toBeNull();
  expect(localStorage.getItem("user")).toBeNull();
}

describe("403 handling", () => {
  it("keeps the session when GitHub is disconnected", async () => {
    mockFetch({ status: 403, body: { detail: "GitHub is disconnected for this account. Reconnect it to continue." } });

    const error = await captureError(apiClient.syncRepositories());

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBe(403);
    expect(error.kind).toBe("github_disconnected");
    expect(error.message).toMatch(/Reconnect it/);
    expectSignedIn();
  });

  it("keeps the session when the GitHub App is not installed", async () => {
    mockFetch({
      status: 403,
      body: { detail: "GitHub App is not installed for this account. Please install it and choose which repositories to grant access to." },
    });

    const error = await captureError(apiClient.getRepositoryFiles("repo-1"));

    expect(error.kind).toBe("github_not_installed");
    expectSignedIn();
  });

  it("reports a blocked file type without logging out", async () => {
    mockFetch({ status: 403, body: { detail: "Access to this file type is not allowed" } });

    const error = await captureError(apiClient.getFileContent("repo-1", ".env"));

    expect(error.kind).toBe("blocked_file");
    expect(error.message).toBe(BLOCKED_FILE_MESSAGE);
    expectSignedIn();
  });

  it("treats other 403s as a permission error", async () => {
    mockFetch({ status: 403, body: { detail: "Access denied" } });

    const error = await captureError(apiClient.getAnalysisById("analysis-1"));

    expect(error.kind).toBe("forbidden");
    expect(error.message).toBe("Access denied");
    expectSignedIn();
  });

  it("ends the session for FastAPI's missing-credentials 403", async () => {
    mockFetch({ status: 403, body: { detail: "Not authenticated" } });

    const error = await captureError(apiClient.getOrganization("org-1"));

    expect(error.kind).toBe("session_expired");
    expectSignedOut();
    expect(authExpired).toHaveBeenCalledTimes(1);
  });
});

describe("401 handling", () => {
  it("ends the session when the refresh is rejected", async () => {
    const fetchFn = mockFetch(
      { status: 401, body: { detail: "Token expired. Please refresh your session." } },
      { status: 401, body: { detail: "Invalid refresh token" } }
    );

    const error = await captureError(apiClient.getTeam("team-1"));

    expect(error.status).toBe(401);
    expect(error.kind).toBe("session_expired");
    expect(fetchedUrl(fetchFn, 1)).toMatch(/\/auth\/refresh$/);
    expectSignedOut();
    expect(authExpired).toHaveBeenCalled();
  });

  it("retries with the refreshed token", async () => {
    const fresh = makeToken();
    const fetchFn = mockFetch(
      { status: 401, body: { detail: "Token expired. Please refresh your session." } },
      { status: 200, body: { access_token: fresh, refresh_token: "refresh-2" } },
      { status: 200, body: { id: "team-2" } }
    );

    await expect(apiClient.getTeam("team-2")).resolves.toEqual({ id: "team-2" });

    const retryInit = fetchFn.mock.calls[2][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(`Bearer ${fresh}`);
    expect(localStorage.getItem("refresh_token")).toBe("refresh-2");
    expectSignedIn();
  });
});

it("keeps the structured 409 detail from the GitHub callback", async () => {
  const detail = {
    message: "Install RepoIQ on your GitHub account to continue.",
    action: "install",
    install_url: "https://github.com/apps/repoiq/installations/new?state=s",
  };
  mockFetch({ status: 409, body: { detail } });

  const error = await captureError(apiClient.githubCallback("code", "state"));

  expect(error.status).toBe(409);
  expect(error.detail).toEqual(detail);
  expect(error.message).toBe(detail.message);
});

describe("signOut", () => {
  it("revokes the session server-side, clears local state, then navigates", async () => {
    const token = localStorage.getItem("token");
    sessionStorage.setItem("repoiq_repositories_cache_page_1", "[]");
    sessionStorage.setItem("unrelated", "kept");
    const fetchFn = mockFetch({ status: 200, body: { message: "Logged out successfully" } });
    const navigate = vi.fn();

    await signOut({ navigate });

    expect(fetchedUrl(fetchFn)).toMatch(/\/auth\/logout$/);
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expectSignedOut();
    expect(sessionStorage.getItem("repoiq_repositories_cache_page_1")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("kept");
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("still signs out locally, and says so, when revocation fails", async () => {
    mockFetch({ status: 503, body: { detail: "Could not fully end your session" } });
    const navigate = vi.fn();

    await signOut({ navigate, redirectTo: "/" });

    expectSignedOut();
    expect(navigate).toHaveBeenCalledWith("/?error=logout_incomplete");
  });

  it("does not report an already-expired session as a failure", async () => {
    mockFetch(
      { status: 401, body: { detail: "Session has ended. Please log in again." } },
      { status: 401, body: { detail: "Invalid refresh token" } }
    );
    const navigate = vi.fn();

    await signOut({ navigate });

    expectSignedOut();
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("skips the server call when there is nothing to revoke", async () => {
    const fetchFn = mockFetch();
    const navigate = vi.fn();

    await signOut({ revokeSession: false, redirectTo: "/", navigate });

    expect(fetchFn).not.toHaveBeenCalled();
    expectSignedOut();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});

it("sends compareTeams ids as repeated parameters", async () => {
  const fetchFn = mockFetch({ status: 200, body: [] });

  await apiClient.compareTeams("org-1", ["a", "b"]);

  expect(fetchedUrl(fetchFn)).toMatch(/\/executive\/organizations\/org-1\/teams\/compare\?team_ids=a&team_ids=b$/);
});

describe("request merging", () => {
  it("never merges two writes to the same endpoint", async () => {
    const fetchFn = mockFetch(
      { status: 200, body: { message: "first" } },
      { status: 200, body: { message: "second" } },
    );

    const [a, b] = await Promise.all([
      apiClient.cancelAnalysis("a-1"),
      apiClient.cancelAnalysis("a-1"),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect([a.message, b.message].sort()).toEqual(["first", "second"]);
  });

  it("shares one request between identical reads in flight", async () => {
    const fetchFn = mockFetch({ status: 200, body: { id: "x" } });

    const [a, b] = await Promise.all([apiClient.getAnalysisById("x"), apiClient.getAnalysisById("x")]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});
