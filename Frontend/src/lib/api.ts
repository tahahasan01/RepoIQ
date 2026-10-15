/**
 * API client for backend communication with caching support.
 * 
 * Caching Strategy:
 * - Backend sends Cache-Control headers with appropriate TTLs
 * - Browser automatically respects cache headers for repeat requests
 * - SessionStorage used for instant page loads (separate from HTTP cache)
 * - Redis on backend provides shared cache across all users and workers
 * 
 * Performance Features:
 * - Automatic token refresh on 401
 * - Request timeout protection (10s)
 * - Cache-aware error handling
 * - Request throttling to prevent excessive API calls
 * - AbortController for request cancellation
 * - Production-optimized logging
 */
import { RequestThrottler } from '@/utils/throttle';
import { clearQueryCache, clearAllQueryCaches } from '@/lib/queryPersister';
import {
  ApiRequestError,
  SESSION_EXPIRED_MESSAGE,
  errorFromResponse,
} from '@/lib/apiErrors';

const IS_DEV = import.meta.env.DEV;

/**
 * The localhost default is a development convenience only.
 *
 * A production build with VITE_API_BASE_URL unset used to fall back to
 * localhost silently: the deployed site would load, then every request would
 * fail against the visitor's own machine. Failing the build-time assumption
 * loudly here turns a confusing outage into an obvious misconfiguration.
 */
const resolveApiBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured;
  if (!IS_DEV) {
    throw new Error(
      'VITE_API_BASE_URL is not set. A production build must be given the API URL at build time.'
    );
  }
  return 'http://localhost:8000/api/v1';
};

const API_BASE_URL = resolveApiBaseUrl();

// Token refresh configuration
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // Refresh if < 5 min remaining
const TOKEN_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

// Production-safe logging - only log in development
const log = {
  debug: (...args: any[]) => IS_DEV && console.log('[API]', ...args),
  info: (...args: any[]) => IS_DEV && console.log('[API]', ...args),
  warn: (...args: any[]) => console.warn('[API]', ...args),
  error: (...args: any[]) => console.error('[API]', ...args),
};

/**
 * Decode JWT token payload without verification (client-side only)
 */
function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get token expiration time in milliseconds
 */
function getTokenExpirationMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return null;
  return payload.exp * 1000; // Convert seconds to ms
}

/**
 * Check if token is about to expire (within threshold)
 */
function isTokenExpiringSoon(token: string, thresholdMs: number = TOKEN_REFRESH_THRESHOLD_MS): boolean {
  const expMs = getTokenExpirationMs(token);
  if (!expMs) return true; // If we can't decode, assume expired
  const remainingMs = expMs - Date.now();
  return remainingMs < thresholdMs;
}

/**
 * Get remaining time until token expires
 */
function getTokenRemainingMs(token: string): number {
  const expMs = getTokenExpirationMs(token);
  if (!expMs) return 0;
  return Math.max(0, expMs - Date.now());
}

/**
 * Check if an error is a CORS error
 */
function isCorsError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  const errorString = errorMessage.toLowerCase();
  
  // Check for CORS-related error messages
  return (
    errorString.includes('cors') ||
    errorString.includes('access-control-allow-origin') ||
    errorString.includes('blocked by cors policy') ||
    (errorString.includes('failed to fetch') && 
     errorString.includes('networkerror') || 
     error.name === 'TypeError')
  );
}

/**
 * Check if an error is a network error (no connection, timeout, etc.)
 */
function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  const errorString = errorMessage.toLowerCase();
  
  return (
    errorString.includes('failed to fetch') ||
    errorString.includes('networkerror') ||
    errorString.includes('network request failed') ||
    errorString.includes('err_network') ||
    error.name === 'TypeError' && errorMessage.includes('fetch')
  );
}

export interface TeamAnalysisSummary {
  id: string;
  overall_score: number | null;
  security_score: number | null;
  quality_score: number | null;
  architecture_score: number | null;
  documentation_score: number | null;
  total_issues: number;
  critical_issues: number;
  high_issues: number;
  files_analyzed: number | null;
  files_eligible: number | null;
  completed_at: string | null;
}

