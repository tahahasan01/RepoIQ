/**
 * Input rules and copy for notification settings, webhooks, invitations and
 * alerts, kept apart from the components so they can be tested on their own.
 */
import type { AlertCheckResult, TeamInvitation } from '@/lib/api';

export type ParseResult<T> = { ok: true; value: T; error?: never } | { ok: false; error: string; value?: never };

/**
 * The alert score threshold as typed by the user. The backend accepts a whole
 * number from 0 to 100 and rejects anything else with a 422.
 */
export function parseScoreThreshold(raw: string): ParseResult<number> {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Enter a score from 0 to 100.' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Use a whole number from 0 to 100.' };
  const value = Number(text);
  if (value > 100) return { ok: false, error: 'The highest score is 100.' };
  return { ok: true, value };
}

/** Events RepoIQ actually sends. The backend lists more names than it emits. */
export const WEBHOOK_EVENTS = [
  { value: 'analysis.completed', label: 'Analysis completed', description: 'Scores and issue counts when an analysis finishes.' },
  { value: 'analysis.failed', label: 'Analysis failed', description: 'The repository and the error when an analysis fails.' },
] as const;

/**
 * Check a webhook URL before it is sent. The backend is the authority (it
 * also refuses private and internal addresses); this catches the mistakes
 * that need no round trip.
 */
export function parseWebhookUrl(raw: string): ParseResult<string> {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Enter the URL that should receive events.' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That isn't a valid URL. It should look like https://example.com/hooks/repoiq." };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Use an https:// URL. RepoIQ only delivers webhooks over HTTPS.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Remove the username and password from the URL. Verify requests with the signing secret instead." };
  }
  return { ok: true, value: url.toString() };
}

/**
 * A signing secret generated in the browser and sent with the create request.
 * The backend never returns a webhook's secret, so one it generated could
 * never be shown; generating it here is what lets it be shown once.
 */
export function generateWebhookSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return 'whsec_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function personName(person: TeamInvitation["inviter"]): string | null {
  return person?.full_name || (person?.github_username ? `@${person.github_username}` : null);
}

/** "Sam invited you to join Platform (Acme) as a lead." */
export function describeInvitation(invitation: TeamInvitation): string {
  const team = invitation.team?.name ?? "a team";
  const org = invitation.organization?.name ? ` (${invitation.organization.name})` : "";
  const role = invitation.role === "member" ? "a member" : `a ${invitation.role}`;
  const inviter = personName(invitation.inviter);
  return `${inviter ?? "Someone"} invited you to join ${team}${org} as ${role}.`;
}

/** The toast after "Check now", from POST /alerts/organizations/{id}/check. */
export function checkResultMessage(result: AlertCheckResult): { title: string; description: string } {
  if (result.alerts_created > 0) {
    const n = result.alerts_created;
    return {
      title: `${n} new alert${n === 1 ? "" : "s"}`,
      description: "They're at the top of the list.",
    };
  }
  if (result.alerts_found > 0) {
    return {
      title: "No new alerts",
      description: "Every problem the check found already has an alert below.",
    };
  }
  return {
    title: "No problems found",
    description: "The latest analysis of each repository raised nothing to alert on.",
  };
}
