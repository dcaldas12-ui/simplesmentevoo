/**
 * Search history management with localStorage persistence
 * Stores up to 10 recent searches for quick access
 */

import type { SearchFormValues } from '@/components/SearchForm';

const HISTORY_KEY = 'simplesmente-voo-searches';
const MAX_SEARCHES = 10;

export interface SearchHistoryItem {
  id: string;
  timestamp: number;
  search: SearchFormValues;
}

/**
 * Get all search history items, sorted by most recent first
 */
export function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as SearchHistoryItem[];
  } catch {
    return [];
  }
}

/**
 * Add a search to history (deduplicates by route)
 */
export function addSearchToHistory(search: SearchFormValues): void {
  if (typeof window === 'undefined') return;
  
  const history = getSearchHistory();
  const now = Date.now();
  const id = `${search.origem}-${search.destino}-${search.dataPartida}`;
  
  // Remove duplicate if exists (same route + date)
  const filtered = history.filter(item => 
    !(item.search.origem === search.origem && 
      item.search.destino === search.destino && 
      item.search.dataPartida === search.dataPartida)
  );
  
  // Add new search at the beginning
  const updated = [
    { id, timestamp: now, search },
    ...filtered
  ].slice(0, MAX_SEARCHES);
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

/**
 * Clear all search history
 */
export function clearSearchHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
}

/**
 * Remove a specific search from history
 */
export function removeSearchFromHistory(id: string): void {
  if (typeof window === 'undefined') return;
  
  const history = getSearchHistory();
  const updated = history.filter(item => item.id !== id);
  
  if (updated.length === 0) {
    clearSearchHistory();
  } else {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }
}
