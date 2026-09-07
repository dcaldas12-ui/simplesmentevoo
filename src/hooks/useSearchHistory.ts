import { useEffect, useState } from 'react';
import {
  addSearchToHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchFromHistory,
  type SearchHistoryItem,
} from '@/lib/search-history';
import type { SearchFormValues } from '@/components/SearchForm';

/**
 * Hook to manage search history
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setHistory(getSearchHistory());
    setMounted(true);
  }, []);

  const add = (search: SearchFormValues) => {
    addSearchToHistory(search);
    setHistory(getSearchHistory());
  };

  const remove = (id: string) => {
    removeSearchFromHistory(id);
    setHistory(getSearchHistory());
  };

  const clear = () => {
    clearSearchHistory();
    setHistory([]);
  };

  return {
    history,
    add,
    remove,
    clear,
    mounted,
  };
}
