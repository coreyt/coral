/**
 * Test rendering utility with providers
 *
 * Wraps components in the necessary providers for integration testing.
 */

import React, { type ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ArmadaProvider } from '../../src/providers/ArmadaProvider';
import type { ArmadaConnectionConfig, Workspace, AnnotationStore } from '../../src/types';
import { createMockArmadaServer, type MockArmadaServer } from './mockArmadaServer';

// ============================================================================
// Types
// ============================================================================

export interface ProviderOptions {
  /** Armada connection configuration */
  armadaConfig?: ArmadaConnectionConfig;
  /** Initial workspace state (partial) */
  workspaceState?: Partial<Workspace>;
  /** Mock Armada server instance (created if not provided) */
  mockServer?: MockArmadaServer;
  /** Called when graph mode changes */
  onModeChange?: (mode: string) => void;
}

export interface RenderWithProvidersResult extends RenderResult {
  /** Mock Armada server for controlling responses */
  armada: MockArmadaServer;
  /** Rerender with the same providers */
  rerenderWithProviders: (ui: ReactElement) => void;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_ARMADA_CONFIG: ArmadaConnectionConfig = {
  serverUrl: 'http://localhost:8765',
  mode: 'call-graph',
};

const DEFAULT_ANNOTATION_STORE: AnnotationStore = {
  version: '1.0.0',
  nodes: {},
  edges: {},
  groups: [],
  tags: [],
  orphaned: [],
};

const DEFAULT_WORKSPACE: Workspace = {
  id: 'test-workspace',
  name: 'Test Workspace',
  rootPath: '/test/project',
  armadaConnection: DEFAULT_ARMADA_CONFIG,
  openDiagrams: [],
  activeLayout: {
    mode: 'tabs',
    panes: [],
    linkedSelection: false,
    linkedNavigation: false,
    scopeLinking: {
      enabled: false,
      mode: 'manual',
      primaryPane: '',
      linkedPanes: [],
    },
  },
  annotations: DEFAULT_ANNOTATION_STORE,
  settings: {
    defaultNotation: 'architecture',
    defaultDiagramType: 'codebase-overview',
    autoRefresh: false,
    refreshInterval: 30000,
  },
};

// ============================================================================
// Provider Wrapper Factory
// ============================================================================

function createWrapper(
  options: ProviderOptions,
  mockServer: MockArmadaServer
): React.FC<{ children: React.ReactNode }> {
  const armadaConfig = options.armadaConfig ?? DEFAULT_ARMADA_CONFIG;

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      ArmadaProvider,
      {
        initialConfig: armadaConfig,
        onModeChange: options.onModeChange,
      },
      children
    );
  };
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render a component with all necessary providers for integration testing.
 *
 * @example
 * ```ts
 * const { armada, getByText } = renderWithProviders(<MyComponent />);
 *
 * // Control mock server responses
 * armada.setResponse('/api/graph', myCustomGraph);
 *
 * // Assert on rendered content
 * expect(getByText('Node 1')).toBeInTheDocument();
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {}
): RenderWithProvidersResult {
  const {
    armadaConfig,
    workspaceState,
    mockServer,
    onModeChange,
    ...renderOptions
  } = options;

  // Create or use provided mock server
  const server = mockServer ?? createMockArmadaServer();

  // Install mock fetch globally
  const originalFetch = global.fetch;
  global.fetch = server.fetch;

  // Create wrapper with providers
  const wrapper = createWrapper(
    { armadaConfig, workspaceState, onModeChange },
    server
  );

  // Render
  const result = render(ui, { wrapper, ...renderOptions });

  // Create rerender function
  const rerenderWithProviders = (newUi: ReactElement) => {
    result.rerender(React.createElement(wrapper, null, newUi));
  };

  // Cleanup: restore original fetch on unmount
  const originalUnmount = result.unmount;
  result.unmount = () => {
    global.fetch = originalFetch;
    return originalUnmount();
  };

  return {
    ...result,
    armada: server,
    rerenderWithProviders,
  };
}

// ============================================================================
// Specialized Render Functions
// ============================================================================

/**
 * Render with a connected Armada instance (health check passes)
 */
export function renderConnected(
  ui: ReactElement,
  options: Omit<ProviderOptions, 'armadaConfig'> & Omit<RenderOptions, 'wrapper'> = {}
): RenderWithProvidersResult {
  return renderWithProviders(ui, {
    ...options,
    armadaConfig: DEFAULT_ARMADA_CONFIG,
  });
}

/**
 * Render with a disconnected Armada instance (no config)
 */
export function renderDisconnected(
  ui: ReactElement,
  options: Omit<ProviderOptions, 'armadaConfig'> & Omit<RenderOptions, 'wrapper'> = {}
): RenderWithProvidersResult {
  const server = options.mockServer ?? createMockArmadaServer();
  server.setError('/health', new Error('Not connected'));

  return renderWithProviders(ui, {
    ...options,
    armadaConfig: undefined,
    mockServer: server,
  });
}

/**
 * Render with a specific workspace state
 */
export function renderWithWorkspace(
  ui: ReactElement,
  workspaceOverrides: Partial<Workspace>,
  options: Omit<ProviderOptions, 'workspaceState'> & Omit<RenderOptions, 'wrapper'> = {}
): RenderWithProvidersResult {
  const workspace: Workspace = {
    ...DEFAULT_WORKSPACE,
    ...workspaceOverrides,
  };

  return renderWithProviders(ui, {
    ...options,
    workspaceState: workspace,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wait for the Armada connection to be established
 */
export async function waitForConnection(
  armada: MockArmadaServer,
  timeoutMs = 5000
): Promise<void> {
  await armada.waitForCalls(3, timeoutMs); // health + stats + modes
}

/**
 * Create a workspace with annotations
 */
export function createWorkspaceWithAnnotations(
  annotations: Partial<AnnotationStore>
): Partial<Workspace> {
  return {
    annotations: {
      ...DEFAULT_ANNOTATION_STORE,
      ...annotations,
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_ARMADA_CONFIG, DEFAULT_WORKSPACE, DEFAULT_ANNOTATION_STORE };
