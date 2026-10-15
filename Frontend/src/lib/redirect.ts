/**
 * Where to send the user after they sign in.
 *
 * ProtectedRoute records the page a signed-out visitor was heading to in
 * `state.from`, but sign-in is a full-page round trip through GitHub, which
 * loses router state - so Login and GitHubCallback always went to /repos.
 * The destination is kept in sessionStorage across the round trip instead.
 *
 * Anything stored or read here is validated to be an internal path. A value
 * that could leave the site (`//evil.example`, `https://...`, `/\evil`) would
 * make the sign-in flow an open redirect.
 */

export const DEFAULT_POST_LOGIN_PATH = '/repos';

const STORAGE_KEY = 'repoiq_post_login_redirect';

// Sending the user back to one of these after signing in would loop or strand
// them on an auth screen.
const AUTH_PATHS = ['/login', '/signup', '/auth/github/callback'];

/**
 * `value` as a same-origin path (pathname + search + hash), or null if it is
 * not a safe internal destination.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  // Browsers treat a backslash like a slash, so "/\evil.example" is
  // protocol-relative. Control characters have no place in a path.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return null;

  let url: URL;
  try {
    url = new URL(candidate, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (AUTH_PATHS.includes(path)) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Remember where to go once the GitHub round trip finishes. */
export function rememberPostLoginRedirect(value: unknown): void {
  const path = safeRedirectPath(value);
  try {
    if (path) {
      sessionStorage.setItem(STORAGE_KEY, path);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable; the user just lands on the default page.
  }
}

/** Read and forget the remembered destination, falling back to the default. */
export function consumePostLoginRedirect(): string {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  return safeRedirectPath(stored) ?? DEFAULT_POST_LOGIN_PATH;
}
