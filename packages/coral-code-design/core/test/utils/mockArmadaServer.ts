/**
 * Mock Armada Server for Integration Testing
 *
 * Provides a controlled mock fetch implementation that simulates
 * Armada HTTP API responses for testing coral-code-design components.
 */

import type { ArmadaStats, ArmadaSymbol, ArmadaSearchResult, BranchConflict } from '../../src/providers/ArmadaProvider';
import type { CoralDocument, GraphMode } from '../../src/types';

// ============================================================================
// Types
// ============================================================================

export interface CallRecord {
  url: string;
  method: string;
  timestamp: number;
  body?: unknown;
}

export interface MockResponse {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: Error;
  delay?: number;
}

export interface MockConfig {
  /** Base URL for the mock server */
  baseUrl?: string;
  /** Default delay for all responses (ms) */
  defaultDelay?: number;
  /** Default responses for standard endpoints */
  defaultResponses?: Partial<DefaultResponses>;
}

export interface DefaultResponses {
  health: { status: string };
  stats: ArmadaStats;
  modes: GraphMode[];
  graph: CoralDocument & { conflicts?: BranchConflict[] };
  symbols: ArmadaSymbol[];
  search: { results: ArmadaSearchResult[] };
  branches: { branches: string[] };
}

export interface MockArmadaServer {
  /** The mock fetch function to use as global.fetch */
  fetch: typeof fetch;
  /** Set a successful response for an endpoint pattern */
  setResponse(endpointPattern: string, response: unknown): void;
  /** Set an error response for an endpoint pattern */
  setError(endpointPattern: string, error: Error, status?: number): void;
  /** Set a delayed response for an endpoint pattern */
  setDelayedResponse(endpointPattern: string, response: unknown, delayMs: number): void;
  /** Set a timeout for an endpoint pattern */
  setTimeout(endpointPattern: string, timeoutMs: number): void;
  /** Reset all custom responses and call history */
  reset(): void;
  /** Get all recorded fetch calls */
  getCallHistory(): CallRecord[];
  /** Get calls matching a pattern */
  getCallsMatching(pattern: string): CallRecord[];
  /** Clear call history without resetting responses */
  clearHistory(): void;
  /** Wait for a specific number of calls to complete */
  waitForCalls(count: number, timeoutMs?: number): Promise<void>;
}

// ============================================================================
// Default Responses
// ============================================================================

const DEFAULT_HEALTH: DefaultResponses['health'] = { status: 'ok' };

const DEFAULT_STATS: DefaultResponses['stats'] = {
  nodes: 100,
  edges: 200,
};

const DEFAULT_MODES: DefaultResponses['modes'] = [
  'call-graph',
  'dependency-graph',
  'inheritance-tree',
  'impact-graph',
  'full-graph',
];

const DEFAULT_GRAPH: DefaultResponses['graph'] = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Mock Graph',
    description: 'Mock graph for testing',
    tags: [],
    version: '1.0.0',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  },
  content: {
    format: 'graph-ir',
    graphIR: {
      nodes: [
        { id: 'node1', label: 'Node 1', type: 'class' },
        { id: 'node2', label: 'Node 2', type: 'function' },
        { id: 'node3', label: 'Node 3', type: 'module' },
      ],
      edges: [
        { id: 'edge1', source: 'node1', target: 'node2', relation: 'calls' },
        { id: 'edge2', source: 'node2', target: 'node3', relation: 'imports' },
      ],
    },
  },
  settings: {
    notation: 'architecture',
    layout: {
      algorithm: 'layered',
      direction: 'TB',
      spacing: { nodeSpacing: 50, layerSpacing: 100 },
    },
  },
};

const DEFAULT_SYMBOLS: DefaultResponses['symbols'] = [
  {
    id: 'scip:src/auth.ts:AuthService#',
    name: 'AuthService',
    type: 'class',
    file: 'src/auth.ts',
    startLine: 10,
    endLine: 100,
  },
  {
    id: 'scip:src/auth.ts:AuthService#login',
    name: 'login',
    type: 'method',
    file: 'src/auth.ts',
    startLine: 20,
    endLine: 35,
    parent: 'scip:src/auth.ts:AuthService#',
  },
];

const DEFAULT_SEARCH: DefaultResponses['search'] = {
  results: [
    {
      id: 'scip:src/auth.ts:AuthService#',
      name: 'AuthService',
      type: 'class',
      file: 'src/auth.ts',
      startLine: 10,
      endLine: 100,
    },
  ],
};

const DEFAULT_BRANCHES: DefaultResponses['branches'] = {
  branches: ['main', 'dev', 'feature/auth'],
};

// ============================================================================
// Factory
// ============================================================================

