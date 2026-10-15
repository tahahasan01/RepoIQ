/**
 * The one RepoIQ plan, shown on the landing page and on /pricing.
 *
 * RepoIQ is free: there are no paid plans, trials or payment details. The two
 * limits below are the production defaults in Backend/.env.example; if the
 * deployment changes ANALYSIS_MAX_FILES or LLM_DAILY_TOKEN_BUDGET_PER_USER,
 * change them here too.
 */
import { MAX_CHAT_FILES } from "@/lib/chat";

/** ANALYSIS_MAX_FILES: most files reviewed per analysis. */
export const ANALYSIS_MAX_FILES = 150;

/** LLM_DAILY_TOKEN_BUDGET_PER_USER, written for people. */
export const DAILY_AI_ALLOWANCE = "2 million";

/** Auto-fix limits per run (Backend/app/services/autofix.py). */
export const AUTOFIX_MAX_FINDINGS = 20;
export const AUTOFIX_MAX_FILES = 10;

/** Files that can be attached to one chat question. */
export const CHAT_MAX_FILES = MAX_CHAT_FILES;

export const FREE_PLAN = {
  name: "Free",
  price: "$0",
  description: "Everything RepoIQ does, for every account. No card, no trial.",
  features: [
    "AI review with Claude plus static checks",
    `Up to ${ANALYSIS_MAX_FILES} files reviewed per analysis, chosen by importance`,
    "Scores, analysis history and trend",
    "Issues, file browser, reports, roadmap and architecture diagram",
    `"Ask about this repo" chat with up to ${CHAT_MAX_FILES} attached files`,
    "Auto-fix as draft pull requests you approve first",
    "Organisations, teams, invitations and alerts",
    "Signed webhooks to your own HTTPS endpoint",
  ],
  limits: [
    `A daily AI allowance of ${DAILY_AI_ALLOWANCE} model tokens per account, shared by analysis, chat and auto-fix. It resets at midnight UTC.`,
    `Auto-fix handles up to ${AUTOFIX_MAX_FINDINGS} findings across ${AUTOFIX_MAX_FILES} files per run.`,
  ],
} as const;
