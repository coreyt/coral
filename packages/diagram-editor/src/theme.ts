/**
 * Theme Definitions for Coral Diagram Editor
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
  headerBg: '#1e242b',
  headerText: '#edf1f4',
  inputBg: 'transparent',
  inputText: '#edf1f4',
  inputBorder: '#667483',

  // Editor pane
  editorBg: '#1e242b',
  editorText: '#edf1f4',
  editorHeaderBg: '#242b33',
  editorHeaderText: '#aeb8c2',
  lineNumbersBg: '#1e242b',
  lineNumbersText: '#aeb8c2',
  lineNumbersBorder: '#3c4651',

  // Canvas
  canvasBg: '#181d22',
  canvasText: '#aeb8c2',
  canvasStatusBg: '#242b33',
  canvasStatusText: '#aeb8c2',
  gridColor: '#3c4651',

  // Inspector panel
  inspectorBg: '#1e242b',
  inspectorHeaderBg: '#242b33',
  inspectorText: '#edf1f4',
  inspectorBorder: '#3c4651',
  tabActiveBg: '#242b33',
  tabActiveText: '#edf1f4',
  tabActiveIndicator: '#e07a66',
  tabInactiveText: '#aeb8c2',

  // Controls
  controlBg: '#28313a',
  controlBgHover: '#242b33',
  controlBgActive: '#492b28',
  controlText: '#edf1f4',
  controlTextMuted: '#aeb8c2',
  controlBorder: '#667483',
  floatingToolbarBg: '#28313a',
  floatingToolbarShadow: 'rgba(0,0,0,0.4)',

  // Status indicators
  successBg: '#1e242b',
  successText: '#7fd1a3',
  errorBg: '#492b28',
  errorText: '#ff9393',
  warningText: '#f0c369',

  // Edges and handles
  edgePrimary: '#666666',
  edgeHover: '#e07a66',
  handleBg: '#e07a66',
  handleBorder: '#1e242b',

  // Selection
  selectionPrimary: '#e07a66',
  selectionHover: '#f18e79',

  // MiniMap
  miniMapBg: '#242b33',
  miniMapBorder: '#3c4651',
  miniMapMask: 'rgba(0,0,0,0.5)',
};

/**
 * Light theme colors
 */
export const lightTheme: ThemeColors = {
  // App chrome
  headerBg: '#ffffff',
  headerText: '#1c2530',
  inputBg: 'transparent',
  inputText: '#1c2530',
  inputBorder: '#9ca8b5',

  // Editor pane
  editorBg: '#ffffff',
  editorText: '#1c2530',
  editorHeaderBg: '#f7f8fa',
  editorHeaderText: '#5b6877',
  lineNumbersBg: '#f7f8fa',
  lineNumbersText: '#5b6877',
  lineNumbersBorder: '#cdd5dd',

  // Canvas
  canvasBg: '#fbfcfd',
  canvasText: '#5b6877',
  canvasStatusBg: '#f7f8fa',
  canvasStatusText: '#5b6877',
  gridColor: '#cdd5dd',

  // Inspector panel
  inspectorBg: '#ffffff',
  inspectorHeaderBg: '#f7f8fa',
  inspectorText: '#1c2530',
  inspectorBorder: '#cdd5dd',
  tabActiveBg: '#f7f8fa',
  tabActiveText: '#1c2530',
  tabActiveIndicator: '#b94835',
  tabInactiveText: '#5b6877',

  // Controls
  controlBg: '#f7f8fa',
  controlBgHover: '#f4f6f8',
  controlBgActive: '#f7e7e2',
  controlText: '#1c2530',
  controlTextMuted: '#5b6877',
  controlBorder: '#9ca8b5',
  floatingToolbarBg: '#ffffff',
  floatingToolbarShadow: 'rgba(0,0,0,0.15)',

  // Status indicators
  successBg: '#f7f8fa',
  successText: '#246b45',
  errorBg: '#f7e7e2',
  errorText: '#a92929',
  warningText: '#8b5b00',

  // Edges and handles
  edgePrimary: '#999999',
  edgeHover: '#b94835',
  handleBg: '#b94835',
  handleBorder: '#ffffff',

  // Selection
  selectionPrimary: '#b94835',
  selectionHover: '#9e3728',

  // MiniMap
  miniMapBg: '#ffffff',
  miniMapBorder: '#cdd5dd',
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
