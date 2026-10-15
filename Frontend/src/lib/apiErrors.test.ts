import { describe, it, expect } from "vitest";
import {
  ApiRequestError,
  BLOCKED_FILE_MESSAGE,
  classifyForbidden,
  detailMessage,
  errorFromResponse,
  isGitHubAccessError,
  isNonRetryableClientError,
} from "@/lib/apiErrors";

describe("classifyForbidden", () => {
  it("treats FastAPI's missing-credentials 403 as a dead session", () => {
    expect(classifyForbidden("Not authenticated")).toBe("session_expired");
    expect(classifyForbidden("Invalid authentication credentials")).toBe("session_expired");
  });

  // The exact strings raised by Backend/app/services/github_token.py.
  it.each([
    ["GitHub is disconnected for this account. Reconnect it to continue.", "github_disconnected"],
    ["GitHub account not connected. Please connect it first.", "github_disconnected"],
    ["No GitHub token on record", "github_disconnected"],
    [
      "GitHub App is not installed for this account. Please install it and choose which repositories to grant access to.",
      "github_not_installed",
    ],
    ["Stored GitHub token could not be decrypted", "github_unavailable"],
  ])("classifies %j as %s", (detail, kind) => {
    expect(classifyForbidden(detail)).toBe(kind);
  });

  it("recognises the blocked file type response", () => {
    expect(classifyForbidden("Access to this file type is not allowed")).toBe("blocked_file");
  });

  it("treats anything else as a permission denial", () => {
    expect(classifyForbidden("Access denied")).toBe("forbidden");
    expect(classifyForbidden(undefined)).toBe("forbidden");
  });
});

describe("errorFromResponse", () => {
  it("keeps status and the structured detail", () => {
    const detail = { message: "Install RepoIQ", action: "install", install_url: "https://github.com/apps/x" };
    const error = errorFromResponse(409, detail);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBe(409);
    expect(error.detail).toBe(detail);
    expect(error.message).toBe("Install RepoIQ");
    expect(error.kind).toBe("http");
  });

  it("gives blocked files a plain-language message", () => {
    const error = errorFromResponse(403, "Access to this file type is not allowed");
    expect(error.kind).toBe("blocked_file");
    expect(error.message).toBe(BLOCKED_FILE_MESSAGE);
  });

  it("keeps the backend's explanation for GitHub access errors", () => {
    const error = errorFromResponse(403, "GitHub is disconnected for this account. Reconnect it to continue.");
    expect(isGitHubAccessError(error)).toBe(true);
    expect(error.message).toMatch(/disconnected/);
  });

  it("flattens FastAPI validation errors", () => {
    expect(detailMessage([{ msg: "field required" }, { msg: "too short" }])).toBe("field required, too short");
  });
});

describe("isNonRetryableClientError", () => {
  it("does not retry 4xx except timeouts and rate limits", () => {
    expect(isNonRetryableClientError(errorFromResponse(403, "Access denied"))).toBe(true);
    expect(isNonRetryableClientError(errorFromResponse(404, "Not found"))).toBe(true);
    expect(isNonRetryableClientError(errorFromResponse(429, "Slow down"))).toBe(false);
    expect(isNonRetryableClientError(errorFromResponse(500, "Boom"))).toBe(false);
    expect(isNonRetryableClientError(new Error("Network Error"))).toBe(false);
  });
});
