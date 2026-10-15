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

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

/**
 * A finding's severity, from whatever the API sent. Anything unrecognised
 * (an empty value, "info", a typo) is treated as low rather than dropped.
 */
export function normalizeSeverity(severity: string | null | undefined): Severity {
  const value = (severity || "").toLowerCase().trim();
  return (SEVERITIES as string[]).includes(value) ? (value as Severity) : "low";
}

/** "critical" -> "Critical". */
export function severityLabel(severity: string | null | undefined): string {
  const value = normalizeSeverity(severity);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "src/app/config.py" -> { name: "config.py", folder: "src/app" }. */
export function splitPath(path: string | null | undefined): { name: string; folder: string } {
  const clean = (path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const cut = clean.lastIndexOf("/");
  if (cut === -1) return { name: clean, folder: "" };
  return { name: clean.slice(cut + 1), folder: clean.slice(0, cut) };
}
