import { useState, useEffect } from 'react';
import { debounce } from '@/utils/throttle';

/**
 * Hook for debounced search input
 * @param initialValue Initial search value
 * @param delay Debounce delay in milliseconds (default: 300ms)
 * @param onSearch Optional callback when search value changes (after debounce)
 * @returns [searchValue, setSearchValue, debouncedValue]
 */
export function useDebouncedSearch(
  initialValue: string = '',
  delay: number = 300,
  onSearch?: (value: string) => void
) {
  const [searchValue, setSearchValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);

  useEffect(() => {
    const debouncedUpdate = debounce((value: string) => {
      setDebouncedValue(value);
      onSearch?.(value);
    }, delay);

    debouncedUpdate(searchValue);

    // Cleanup function
    return () => {
      // The debounce function handles cleanup internally
    };
  }, [searchValue, delay, onSearch]);

  return [searchValue, setSearchValue, debouncedValue] as const;
}
