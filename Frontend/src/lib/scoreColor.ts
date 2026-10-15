/**
 * Colour for a 0-100 score. The one place score bands are decided.
 *
 * The dashboard used to colour each metric by its own brand hue: Security was
 * always green, Docs always pink, Testing always orange. So a security score of
 * 50 rendered in the same reassuring green as a security score of 100, and the
 * one tile users scan first told them nothing about whether the number was good.
 *
 * In a product whose entire purpose is grading a repository, colour is not
 * decoration - it is the fastest channel the interface has. It has to encode
 * the score, and only the score.
 *
 * Three bands, backed by the --score-* tokens in index.css so both themes get
 * a value with enough contrast:
 *   good  80-100
 *   fair  60-79
 *   poor  0-59
 */
export type ScoreBand = "good" | "fair" | "poor" | "none";

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return "none";
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

const BAND_COLORS: Record<ScoreBand, string> = {
  good: "hsl(var(--score-good))",
  fair: "hsl(var(--score-fair))",
  poor: "hsl(var(--score-poor))",
  // Unknown is never green, which would read as "fine".
  none: "hsl(var(--muted-foreground))",
};

const BAND_TEXT_CLASSES: Record<ScoreBand, string> = {
  good: "text-score-good",
  fair: "text-score-fair",
  poor: "text-score-poor",
  none: "text-muted-foreground",
};

const BAND_BG_CLASSES: Record<ScoreBand, string> = {
  good: "bg-score-good",
  fair: "bg-score-fair",
  poor: "bg-score-poor",
  none: "bg-muted-foreground",
};

/** A CSS colour for inline styles (`style={{ color: scoreColor(n) }}`). */
export function scoreColor(score: number | null | undefined): string {
  return BAND_COLORS[scoreBand(score)];
}

/** Tailwind text colour class for a score. */
export function scoreTextClass(score: number | null | undefined): string {
  return BAND_TEXT_CLASSES[scoreBand(score)];
}

/** Tailwind background colour class for a score (bars, meters). */
export function scoreBgClass(score: number | null | undefined): string {
  return BAND_BG_CLASSES[scoreBand(score)];
}

/** Word for a score, for tooltips and screen readers. */
export function scoreLabel(score: number | null | undefined): string {
  switch (scoreBand(score)) {
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    default:
      return "Not scored";
  }
}
