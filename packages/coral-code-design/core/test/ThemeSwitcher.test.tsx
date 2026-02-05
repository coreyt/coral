/**
 * Tests for ThemeSwitcher component
 *
 * Issue #25: CCD-REQ-010 Theme Switcher UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { ThemeSwitcher } from '../src/components/ThemeSwitcher';

// Helper to render with ThemeProvider
function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
}

describe('ThemeSwitcher', () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();

    mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? false : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render all theme options', () => {
      renderWithTheme(<ThemeSwitcher />);

      expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /high contrast/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /system/i })).toBeInTheDocument();
    });

    it('should indicate current theme', () => {
      localStorage.setItem('coral-theme', 'dark');
      renderWithTheme(<ThemeSwitcher />);

      const darkButton = screen.getByRole('button', { name: /dark/i });
      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should show system as active when using system preference', () => {
      renderWithTheme(<ThemeSwitcher />);

      const systemButton = screen.getByRole('button', { name: /system/i });
      expect(systemButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('theme selection', () => {
    it('should switch to light theme when clicking light button', () => {
      renderWithTheme(<ThemeSwitcher />);

      fireEvent.click(screen.getByRole('button', { name: /light/i }));

      expect(localStorage.getItem('coral-theme')).toBe('light');
      expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('should switch to dark theme when clicking dark button', () => {
      renderWithTheme(<ThemeSwitcher />);

      fireEvent.click(screen.getByRole('button', { name: /dark/i }));

      expect(localStorage.getItem('coral-theme')).toBe('dark');
      expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('should switch to high-contrast theme when clicking high contrast button', () => {
      renderWithTheme(<ThemeSwitcher />);

      fireEvent.click(screen.getByRole('button', { name: /high contrast/i }));

      expect(localStorage.getItem('coral-theme')).toBe('high-contrast');
      expect(screen.getByRole('button', { name: /high contrast/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('should switch to system theme when clicking system button', () => {
      localStorage.setItem('coral-theme', 'dark');
      renderWithTheme(<ThemeSwitcher />);

      fireEvent.click(screen.getByRole('button', { name: /system/i }));

      expect(localStorage.getItem('coral-theme')).toBe('system');
      expect(screen.getByRole('button', { name: /system/i })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('compact variant', () => {
    it('should render compact version with icons only', () => {
      renderWithTheme(<ThemeSwitcher variant="compact" />);

      // Should still have buttons but without text labels
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(4);
    });
  });

  describe('dropdown variant', () => {
    it('should render as dropdown', () => {
      renderWithTheme(<ThemeSwitcher variant="dropdown" />);

      // Should have a trigger button
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should show options when dropdown is opened', () => {
      renderWithTheme(<ThemeSwitcher variant="dropdown" />);

      // Click to open dropdown
      fireEvent.click(screen.getByRole('button'));

      // Options should be visible
      expect(screen.getByRole('option', { name: /light/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /dark/i })).toBeInTheDocument();
    });

    it('should close dropdown after selecting option', () => {
      renderWithTheme(<ThemeSwitcher variant="dropdown" />);

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      // Select an option
      fireEvent.click(screen.getByRole('option', { name: /dark/i }));

      // Dropdown should close (options not visible)
      expect(screen.queryByRole('option', { name: /light/i })).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels for all buttons', () => {
      renderWithTheme(<ThemeSwitcher />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('should support keyboard navigation', () => {
      renderWithTheme(<ThemeSwitcher />);

      const lightButton = screen.getByRole('button', { name: /light/i });
      lightButton.focus();
      expect(document.activeElement).toBe(lightButton);

      // Press Enter to select
      fireEvent.keyDown(lightButton, { key: 'Enter' });
      expect(localStorage.getItem('coral-theme')).toBe('light');
    });

    it('should have role group for button set', () => {
      renderWithTheme(<ThemeSwitcher />);

      expect(screen.getByRole('group')).toBeInTheDocument();
    });
  });

  describe('onChange callback', () => {
    it('should call onChange when theme changes', () => {
      const onChange = vi.fn();
      renderWithTheme(<ThemeSwitcher onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /dark/i }));

      expect(onChange).toHaveBeenCalledWith('dark');
    });
  });
});
