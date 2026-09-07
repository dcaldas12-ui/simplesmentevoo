/**
 * Theme management with localStorage persistence and system preference detection
 */

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'simplesmente-voo-theme';

/**
 * Get the effective theme (resolves 'system' to actual light/dark)
 */
export function getEffectiveTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  const theme = stored || 'system';
  
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  
  // System preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get the stored theme preference (not necessarily the effective one)
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(THEME_KEY) as Theme) || 'system';
}

/**
 * Set theme preference and apply to DOM
 */
export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem(THEME_KEY, theme);
  
  const effective = theme === 'system' 
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : theme;
  
  document.documentElement.classList.toggle('dark', effective === 'dark');
}

/**
 * Initialize theme from localStorage or system preference
 * Call this in app startup (e.g., __root.tsx)
 */
export function initializeTheme(): void {
  if (typeof window === 'undefined') return;
  
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  const theme = stored || 'system';
  setTheme(theme);
  
  // Listen for system preference changes
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    const currentTheme = getStoredTheme();
    if (currentTheme === 'system') {
      setTheme('system');
    }
  };
  
  darkModeQuery.addEventListener('change', handleChange);
}
