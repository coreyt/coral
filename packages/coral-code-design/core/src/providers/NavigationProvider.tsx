/**
 * NavigationProvider
 *
 * Handles navigation between diagrams and source code.
 * Designed for VS Code compatibility - navigation is delegated to the host.
 */

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import type { NavigationRequest, NavigationProvider as INavigationProvider } from '../types';

// ============================================================================
// Context
// ============================================================================

export interface NavigationContextValue {
  /**
   * Navigate to a file/symbol
   */
  navigate: (request: NavigationRequest) => Promise<void>;

  /**
   * Check if navigation is supported for a request
   */
  canNavigate: (request: NavigationRequest): boolean;

  /**
   * Open a file in the code preview pane (internal)
   */
  previewFile: (file: string, line?: number) => void;

  /**
   * Current preview state
   */
  preview: PreviewState | null;
}

export interface PreviewState {
  file: string;
  line?: number;
  content?: string;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

// ============================================================================
// Provider Props
// ============================================================================

export interface NavigationProviderProps {
  children: ReactNode;

  /**
   * External navigation handler.
   * In standalone: opens in system editor or embedded preview
   * In VS Code: sends command to extension host
   */
  navigationHandler?: INavigationProvider;

  /**
   * File content loader for preview pane.
   */
  fileLoader?: (path: string) => Promise<string>;
}

// ============================================================================
// Provider Component
// ============================================================================

import { useState } from 'react';

export function NavigationProvider({
  children,
  navigationHandler,
  fileLoader,
}: NavigationProviderProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const navigate = useCallback(async (request: NavigationRequest) => {
    if (navigationHandler) {
      await navigationHandler.navigate(request);
    } else {
      // Fallback: open in preview pane
      setPreview({
        file: request.target.file,
        line: request.target.line,
      });
    }
  }, [navigationHandler]);

  const canNavigate = useCallback((request: NavigationRequest): boolean => {
    if (navigationHandler) {
      return navigationHandler.canNavigate(request);
    }
    // Fallback: we can always preview
    return true;
  }, [navigationHandler]);

  const previewFile = useCallback(async (file: string, line?: number) => {
    let content: string | undefined;

    if (fileLoader) {
      try {
        content = await fileLoader(file);
      } catch {
        // Ignore load errors, show path only
      }
    }

    setPreview({ file, line, content });
  }, [fileLoader]);

  const value: NavigationContextValue = {
    navigate,
    canNavigate,
    previewFile,
    preview,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}
