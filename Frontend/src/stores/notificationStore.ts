import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'analysis_complete';
  title: string;
  message: string;
  repoId?: string;
  repoName?: string;
  analysisId?: string;
  timestamp: number;
  read: boolean;
  onClick?: () => void;
}

export interface BackgroundAnalysis {
  repoId: string;
  repoName: string;
  analysisId: string;
  startedAt: number;
  status: 'in_progress' | 'completed' | 'failed' | 'prefetching';
  elapsedSeconds?: number;
}

interface NotificationState {
  notifications: Notification[];
  backgroundAnalyses: Map<string, BackgroundAnalysis>;
  unreadCount: number;
  
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  
  // Background analysis tracking
  startBackgroundAnalysis: (repoId: string, repoName: string, analysisId: string) => void;
  updateBackgroundAnalysis: (repoId: string, status: BackgroundAnalysis['status'], elapsedSeconds?: number) => void;
  removeBackgroundAnalysis: (repoId: string) => void;
  getBackgroundAnalysis: (repoId: string) => BackgroundAnalysis | undefined;
  cancelBackgroundAnalysis: (repoId: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  backgroundAnalyses: new Map(),
  unreadCount: 0,
  
  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };
    
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep max 50
      unreadCount: state.unreadCount + 1,
    }));
    
    // Play notification sound (optional)
    try {
      // Only play if page is not focused
      if (document.hidden) {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {}); // Ignore if blocked
      }
    } catch {}
    
    return newNotification.id;
  },
  
  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id);
      return {
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: notification && !notification.read 
          ? Math.max(0, state.unreadCount - 1) 
          : state.unreadCount,
      };
    });
  },
  
  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id);
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        };
      }
      return state;
    });
  },
  
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
  
  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },
  
  // Background analysis tracking
  startBackgroundAnalysis: (repoId, repoName, analysisId) => {
    set((state) => {
      const newMap = new Map(state.backgroundAnalyses);
      newMap.set(repoId, {
        repoId,
        repoName,
        analysisId,
        startedAt: Date.now(),
        status: 'in_progress',
      });
      return { backgroundAnalyses: newMap };
    });
  },
  
  updateBackgroundAnalysis: (repoId, status, elapsedSeconds) => {
    set((state) => {
      const newMap = new Map(state.backgroundAnalyses);
      const analysis = newMap.get(repoId);
      if (analysis) {
        newMap.set(repoId, { ...analysis, status, elapsedSeconds });
      }
      return { backgroundAnalyses: newMap };
    });
  },
  
  removeBackgroundAnalysis: (repoId) => {
    set((state) => {
      const newMap = new Map(state.backgroundAnalyses);
      newMap.delete(repoId);
      return { backgroundAnalyses: newMap };
    });
  },
  
  getBackgroundAnalysis: (repoId) => {
    return get().backgroundAnalyses.get(repoId);
  },
  
  cancelBackgroundAnalysis: async (repoId) => {
    const analysis = get().backgroundAnalyses.get(repoId);
    if (!analysis) return;
    
    // Always remove from tracking immediately so the UI updates instantly
    get().removeBackgroundAnalysis(repoId);
    get().addNotification({
      type: 'info',
      title: 'Analysis Cancelled',
      message: `${analysis.repoName} analysis was cancelled.`,
      repoId,
      repoName: analysis.repoName,
    });
    
    // Then tell the backend to cancel the running task
    try {
      const { default: apiClient } = await import('@/lib/api');
      await apiClient.cancelAnalysis(analysis.analysisId);
      console.log('[NotificationStore] Backend cancel confirmed for', analysis.repoName);
    } catch (err) {
      console.error('[NotificationStore] Failed to cancel analysis on backend (UI already cleaned up):', err);
    }
  },
}));

// Global polling for background analyses
let pollingInterval: NodeJS.Timeout | null = null;

// Check if user is already on the dashboard for this repo
function isOnDashboard(repoId: string): boolean {
  const currentPath = window.location.pathname;
  return currentPath.startsWith(`/dashboard/${repoId}`);
}

// Prefetch ALL dashboard data for instant display
async function prefetchAllDashboardData(repoId: string, analysisResult: any): Promise<boolean> {
  console.log('[NotificationStore] Prefetching ALL dashboard data for repo:', repoId);
  
  try {
    const { default: apiClient } = await import('@/lib/api');
    
    // Fetch ALL remaining data in parallel (we already have analysisResult)
    const [files, history] = await Promise.all([
      apiClient.getRepositoryFiles(repoId).catch((e) => {
        console.warn('[Prefetch] Files fetch failed:', e);
        return null;
      }),
      apiClient.getAnalysisHistory(repoId, true).catch((e) => {
        console.warn('[Prefetch] History fetch failed:', e);
        return null;
      }),
    ]);
    
    // Cache keys
    const ANALYSIS_CACHE_KEY = `repoiq_analysis_${repoId}`;
    const FILES_CACHE_KEY = `repoiq_files_${repoId}`;
    const HISTORY_CACHE_KEY = `repoiq_history_${repoId}`;
    
    try {
      const now = Date.now();
      
      // Cache analysis result with history included
      const analysisData = {
        ...analysisResult,
        history: history?.history || history || [],
      };
      sessionStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({
        data: analysisData,
        timestamp: now
      }));
      console.log('[Prefetch] Cached analysis data');
      
      // Cache files
      if (files) {
        const filesList = Array.isArray(files) ? files : files.files || [];
        sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify({
          data: filesList,
          timestamp: now
        }));
        console.log('[Prefetch] Cached', filesList.length, 'files');
      }
      
      // Cache history
      if (history) {
        const historyList = history?.history || history || [];
        sessionStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify({
          data: historyList,
          timestamp: now
        }));
        console.log('[Prefetch] Cached', historyList.length, 'history entries');
      }
      
      console.log('[NotificationStore] Successfully prefetched and cached ALL dashboard data');
      return true;
    } catch (e) {
      console.warn('[NotificationStore] Failed to cache prefetched data:', e);
      return true; // Still return true since we fetched the data
    }
  } catch (err) {
    console.error('[NotificationStore] Prefetch failed:', err);
    return false;
  }
}

