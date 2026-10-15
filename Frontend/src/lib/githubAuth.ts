import apiClient from '@/lib/api';
import { rememberPostLoginRedirect } from '@/lib/redirect';

/**
 * Starting a GitHub round trip, in the current tab.
 *
 *  - 'signin'  signs in, or re-authorises a signed-in user. For a user who has
 *              already authorised the app GitHub redirects straight back, so
 *              this is usually invisible.
 *  - 'install' opens the GitHub App's install page. For an account that has
 *              already installed it, GitHub offers to configure the existing
 *              installation - that is where repositories are added or removed.
 *              OAuth mode has no installation, so it falls back to 'signin'.
 *
 * Both land on /auth/github/callback. `returnTo`, when given, is where the
 * callback sends the user afterwards (validated as an internal path).
 */
export type GitHubFlow = 'signin' | 'install';

export interface StartGitHubFlowOptions {
  returnTo?: string | null;
  /** Navigation hook, for tests. Defaults to a full page load. */
  navigate?: (url: string) => void;
}

// ---------------------------------------------------------------------------
// Binding the OAuth `state` to this browser
// ---------------------------------------------------------------------------
//
// The backend's state nonces (services/oauth_state.py) prove a state was
// issued by RepoIQ and has not been used - but not WHICH browser it was issued
// to: anyone can fetch one from /auth/github/authorize. So a link to
// /auth/github/callback?code=<attacker's code>&state=<attacker's state> passes
// the backend check, and exchanging it would sign the victim into the
// attacker's account (login CSRF / session swap).
//
// The callback therefore exchanges a code only when its `state` is the one
// THIS tab stored when it started the flow, and consumes it on use. The value
// stored is the backend-issued state itself, not a second nonce.

const OAUTH_STATE_KEY = 'repoiq_github_oauth_state';
// The backend's nonce lives 10 minutes (STATE_TTL_SECONDS); so does ours.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Record the state of a GitHub flow this tab is about to start. */
export function rememberOAuthState(state: string | null | undefined): void {
  if (!state) return;
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ state, at: Date.now() }));
  } catch {
    // Without storage the callback cannot verify the flow and will refuse it -
    // failing closed is the point.
  }
}

/** The state from `url`'s query string, if any (e.g. the 409's install_url). */
export function stateFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}

/**
 * True only if `state` is the one this tab stored, unexpired. The stored value
 * is deleted either way, so a state can be used once.
 */
export function consumeOAuthState(state: string | null | undefined): boolean {
  let stored: { state?: unknown; at?: unknown } | null = null;
  try {
    const raw = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  if (!state || !stored || typeof stored.state !== 'string' || typeof stored.at !== 'number') {
    return false;
  }
  if (Date.now() - stored.at > OAUTH_STATE_TTL_MS) return false;
  return stored.state === state;
}

/** Whether this tab has started a GitHub flow that has not come back yet. */
export function hasPendingOAuthState(): boolean {
  try {
    const raw = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    return typeof at === 'number' && Date.now() - at <= OAUTH_STATE_TTL_MS;
  } catch {
    return false;
  }
}

export async function startGitHubFlow(
  flow: GitHubFlow,
  { returnTo, navigate = (url) => window.location.assign(url) }: StartGitHubFlowOptions = {}
): Promise<void> {
  const res = await apiClient.getGitHubAuthUrl();
  const url = flow === 'install' && res?.install_url ? res.install_url : res?.auth_url;
  if (!url) {
    throw new Error('GitHub sign-in is not available right now. Please try again.');
  }
  if (returnTo !== undefined) {
    rememberPostLoginRedirect(returnTo);
  }
  // auth_url and install_url carry the same single-use state.
  rememberOAuthState(res.state ?? stateFromUrl(url));
  navigate(url);
}
