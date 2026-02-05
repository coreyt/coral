/**
 * ThemeToggle Component
 *
 * UI control for switching between themes.
 * Issue #21: CCD-REQ-010 Theming and Accessibility
 */

import { useTheme, type Theme } from '../../providers/ThemeProvider';

export interface ThemeToggleProps {
  /** Show as dropdown (default) or icon button */
  variant?: 'dropdown' | 'icon';
  /** Additional class name */
  className?: string;
}

const THEME_ICONS: Record<Theme, string> = {
  light: '☀️',
  dark: '🌙',
  'high-contrast': '◐',
  system: '💻',
};

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  'high-contrast': 'High Contrast',
  system: 'System',
};

export function ThemeToggle({ variant = 'dropdown', className }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme, resolvedTheme } = useTheme();

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleTheme}
        className={className}
        aria-label={`Toggle theme (current: ${resolvedTheme})`}
        title={`Toggle theme (current: ${resolvedTheme})`}
        style={{
          padding: '6px 10px',
          fontSize: '16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: '4px',
        }}
      >
        {THEME_ICONS[resolvedTheme]}
      </button>
    );
  }

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      className={className}
      aria-label="Select theme"
      style={{
        padding: '6px 10px',
        fontSize: '13px',
        border: '1px solid var(--border-color, #e0e0e0)',
        borderRadius: '4px',
        background: 'var(--input-bg, #fff)',
        color: 'var(--text-color, #333)',
        cursor: 'pointer',
      }}
    >
      {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
        <option key={t} value={t}>
          {THEME_ICONS[t]} {THEME_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
