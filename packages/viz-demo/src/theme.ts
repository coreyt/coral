/**
 * Theme Definitions for Coral viz-demo
 *
 * Provides color palettes for light and dark themes following
 * the Coral Design Standard (M3 + Apple HIG patterns).
 */

import { useMemo, useSyncExternalStore } from 'react';

/**
 * Theme color palette
 */
export interface ThemeColors {
  // App chrome
  headerBg: string;
  headerText: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;

  // Editor pane
  editorBg: string;
  editorText: string;
  editorHeaderBg: string;
  editorHeaderText: string;
  lineNumbersBg: string;
  lineNumbersText: string;
  lineNumbersBorder: string;

  // Canvas
  canvasBg: string;
  canvasText: string;
  canvasStatusBg: string;
  canvasStatusText: string;
  gridColor: string;

  // Inspector panel
  inspectorBg: string;
  inspectorHeaderBg: string;
  inspectorText: string;
  inspectorBorder: string;
  tabActiveBg: string;
  tabActiveText: string;
  tabActiveIndicator: string;
  tabInactiveText: string;

  // Controls (buttons, segmented controls, floating toolbar)
  controlBg: string;
  controlBgHover: string;
  controlBgActive: string;
  controlText: string;
  controlTextMuted: string;
  controlBorder: string;
  floatingToolbarBg: string;
  floatingToolbarShadow: string;

  // Status indicators
  successBg: string;
  successText: string;
  errorBg: string;
  errorText: string;
  warningText: string;

  // Edges and handles
  edgePrimary: string;
  edgeHover: string;
  handleBg: string;
  handleBorder: string;

  // Selection
  selectionPrimary: string;
  selectionHover: string;

  // MiniMap
  miniMapBg: string;
  miniMapBorder: string;
  miniMapMask: string;
}

/**
 * Dark theme colors (VSCode-inspired)
 */
export const darkTheme: ThemeColors = {
  // App chrome
  headerBg: '#1e1e1e',
  headerText: '#ffffff',
  inputBg: 'transparent',
  inputText: '#ffffff',
  inputBorder: '#333333',

  // Editor pane
  editorBg: '#1e1e1e',
  editorText: '#d4d4d4',
  editorHeaderBg: '#252526',
  editorHeaderText: '#888888',
  lineNumbersBg: '#1e1e1e',
  lineNumbersText: '#555555',
  lineNumbersBorder: '#333333',

  // Canvas
  canvasBg: '#1a1a1a',
  canvasText: '#666666',
  canvasStatusBg: '#252526',
  canvasStatusText: '#888888',
  gridColor: '#333333',

  // Inspector panel
  inspectorBg: '#252526',
  inspectorHeaderBg: '#1e1e1e',
  inspectorText: '#d4d4d4',
  inspectorBorder: '#333333',
  tabActiveBg: '#252526',
  tabActiveText: '#ffffff',
  tabActiveIndicator: '#007acc',
  tabInactiveText: '#888888',

  // Controls
  controlBg: '#333333',
  controlBgHover: '#444444',
  controlBgActive: '#555555',
  controlText: '#ffffff',
  controlTextMuted: '#aaaaaa',
  controlBorder: '#555555',
  floatingToolbarBg: '#333333',
  floatingToolbarShadow: 'rgba(0,0,0,0.4)',

  // Status indicators
  successBg: '#1e3a1e',
  successText: '#89d185',
  errorBg: '#5c2626',
  errorText: '#f48771',
  warningText: '#f0ad4e',

  // Edges and handles
  edgePrimary: '#666666',
  edgeHover: '#3794ff',
  handleBg: '#007acc',
  handleBorder: '#1e1e1e',

  // Selection
  selectionPrimary: '#007acc',
  selectionHover: '#3794ff',

  // MiniMap
  miniMapBg: '#252526',
  miniMapBorder: '#333333',
  miniMapMask: 'rgba(0,0,0,0.5)',
};

/**
 * Light theme colors
 */
