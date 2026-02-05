/**
 * ThemeSwitcher Component
 *
 * UI component for switching between themes.
 * Issue #25: CCD-REQ-010 Theme Switcher UI
 */

import { useState, useCallback } from 'react';
import { useTheme, type Theme } from '../../providers/ThemeProvider';

// ============================================================================
// Types
// ============================================================================

export interface ThemeSwitcherProps {
  /** Variant: default (buttons), compact (icons only), or dropdown */
  variant?: 'default' | 'compact' | 'dropdown';
  /** Callback when theme changes */
  onChange?: (theme: Theme) => void;
  /** Additional class name */
  className?: string;
}

interface ThemeOption {
  value: Theme;
  label: string;
  icon: string;
}

// ============================================================================
// Constants
// ============================================================================

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: '\u2600' }, // Sun
  { value: 'dark', label: 'Dark', icon: '\u263E' }, // Moon
  { value: 'high-contrast', label: 'High Contrast', icon: '\u25D0' }, // Circle with half black
  { value: 'system', label: 'System', icon: '\u2699' }, // Gear
];

// ============================================================================
// Styles
// ============================================================================

const styles = {
  group: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    borderRadius: '8px',
    backgroundColor: 'var(--theme-bg-secondary, #f0f0f0)',
  } as React.CSSProperties,
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--theme-text-primary, #333)',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.15s, color 0.15s',
  } as React.CSSProperties,
  buttonActive: {
    backgroundColor: 'var(--theme-bg-active, #fff)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  buttonCompact: {
    padding: '8px',
  } as React.CSSProperties,
  icon: {
    fontSize: '16px',
  } as React.CSSProperties,
  dropdown: {
    position: 'relative',
    display: 'inline-block',
  } as React.CSSProperties,
  dropdownTrigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    color: 'var(--theme-text-primary, #333)',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    padding: '4px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '8px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: '160px',
  } as React.CSSProperties,
  dropdownOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: 'var(--theme-text-primary, #333)',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  dropdownOptionActive: {
    backgroundColor: 'var(--theme-bg-active, #e8f4fd)',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function ThemeSwitcher({
  variant = 'default',
  onChange,
  className,
}: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
      onChange?.(newTheme);
      setIsOpen(false);
    },
    [setTheme, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, themeValue: Theme) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleThemeChange(themeValue);
      }
    },
    [handleThemeChange]
  );

  // Dropdown variant
  if (variant === 'dropdown') {
    const currentOption = THEME_OPTIONS.find((opt) => opt.value === theme);

    return (
      <div style={styles.dropdown} className={className}>
        <button
          type="button"
          style={styles.dropdownTrigger}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span style={styles.icon}>{currentOption?.icon}</span>
          <span>{currentOption?.label}</span>
          <span style={{ marginLeft: 'auto' }}>{isOpen ? '\u25B2' : '\u25BC'}</span>
        </button>

        {isOpen && (
          <div style={styles.dropdownMenu} role="listbox">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={theme === option.value}
                style={{
                  ...styles.dropdownOption,
                  ...(theme === option.value ? styles.dropdownOptionActive : {}),
                }}
                onClick={() => handleThemeChange(option.value)}
              >
                <span style={styles.icon}>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default and compact variants
  const isCompact = variant === 'compact';

  return (
    <div role="group" aria-label="Theme selection" style={styles.group} className={className}>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          aria-label={option.label}
          style={{
            ...styles.button,
            ...(isCompact ? styles.buttonCompact : {}),
            ...(theme === option.value ? styles.buttonActive : {}),
          }}
          onClick={() => handleThemeChange(option.value)}
          onKeyDown={(e) => handleKeyDown(e, option.value)}
        >
          <span style={styles.icon}>{option.icon}</span>
          {!isCompact && <span>{option.label}</span>}
        </button>
      ))}
    </div>
  );
}
