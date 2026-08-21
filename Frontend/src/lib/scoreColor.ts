/**
 * Colour for a 0-100 score.
 *
 * The dashboard used to colour each metric by its own brand hue: Security was
 * always green, Docs always pink, Testing always orange. So a security score of
 * 50 rendered in the same reassuring green as a security score of 100, and the
 * one tile users scan first told them nothing about whether the number was good.
 *
 * In a product whose entire purpose is grading a repository, colour is not
 * decoration - it is the fastest channel the interface has. It has to encode
 * the score.
 */
export const SCORE_COLORS = {
  strong: '#22c55e',   // 80-100  healthy
  fair: '#eab308',     // 60-79   worth a look
  weak: '#f97316',     // 40-59   needs work
  critical: '#ef4444', // 0-39    urgent
} as const;

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '#64748b'; // unknown - never green, which would read as "fine"
  }
  if (score >= 80) return SCORE_COLORS.strong;
  if (score >= 60) return SCORE_COLORS.fair;
  if (score >= 40) return SCORE_COLORS.weak;
  return SCORE_COLORS.critical;
}

/** Word for a score, for tooltips and screen readers. */
export function scoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Not scored';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs work';
  return 'Critical';
}
