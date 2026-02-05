/**
 * ArmadaProvider
 *
 * Manages connection to Armada HTTP API and provides data fetching.
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ArmadaConnectionConfig,
  GraphMode,
  DiagramType,
  ScopeConfig,
  CoralDocument,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODES: GraphMode[] = [
  'call-graph',
  'dependency-graph',
  'inheritance-tree',
  'impact-graph',
  'full-graph',
];

// ============================================================================
// Armada Stats
// ============================================================================

export interface ArmadaStats {
  nodes: number;
  edges: number;
}

// ============================================================================
// Context
// ============================================================================

/**
 * Symbol node from Armada knowledge graph
 */
export interface ArmadaSymbol {
  id: string;
  name: string;
  type: string;
  file: string;
  startLine: number;
  endLine: number;
  parent?: string;
}

/**
 * Search result from Armada
 */
export interface ArmadaSearchResult {
  id: string;
  name: string;
  type: string;
  file: string;
  startLine: number;
  endLine: number;
}

/**
 * Branch projection configuration
 */
export interface BranchProjectionConfig {
  /** Base branch (e.g., "dev") */
  baseBranch: string;
  /** Branches to include in the projection */
  includeBranches: string[];
}

/**
 * Conflict detected in branch projection
 */
export interface BranchConflict {
  file_path: string;
  branches: string[];
  conflict_type: 'both_modified' | 'deleted_modified' | 'renamed';
}

export interface ArmadaContextValue {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  stats: ArmadaStats | null;

  // Mode state
  currentMode: GraphMode | null;
  availableModes: GraphMode[];
  setMode: (mode: GraphMode) => void;

  // Branch projection state
  branchProjection: BranchProjectionConfig | null;
  setBranchProjection: (config: BranchProjectionConfig | null) => void;
  availableBranches: string[];
  fetchBranches: () => Promise<string[]>;

  // Refresh state
  isRefreshing: boolean;

  // Connection operations
  connect: (config: ArmadaConnectionConfig) => Promise<void>;
  disconnect: () => void;

  // Data fetching (returns conflicts when branch projection is active)
  fetchDiagram: (
    type: DiagramType,
    scope?: ScopeConfig,
    mode?: GraphMode
  ) => Promise<CoralDocument & { conflicts?: BranchConflict[] }>;

  // Symbol fetching
  fetchSymbols: (scope: string) => Promise<ArmadaSymbol[]>;

  // Search
  search: (query: string) => Promise<ArmadaSearchResult[]>;

  // Refresh
  refresh: () => Promise<void>;
}

const ArmadaContext = createContext<ArmadaContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export function useArmada(): ArmadaContextValue {
  const context = useContext(ArmadaContext);
  if (!context) {
    throw new Error('useArmada must be used within an ArmadaProvider');
  }
  return context;
}

// ============================================================================
// Provider Props
// ============================================================================

export interface ArmadaProviderProps {
  children: ReactNode;
  initialConfig?: ArmadaConnectionConfig;
  /** Called when the graph mode changes */
  onModeChange?: (mode: GraphMode) => void;
}

// ============================================================================
// Internal Query Client
// ============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      retry: 1,
    },
  },
});

/**
 * Clear all cached queries. Use in tests to ensure fresh state.
 * @internal - For testing only
 */
export function clearArmadaQueryCache(): void {
  queryClient.clear();
}

// ============================================================================
// Provider Component
// ============================================================================

