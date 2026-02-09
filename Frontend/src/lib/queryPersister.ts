import { QueryClient } from '@tanstack/react-query';

// User-scoped cache key prefix
const getCacheKey = (userId?: string) => {
  if (userId) {
    return `repoiq_cache_${userId}`;
  }
  return 'repoiq_cache_anonymous';
};

// Persist React Query cache to localStorage
export function persistQueryCache(queryClient: QueryClient, userId?: string) {
  const cacheKey = getCacheKey(userId);
  
  // Load cache from localStorage on mount
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const cacheData = JSON.parse(cached);
      const cacheAge = Date.now() - (cacheData.timestamp || 0);
      
      // Only restore cache if it's less than 24 hours old
      if (cacheAge < 24 * 60 * 60 * 1000 && cacheData.queries) {
        // Restore individual queries
        let restoredCount = 0;
        Object.entries(cacheData.queries).forEach(([key, value]: [string, any]) => {
          try {
            const queryKey = JSON.parse(key);
            if (value?.data !== undefined) {
              queryClient.setQueryData(queryKey, value.data);
              restoredCount++;
            }
          } catch (err) {
            // Skip invalid query keys
          }
        });
        
        if (restoredCount > 0) {
          console.log(`[QueryPersister] ✅ Restored ${restoredCount} queries from localStorage`);
        }
      } else {
        console.log('[QueryPersister] ⏭️ Cache expired, skipping restore');
      }
    }
  } catch (err) {
    console.warn('[QueryPersister] Failed to restore cache:', err);
  }
  
  // Save cache to localStorage periodically (every 30 seconds)
  const saveInterval = setInterval(() => {
    try {
      const queryCache = queryClient.getQueryCache();
      const queries = queryCache.getAll();
      
      const cacheData: Record<string, any> = {};
      queries.forEach((query) => {
        if (query.state.data !== undefined) {
          const key = JSON.stringify(query.queryKey);
          cacheData[key] = {
            data: query.state.data,
            dataUpdatedAt: query.state.dataUpdatedAt,
            status: query.state.status,
          };
        }
      });
      
      localStorage.setItem(cacheKey, JSON.stringify({
        queries: cacheData,
        timestamp: Date.now(),
      }));
      
      console.log(`[QueryPersister] 💾 Saved ${Object.keys(cacheData).length} queries to cache`);
    } catch (err) {
      console.warn('[QueryPersister] Failed to save cache:', err);
    }
  }, 30000); // Save every 30 seconds
  
  // Return cleanup function
  return () => {
    clearInterval(saveInterval);
  };
}

// Clear cache for a specific user (call on logout)
export function clearQueryCache(userId?: string) {
  const cacheKey = getCacheKey(userId);
  try {
    localStorage.removeItem(cacheKey);
    console.log('[QueryPersister] 🗑️ Cleared cache for user');
  } catch (err) {
    console.warn('[QueryPersister] Failed to clear cache:', err);
  }
}

// Clear all caches (for cleanup)
export function clearAllQueryCaches() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('repoiq_cache_')) {
        localStorage.removeItem(key);
      }
    });
    console.log('[QueryPersister] 🗑️ Cleared all caches');
  } catch (err) {
    console.warn('[QueryPersister] Failed to clear all caches:', err);
  }
}
