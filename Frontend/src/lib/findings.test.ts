import { describe, expect, it } from "vitest";
import { findingArea, formatCategory, normalizeSeverity, severityLabel, splitPath } from "./findings";

describe("findings helpers", () => {
  it("maps agent types to the score they count against", () => {
    expect(findingArea("security")).toBe("security");
    expect(findingArea("Documentation")).toBe("documentation");
    expect(findingArea("performance")).toBe("quality");
    expect(findingArea(null)).toBe("quality");
  });

  it("formats categories in sentence case", () => {
    expect(formatCategory("missing_rate_limiting")).toBe("Missing rate limiting");
    expect(formatCategory("")).toBe("Other");
  });

  it("normalises severities and labels them", () => {
    expect(normalizeSeverity("HIGH")).toBe("high");
    expect(normalizeSeverity("info")).toBe("low");
    expect(normalizeSeverity(undefined)).toBe("low");
    expect(severityLabel("critical")).toBe("Critical");
  });

  it("splits a path into file name and folder", () => {
    expect(splitPath("src/app/config.py")).toEqual({ name: "config.py", folder: "src/app" });
    expect(splitPath("README.md")).toEqual({ name: "README.md", folder: "" });
    expect(splitPath("src\\win\\a.ts")).toEqual({ name: "a.ts", folder: "src/win" });
  });
});