// Navigate to dashboard or refresh if already there
function navigateOrRefresh(repoId: string) {
  if (isOnDashboard(repoId)) {
    // Already on dashboard - dispatch refresh event
    console.log('[NotificationStore] Already on dashboard, dispatching refresh event');
    window.dispatchEvent(new CustomEvent('dashboardRefresh', { 
      detail: { repoId } 
    }));
    // Force reload the page to get fresh data
    window.location.reload();
  } else {
    // Navigate to dashboard
    console.log('[NotificationStore] Navigating to dashboard');
    window.location.href = `/dashboard/${repoId}`;
  }
}

export function startBackgroundAnalysisPolling() {
  if (pollingInterval) return;
  
  console.log('[NotificationStore] Starting background analysis polling');
  
  pollingInterval = setInterval(async () => {
    const store = useNotificationStore.getState();
    const analyses = Array.from(store.backgroundAnalyses.values());
    
    if (analyses.length === 0) {
      return;
    }
    
    // Poll each in-progress analysis
    for (const analysis of analyses) {
      if (analysis.status !== 'in_progress') continue;
      
      // Update elapsed time
      const elapsedSeconds = Math.round((Date.now() - analysis.startedAt) / 1000);
      store.updateBackgroundAnalysis(analysis.repoId, 'in_progress', elapsedSeconds);
      
      try {
        const { default: apiClient } = await import('@/lib/api');
        const result = await apiClient.getAnalysisResults(analysis.repoId);
        
        console.log('[BackgroundAnalysis] Poll result for', analysis.repoName, ':', result?.status);
        
        if (result.status === 'completed') {
          console.log('[BackgroundAnalysis] Analysis COMPLETED for', analysis.repoName, 'Score:', result.overall_score);
          
          // Mark as prefetching
          store.updateBackgroundAnalysis(analysis.repoId, 'prefetching');
          
          // Prefetch ALL dashboard data before navigating/refreshing
          console.log('[BackgroundAnalysis] Prefetching ALL dashboard data...');
          const prefetchSuccess = await prefetchAllDashboardData(analysis.repoId, result);
          
          // Mark as completed and remove from tracking
          store.updateBackgroundAnalysis(analysis.repoId, 'completed');
          store.removeBackgroundAnalysis(analysis.repoId);
          
          // Add completion notification
          store.addNotification({
            type: 'analysis_complete',
            title: 'Analysis Complete!',
            message: `${analysis.repoName} finished. Score: ${result.overall_score}`,
            repoId: analysis.repoId,
            repoName: analysis.repoName,
            analysisId: analysis.analysisId,
          });
          
          // Dispatch event for other components
          window.dispatchEvent(new CustomEvent('analysisCompleted', { 
            detail: { repoId: analysis.repoId, analysisId: analysis.analysisId, result } 
          }));
          
          // Navigate to dashboard or refresh if already there
          if (prefetchSuccess) {
            console.log('[BackgroundAnalysis] Prefetch complete, navigating/refreshing...');
            // Small delay to show notification
            setTimeout(() => {
              navigateOrRefresh(analysis.repoId);
            }, 300);
          }
          
        } else if (result.status === 'failed') {
          console.log('[BackgroundAnalysis] Analysis FAILED for', analysis.repoName);
          store.updateBackgroundAnalysis(analysis.repoId, 'failed');
          store.removeBackgroundAnalysis(analysis.repoId);
          store.addNotification({
            type: 'error',
            title: 'Analysis Failed',
            message: `${analysis.repoName} analysis failed: ${result.error_message || 'Unknown error'}`,
            repoId: analysis.repoId,
            repoName: analysis.repoName,
          });
        } else if (result.status === 'cancelled') {
          console.log('[BackgroundAnalysis] Analysis CANCELLED for', analysis.repoName);
          store.removeBackgroundAnalysis(analysis.repoId);
          // Clear the analyzing UI state
          const { useUIStore } = await import('./uiStore');
          useUIStore.getState().setAnalyzingRepo(analysis.repoId, false);
          // Dispatch event so Repositories page can clean up
          window.dispatchEvent(new CustomEvent('analysisCancelled', { detail: { repoId: analysis.repoId } }));
        }
        // If still 'in_progress', continue polling
      } catch (err) {
        // Silently continue polling
        console.log('[BackgroundAnalysis] Polling error (will retry):', err);
      }
    }
  }, 2000); // Poll every 2 seconds for faster response
}

export function stopBackgroundAnalysisPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
