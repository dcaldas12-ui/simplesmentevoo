import { useEffect, useState } from 'react';
import { getEffectiveTheme, getStoredTheme, initializeTheme, setTheme, type Theme } from '@/lib/theme';

/**
 * Hook to manage theme state and provide theme switching functionality
 * Handles initialization, persistence, and system preference detection
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
    setThemeState(getStoredTheme());
    setMounted(true);
  }, []);

  const effectiveTheme = getEffectiveTheme();

  const toggleTheme = () => {
    const current = getStoredTheme();
    let next: Theme;
    
    if (current === 'light') {
      next = 'dark';
    } else if (current === 'dark') {
      next = 'system';
    } else {
      next = 'light';
    }
    
    setTheme(next);
    setThemeState(next);
  };

  return {
    theme,
    effectiveTheme,
    setTheme: (t: Theme) => {
      setTheme(t);
      setThemeState(t);
    },
    toggleTheme,
    mounted,
  };
}