function ArmadaProviderInner({
  children,
  initialConfig,
  onModeChange,
}: ArmadaProviderProps) {
  const client = useQueryClient();

  // Mode state
  const [currentMode, setCurrentMode] = useState<GraphMode | null>(
    initialConfig?.mode ?? null
  );

  // Branch projection state
  const [branchProjection, setBranchProjectionState] = useState<BranchProjectionConfig | null>(
    null
  );
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [availableModes, setAvailableModes] = useState<GraphMode[]>(DEFAULT_MODES);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Connection state
  const {
    data: connectionState,
    refetch: checkConnection,
    isFetching: isCheckingConnection,
  } = useQuery({
    queryKey: ['armada', 'connection'],
    queryFn: async () => {
      if (!initialConfig) return { connected: false, config: null };

      try {
        const response = await fetch(`${initialConfig.serverUrl}/health`);
        if (!response.ok) throw new Error('Health check failed');

        const data = await response.json();
        return {
          connected: data.status === 'ok',
          config: initialConfig,
        };
      } catch {
        return { connected: false, config: initialConfig };
      }
    },
    enabled: !!initialConfig,
  });

  // Fetch available modes when connected
  useQuery({
    queryKey: ['armada', 'modes'],
    queryFn: async () => {
      if (!connectionState?.config) return DEFAULT_MODES;

      try {
        const response = await fetch(`${connectionState.config.serverUrl}/api/modes`);
        if (!response.ok) return DEFAULT_MODES;

        const modes = await response.json();
        setAvailableModes(modes as GraphMode[]);
        return modes as GraphMode[];
      } catch {
        return DEFAULT_MODES;
      }
    },
    enabled: connectionState?.connected ?? false,
  });

  // Stats query
  const { data: stats, isFetching: isFetchingStats } = useQuery({
    queryKey: ['armada', 'stats'],
    queryFn: async () => {
      if (!connectionState?.config) throw new Error('Not connected');

      const response = await fetch(`${connectionState.config.serverUrl}/api/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');

      return response.json() as Promise<ArmadaStats>;
    },
    enabled: connectionState?.connected ?? false,
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async (config: ArmadaConnectionConfig) => {
      const response = await fetch(`${config.serverUrl}/health`);
      if (!response.ok) throw new Error('Failed to connect to Armada');

      const data = await response.json();
      if (data.status !== 'ok') throw new Error('Armada server unhealthy');

      return config;
    },
    onSuccess: (config) => {
      setCurrentMode(config.mode);
      client.invalidateQueries({ queryKey: ['armada'] });
    },
  });

  // Set mode with callback notification
  const setMode = useCallback((mode: GraphMode) => {
    setCurrentMode(mode);
    onModeChange?.(mode);
    // Invalidate diagram-related queries when mode changes
    client.invalidateQueries({ queryKey: ['armada', 'diagram'] });
  }, [client, onModeChange]);

  // Set branch projection
  const setBranchProjection = useCallback((config: BranchProjectionConfig | null) => {
    setBranchProjectionState(config);
    // Invalidate diagram-related queries when branch projection changes
    client.invalidateQueries({ queryKey: ['armada', 'diagram'] });
  }, [client]);

  // Fetch diagram
  const fetchDiagram = useCallback(async (
    type: DiagramType,
    scope?: ScopeConfig,
    mode?: GraphMode
  ): Promise<CoralDocument & { conflicts?: BranchConflict[] }> => {
    if (!connectionState?.config) {
      throw new Error('Not connected to Armada');
    }

    const graphMode = mode ?? currentMode ?? diagramTypeToGraphMode(type);
    const url = new URL(`${connectionState.config.serverUrl}/api/graph`);
    url.searchParams.set('mode', graphMode);
    url.searchParams.set('format', 'json');

    if (scope?.rootPath) {
      url.searchParams.set('filter', scope.rootPath);
    }

    // Add branch projection parameters
    if (branchProjection) {
      const branches = [branchProjection.baseBranch, ...branchProjection.includeBranches];
      url.searchParams.set('include_branches', branches.join(','));
    }

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch diagram');

    return response.json();
  }, [connectionState, currentMode, branchProjection]);

  // Fetch symbols for a scope (file or directory)
  const fetchSymbols = useCallback(async (scope: string): Promise<ArmadaSymbol[]> => {
    if (!connectionState?.config) {
      throw new Error('Not connected to Armada');
    }

    const url = new URL(`${connectionState.config.serverUrl}/api/symbols`);
    url.searchParams.set('scope', scope);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch symbols');

    return response.json();
  }, [connectionState]);

  // Search for symbols
  const search = useCallback(async (query: string): Promise<ArmadaSearchResult[]> => {
    if (!connectionState?.config) {
      throw new Error('Not connected to Armada');
    }

    const url = new URL(`${connectionState.config.serverUrl}/api/search`);
    url.searchParams.set('query', query);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to search');

    const data = await response.json();
    return data.results ?? [];
  }, [connectionState]);

  // Fetch available branches
  const fetchBranches = useCallback(async (): Promise<string[]> => {
    if (!connectionState?.config) {
      return [];
    }

    try {
      const url = new URL(`${connectionState.config.serverUrl}/api/branches`);
      const response = await fetch(url.toString());

      if (!response.ok) {
        // Armada may not support branches yet, return empty array
        return [];
      }

      const data = await response.json();
      const branches = data.branches ?? [];
      setAvailableBranches(branches);
      return branches;
    } catch {
      // Graceful fallback if API doesn't exist
      return [];
    }
  }, [connectionState]);

  // Connect
  const connect = useCallback(async (config: ArmadaConnectionConfig) => {
    await connectMutation.mutateAsync(config);
  }, [connectMutation]);

  // Disconnect
  const disconnect = useCallback(() => {
    setCurrentMode(null);
    client.setQueryData(['armada', 'connection'], {
      connected: false,
      config: null,
    });
  }, [client]);

  // Refresh
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await client.invalidateQueries({ queryKey: ['armada'] });
    } finally {
      setIsRefreshing(false);
    }
  }, [client]);

  // Update isRefreshing based on query states
  useEffect(() => {
    setIsRefreshing(isCheckingConnection || isFetchingStats);
  }, [isCheckingConnection, isFetchingStats]);

  const value: ArmadaContextValue = {
    isConnected: connectionState?.connected ?? false,
    isConnecting: connectMutation.isPending,
    connectionError: connectMutation.error?.message ?? null,
    stats: stats ?? null,
    currentMode,
    availableModes,
    setMode,
    branchProjection,
    setBranchProjection,
    availableBranches,
    fetchBranches,
    isRefreshing,
    connect,
    disconnect,
    fetchDiagram,
    fetchSymbols,
    search,
    refresh,
  };

  return (
    <ArmadaContext.Provider value={value}>
      {children}
    </ArmadaContext.Provider>
  );
}

export function ArmadaProvider(props: ArmadaProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ArmadaProviderInner {...props} />
    </QueryClientProvider>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function diagramTypeToGraphMode(type: DiagramType): GraphMode {
  switch (type) {
    case 'call-graph':
      return 'call-graph';
    case 'dependency-graph':
    case 'module-graph':
    case 'codebase-overview':
      return 'dependency-graph';
    case 'inheritance-tree':
      return 'inheritance-tree';
    case 'impact-analysis':
      return 'impact-graph';
    default:
      return 'full-graph';
  }
}
