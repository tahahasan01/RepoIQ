/**
 * Shapes returned by the AI endpoints: repository chat, auto-fix runs, the
 * improvement roadmap and the architecture diagram. They mirror
 * Backend/app/api/routes/chat.py and Backend/app/api/routes/analysis.py.
 */

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Markdown for assistant replies, plain text for the user's questions. */
  content: string;
  /** Repository file paths attached to the question (at most three). */
  context_files?: string[] | null;
  created_at: string;
  /** Client-only: an optimistic message the server has not confirmed yet. */
  pending?: boolean;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

export interface SendChatMessageInput {
  message: string;
  contextFiles?: string[];
}

// ── Auto-fix ─────────────────────────────────────────────────────────────────

export type AutofixStatus =
  | "pending"
  | "running"
  | "ready"
  | "publishing"
  | "completed"
  | "failed"
  | "discarded";

export interface AutofixProposal {
  file_path: string;
  summary: string;
  /** Unified diff text for this file. */
  diff: string;
  issue_ids: string[];
  /** Changed lines (original numbering) far from every selected finding - review these closely. */
  changes_outside_findings?: number[];
}

export interface AutofixSkipped {
  file_path: string;
  reason: string;
}

export interface AutofixRun {
  id: string;
  repository_id: string;
  status: AutofixStatus;
  issue_ids: string[];
  proposals?: AutofixProposal[] | null;
  /** Fingerprint of the proposals as shown; approval must send it back. */
  proposals_digest?: string | null;
  fixed_issue_ids?: string[] | null;
  skipped?: AutofixSkipped[] | null;
  branch?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface StartAutofixResponse {
  run_id: string;
  status: AutofixStatus;
  execution_mode?: string;
}

// ── Roadmap and architecture ─────────────────────────────────────────────────

export interface RoadmapItem {
  issue: string;
  category: string;
  impact: string;
  effort: string;
}

export interface ImprovementRoadmap {
  priority_order?: string[];
  quick_wins?: RoadmapItem[];
  medium_term?: RoadmapItem[];
  long_term?: RoadmapItem[];
  estimated_impact?: {
    critical_issues?: number;
    high_issues?: number;
    architecture_issues?: number;
    auto_fixable?: number;
  };
  created_at?: string;
}

export interface ArchitectureComponent {
  name: string;
  description: string;
  /** Directories or files in the repository that make up the component. */
  paths: string[];
}

export interface ArchitectureLayer {
  id: string;
  name: string;
  description: string;
  components: ArchitectureComponent[];
}

export interface ArchitectureDiagram {
  repository_id: string;
  repository_name: string;
  architecture: {
    summary: string;
    layers: ArchitectureLayer[];
    connections: { from: string; to: string; label: string }[];
    /** "ai", or "file_layout" when the model was unavailable. */
    source?: string;
  };
  /** Mermaid flowchart built by the server from `architecture`; always valid. */
  mermaid: string;
  file_count: number;
}