export function createMockArmadaServer(config: MockConfig = {}): MockArmadaServer {
  const {
    baseUrl = 'http://localhost:8765',
    defaultDelay = 0,
    defaultResponses = {},
  } = config;

  // Merge default responses
  const responses: DefaultResponses = {
    health: defaultResponses.health ?? DEFAULT_HEALTH,
    stats: defaultResponses.stats ?? DEFAULT_STATS,
    modes: defaultResponses.modes ?? DEFAULT_MODES,
    graph: defaultResponses.graph ?? DEFAULT_GRAPH,
    symbols: defaultResponses.symbols ?? DEFAULT_SYMBOLS,
    search: defaultResponses.search ?? DEFAULT_SEARCH,
    branches: defaultResponses.branches ?? DEFAULT_BRANCHES,
  };

  // Custom response overrides
  const customResponses = new Map<string, MockResponse>();

  // Call history
  const callHistory: CallRecord[] = [];

  // Resolve callbacks for waitForCalls
  const waitCallbacks: Array<{ count: number; resolve: () => void }> = [];

  function recordCall(url: string, method: string, body?: unknown): void {
    const record: CallRecord = {
      url,
      method,
      timestamp: Date.now(),
      body,
    };
    callHistory.push(record);

    // Check if any waitCallbacks should be resolved
    for (let i = waitCallbacks.length - 1; i >= 0; i--) {
      if (callHistory.length >= waitCallbacks[i].count) {
        waitCallbacks[i].resolve();
        waitCallbacks.splice(i, 1);
      }
    }
  }

  function getEndpointType(url: string): keyof DefaultResponses | null {
    if (url.includes('/health')) return 'health';
    if (url.includes('/api/stats')) return 'stats';
    if (url.includes('/api/modes')) return 'modes';
    if (url.includes('/api/graph')) return 'graph';
    if (url.includes('/api/symbols')) return 'symbols';
    if (url.includes('/api/search')) return 'search';
    if (url.includes('/api/branches')) return 'branches';
    return null;
  }

  function findCustomResponse(url: string): MockResponse | null {
    for (const [pattern, response] of customResponses) {
      if (url.includes(pattern)) {
        return response;
      }
    }
    return null;
  }

  async function mockFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    let body: unknown;

    if (init?.body) {
      try {
        body = JSON.parse(init.body as string);
      } catch {
        body = init.body;
      }
    }

    recordCall(url, method, body);

    // Check for custom response first
    const customResponse = findCustomResponse(url);
    if (customResponse) {
      const delay = customResponse.delay ?? defaultDelay;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (customResponse.error) {
        throw customResponse.error;
      }

      return {
        ok: customResponse.ok,
        status: customResponse.status,
        json: () => Promise.resolve(customResponse.data),
        text: () => Promise.resolve(JSON.stringify(customResponse.data)),
      } as Response;
    }

    // Use default response based on endpoint
    const endpointType = getEndpointType(url);
    if (!endpointType) {
      return {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        text: () => Promise.resolve('Not found'),
      } as Response;
    }

    if (defaultDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, defaultDelay));
    }

    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(responses[endpointType]),
      text: () => Promise.resolve(JSON.stringify(responses[endpointType])),
    } as Response;
  }

  return {
    fetch: mockFetch as typeof fetch,

    setResponse(endpointPattern: string, response: unknown): void {
      customResponses.set(endpointPattern, {
        ok: true,
        status: 200,
        data: response,
      });
    },

    setError(endpointPattern: string, error: Error, status = 500): void {
      customResponses.set(endpointPattern, {
        ok: false,
        status,
        error,
      });
    },

    setDelayedResponse(endpointPattern: string, response: unknown, delayMs: number): void {
      customResponses.set(endpointPattern, {
        ok: true,
        status: 200,
        data: response,
        delay: delayMs,
      });
    },

    setTimeout(endpointPattern: string, timeoutMs: number): void {
      customResponses.set(endpointPattern, {
        ok: false,
        status: 408,
        error: new Error(`Request timeout after ${timeoutMs}ms`),
        delay: timeoutMs,
      });
    },

    reset(): void {
      customResponses.clear();
      callHistory.length = 0;
    },

    getCallHistory(): CallRecord[] {
      return [...callHistory];
    },

    getCallsMatching(pattern: string): CallRecord[] {
      return callHistory.filter((call) => call.url.includes(pattern));
    },

    clearHistory(): void {
      callHistory.length = 0;
    },

    waitForCalls(count: number, timeoutMs = 5000): Promise<void> {
      if (callHistory.length >= count) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for ${count} calls (got ${callHistory.length})`));
        }, timeoutMs);

        waitCallbacks.push({
          count,
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
        });
      });
    },
  };
}

// ============================================================================
// Preset Fixtures
// ============================================================================

/** Create a mock server with empty graph response */
export function createEmptyGraphServer(): MockArmadaServer {
  return createMockArmadaServer({
    defaultResponses: {
      graph: {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Empty Graph',
          description: '',
          tags: [],
          version: '1.0.0',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
        },
        content: {
          format: 'graph-ir',
          graphIR: { nodes: [], edges: [] },
        },
        settings: {
          notation: 'architecture',
          layout: {
            algorithm: 'layered',
            direction: 'TB',
            spacing: { nodeSpacing: 50, layerSpacing: 100 },
          },
        },
      },
    },
  });
}

/** Create a mock server that fails health check */
export function createUnhealthyServer(): MockArmadaServer {
  const server = createMockArmadaServer();
  server.setResponse('/health', { status: 'error', message: 'Service unavailable' });
  return server;
}

/** Create a mock server that simulates network errors */
export function createNetworkErrorServer(): MockArmadaServer {
  const server = createMockArmadaServer();
  server.setError('/health', new Error('Network error: Connection refused'));
  return server;
}
