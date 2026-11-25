/**
 * AppHeader - Top application bar extracted from App.tsx
 *
 * 48px bar containing logo, document name, file controls, and action buttons.
 * Follows Coral Design Standard (M3 compact density).
 */

import { UnsavedIndicator } from '../RecoveryBanner';
import { FileControls, type CoralDocument } from '@coral-viz/viz';
import { useEffect, useRef, type KeyboardEvent } from 'react';

export interface AppHeaderProps {
  documentName: string;
  onDocumentNameChange: (name: string) => void;
  isDirty: boolean;
  lastSaveTime: number | null;
  inspectorCollapsed: boolean;
  onToggleInspector: (invoker?: HTMLElement) => void;
  onToggleCommandPalette: () => void;
  onTogglePreferences: () => void;
  onHelp?: () => void;
  onAbout?: () => void;
  onSave: () => CoralDocument;
  onLoad: (doc: CoralDocument) => void;
  /** Raw file hand-off to the shared open pipeline (R-064). */
  onOpenFile?: (file: { name: string; text: string }) => void;
  /** File-read failure hand-off to the shared open pipeline (R-064). */
  onOpenFileError?: (failure: { name: string; error: Error }) => void;
  openAccept?: string;
  overflowMenuOpen: boolean;
  onToggleOverflowMenu: () => void;
  /**
   * Items for the overflow menu. The actions belong to the composition root,
   * which owns export and the document; the header only renders them.
   */
  overflowItems?: Array<{ label: string; action: () => void }>;
  theme: Record<string, string>;
}

