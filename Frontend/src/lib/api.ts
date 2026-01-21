// API client for backend communication
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

interface ApiError {
  detail: string | { msg: string }[];
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let token = this.getToken();

    const makeHeaders = () => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[API] Request with token:', token.substring(0, 20) + '...');
      } else {
        console.log('[API] Request without token');
      }
      return headers;
    };

    console.log('[API] Fetching:', url);

    const doFetch = async () => {
      return fetch(url, {
        ...options,
        headers: makeHeaders(),
      });
    };

    try {
      let response = await doFetch();
      console.log('[API] Response status:', response.status);

      // If unauthorized, try refresh once
      if (response.status === 401) {
        console.log('[API] 401 received, attempting token refresh');
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          token = this.getToken();
          response = await doFetch();
          console.log('[API] Retried request, status:', response.status);
        } else {
          // notify app to route user back to login
          try {
            window.dispatchEvent(new CustomEvent('authExpired'));
          } catch {}
        }
      }

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          detail: 'An error occurred',
        }));

        const message = Array.isArray(errorData.detail)
          ? errorData.detail.map(e => e.msg).join(', ')
          : errorData.detail;

        console.log('[API] Error:', message);
        throw new Error(message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[API] Success:', data);
      return data;
    } catch (error) {
      console.log('[API] Exception:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error');
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      console.log('[API] No refresh token available');
      this.clearAuthAndCaches();
      return false;
    }

    try {
      const resp = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!resp.ok) {
        console.log('[API] Refresh failed, status:', resp.status);
        // clear tokens + caches
        this.clearAuthAndCaches();
        return false;
      }

      const data = await resp.json();
      if (data.access_token) {
        localStorage.setItem('token', data.access_token);
      }
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      console.log('[API] Token refreshed');
      return true;
    } catch (err) {
      console.error('[API] Refresh exception', err);
      this.clearAuthAndCaches();
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

  async getAnalysisResults(repoId: string) {
    return this.request<any>(`/analysis/repositories/${repoId}/results`);
  }

  async getAnalysisHistory(repoId: string) {
    return this.request<any>(`/analysis/repositories/${repoId}/history`);
  }

  async getIssues(analysisId: string) {
    return this.request<any[]>(`/analysis/${analysisId}/issues`);
  }

  async getRepositoryFiles(repoId: string) {
    return this.request<any>(`/github/repositories/${repoId}/files`);
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
