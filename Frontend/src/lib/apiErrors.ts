/**
 * Typed errors for API failures, and the rules for telling them apart.
 *
 * The backend uses 403 for several unrelated situations, and they need
 * different responses from the UI:
 *
 *  - FastAPI's HTTPBearer answers 403 "Not authenticated" when a request
 *    carries no Authorization header at all. That one really does mean "no
 *    session" (an expired or invalid token is a 401 instead - see
 *    Backend/app/api/dependencies.py get_current_user).
 *  - get_github_token answers 403 when GitHub is disconnected, the GitHub App
 *    is not installed, or no usable GitHub token can be produced. The user is
 *    still signed in; they need to connect GitHub or install the app.
 *  - The file-content endpoint answers 403 for blocked sensitive file types.
 *  - Everything else is an ordinary permission denial.
 *
 * The client used to treat every 403 as an expired session and log the user
 * out, so disconnecting GitHub or clicking a .env file in the file browser
 * signed the user out of RepoIQ.
 */

export type ApiErrorKind =
  /** No valid session: 401, or a 403 caused by missing credentials. */
  | 'session_expired'
  /** GitHub was disconnected from the account (or never connected). */
  | 'github_disconnected'
  /** Signed in, but the GitHub App is not installed for this account. */
  | 'github_not_installed'
  /** Some other reason a GitHub token could not be produced. */
  | 'github_unavailable'
  /** The file type is blocked from being viewed. */
  | 'blocked_file'
  /** A permission denial for this resource. */
  | 'forbidden'
  /** Any other HTTP error. */
  | 'http';

export type GitHubAccessKind = Extract<
  ApiErrorKind,
  'github_disconnected' | 'github_not_installed' | 'github_unavailable'
>;

export const BLOCKED_FILE_MESSAGE = "This file type can't be viewed.";
export const FORBIDDEN_MESSAGE = "You don't have permission to do that.";
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /**
   * The response's `detail`, untouched. It can be a string, FastAPI's
   * validation array, or a structured object (the 409 from the GitHub callback
   * carries `{ action: "install", install_url }`), and callers branch on it.
   */
  readonly detail: unknown;

  constructor(message: string, status: number, kind: ApiErrorKind, detail?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

/** The human-readable part of a FastAPI `detail`, whatever its shape. */
export function detailMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg: unknown }).msg) : ''))
      .filter(Boolean)
      .join(', ');
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const message = (detail as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

// HTTPBearer's two auto_error details: the request carried no usable
// Authorization header, so there is no session to keep.
const MISSING_CREDENTIALS = new Set(['not authenticated', 'invalid authentication credentials']);

/** Which kind of 403 this is, from the response detail. */
export function classifyForbidden(detail: unknown): ApiErrorKind {
  const text = detailMessage(detail).trim().toLowerCase();

  if (MISSING_CREDENTIALS.has(text)) return 'session_expired';
  if (text.includes('file type')) return 'blocked_file';

  if (text.includes('github') || text.includes('install')) {
    if (text.includes('not installed') || text.includes('install it')) return 'github_not_installed';
    if (
      text.includes('disconnected') ||
      text.includes('not connected') ||
      text.includes('no github token')
    ) {
      return 'github_disconnected';
    }
    return 'github_unavailable';
  }

  return 'forbidden';
}

/** The message shown to the user for a failed request. */
export function messageForError(status: number, kind: ApiErrorKind, detail: unknown): string {
  switch (kind) {
    case 'session_expired':
      return SESSION_EXPIRED_MESSAGE;
    case 'blocked_file':
      return BLOCKED_FILE_MESSAGE;
    case 'forbidden':
      return detailMessage(detail) || FORBIDDEN_MESSAGE;
    default:
      return detailMessage(detail) || `HTTP ${status}`;
  }
}

/** Build the error thrown for a non-2xx response (other than a 401). */
export function errorFromResponse(status: number, detail: unknown): ApiRequestError {
  const kind: ApiErrorKind = status === 403 ? classifyForbidden(detail) : 'http';
  return new ApiRequestError(messageForError(status, kind, detail), status, kind, detail);
}

export function getErrorKind(error: unknown): ApiErrorKind | null {
  return error instanceof ApiRequestError ? error.kind : null;
}

export function isGitHubAccessKind(kind: ApiErrorKind | null | undefined): kind is GitHubAccessKind {
  return (
    kind === 'github_disconnected' || kind === 'github_not_installed' || kind === 'github_unavailable'
  );
}

export function isGitHubAccessError(error: unknown): error is ApiRequestError & { kind: GitHubAccessKind } {
  return isGitHubAccessKind(getErrorKind(error));
}

/** A 4xx will not change by retrying it; 408 and 429 are the exceptions. */
export function isNonRetryableClientError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  const { status } = error;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
