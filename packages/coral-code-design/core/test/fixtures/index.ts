/**
 * Test fixtures for coral-code-design integration tests
 *
 * Import fixtures as needed for tests.
 */

// Armada API response fixtures
import healthResponse from './armada/health.json';
import statsResponse from './armada/stats.json';
import modesResponse from './armada/modes.json';
import graphModuleResponse from './armada/graph-module.json';
import graphCallResponse from './armada/graph-call.json';
import symbolsResponse from './armada/symbols.json';
import searchResultsResponse from './armada/search-results.json';
import branchesResponse from './armada/branches.json';

// GraphIR fixtures
import simpleGraphIR from './graphIR/simple.json';
import complexGraphIR from './graphIR/complex.json';

// Workspace fixtures
import minimalWorkspace from './workspace/minimal.json';
import annotatedWorkspace from './workspace/with-annotations.json';

// ============================================================================
// Armada Fixtures
// ============================================================================

export const armadaFixtures = {
  health: healthResponse,
  stats: statsResponse,
  modes: modesResponse,
  graphModule: graphModuleResponse,
  graphCall: graphCallResponse,
  symbols: symbolsResponse,
  searchResults: searchResultsResponse,
  branches: branchesResponse,
} as const;

// ============================================================================
// GraphIR Fixtures
// ============================================================================

export const graphIRFixtures = {
  simple: simpleGraphIR,
  complex: complexGraphIR,
} as const;

// ============================================================================
// Workspace Fixtures
// ============================================================================

export const workspaceFixtures = {
  minimal: minimalWorkspace,
  withAnnotations: annotatedWorkspace,
} as const;

// ============================================================================
// All Fixtures
// ============================================================================

export const fixtures = {
  armada: armadaFixtures,
  graphIR: graphIRFixtures,
  workspace: workspaceFixtures,
} as const;

export default fixtures;