export function AppHeader({
  documentName,
  onDocumentNameChange,
  isDirty,
  lastSaveTime,
  inspectorCollapsed,
  onToggleInspector,
  onToggleCommandPalette,
  onTogglePreferences,
  onHelp,
  onAbout,
  onSave,
  onLoad,
  onOpenFile,
  onOpenFileError,
  openAccept,
  overflowMenuOpen,
  onToggleOverflowMenu,
  overflowItems = [],
  theme,
}: AppHeaderProps) {
  const fileControlsHostRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const responsiveOverflowItems = [
    { label: 'Load', action: () => fileControlsHostRef.current?.querySelectorAll('button')[1]?.click() },
    { label: 'Command palette', action: onToggleCommandPalette },
    ...(onHelp ? [{ label: 'Help', action: onHelp }] : []),
    ...(onAbout ? [{ label: 'About Coral', action: onAbout }] : []),
    { label: 'Preferences', action: onTogglePreferences },
    { label: inspectorCollapsed ? 'Show Properties' : 'Hide Properties', action: () => onToggleInspector(moreButtonRef.current ?? undefined) },
  ];
  useEffect(() => {
    if (overflowMenuOpen) queueMicrotask(() => {
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      items.find((item) => item.offsetParent !== null)?.focus();
    });
  }, [overflowMenuOpen]);
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter((item) => item.offsetParent !== null);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onToggleOverflowMenu();
      queueMicrotask(() => moreButtonRef.current?.focus());
      return;
    }
    const target = event.key === 'ArrowDown' ? items[(index + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length]
        : event.key === 'Home' ? items[0]
          : event.key === 'End' ? items[items.length - 1] : undefined;
    if (target) { event.preventDefault(); target.focus(); }
  };
  return (
    <header
      className="coral-app-header"
      style={{
        padding: '8px 16px',
        background: theme.headerBg,
        color: theme.headerText,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        height: '48px',
        flexShrink: 0,
      }}
    >
      {/* Logo/Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span aria-hidden="true" style={{ fontSize: '18px' }}>◇</span>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Coral</span>
      </div>

      {/* Document Name - editable */}
      <input
        className="coral-document-name"
        type="text"
        value={documentName}
        onChange={(e) => onDocumentNameChange(e.target.value)}
        style={{
          background: theme.inputBg,
          border: 'none',
          color: theme.inputText,
          fontSize: '14px',
          padding: '4px 8px',
          borderRadius: '4px',
          outline: 'none',
          minWidth: '150px',
        }}
        onFocus={(e) => (e.target.style.background = theme.controlBg)}
        onBlur={(e) => (e.target.style.background = 'transparent')}
        aria-label="Document name"
      />

      {/* Unsaved Changes Indicator */}
      <UnsavedIndicator isDirty={isDirty} lastSaveTime={lastSaveTime} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Cmd+K hint */}
      <button
        className="coral-button coral-command-hint"
        onClick={onToggleCommandPalette}
        title="Command Palette (Ctrl+K)"
        style={{
          padding: '3px 10px',
          fontSize: '11px',
          borderRadius: '4px',
          border: `1px solid ${theme.controlBorder}`,
          background: 'transparent',
          color: theme.controlTextMuted,
          cursor: 'pointer',
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
        }}
      >
        Ctrl+K
      </button>

      {/* File Controls (Save/Load only, Export moved to overflow) */}
      <div ref={fileControlsHostRef}>
        <FileControls
          className="coral-file-controls"
          document={null}
          onGetDocument={onSave}
          onLoad={onLoad}
          {...(onOpenFile ? { onOpenFile } : {})}
          {...(onOpenFileError ? { onOpenFileError } : {})}
          {...(openAccept ? { accept: openAccept } : {})}
          showExport={false}
        />
      </div>

      {/* Overflow Menu */}
      <div style={{ position: 'relative' }}>
        <button
          ref={moreButtonRef}
          className="coral-button coral-button--quiet coral-more-button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleOverflowMenu();
          }}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={overflowMenuOpen}
          aria-controls="coral-more-menu"
          title="More actions"
          style={{
            padding: '6px 10px',
            fontSize: '14px',
            borderRadius: '4px',
            border: 'none',
            background: overflowMenuOpen ? theme.controlBgActive : 'transparent',
            color: theme.controlText,
            cursor: 'pointer',
          }}
        >
          More
        </button>
        {overflowMenuOpen && (
          <div
            id="coral-more-menu"
            ref={menuRef}
            role="menu"
            aria-label="More actions"
            onKeyDown={handleMenuKeyDown}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: theme.inspectorBg,
              border: `1px solid ${theme.inspectorBorder}`,
              borderRadius: '6px',
              boxShadow: 'var(--coral-shadow-overlay)',
              minWidth: '180px',
              zIndex: 100,
              padding: '4px 0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[...responsiveOverflowItems.map((item) => ({ ...item, responsiveOnly: true })),
              ...overflowItems.map((item) => ({ ...item, responsiveOnly: false }))].map((item) => (
              <button
                role="menuitem"
                className={`coral-menu-item${item.responsiveOnly ? ' coral-menu-item--responsive' : ''}`}
                key={item.label}
                onClick={() => {
                  moreButtonRef.current?.focus();
                  item.action();
                  onToggleOverflowMenu();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 16px',
                  fontSize: '13px',
                  background: 'transparent',
                  border: 'none',
                  color: theme.inspectorText,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = theme.controlBgHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preferences */}
      {onHelp && <button className="coral-button coral-button--quiet coral-header-secondary" type="button" onClick={onHelp} aria-label="Help" title="Help">Help</button>}
      {onAbout && <button className="coral-button coral-button--quiet coral-header-secondary" type="button" onClick={onAbout} aria-label="About Coral" title="About Coral">About</button>}
      <button
        className="coral-button coral-button--quiet coral-header-secondary"
        onClick={onTogglePreferences}
        aria-label="Preferences"
        title="Preferences (Ctrl+,)"
        style={{
          padding: '6px 10px',
          fontSize: '14px',
          borderRadius: '4px',
          border: 'none',
          background: 'transparent',
          color: theme.controlText,
          cursor: 'pointer',
        }}
      >
        Preferences
      </button>

      {/* Inspector Toggle */}
      <button
        className="coral-button coral-button--quiet coral-inspector-toggle"
        onClick={(event) => onToggleInspector(event.currentTarget)}
        aria-label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
        aria-pressed={!inspectorCollapsed}
        style={{
          padding: '6px 10px',
          fontSize: '12px',
          borderRadius: '4px',
          border: 'none',
          background: inspectorCollapsed ? theme.controlBg : theme.controlBgActive,
          color: theme.controlText,
          cursor: 'pointer',
        }}
      >
        {inspectorCollapsed ? 'Properties' : 'Hide Properties'}
      </button>
    </header>
  );
}
