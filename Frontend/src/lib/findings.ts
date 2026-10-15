/**
 * Presentation helpers for analysis findings.
 */

export type FindingArea = "security" | "quality" | "architecture" | "documentation";

export const FINDING_AREAS: FindingArea[] = ["security", "quality", "architecture", "documentation"];

export const AREA_LABELS: Record<FindingArea, string> = {
  security: "Security",
  quality: "Quality",
  architecture: "Architecture",
  documentation: "Docs",
};

/**
 * The score a finding counts against, from its stored agent_type. Mirrors
 * DIMENSION_AGENTS in Backend/app/services/scoring.py: anything that is not
 * security, architecture or documentation counts toward quality.
 */
export function findingArea(agentType: string | null | undefined): FindingArea {
  const value = (agentType || "").toLowerCase();
  if (value === "security" || value === "architecture" || value === "documentation") return value;
  return "quality";
}

/** "missing_rate_limiting" -> "Missing rate limiting". */
export function formatCategory(category: string | null | undefined): string {
  const words = (category || "").replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!words) return "Other";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