export const lightTheme: ThemeColors = {
  // App chrome
  headerBg: '#f3f3f3',
  headerText: '#333333',
  inputBg: 'transparent',
  inputText: '#333333',
  inputBorder: '#cccccc',

  // Editor pane
  editorBg: '#ffffff',
  editorText: '#333333',
  editorHeaderBg: '#f3f3f3',
  editorHeaderText: '#666666',
  lineNumbersBg: '#f7f7f7',
  lineNumbersText: '#999999',
  lineNumbersBorder: '#e0e0e0',

  // Canvas
  canvasBg: '#fafafa',
  canvasText: '#666666',
  canvasStatusBg: '#f3f3f3',
  canvasStatusText: '#666666',
  gridColor: '#e0e0e0',

  // Inspector panel
  inspectorBg: '#f3f3f3',
  inspectorHeaderBg: '#e8e8e8',
  inspectorText: '#333333',
  inspectorBorder: '#dddddd',
  tabActiveBg: '#f3f3f3',
  tabActiveText: '#333333',
  tabActiveIndicator: '#0066cc',
  tabInactiveText: '#666666',

  // Controls
  controlBg: '#e8e8e8',
  controlBgHover: '#dddddd',
  controlBgActive: '#d0d0d0',
  controlText: '#333333',
  controlTextMuted: '#666666',
  controlBorder: '#cccccc',
  floatingToolbarBg: '#ffffff',
  floatingToolbarShadow: 'rgba(0,0,0,0.15)',

  // Status indicators
  successBg: '#e6f4ea',
  successText: '#137333',
  errorBg: '#fce8e6',
  errorText: '#c5221f',
  warningText: '#b36b00',

  // Edges and handles
  edgePrimary: '#999999',
  edgeHover: '#0066cc',
  handleBg: '#0066cc',
  handleBorder: '#ffffff',

  // Selection
  selectionPrimary: '#0066cc',
  selectionHover: '#1a8cff',

  // MiniMap
  miniMapBg: '#ffffff',
  miniMapBorder: '#dddddd',
  miniMapMask: 'rgba(255,255,255,0.5)',
};

/**
 * Get the theme colors based on theme preference
 */
export function getThemeColors(
  theme: 'light' | 'dark' | 'system',
  systemPrefersDark?: boolean
): ThemeColors {
  if (theme === 'system') {
    // Use system preference
    const prefersDark = systemPrefersDark ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? darkTheme : lightTheme;
  }
  return theme === 'dark' ? darkTheme : lightTheme;
}

/**
 * Subscribe to system color scheme changes
 */
function subscribeToSystemTheme(callback: () => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

/**
 * Get snapshot of system theme preference
 */
function getSystemThemeSnapshot(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Server snapshot (for SSR, default to dark)
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook to get resolved theme colors based on user preference
 * Automatically updates when system theme changes (for 'system' setting)
 */
export function useThemeColors(theme: 'light' | 'dark' | 'system'): ThemeColors {
  // Subscribe to system theme changes for 'system' mode
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    getServerSnapshot
  );

  return useMemo(
    () => getThemeColors(theme, systemPrefersDark),
    [theme, systemPrefersDark]
  );
}

/**
 * Generate CSS variables for the current theme (for use in style injection)
 */
export function getEdgeStyles(theme: ThemeColors): string {
  return `
    /* Selected edge styling */
    .react-flow__edge.selected .react-flow__edge-path {
      stroke: ${theme.selectionPrimary} !important;
      stroke-width: 3px !important;
    }

    /* Edge hover effect */
    .react-flow__edge:hover .react-flow__edge-path {
      stroke: ${theme.selectionHover} !important;
      stroke-width: 2.5px !important;
    }

    /* Reconnection handle styling */
    .react-flow__edge.selected .react-flow__edge-interaction {
      stroke: transparent;
      stroke-width: 20px;
      cursor: crosshair;
    }

    /* Source/target handles during reconnection */
    .react-flow__handle.connectable {
      background: ${theme.handleBg};
      border: 2px solid ${theme.handleBorder};
      width: 10px;
      height: 10px;
    }

    .react-flow__handle.connectable:hover {
      background: ${theme.selectionHover};
      transform: scale(1.2);
    }

    /* React Flow controls styling */
    .react-flow__controls {
      display: none; /* Hidden - using floating toolbar instead */
    }

    /* React Flow attribution */
    .react-flow__attribution {
      background: transparent !important;
    }
    .react-flow__attribution a {
      color: ${theme.lineNumbersText} !important;
    }
  `;
}
