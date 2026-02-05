/**
 * ThemeProvider
 *
 * Manages theme state (light/dark/high-contrast) with system preference support.
 * Issue #21: CCD-REQ-010 Theming and Accessibility
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark' | 'high-contrast' | 'system';
export type ResolvedTheme = 'light' | 'dark' | 'high-contrast';

export interface ThemeContextValue {
  /** Current theme setting */
  theme: Theme;
  /** Resolved theme (system resolved to actual theme) */
  resolvedTheme: ResolvedTheme;
  /** System preference (light or dark) */
  systemPreference: 'light' | 'dark';
  /** Set theme */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'coral-theme';
const THEME_CLASSES = ['theme-light', 'theme-dark', 'theme-high-contrast'];

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// ============================================================================
// Provider Props
// ============================================================================

export interface ThemeProviderProps {
  children: ReactNode;
  /** Default theme (defaults to 'system') */
  defaultTheme?: Theme;
}

// ============================================================================
// Provider Component
// ============================================================================

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  // Get initial theme from localStorage or default
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidTheme(stored)) {
      return stored as Theme;
    }
    return defaultTheme;
  });

  // Track system preference
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Resolve theme (system -> actual theme)
  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemPreference : theme;

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

    // Add current theme class
    root.classList.add(`theme-${resolvedTheme}`);
  }, [resolvedTheme]);

  // Set theme with persistence
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme, setTheme]);

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    systemPreference,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function isValidTheme(value: string): value is Theme {
  return ['light', 'dark', 'high-contrast', 'system'].includes(value);
}
