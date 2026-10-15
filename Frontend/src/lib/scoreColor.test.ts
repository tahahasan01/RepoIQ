import { describe, expect, it } from "vitest";
import { scoreBand, scoreColor, scoreLabel, scoreTextClass } from "./scoreColor";

describe("scoreBand", () => {
  it("uses three bands with 80 and 60 as the edges", () => {
    expect(scoreBand(100)).toBe("good");
    expect(scoreBand(80)).toBe("good");
    expect(scoreBand(79)).toBe("fair");
    expect(scoreBand(60)).toBe("fair");
    expect(scoreBand(59)).toBe("poor");
    expect(scoreBand(0)).toBe("poor");
  });

  it("treats a missing score as unscored, not as good", () => {
    expect(scoreBand(null)).toBe("none");
    expect(scoreBand(undefined)).toBe("none");
    expect(scoreBand(Number.NaN)).toBe("none");
    expect(scoreLabel(null)).toBe("Not scored");
    expect(scoreColor(null)).toBe("hsl(var(--muted-foreground))");
  });
});

describe("score colours", () => {
  it("come from the theme tokens", () => {
    expect(scoreColor(92)).toBe("hsl(var(--score-good))");
    expect(scoreColor(65)).toBe("hsl(var(--score-fair))");
    expect(scoreColor(12)).toBe("hsl(var(--score-poor))");
    expect(scoreTextClass(65)).toBe("text-score-fair");
    expect(scoreLabel(12)).toBe("Poor");
  });
});
