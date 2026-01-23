/**
 * Throttle utility - limits function execution to once per delay period
 * @param func Function to throttle
 * @param delay Delay in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func.apply(this, args);
    } else {
      // Clear existing timeout and set a new one
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Debounce utility - delays function execution until after delay period has passed
 * @param func Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Request throttler - prevents too many API calls in quick succession
 * Useful for search inputs, scroll events, etc.
 */
export class RequestThrottler {
  private pendingRequests = new Map<string, Promise<any>>();
  private lastRequestTime = new Map<string, number>();
  private minDelay: number;

  constructor(minDelay: number = 300) {
    this.minDelay = minDelay;
  }

  /**
   * Throttle a request - if called multiple times quickly, only the last one executes
   */
  async throttle<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(key) || 0;
    const timeSinceLastRequest = now - lastTime;

    // Cancel any existing timeout for this key
    const timeoutKey = `_timeout_${key}`;
    const existingTimeout = (this.pendingRequests as any).get(timeoutKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      (this.pendingRequests as any).delete(timeoutKey);
    }

    // If enough time has passed, execute immediately
    if (timeSinceLastRequest >= this.minDelay) {
      this.lastRequestTime.set(key, now);
      const promise = requestFn();
      this.pendingRequests.set(key, promise);
      
      try {
        const result = await promise;
        // Only delete if it's still the same promise
        if (this.pendingRequests.get(key) === promise) {
          this.pendingRequests.delete(key);
        }
        return result;
      } catch (error) {
        // Only delete if it's still the same promise
        if (this.pendingRequests.get(key) === promise) {
          this.pendingRequests.delete(key);
        }
        throw error;
      }
    }

    // Otherwise, delay execution
    let promiseRef: Promise<T> | null = null;
    const promise = new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        // Check if this is still the latest request
        const currentPending = this.pendingRequests.get(key);
        if (currentPending && currentPending !== promiseRef) {
          // A newer request came in, ignore this one
          return;
        }

        this.lastRequestTime.set(key, Date.now());
        const requestPromise = requestFn();
        this.pendingRequests.set(key, requestPromise);
        (this.pendingRequests as any).delete(timeoutKey);
        
        try {
          const result = await requestPromise;
          // Only delete if it's still the same promise
          if (this.pendingRequests.get(key) === requestPromise) {
            this.pendingRequests.delete(key);
          }
          resolve(result);
        } catch (error) {
          // Only delete if it's still the same promise
          if (this.pendingRequests.get(key) === requestPromise) {
            this.pendingRequests.delete(key);
          }
          reject(error);
        }
      }, this.minDelay - timeSinceLastRequest);
      
      // Store timeout for potential cancellation
      (this.pendingRequests as any).set(timeoutKey, timeoutId);
    });
    
    promiseRef = promise;
    // Track the promise
    this.pendingRequests.set(key, promise);
    
    return promise;
  }

  /**
   * Debounce a request - only execute after delay period with no new requests
   */
  debounce<T>(
    key: string,
    requestFn: () => Promise<T>,
    delay: number = this.minDelay
  ): Promise<T> {
    // Clear any existing timeout
    const timeoutKey = `_timeout_${key}`;
    const existingTimeout = (this.pendingRequests as any).get(timeoutKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      (this.pendingRequests as any).delete(timeoutKey);
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        this.lastRequestTime.set(key, Date.now());
        const promise = requestFn();
        this.pendingRequests.set(key, promise);
        (this.pendingRequests as any).delete(timeoutKey);
        
        try {
          const result = await promise;
          this.pendingRequests.delete(key);
          resolve(result);
        } catch (error) {
          this.pendingRequests.delete(key);
          reject(error);
        }
      }, delay);

      // Store timeout ID for cancellation
      (this.pendingRequests as any).set(timeoutKey, timeoutId);
    });
  }

  /**
   * Cancel a pending request
   */
  cancel(key: string): void {
    const timeoutId = (this.pendingRequests as any).get(`_timeout_${key}`);
    if (timeoutId) {
      clearTimeout(timeoutId);
      (this.pendingRequests as any).delete(`_timeout_${key}`);
    }
    this.pendingRequests.delete(key);
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.forEach((_, key) => {
      const timeoutId = (this.pendingRequests as any).get(`_timeout_${key}`);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    this.pendingRequests.clear();
    this.lastRequestTime.clear();
  }
}

// Global request throttler instance
export const requestThrottler = new RequestThrottler(300);