export interface TeamSummary {
  team: { id: string; name: string; organization_id: string; manager_id?: string | null; description?: string | null };
  period_days: number;
  metrics: {
    total_repositories: number;
    overall_score: number;
    total_issues: number;
    critical_issues: number;
    team_size: number;
    velocity: number;
  };
  trends: { date: string; average_score: number; average_issues: number }[];
  repositories: {
    id: string;
    name: string;
    full_name: string;
    language: string | null;
    is_private: boolean | null;
    owner_id: string;
    latest_analysis: TeamAnalysisSummary | null;
  }[];
  members: {
    user_id: string;
    role: string;
    joined_at: string | null;
    user: { id: string; full_name: string | null; avatar_url: string | null; github_username: string | null } | null;
    total_commits: number;
    total_lines_added: number;
    total_lines_removed: number;
    total_issues_introduced: number;
    issues_per_100_commits: number | null;
    repositories: number;
  }[];
}

class ApiClient {
  private baseUrl: string;
  private refreshing: boolean = false;
  private refreshPromise: Promise<boolean> | null = null;
  private requestThrottler: RequestThrottler;
  
  // Track pending requests to prevent duplicate calls
  private pendingRequests = new Map<string, Promise<any>>();
  
  // Track AbortControllers for request cancellation
  private abortControllers = new Map<string, AbortController>();
  
  // Background token refresh interval
  private tokenCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Throttle requests with 300ms minimum delay between same endpoint calls
    this.requestThrottler = new RequestThrottler(300);
    
