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
  navigate(url);
}
