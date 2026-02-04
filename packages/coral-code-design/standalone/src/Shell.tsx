/**
 * Shell Component
 *
 * Application shell with menu bar and window chrome.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { useWorkspace, useArmada } from '@coral-code-design/core';

export interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const { workspace, openWorkspace } = useWorkspace();
  const { connect, disconnect, isConnected } = useArmada();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Handle opening a workspace
  const handleOpenWorkspace = useCallback(async () => {
    // Use File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        // For now, just use the name - full path access would require more setup
        await openWorkspace(dirHandle.name);
      } catch (e) {
        // User cancelled or error
        console.error('Failed to open workspace:', e);
      }
    } else {
      alert('File System Access API not supported in this browser');
    }
  }, [openWorkspace]);

  // Handle Armada connection
  const handleConnect = useCallback(async () => {
    const url = prompt('Armada server URL:', 'http://localhost:8765');
    if (url) {
      await connect({ serverUrl: url, mode: 'call-graph' });
    }
  }, [connect]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
      }}
    >
      {/* Menu bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '32px',
          backgroundColor: 'var(--header-bg)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 8px',
          fontSize: '13px',
        }}
      >
        {/* App icon/name */}
        <span style={{ fontWeight: 600, marginRight: '16px' }}>
          🐚 Coral Code Design
        </span>

        {/* Menus */}
        <MenuButton
          label="File"
          isOpen={menuOpen === 'file'}
          onToggle={() => setMenuOpen(menuOpen === 'file' ? null : 'file')}
        >
          <MenuItem label="Open Workspace..." shortcut="Cmd+O" onClick={handleOpenWorkspace} />
          <MenuItem label="Close Workspace" onClick={() => {}} disabled={!workspace} />
          <MenuDivider />
          <MenuItem label="Save Layout" shortcut="Cmd+S" onClick={() => {}} disabled={!workspace} />
          <MenuItem label="Export..." onClick={() => {}} disabled={!workspace} />
        </MenuButton>

        <MenuButton
          label="View"
          isOpen={menuOpen === 'view'}
          onToggle={() => setMenuOpen(menuOpen === 'view' ? null : 'view')}
        >
          <MenuItem label="Tabs" onClick={() => {}} />
          <MenuItem label="Split Horizontal" onClick={() => {}} />
          <MenuItem label="Split Vertical" onClick={() => {}} />
          <MenuItem label="Grid 2x2" onClick={() => {}} />
          <MenuDivider />
          <MenuItem label="Toggle Navigator" shortcut="Cmd+B" onClick={() => {}} />
          <MenuItem label="Toggle Inspector" shortcut="Cmd+I" onClick={() => {}} />
        </MenuButton>

        <MenuButton
          label="Diagram"
          isOpen={menuOpen === 'diagram'}
          onToggle={() => setMenuOpen(menuOpen === 'diagram' ? null : 'diagram')}
        >
          <MenuItem label="New Diagram" shortcut="Cmd+N" onClick={() => {}} />
          <MenuDivider />
          <MenuItem label="Refresh" shortcut="Cmd+R" onClick={() => {}} />
          <MenuItem label="Zoom to Fit" shortcut="Cmd+0" onClick={() => {}} />
        </MenuButton>

        <MenuButton
          label="Armada"
          isOpen={menuOpen === 'armada'}
          onToggle={() => setMenuOpen(menuOpen === 'armada' ? null : 'armada')}
        >
          {isConnected ? (
            <>
              <MenuItem label="Disconnect" onClick={disconnect} />
              <MenuItem label="Refresh Data" onClick={() => {}} />
            </>
          ) : (
            <MenuItem label="Connect..." onClick={handleConnect} />
          )}
        </MenuButton>

        <MenuButton
          label="Help"
          isOpen={menuOpen === 'help'}
          onToggle={() => setMenuOpen(menuOpen === 'help' ? null : 'help')}
        >
          <MenuItem label="Documentation" onClick={() => window.open('https://github.com/coreyt/coral', '_blank')} />
          <MenuItem label="Keyboard Shortcuts" shortcut="Cmd+?" onClick={() => {}} />
          <MenuDivider />
          <MenuItem label="About" onClick={() => alert('Coral Code Design v0.1.0')} />
        </MenuButton>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Search hint */}
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          🔍 Cmd+P
        </span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Menu Components
// ============================================================================

interface MenuButtonProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function MenuButton({ label, isOpen, onToggle, children }: MenuButtonProps) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          padding: '4px 8px',
          background: isOpen ? 'var(--selected-bg)' : 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        {label}
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: '200px',
            backgroundColor: 'var(--palette-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ label, shortcut, onClick, disabled }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{shortcut}</span>
      )}
    </button>
  );
}

function MenuDivider() {
  return (
    <div
      style={{
        height: '1px',
        backgroundColor: 'var(--border-color)',
        margin: '4px 0',
      }}
    />
  );
}
