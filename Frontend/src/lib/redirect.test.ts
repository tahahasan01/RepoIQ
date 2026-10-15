import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_POST_LOGIN_PATH,
  consumePostLoginRedirect,
  rememberPostLoginRedirect,
  safeRedirectPath,
} from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard/123", "/dashboard/123"],
    ["/dashboard/123/issues?severity=high#top", "/dashboard/123/issues?severity=high#top"],
    ["/organizations", "/organizations"],
  ])("accepts the internal path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "dashboard/123",
    "/foo\nbar",
    "",
  ])("rejects %j", (input) => {
    expect(safeRedirectPath(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath({ pathname: "/repos" })).toBeNull();
  });

  it("rejects auth pages, which would loop", () => {
    expect(safeRedirectPath("/login")).toBeNull();
    expect(safeRedirectPath("/login/")).toBeNull();
    expect(safeRedirectPath("/signup")).toBeNull();
    expect(safeRedirectPath("/auth/github/callback?code=x")).toBeNull();
  });
});

describe("post-login redirect memory", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips a safe path once", () => {
    rememberPostLoginRedirect("/teams/42");
    expect(consumePostLoginRedirect()).toBe("/teams/42");
    expect(consumePostLoginRedirect()).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("falls back to the default for an unsafe path", () => {
    rememberPostLoginRedirect("//evil.example");
    expect(consumePostLoginRedirect()).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("re-validates a tampered stored value", () => {
    sessionStorage.setItem("repoiq_post_login_redirect", "https://evil.example");
    expect(consumePostLoginRedirect()).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("null clears a previously remembered destination", () => {
    rememberPostLoginRedirect("/teams/42");
    rememberPostLoginRedirect(null);
    expect(consumePostLoginRedirect()).toBe(DEFAULT_POST_LOGIN_PATH);
  });
});