    // Start background token refresh check
    this.startTokenRefreshCheck();
  }
  
  /**
   * Start background interval to check and refresh tokens proactively
   */
  private startTokenRefreshCheck(): void {
    // Clear existing interval if any
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
    }
    
    // Check token every minute
    this.tokenCheckInterval = setInterval(() => {
      this.proactiveTokenRefresh();
    }, TOKEN_CHECK_INTERVAL_MS);
    
    // Also check immediately on startup
    setTimeout(() => this.proactiveTokenRefresh(), 1000);
  }
  
  /**
   * Proactively refresh token if it's about to expire
   */
  private async proactiveTokenRefresh(): Promise<void> {
    const token = this.getToken();
    if (!token) return; // Not logged in
    
    if (isTokenExpiringSoon(token)) {
      const remainingMs = getTokenRemainingMs(token);
      const remainingMin = Math.round(remainingMs / 60000);
      log.info(`Token expiring in ${remainingMin}min, proactively refreshing...`);
      
      const success = await this.tryRefreshToken();
      if (success) {
        log.info('Proactive token refresh successful');
      } else {
        log.warn('Proactive token refresh failed');
        // Don't clear auth yet - let the next request handle it
      }
    }
  }
  
  /**
   * Ensure token is fresh before making a request
   * Returns true if token is valid (or was refreshed), false if auth failed
   */
  private async ensureTokenFresh(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return true; // No token = public request
    
    // Check if token is expiring very soon (< 30 seconds)
    // If so, refresh before making the request
    if (isTokenExpiringSoon(token, 30 * 1000)) {
      log.info('Token expiring very soon, refreshing before request...');
      return await this.tryRefreshToken();
    }
    
    return true;
  }
  
  /**
   * Cancel a pending request by its key
   */
  cancelRequest(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
      this.pendingRequests.delete(key);
      log.debug('Cancelled request:', key);
    }
  }
  
  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach((controller, key) => {
      controller.abort();
      log.debug('Cancelled request:', key);
    });
    this.abortControllers.clear();
    this.pendingRequests.clear();
  }

  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  private clearAuthAndCaches() {
    // Read the user id BEFORE clearing the token - the persisted query cache is
    // keyed by it, and without it we would clear the anonymous bucket and leave
    // the real one behind.
    let userId: string | undefined;
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload?.sub || payload?.user_id || payload?.id;
      }
    } catch {}

    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('access_token'); // Also clear access_token if stored separately
    } catch {}
    try {
      // Every per-session cache the app keeps in sessionStorage is prefixed
      // repoiq_: the repository list (one key per page), batch scores, and the
      // per-repository issue and analysis caches. Only the bare list key used to
      // be removed, so the next person to sign in on this tab could be shown the
      // previous user's repositories from the page caches.
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('repoiq_'))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {}
    try {
      // This used to be `require('@/lib/queryPersister')`, which does not exist
      // in an ESM bundle - it threw on every call and was swallowed by the catch,
      // so the persisted React Query cache was NEVER cleared on logout. It holds
      // repository and analysis data and survives 24 hours, so on a shared
      // browser the next user could restore the previous user's data.
      clearQueryCache(userId);
      clearAllQueryCaches();
    } catch {}
  }

  /** Drop the local session and tell the app to route to the login page. */
  private expireSession() {
    this.clearAuthAndCaches();
    window.dispatchEvent(new CustomEvent('authExpired'));
  }

  /**
   * Forget the session on this device without contacting the server. Used
   * after the account has been deleted, when there is nothing left to revoke;
   * everywhere else, sign out through signOut() so the session is revoked.
   */
  clearLocalSession() {
    this.clearAuthAndCaches();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    throttleKey?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Proactively refresh token if expiring very soon (non-blocking for most requests)
    // Skip for auth endpoints to avoid infinite loops
    if (!endpoint.includes('/auth/')) {
      await this.ensureTokenFresh();
    }
    
    let token = this.getToken();
    
    // Don't throttle critical endpoints that need fresh data
    // BUT still deduplicate them to prevent multiple simultaneous requests
    const criticalEndpoints = ['/results', '/issues'];
    const isCritical = criticalEndpoints.some(path => endpoint.includes(path));
    
    // Use throttling for GET requests (read operations) but NOT for critical endpoints
    const shouldThrottle = !isCritical && (options.method === 'GET' || !options.method);
    const key = throttleKey || endpoint;
    
    // ALWAYS deduplicate requests (even critical ones) to prevent rate limit issues
    if (this.pendingRequests.has(key)) {
      // Return existing pending request instead of making a new one
      log.debug('♻️ Deduplicating request for:', endpoint);
      return this.pendingRequests.get(key) as Promise<T>;
    }
    
    const makeRequest = async (): Promise<T> => {
      return this._doRequest<T>(endpoint, options, token);
    };
    
    let requestPromise: Promise<T>;
    
    if (shouldThrottle) {
      requestPromise = this.requestThrottler.throttle(key, makeRequest);
    } else {
      requestPromise = makeRequest();
    }
    
    // Track pending request for ALL requests (for deduplication)
    this.pendingRequests.set(key, requestPromise);
    // Not `.finally()`: that returns a second promise which rejects along with
    // the request and has no handler, so every failed request also raised an
    // unhandled rejection ("Uncaught (in promise)") on top of the error the
    // caller handles.
    const forget = () => {
      this.pendingRequests.delete(key);
    };
    requestPromise.then(forget, forget);
    
    return requestPromise;
  }
  
  private async _doRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    token: string | null = null
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    if (!token) token = this.getToken();

    const makeHeaders = () => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        log.debug('Request with token:', token.substring(0, 20) + '...');
      } else {
        log.debug('Request without token');
      }
      return headers;
    };

    log.debug('Fetching:', url);

    const doFetch = async (currentToken: string | null = token) => {
      const headers = makeHeaders();
      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }
      return fetch(url, {
        ...options,
        headers,
      });
    };

    try {
      let response = await doFetch();
      log.debug('Response status:', response.status);

      // 401 is the backend's "this session is not valid" (expired, revoked, or
      // the user no longer exists). Try one refresh; if that fails, or the
      // refreshed token is rejected too, the session is over.
      if (response.status === 401) {
        log.info('401 received, attempting token refresh');
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          response = await doFetch(this.getToken());
          log.debug('Retried request, status:', response.status);
        }
        if (!refreshed || response.status === 401) {
          log.info('Session is no longer valid, logging out');
          this.expireSession();
          throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401, 'session_expired');
        }
      }

      if (!response.ok) {
        const errorData: { detail?: unknown } = await response.json().catch(() => ({
          detail: 'An error occurred',
        }));

        // `detail` can be a string, FastAPI's validation array, or a structured
        // object (e.g. the 409 that tells the client to send the user to the
        // GitHub App install page). The error keeps it untouched alongside the
        // status and a classified `kind`, so callers can branch on it.
        //
        // 403 is NOT treated as an expired session. Every 403 used to clear the
        // session and fire authExpired, so a disconnected GitHub account, an
        // uninstalled GitHub App or a click on a blocked file type logged the
        // user out of RepoIQ. Only a 403 caused by missing credentials (FastAPI's
        // "Not authenticated") still ends the session - see lib/apiErrors.ts.
        const error = errorFromResponse(response.status, errorData.detail);
        log.warn('Error:', response.status, error.kind, error.message);

        if (error.kind === 'session_expired') {
          this.expireSession();
        }
        throw error;
      }

      const data = await response.json();
      log.debug('Success:', typeof data === 'object' ? Object.keys(data) : data);
      return data;
    } catch (error) {
      // An HTTP error response is already classified; the CORS/network
      // heuristics below must not reinterpret it.
      if (error instanceof ApiRequestError) {
        throw error;
      }

      // Handle AbortError silently (user cancelled request)
      if (error instanceof DOMException && error.name === 'AbortError') {
        log.debug('Request aborted');
        throw error;
      }
      
      log.debug('Exception:', error);
      
      // Detect and enhance CORS errors
      if (isCorsError(error)) {
        const corsError = new Error(
          'CORS Error: Backend is not allowing requests from this origin. ' +
          'Please check backend CORS configuration to include: ' + window.location.origin
        );
        (corsError as any).isCorsError = true;
        (corsError as any).originalError = error;
        log.error('CORS Error detected:', corsError.message);
        throw corsError;
      }
      
      // Detect and enhance network errors
      if (isNetworkError(error)) {
        const networkError = new Error(
          'Network Error: Unable to reach the backend server. ' +
          'Please ensure the backend is running on ' + this.baseUrl
        );
        (networkError as any).isNetworkError = true;
        (networkError as any).originalError = error;
        log.error('Network Error detected:', networkError.message);
        throw networkError;
      }
      
      // Preserve original error if it's an Error instance
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('Network error');
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    // If already refreshing, wait for that attempt
    if (this.refreshing && this.refreshPromise) {
      log.debug('Refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    this.refreshing = true;
    this.refreshPromise = this._doRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshing = false;
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      log.info('No refresh token available');
      this.expireSession();
      return false;
    }

    try {
      const resp = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!resp.ok) {
        log.info('Refresh failed, status:', resp.status);
        this.expireSession();
        return false;
      }

      const data = await resp.json();
      if (data.access_token) {
        localStorage.setItem('token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token);
        }
        log.info('Token refreshed successfully');
        return true;
      }
      
      log.warn('Refresh response missing access_token');
      this.expireSession();
      return false;
    } catch (err) {
      log.error('Refresh exception', err);
      this.expireSession();
      return false;
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{ access_token: string; refresh_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signup(email: string, password: string, full_name: string) {
    return this.request<{ access_token: string; refresh_token: string; user: any }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    });
  }

  async getCurrentUser() {
    return this.request<any>('/auth/me');
  }

  async getGitHubAuthUrl() {
    // In GitHub App mode `auth_url` signs the user in and `install_url` opens
    // the app's install/configure page, where repository access is chosen.
    // OAuth mode has only `auth_url`.
    return this.request<{
      auth_url: string;
      install_url?: string;
      state?: string;
      mode?: 'app' | 'oauth';
    }>('/auth/github/authorize');
  }

  async disconnectGitHub() {
    return this.request<any>(`/github/disconnect`, { method: 'POST' });
  }

  async githubCallback(
    code: string,
    state?: string | null,
    installationId?: string | null
  ) {
    // `state` is the CSRF nonce issued by /auth/github/authorize and echoed back
    // by GitHub. The backend burns it on first use.
    //
    // `installation_id` is only present in GitHub App mode, on the callback
    // after a fresh install. The backend needs it to record which installation
    // belongs to this user; without it, login succeeds but every repository
    // call then fails because there is no installation to mint a token from.
    const body: Record<string, string> = { code };
    if (state) body.state = state;
    if (installationId) body.installation_id = installationId;

    return this.request<{ access_token: string; refresh_token: string; user?: any }>(
      '/auth/github/callback',
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  // Repository endpoints
  async syncRepositories() {
    return this.request<any[]>('/github/sync', {
      method: 'POST',
    });
  }

  async getRepositories(page = 1, per_page = 30) {
    return this.request<any[]>(`/github/repositories?page=${page}&per_page=${per_page}`);
  }

  async getRepository(repoId: string) {
    return this.request<any>(`/github/repositories/${repoId}`);
  }

  // Analysis endpoints
  async startAnalysis(repoId: string) {
    return this.request<{ analysis_id: string; status: string; message: string }>(
      `/analysis/repositories/${repoId}/analyze`,
      { method: 'POST' }
    );
  }

  async cancelAnalysis(analysisId: string) {
    return this.request<{ message: string }>(
      `/analysis/${analysisId}/cancel`,
      { method: 'POST' }
    );
  }

  async getAnalysisResults(repoId: string) {
    // Use repoId in throttle key for proper deduplication
    return this.request<any>(
      `/analysis/repositories/${repoId}/results`,
      {},
      `analysis_results_${repoId}` // Deduplication key
    );
  }

  async getBatchAnalysisResults() {
    return this.request<{ results: Record<string, any> }>(`/analysis/batch/results`);
  }

  async getAnalysisHistory(repoId: string, forceRefresh: boolean = false) {
    const params = forceRefresh ? '?refresh=true' : '';
    // Use repoId in throttle key for proper deduplication (unless force refresh)
    const throttleKey = forceRefresh ? undefined : `analysis_history_${repoId}`;
    return this.request<any>(
      `/analysis/repositories/${repoId}/history${params}`,
      {},
      throttleKey
    );
  }

  async getAnalysisById(analysisId: string) {
    return this.request<any>(`/analysis/${analysisId}`);
  }

  async getIssues(analysisId: string) {
    return this.request<any[]>(`/analysis/${analysisId}/issues`);
  }

  async getIssuesByAnalysisId(analysisId: string) {
    return this.request<any[]>(`/analysis/${analysisId}/issues`);
  }

  async getRepositoryFiles(repoId: string) {
    // Use repoId in throttle key for proper deduplication
    return this.request<any>(
      `/github/repositories/${repoId}/files`,
      {},
      `repo_files_${repoId}`
    );
  }

  async getFileContent(repoId: string, filePath: string) {
    return this.request<any>(`/github/repositories/${repoId}/files/content?file_path=${encodeURIComponent(filePath)}`);
  }

  async autoFixIssues(repoId: string, issueIds: string[]) {
    return this.request<{ message: string; issue_count: number }>(
      `/analysis/repositories/${repoId}/fix`,
      {
        method: 'POST',
        body: JSON.stringify({ issue_ids: issueIds }),
      }
    );
  }

  async getImprovementRoadmap(repoId: string) {
    return this.request<any>(`/analysis/repositories/${repoId}/roadmap`);
  }

  async getArchitectureDiagram(repoId: string) {
    return this.request<{
      repository_id: string;
      repository_name: string;
      diagram: string;
      file_count: number;
    }>(`/analysis/repositories/${repoId}/architecture`);
  }

  async refresh(refreshToken: string) {
    return this.request<{ access_token: string; refresh_token: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async logout() {
    try {
      await this.request<void>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      // Always clear cache even if logout request fails
      this.clearAuthAndCaches();
    }
  }

  // Chat endpoints (repo-based)
  async sendChatMessage(repoId: string, message: string) {
    return this.request<any>(`/chat/repositories/${repoId}/message`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getChatHistory(repoId: string) {
    return this.request<any[]>(`/chat/repositories/${repoId}/history`);
  }

  async clearChatHistory(repoId: string) {
    return this.request<void>(`/chat/repositories/${repoId}/history`, {
      method: 'DELETE',
    });
  }

  // User management endpoints
  // PUT /users/me accepts only these fields. Email is not editable; it used to
  // be sent anyway and silently dropped by the backend.
  async updateProfile(data: { full_name?: string; bio?: string; avatar_url?: string }) {
    return this.request<any>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updatePassword(currentPassword: string, newPassword: string) {
    return this.request<void>('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}/users/me/avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload avatar');
    }

    return response.json();
  }

  async deleteAccount() {
    return this.request<void>('/users/me', {
      method: 'DELETE',
    });
  }

  // Organization endpoints
  // Organizations are free-plan only; the backend ignores any plan_type.
  async createOrganization(name: string) {
    return this.request<any>('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async listOrganizations() {
    return this.request<any[]>('/organizations');
  }

  async getOrganization(orgId: string) {
    return this.request<any>(`/organizations/${orgId}`);
  }

  async updateOrganization(orgId: string, data: { name?: string }) {
    return this.request<any>(`/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteOrganization(orgId: string) {
    return this.request<void>(`/organizations/${orgId}`, {
      method: 'DELETE',
    });
  }

  async getOrganizationRepositories(orgId: string) {
    return this.request<any[]>(`/organizations/${orgId}/repositories`);
  }

  // Team endpoints
  async createTeam(organizationId: string, name: string, managerId?: string, description?: string) {
    return this.request<any>('/teams', {
      method: 'POST',
      body: JSON.stringify({ organization_id: organizationId, name, manager_id: managerId, description }),
    });
  }

  async listOrganizationTeams(orgId: string) {
    return this.request<any[]>(`/teams/organization/${orgId}`);
  }

  async getTeam(teamId: string) {
    return this.request<any>(`/teams/${teamId}`);
  }

  async deleteTeam(teamId: string) {
    return this.request<void>(`/teams/${teamId}`, {
      method: 'DELETE',
    });
  }

  async addTeamMember(teamId: string, userId: string, role: string = 'member') {
    return this.request<any>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    });
  }

  async removeTeamMember(teamId: string, userId: string) {
    return this.request<void>(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async getTeamMembers(teamId: string) {
    return this.request<any[]>(`/teams/${teamId}/members`);
  }

  async assignRepositoryToTeam(teamId: string, repoId: string) {
    return this.request<any>(`/teams/${teamId}/repositories/${repoId}`, {
      method: 'POST',
    });
  }

  async unassignRepositoryFromTeam(teamId: string, repoId: string) {
    return this.request<void>(`/teams/${teamId}/repositories/${repoId}`, {
      method: 'DELETE',
    });
  }

  /** Team page data: metrics, trends, repositories with latest scores, member totals. */
  async getTeamSummary(teamId: string, periodDays = 30) {
    return this.request<TeamSummary>(`/teams/${teamId}/summary?period_days=${periodDays}`);
  }

  async getTeamRepositories(teamId: string) {
    return this.request<any[]>(`/teams/${teamId}/repositories`);
  }

  // Developer endpoints
  async getDeveloperPerformance(userId: string, repositoryId?: string, periodDays: number = 30) {
    const params = new URLSearchParams({ period_days: periodDays.toString() });
    if (repositoryId) params.append('repository_id', repositoryId);
    return this.request<any>(`/developers/performance/${userId}?${params}`);
  }

  async getOrganizationDevelopers(orgId: string, periodDays: number = 30) {
    return this.request<any[]>(`/developers/organization/${orgId}?period_days=${periodDays}`);
  }

  async getRepositoryContributors(repoId: string) {
    return this.request<any[]>(`/developers/repositories/${repoId}/contributors`);
  }

  async trackRepositoryContributions(repoId: string) {
    return this.request<any>(`/developers/repositories/${repoId}/track-contributions`, {
      method: 'POST',
    });
  }

  async getRepositoryOwnership(repoId: string) {
    return this.request<Record<string, any[]>>(`/developers/repositories/${repoId}/ownership`);
  }

  async getOwnershipHealth(repoId: string) {
    return this.request<any>(`/developers/repositories/${repoId}/ownership/health`);
  }

  async getIssueBlame(issueId: string) {
    return this.request<any[]>(`/developers/issues/${issueId}/blame`);
  }

  async getOrphanedCode(repoId: string, daysThreshold: number = 90) {
    return this.request<any[]>(`/developers/repositories/${repoId}/orphaned-code?days_threshold=${daysThreshold}`);
  }

  async analyzeCodeOwnership(repoId: string) {
    return this.request<any>(`/developers/repositories/${repoId}/analyze-ownership`, {
      method: 'POST',
    });
  }

  // Executive Dashboard endpoints
  async getOrganizationOverview(orgId: string) {
    return this.request<any>(`/executive/organizations/${orgId}/overview`);
  }

  async getBusinessRiskScore(orgId: string) {
    return this.request<any>(`/executive/organizations/${orgId}/risk-score`);
  }

  async getTopRiskAreas(orgId: string, limit: number = 10) {
    return this.request<any[]>(`/executive/organizations/${orgId}/risk-areas?limit=${limit}`);
  }

  async getComplianceStatus(orgId: string) {
    return this.request<any>(`/executive/organizations/${orgId}/compliance`);
  }

  async compareTeams(orgId: string, teamIds?: string[]) {
    // Repeated parameters (team_ids=a&team_ids=b) are how FastAPI reads a
    // List[str] query parameter, and work with backends that also accept a
    // comma-joined value. A comma-joined value alone arrived as one bogus id.
    const params = new URLSearchParams();
    (teamIds ?? []).forEach((id) => params.append('team_ids', id));
    const query = params.toString();
    return this.request<any[]>(
      `/executive/organizations/${orgId}/teams/compare${query ? `?${query}` : ''}`
    );
  }

  async getTeamLeaderboard(orgId: string, metric: string = 'overall_score') {
    return this.request<any[]>(`/executive/organizations/${orgId}/teams/leaderboard?metric=${metric}`);
  }

  async getTeamHealthTrends(teamId: string, days: number = 30) {
    return this.request<any[]>(`/executive/teams/${teamId}/trends?days=${days}`);
  }

  // ---------------------------------------------------------------------------
  // Alerts, notification settings, team invitations and webhooks.
  // Shapes are documented in Backend/app/api/routes/{alerts,users,teams,webhooks}.py.
  // ---------------------------------------------------------------------------

  async getOrganizationAlerts(orgId: string, days: number = 7, includeAcknowledged: boolean = true) {
    const params = new URLSearchParams({
      days: String(days),
      include_acknowledged: String(includeAcknowledged),
    });
    return this.request<Alert[]>(`/alerts/organizations/${orgId}?${params}`);
  }

  async checkAlerts(orgId: string) {
    return this.request<AlertCheckResult>(`/alerts/organizations/${orgId}/check`, {
      method: 'POST',
    });
  }

  async acknowledgeAlert(alertId: string) {
    return this.request<Alert>(`/alerts/${alertId}/acknowledge`, { method: 'POST' });
  }

  async getNotificationSettings() {
    return this.request<NotificationSettings>('/users/me/settings');
  }

  async updateNotificationSettings(changes: NotificationSettingsUpdate) {
    const body = JSON.stringify(changes);
    // Requests are de-duplicated by key, and the default key is the endpoint:
    // a second change sent while the first is in flight would be handed the
    // first one's response and never reach the server. Keying by body keeps
    // distinct changes distinct.
    return this.request<NotificationSettings>(
      '/users/me/settings',
      { method: 'PUT', body },
      `PUT /users/me/settings ${body}`
    );
  }

  async getMyInvitations() {
    return this.request<TeamInvitation[]>('/teams/invitations');
  }

  async acceptInvitation(invitationId: string) {
    return this.request<{
      invitation: TeamInvitation;
      membership: { team_id: string; user_id: string; role: TeamRole };
    }>(`/teams/invitations/${invitationId}/accept`, { method: 'POST' });
  }

  async declineInvitation(invitationId: string) {
    return this.request<{ invitation: TeamInvitation }>(
      `/teams/invitations/${invitationId}/decline`,
      { method: 'POST' }
    );
  }

  async getTeamInvitations(teamId: string) {
    return this.request<TeamInvitation[]>(`/teams/${teamId}/invitations`);
  }

  async revokeInvitation(teamId: string, invitationId: string) {
    return this.request<{ invitation: TeamInvitation }>(
      `/teams/${teamId}/invitations/${invitationId}`,
      { method: 'DELETE' }
    );
  }

  // The webhook collection routes are declared as "/" under the /webhooks
  // prefix, so they are addressed with the trailing slash (no redirect hop).
  async listWebhooks() {
    return this.request<{ webhooks: Webhook[] }>('/webhooks/');
  }

  async createWebhook(data: { url: string; events: string[]; secret: string }) {
    // Own de-duplication key: the default (the endpoint) is shared with the
    // list GET, and a create sent while a list is in flight would be handed
    // the list's response instead of being sent.
    return this.request<Webhook & { message: string }>(
      '/webhooks/',
      { method: 'POST', body: JSON.stringify(data) },
      `POST /webhooks/ ${data.url}`
    );
  }

  async deleteWebhook(webhookId: string) {
    return this.request<{ message: string }>(`/webhooks/${webhookId}`, { method: 'DELETE' });
  }

  async testWebhook(webhookId: string) {
    return this.request<{ message: string }>(`/webhooks/${webhookId}/test`, { method: 'POST' });
  }

  async getWebhookDeliveries(webhookId: string, limit: number = 20, offset: number = 0) {
    return this.request<WebhookDeliveryPage>(
      `/webhooks/${webhookId}/deliveries?limit=${limit}&offset=${offset}`
    );
  }
}

export type AlertSeverity = 'critical' | 'high' | 'medium';
export type AlertType = 'critical_issues' | 'security_vulnerability' | 'quality_threshold';

export interface Alert {
  id: string;
  organization_id: string;
  repository_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: {
    repository_name?: string;
    repository_full_name?: string;
    analysis_id?: string;
    analysis_completed_at?: string;
    [key: string]: unknown;
  };
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export interface AlertCheckResult {
  success: boolean;
  organization_id: string;
  alerts_found: number;
  alerts_created: number;
  alerts: Alert[];
}

export interface NotificationSettings {
  email_notifications: boolean;
  security_alerts: boolean;
  weekly_digest: boolean;
  /** 0-100. */
  alert_score_threshold: number;
  auto_analyze_new_repos: boolean;
  /** null until the user first saves. */
  updated_at: string | null;
}

export type NotificationSettingsUpdate = Partial<Omit<NotificationSettings, 'updated_at'>>;

export type TeamRole = 'member' | 'lead' | 'manager';

export interface InvitationPerson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  invited_user_id: string;
  invited_by: string | null;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
  responded_at: string | null;
  team: { id: string; name: string; organization_id: string } | null;
  organization: { id: string; name: string } | null;
  invitee: InvitationPerson | null;
  inviter: InvitationPerson | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export type WebhookDeliveryStatus = 'success' | 'retrying' | 'failed' | 'blocked';

export interface WebhookDelivery {
  id: string;
  delivery_id: string | null;
  event_type: string;
  status: WebhookDeliveryStatus;
  /** 0 when no HTTP response was received. */
  response_code: number;
  attempt: number;
  error: string | null;
  delivered_at: string;
}

export interface WebhookDeliveryPage {
  webhook_id: string;
  deliveries: WebhookDelivery[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;

export interface SignOutOptions {
  /**
   * Revoke the session server-side first (the default). Pass false only when
   * there is nothing left to revoke, e.g. right after deleting the account.
   */
  revokeSession?: boolean;
  /** Where to send the browser afterwards. */
  redirectTo?: string;
  /** Navigation hook, for tests. Defaults to a full page load. */
  navigate?: (url: string) => void;
}

/**
 * The one way to sign out.
 *
 * Only the Settings page used to call POST /auth/logout; the account menu, the
 * navbar and the account settings page just deleted the tokens from
 * localStorage, so the session stayed valid server-side until it expired.
 *
 * Ends with a full page load rather than a router navigation: in-memory state
 * (the React Query cache, the zustand stores) would otherwise survive the
 * sign-out, and the query persister would write it back to localStorage on its
 * next tick.
 */
export async function signOut(options: SignOutOptions = {}): Promise<void> {
  const {
    revokeSession = true,
    redirectTo = '/login',
    navigate = (url: string) => window.location.assign(url),
  } = options;

  let revocationFailed = false;
  if (revokeSession) {
    try {
      // logout() clears the local session whether or not the request succeeds.
      await apiClient.logout();
    } catch (err) {
      // A dead session has nothing left to revoke. Anything else (a 503 from
      // the revocation store, the network) means the tokens may stay valid
      // until they expire, and the user is told so rather than told nothing.
      revocationFailed = !(err instanceof ApiRequestError && err.kind === 'session_expired');
      log.warn('Server-side logout failed:', err);
    }
  } else {
    apiClient.clearLocalSession();
  }

  if (revocationFailed) {
    const separator = redirectTo.includes('?') ? '&' : '?';
    navigate(`${redirectTo}${separator}error=logout_incomplete`);
  } else {
    navigate(redirectTo);
  }
}
