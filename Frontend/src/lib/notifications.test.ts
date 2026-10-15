import { describe, it, expect } from "vitest";
import { generateWebhookSecret, parseScoreThreshold, parseWebhookUrl } from "@/lib/notifications";

describe("parseScoreThreshold", () => {
  it.each([
    ["0", 0],
    ["60", 60],
    [" 100 ", 100],
  ])("accepts %s", (raw, value) => {
    expect(parseScoreThreshold(raw)).toEqual({ ok: true, value });
  });

  it.each(["", "  ", "101", "-1", "60.5", "6e1", "abc", "1,000"])("rejects %j", (raw) => {
    const result = parseScoreThreshold(raw);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("parseWebhookUrl", () => {
  it("accepts an https URL and normalises it", () => {
    expect(parseWebhookUrl(" https://example.com/hooks ")).toEqual({ ok: true, value: "https://example.com/hooks" });
  });

  it("rejects plain http", () => {
    const result = parseWebhookUrl("http://example.com/hooks");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/https/);
  });

  it("rejects text that is not a URL, and URLs carrying credentials", () => {
    expect(parseWebhookUrl("example.com").ok).toBe(false);
    expect(parseWebhookUrl("https://user:pass@example.com/").ok).toBe(false);
    expect(parseWebhookUrl("").ok).toBe(false);
  });
});

describe("generateWebhookSecret", () => {
  it("is prefixed, hex, 32 random bytes, and different every time", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
