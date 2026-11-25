/**
 * PreferencesDialog Tests
 *
 * Tests for the Preferences modal dialog (Ctrl+,).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PreferencesDialog,
  type PreferencesDialogProps,
} from '../../src/components/PreferencesDialog';

const defaultTheme: Record<string, string> = {
  inspectorBg: '#1e1e1e',
  inspectorBorder: '#333333',
  inspectorText: '#cccccc',
};

const defaultPreferences = {
  defaultNotation: 'flowchart',
  defaultLayoutPreset: 'flowchart' as const,
  theme: 'system' as const,
  showMinimap: true,
  showControls: true,
  fitViewOnLoad: true,
  autoSaveInterval: 0,
  recentFiles: [],
  maxRecentFiles: 10,
  llmProvider: 'anthropic' as const,
  llmModel: 'claude-sonnet-4-5-20250929',
  llmSaveApiKey: false,
  llmSavedApiKey: '',
  llmMaxRetries: 2,
  speechRecognitionMode: 'local' as const,
};

const defaultProviders = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
  },
];

function defaultProps(overrides: Partial<PreferencesDialogProps> = {}): PreferencesDialogProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    userPreferences: defaultPreferences,
    onUserPreferencesChange: vi.fn(),
    notations: [
      { id: 'flowchart', name: 'Flowchart' },
      { id: 'architecture', name: 'Architecture' },
    ],
    llmProviders: defaultProviders,
    llmApiKey: '',
    onLlmApiKeyChange: vi.fn(),
    onLlmApiKeyPersistenceChange: vi.fn().mockReturnValue(true),
    theme: defaultTheme,
    ...overrides,
  };
}

describe('PreferencesDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PreferencesDialog {...defaultProps({ isOpen: false })} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when open', () => {
    render(<PreferencesDialog {...defaultProps()} />);
    expect(screen.getByRole('dialog', { name: 'Preferences' }).getAttribute('aria-modal')).toBe('true');
  });

  it('shows Appearance section with theme and checkboxes', () => {
    render(<PreferencesDialog {...defaultProps()} />);
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Show minimap')).toBeDefined();
    expect(screen.getByText('Show controls')).toBeDefined();
    expect(screen.getByText('Fit view on load')).toBeDefined();
  });

  it('shows Defaults section with notation and layout selects', () => {
    render(<PreferencesDialog {...defaultProps()} />);
    expect(screen.getByText('Defaults for New Diagrams')).toBeDefined();
    expect(screen.getByText('Default Notation')).toBeDefined();
    expect(screen.getByText('Default Layout')).toBeDefined();
  });

  it('hides AI Generation section when no providers', () => {
    render(<PreferencesDialog {...defaultProps({ llmProviders: [] })} />);
    expect(screen.queryByText('AI Generation')).toBeNull();
  });

  it('shows Recent Files section when files exist', () => {
    const prefs = { ...defaultPreferences, recentFiles: ['file1.json', 'file2.json'] };
    render(<PreferencesDialog {...defaultProps({ userPreferences: prefs })} />);
    expect(screen.getByText('Recent Files (2)')).toBeDefined();
  });

  it('hides Recent Files section when no files', () => {
    render(<PreferencesDialog {...defaultProps()} />);
    expect(screen.queryByText(/Recent Files/)).toBeNull();
  });

  it('fires onUserPreferencesChange when checkbox toggled', () => {
    const onUserPreferencesChange = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onUserPreferencesChange })} />);

    const minimap = screen.getByText('Show minimap').previousElementSibling as HTMLInputElement;
    fireEvent.click(minimap);
    expect(onUserPreferencesChange).toHaveBeenCalledWith({ showMinimap: false });
  });

  it('keeps entity highlighting off by default and persists an explicit opt-in', () => {
    const onUserPreferencesChange = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onUserPreferencesChange })} />);

    const highlighting = screen.getByText('Entity highlighting').previousElementSibling as HTMLInputElement;
    expect(highlighting.checked).toBe(false);
    fireEvent.click(highlighting);
    expect(onUserPreferencesChange).toHaveBeenCalledWith({ editorEntityHighlighting: true });
  });

  it('fires onUserPreferencesChange when theme changes', () => {
    const onUserPreferencesChange = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onUserPreferencesChange })} />);

    const themeSelect = screen.getByDisplayValue('System');
    fireEvent.change(themeSelect, { target: { value: 'dark' } });
    expect(onUserPreferencesChange).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onClose })} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onClose })} />);

    const overlay = screen.getByTestId('preferences-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when clicking inside dialog', () => {
    const onClose = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onClose })} />);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes via close button', () => {
    const onClose = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onClose })} />);

    fireEvent.click(screen.getByLabelText('Close preferences'));
    expect(onClose).toHaveBeenCalled();
  });

  it('exposes the explicit workspace-layout reset action', () => {
    const onResetWorkspace = vi.fn();
    render(<PreferencesDialog {...defaultProps({ onResetWorkspace })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset workspace layout' }));
    expect(onResetWorkspace).toHaveBeenCalledOnce();
  });
});

describe('0.2.9 AI preferences deferral', () => {
  it('shows neither provider credentials nor voice input settings', () => {
    render(<PreferencesDialog {...defaultProps()} />);
    expect(screen.queryByText('AI Generation')).toBeNull();
    expect(screen.queryByLabelText('Voice input mode')).toBeNull();
  });
});
