/**
 * Workspace Component
 *
 * Root layout component that orchestrates the three-pane layout:
 * Navigator | Diagram Area | Inspector
 */

import { type ReactNode } from 'react';
import type { LayoutMode } from '../../types';

export interface WorkspaceLayoutProps {
  /** Navigator pane (file tree, outline) */
  navigator?: ReactNode;

  /** Main diagram area */
  children: ReactNode;

  /** Inspector pane (properties, annotations) */
  inspector?: ReactNode;

  /** Status bar content */
  statusBar?: ReactNode;

  /** Current layout mode */
  layoutMode?: LayoutMode;

  /** Navigator collapsed state */
  navigatorCollapsed?: boolean;

  /** Inspector collapsed state */
  inspectorCollapsed?: boolean;

  /** Toggle navigator */
  onNavigatorToggle?: () => void;

  /** Toggle inspector */
  onInspectorToggle?: () => void;
}

export function WorkspaceLayout({
  navigator,
  children,
  inspector,
  statusBar,
  navigatorCollapsed = false,
  inspectorCollapsed = false,
}: WorkspaceLayoutProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* Main content area */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Navigator pane */}
        {navigator && !navigatorCollapsed && (
          <div
            style={{
              width: '240px',
              minWidth: '200px',
              maxWidth: '400px',
              borderRight: '1px solid var(--border-color, #e0e0e0)',
              overflow: 'auto',
            }}
          >
            {navigator}
          </div>
        )}

        {/* Diagram area */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>

        {/* Inspector pane */}
        {inspector && !inspectorCollapsed && (
          <div
            style={{
              width: '280px',
              minWidth: '240px',
              maxWidth: '400px',
              borderLeft: '1px solid var(--border-color, #e0e0e0)',
              overflow: 'auto',
            }}
          >
            {inspector}
          </div>
        )}
      </div>

      {/* Status bar */}
      {statusBar && (
        <div
          style={{
            height: '24px',
            borderTop: '1px solid var(--border-color, #e0e0e0)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            fontSize: '12px',
          }}
        >
          {statusBar}
        </div>
      )}
    </div>
  );
}
