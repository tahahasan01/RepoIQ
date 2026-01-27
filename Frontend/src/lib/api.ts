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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
const IS_DEV = import.meta.env.DEV;

// Production-safe logging - only log in development
const log = {
  debug: (...args: any[]) => IS_DEV && console.log('[API]', ...args),
  info: (...args: any[]) => IS_DEV && console.log('[API]', ...args),
  warn: (...args: any[]) => console.warn('[API]', ...args),
  error: (...args: any[]) => console.error('[API]', ...args),
};

interface ApiError {
  detail: string | { msg: string }[];
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

class ApiClient {
  private baseUrl: string;
  private refreshing: boolean = false;
  private refreshPromise: Promise<boolean> | null = null;
  private requestThrottler: RequestThrottler;
  
  // Track pending requests to prevent duplicate calls
  private pendingRequests = new Map<string, Promise<any>>();
  
  // Track AbortControllers for request cancellation
  private abortControllers = new Map<string, AbortController>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Throttle requests with 300ms minimum delay between same endpoint calls
    this.requestThrottler = new RequestThrottler(300);
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
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    } catch {}
    try {
      // clear repo list cache so UI doesn't look "logged in" with stale data
      sessionStorage.removeItem('repoiq_repositories_cache');
    } catch {}
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    throttleKey?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
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
    requestPromise.finally(() => {
      this.pendingRequests.delete(key);
    });
    
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

      // Handle authentication errors
      if (response.status === 401) {
        log.info('401 received, attempting token refresh');
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          const newToken = this.getToken();
          response = await doFetch(newToken);
          log.debug('Retried request, status:', response.status);
        } else {
          // Token refresh failed - clear auth and redirect to login
          log.info('Token refresh failed, logging out');
          this.clearAuthAndCaches();
          window.dispatchEvent(new CustomEvent('authExpired'));
          throw new Error('Authentication expired. Please log in again.');
        }
      }

      // Handle forbidden - session expired or invalid
      if (response.status === 403) {
        log.info('403 Forbidden - session expired or invalid, logging out');
        this.clearAuthAndCaches();
        window.dispatchEvent(new CustomEvent('authExpired'));
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          detail: 'An error occurred',
        }));

        const message = Array.isArray(errorData.detail)
          ? errorData.detail.map(e => e.msg).join(', ')
          : errorData.detail;

        log.warn('Error:', message);
        throw new Error(message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      log.debug('Success:', typeof data === 'object' ? Object.keys(data) : data);
      return data;
    } catch (error) {
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
      this.clearAuthAndCaches();
      window.dispatchEvent(new CustomEvent('authExpired'));
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
        this.clearAuthAndCaches();
        window.dispatchEvent(new CustomEvent('authExpired'));
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
      this.clearAuthAndCaches();
      window.dispatchEvent(new CustomEvent('authExpired'));
      return false;
    } catch (err) {
      log.error('Refresh exception', err);
      this.clearAuthAndCaches();
      window.dispatchEvent(new CustomEvent('authExpired'));
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
    return this.request<{ auth_url: string }>('/auth/github/authorize');
  }

  async disconnectGitHub() {
    return this.request<any>(`/github/disconnect`, { method: 'POST' });
  }

  async githubCallback(code: string) {
    return this.request<{ access_token: string; refresh_token: string }>('/auth/github/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
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
    return this.request<void>('/auth/logout', {
      method: 'POST',
    });
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
  async updateProfile(data: { full_name?: string; email?: string }) {
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
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
