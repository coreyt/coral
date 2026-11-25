/**
 * AppHeader Tests
 *
 * Behavioral tests for the extracted AppHeader component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppHeader, type AppHeaderProps } from '../../src/components/AppHeader';

const fileControlsBridge = vi.hoisted(() => ({ props: null as any }));

// Mock @coral-viz/viz FileControls while retaining its composition contract.
vi.mock('@coral-viz/viz', () => ({
  FileControls: (props: any) => {
    fileControlsBridge.props = props;
    return <div data-testid="file-controls">FileControls</div>;
  },
}));

// Mock UnsavedIndicator as a simple div
vi.mock('../../src/RecoveryBanner', () => ({
  UnsavedIndicator: ({ isDirty }: { isDirty: boolean }) => (
    <div data-testid="unsaved-indicator">{isDirty ? 'Unsaved' : ''}</div>
  ),
}));

function defaultProps(overrides: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    documentName: 'Untitled Diagram',
    onDocumentNameChange: vi.fn(),
    isDirty: false,
    lastSaveTime: null,
    inspectorCollapsed: false,
    onToggleInspector: vi.fn(),
    onToggleCommandPalette: vi.fn(),
    onTogglePreferences: vi.fn(),
    onSave: vi.fn(),
    onLoad: vi.fn(),
    overflowMenuOpen: false,
    onToggleOverflowMenu: vi.fn(),
    theme: {
      headerBg: '#1e1e1e',
      headerText: '#cccccc',
      inputBg: 'transparent',
      inputText: '#cccccc',
      controlBg: '#2a2a2a',
      controlBgActive: '#333333',
      controlBgHover: '#2a2a2a',
      controlText: '#cccccc',
      controlTextMuted: '#666666',
      controlBorder: '#444444',
      inspectorBg: '#252526',
      inspectorBorder: '#333333',
      inspectorText: '#cccccc',
    },
    ...overrides,
  };
}

describe('AppHeader', () => {
  it('renders document name input with provided value', () => {
    render(<AppHeader {...defaultProps({ documentName: 'My Diagram' })} />);

    const input = screen.getByLabelText('Document name') as HTMLInputElement;
    expect(input.value).toBe('My Diagram');
  });

  it('calls onDocumentNameChange when input changes', () => {
    const onDocumentNameChange = vi.fn();
    render(<AppHeader {...defaultProps({ onDocumentNameChange })} />);

    const input = screen.getByLabelText('Document name');
    fireEvent.change(input, { target: { value: 'New Name' } });

    expect(onDocumentNameChange).toHaveBeenCalledWith('New Name');
  });

  it('calls onToggleInspector when inspector toggle button clicked', () => {
    const onToggleInspector = vi.fn();
    render(<AppHeader {...defaultProps({ onToggleInspector })} />);

    const button = screen.getByLabelText('Hide inspector');
    fireEvent.click(button);

    expect(onToggleInspector).toHaveBeenCalledOnce();
  });

  it('calls onTogglePreferences when gear button clicked', () => {
    const onTogglePreferences = vi.fn();
    render(<AppHeader {...defaultProps({ onTogglePreferences })} />);

    const button = screen.getByLabelText('Preferences');
    fireEvent.click(button);

    expect(onTogglePreferences).toHaveBeenCalledOnce();
  });

  it('calls onToggleCommandPalette when Ctrl+K button clicked', () => {
    const onToggleCommandPalette = vi.fn();
    render(<AppHeader {...defaultProps({ onToggleCommandPalette })} />);

    const button = screen.getByTitle('Command Palette (Ctrl+K)');
    fireEvent.click(button);

    expect(onToggleCommandPalette).toHaveBeenCalledOnce();
  });

  it('forwards selected-file read failures from FileControls', () => {
    const onOpenFileError = vi.fn();
    render(<AppHeader {...defaultProps({ onOpenFile: vi.fn(), onOpenFileError })} />);

    const error = new Error('read denied');
    fileControlsBridge.props.onOpenFileError({ name: 'denied.coral', error });
    expect(onOpenFileError).toHaveBeenCalledWith({ name: 'denied.coral', error });
  });

  it('opens Help and About from named header controls', () => {
    const onHelp = vi.fn();
    const onAbout = vi.fn();
    render(<AppHeader {...defaultProps({ onHelp, onAbout })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: 'About Coral' }));
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onAbout).toHaveBeenCalledOnce();
  });

  it('keeps hidden responsive commands reachable from More', () => {
    const onToggleCommandPalette = vi.fn();
    const onTogglePreferences = vi.fn();
    const onToggleInspector = vi.fn();
    const onHelp = vi.fn();
    const onAbout = vi.fn();
    render(<AppHeader {...defaultProps({
      overflowMenuOpen: true,
      onToggleCommandPalette,
      onTogglePreferences,
      onToggleInspector,
      onHelp,
      onAbout,
    })} />);

    const responsiveItems = [...document.querySelectorAll<HTMLButtonElement>('.coral-menu-item--responsive')];
    expect(responsiveItems.map((item) => item.textContent)).toEqual([
      'Load', 'Command palette', 'Help', 'About Coral', 'Preferences', 'Hide Properties',
    ]);
    for (const label of ['Command palette', 'Help', 'About Coral', 'Preferences', 'Hide Properties']) {
      fireEvent.click(responsiveItems.find((item) => item.textContent === label)!);
    }
    expect(onToggleCommandPalette).toHaveBeenCalledOnce();
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onAbout).toHaveBeenCalledOnce();
    expect(onTogglePreferences).toHaveBeenCalledOnce();
    expect(onToggleInspector).toHaveBeenCalledOnce();
  });

  it('closes More with Escape and restores focus to its invoker', async () => {
    const onToggleOverflowMenu = vi.fn();
    render(<AppHeader {...defaultProps({ overflowMenuOpen: true, onToggleOverflowMenu })} />);
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-controls')).toBe('coral-more-menu');
    expect(screen.getByRole('menu', { name: 'More actions' }).id).toBe('coral-more-menu');
    fireEvent.keyDown(screen.getByRole('menu', { name: 'More actions' }), { key: 'Escape' });
    expect(onToggleOverflowMenu).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});
