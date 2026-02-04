/**
 * ArmadaProvider
 *
 * Manages connection to Armada HTTP API and provides data fetching.
 */

import {
  createContext,
  useContext,
  useCallback,
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
// Armada Stats
// ============================================================================

export interface ArmadaStats {
  nodes: number;
  edges: number;
}

// ============================================================================
// Context
// ============================================================================

export interface ArmadaContextValue {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  stats: ArmadaStats | null;

  // Connection operations
  connect: (config: ArmadaConnectionConfig) => Promise<void>;
  disconnect: () => void;

  // Data fetching
  fetchDiagram: (
    type: DiagramType,
    scope?: ScopeConfig,
    mode?: GraphMode
  ) => Promise<CoralDocument>;

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

// ============================================================================
// Provider Component
// ============================================================================

function ArmadaProviderInner({
  children,
  initialConfig,
}: ArmadaProviderProps) {
  const client = useQueryClient();

  // Connection state
  const {
    data: connectionState,
    refetch: checkConnection,
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

  // Stats query
  const { data: stats } = useQuery({
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
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['armada'] });
    },
  });

  // Fetch diagram
  const fetchDiagram = useCallback(async (
    type: DiagramType,
    scope?: ScopeConfig,
    mode?: GraphMode
  ): Promise<CoralDocument> => {
    if (!connectionState?.config) {
      throw new Error('Not connected to Armada');
    }

    const graphMode = mode ?? diagramTypeToGraphMode(type);
    const url = new URL(`${connectionState.config.serverUrl}/api/graph`);
    url.searchParams.set('mode', graphMode);
    url.searchParams.set('format', 'json');

    if (scope?.rootPath) {
      url.searchParams.set('filter', scope.rootPath);
    }

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch diagram');

    return response.json();
  }, [connectionState]);

  // Connect
  const connect = useCallback(async (config: ArmadaConnectionConfig) => {
    await connectMutation.mutateAsync(config);
  }, [connectMutation]);

  // Disconnect
  const disconnect = useCallback(() => {
    client.setQueryData(['armada', 'connection'], {
      connected: false,
      config: null,
    });
  }, [client]);

  // Refresh
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ['armada'] });
  }, [client]);

  const value: ArmadaContextValue = {
    isConnected: connectionState?.connected ?? false,
    isConnecting: connectMutation.isPending,
    connectionError: connectMutation.error?.message ?? null,
    stats: stats ?? null,
    connect,
    disconnect,
    fetchDiagram,
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
