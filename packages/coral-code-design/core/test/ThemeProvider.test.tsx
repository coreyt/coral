/**
 * Tests for ThemeProvider and useTheme
 *
 * Issue #21: CCD-REQ-010 Theming and Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme, type Theme } from '../src/providers/ThemeProvider';

// Test component to access theme context
function ThemeConsumer() {
  const { theme, setTheme, toggleTheme, systemPreference } = useTheme();

  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="system-pref">{systemPreference}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-high-contrast" onClick={() => setTheme('high-contrast')}>High Contrast</button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>System</button>
      <button data-testid="toggle" onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  // Mock matchMedia
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let mediaQueryListeners: ((e: { matches: boolean }) => void)[] = [];

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Reset listeners
    mediaQueryListeners = [];

    // Mock matchMedia
    mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_event: string, listener: (e: { matches: boolean }) => void) => {
        mediaQueryListeners.push(listener);
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default behavior', () => {
    it('should default to system theme', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('system');
    });

    it('should apply light theme class when system prefers light', () => {
      mockMatchMedia.mockImplementation((query: string) => ({
        matches: query.includes('dark') ? false : true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const { container } = render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      // The root element should have the theme class
      expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    });

    it('should apply dark theme class when system prefers dark', () => {
      mockMatchMedia.mockImplementation((query: string) => ({
        matches: query.includes('dark') ? true : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });
  });

  describe('theme switching', () => {
    it('should switch to light theme', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByTestId('set-light'));

      expect(screen.getByTestId('theme').textContent).toBe('light');
      expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    });

    it('should switch to dark theme', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByTestId('set-dark'));

      expect(screen.getByTestId('theme').textContent).toBe('dark');
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });

    it('should switch to high-contrast theme', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByTestId('set-high-contrast'));

      expect(screen.getByTestId('theme').textContent).toBe('high-contrast');
      expect(document.documentElement.classList.contains('theme-high-contrast')).toBe(true);
    });

    it('should toggle between light and dark', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      // Set to light first
      fireEvent.click(screen.getByTestId('set-light'));
      expect(screen.getByTestId('theme').textContent).toBe('light');

      // Toggle to dark
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('theme').textContent).toBe('dark');

      // Toggle back to light
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('theme').textContent).toBe('light');
    });
  });

  describe('persistence', () => {
    it('should persist theme to localStorage', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByTestId('set-dark'));

      expect(localStorage.getItem('coral-theme')).toBe('dark');
    });

    it('should restore theme from localStorage', () => {
      localStorage.setItem('coral-theme', 'dark');

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });
  });

  describe('system preference', () => {
    it('should detect system preference', () => {
      mockMatchMedia.mockImplementation((query: string) => ({
        matches: query.includes('dark') ? true : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('system-pref').textContent).toBe('dark');
    });

    it('should update when system preference changes', async () => {
      mockMatchMedia.mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_event: string, listener: (e: { matches: boolean }) => void) => {
          mediaQueryListeners.push(listener);
        },
        removeEventListener: vi.fn(),
      }));

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      // Simulate system preference change
      act(() => {
        mediaQueryListeners.forEach(listener => listener({ matches: true }));
      });

      expect(screen.getByTestId('system-pref').textContent).toBe('dark');
    });
  });
});

describe('useTheme outside provider', () => {
  it('should throw error when used outside ThemeProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<ThemeConsumer />);
    }).toThrow('useTheme must be used within a ThemeProvider');

    consoleSpy.mockRestore();
  });
});
