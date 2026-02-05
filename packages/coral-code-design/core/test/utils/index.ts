/**
 * Test utilities for coral-code-design integration tests
 */

export {
  createMockArmadaServer,
  createEmptyGraphServer,
  createUnhealthyServer,
  createNetworkErrorServer,
  type MockArmadaServer,
  type CallRecord,
  type MockConfig,
  type MockResponse,
  type DefaultResponses,
} from './mockArmadaServer';

export {
  renderWithProviders,
  renderConnected,
  renderDisconnected,
  renderWithWorkspace,
  waitForConnection,
  createWorkspaceWithAnnotations,
  DEFAULT_ARMADA_CONFIG,
  DEFAULT_WORKSPACE,
  DEFAULT_ANNOTATION_STORE,
  type ProviderOptions,
  type RenderWithProvidersResult,
} from './renderWithProviders';
