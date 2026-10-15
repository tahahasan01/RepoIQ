import { describe, expect, it } from "vitest";
import { buildTrend } from "./trend";

describe("buildTrend", () => {
  it("orders oldest first", () => {
    const trend = buildTrend([
      { completed_at: "2026-10-02T10:00:00Z", overall_score: 70 },
      { completed_at: "2026-10-01T10:00:00Z", overall_score: 60 },
    ]);
    expect(trend.map((p) => p.score)).toEqual([60, 70]);
  });

  it("uses plain dates when every run is on a different day", () => {
    const trend = buildTrend([
      { completed_at: "2026-10-02T10:00:00Z", overall_score: 70 },
      { completed_at: "2026-10-01T10:00:00Z", overall_score: 60 },
    ]);
    expect(trend[0].date).not.toMatch(/:/);
  });

  it("adds the time when runs share a day, so points are distinguishable", () => {
    const trend = buildTrend([
      { completed_at: "2026-10-15T14:30:00Z", overall_score: 56 },
      { completed_at: "2026-10-15T09:05:00Z", overall_score: 55 },
    ]);
    expect(trend[0].date).toMatch(/:/);
    expect(trend[0].date).not.toEqual(trend[1].date);
  });
});
