/**
 * UI-side shapes for analysis results.
 *
 * These lived in services/scanService.ts next to a mock "scan" generator
 * (random issues, a fake delay, dummy bug reports) that is gone. The types are
 * what pages map real API data into.
 */

export interface ScanIssue {
  id: number;
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  /** Which score the finding counts against. */
  area?: import("@/lib/findings").FindingArea;
  description: string;
  details: string;
  fix: string;
}

export interface ScanResult {
  id: string;
  timestamp: number;
  repoName: string;
  branch: string;
  issues: ScanIssue[];
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

export interface BugReport {
  id: number | string;
  title: string;
  details: string;
  timestamp: number;
  repoName: string;
  severity?: "critical" | "high" | "medium" | "low";
  status?: "open" | "triaged" | "in_progress" | "resolved";
  category?: string;
  file_path?: string;
  line_number?: number;
}
