import { describe, it, expect } from "vitest";
import {
  checkResultMessage,
  describeInvitation,
  generateWebhookSecret,
  parseScoreThreshold,
  parseWebhookUrl,
} from "@/lib/notifications";
import type { TeamInvitation } from "@/lib/api";

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

const base = { success: true, organization_id: "org-1", alerts: [] };

describe("checkResultMessage", () => {
  it("counts newly raised alerts", () => {
    expect(checkResultMessage({ ...base, alerts_found: 3, alerts_created: 1 }).title).toBe("1 new alert");
    expect(checkResultMessage({ ...base, alerts_found: 3, alerts_created: 2 }).title).toBe("2 new alerts");
  });

  it("says nothing is new when every condition already has an alert", () => {
    expect(checkResultMessage({ ...base, alerts_found: 2, alerts_created: 0 }).title).toBe("No new alerts");
  });

  it("says no problems were found when no condition is true", () => {
    expect(checkResultMessage({ ...base, alerts_found: 0, alerts_created: 0 }).title).toBe("No problems found");
  });
});

describe("describeInvitation", () => {
  const invitation = {
    role: "lead",
    team: { id: "t", name: "Platform", organization_id: "o" },
    organization: { id: "o", name: "Acme" },
    inviter: { id: "u", full_name: null, avatar_url: null, github_username: "sam" },
  } as TeamInvitation;

  it("says who invited you, to what, and as what", () => {
    expect(describeInvitation(invitation)).toBe("@sam invited you to join Platform (Acme) as a lead.");
  });

  it("copes with a deleted inviter", () => {
    expect(describeInvitation({ ...invitation, inviter: null, role: "member" })).toBe(
      "Someone invited you to join Platform (Acme) as a member."
    );
  });
});
