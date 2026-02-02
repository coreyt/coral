/**
 * Armada Connection Hook
 *
 * Manages connection to Armada's HTTP visualization API.
 * Requirement: CORAL-REQ-017 (Armada HTTP Datasource)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CoralDocument } from '@coral/viz';

/** Available graph visualization modes from Armada */
export type GraphMode =
  | 'call-graph'
  | 'dependency-graph'
  | 'inheritance-tree'
  | 'impact-graph'
  | 'full-graph';

/** Connection configuration */
export interface ArmadaConnectionConfig {
  serverUrl: string;
  mode: GraphMode;
}

/** Graph statistics from Armada */
export interface ArmadaStats {
  nodes: number;
  edges: number;
}

/** Hook options */
export interface UseArmadaConnectionOptions {
  /** Callback when a document is loaded from Armada */
  onDocumentLoad?: (doc: CoralDocument) => void;
  /** Initial configuration (overrides localStorage) */
  initialConfig?: Partial<ArmadaConnectionConfig>;
}

/** Hook return value */
export interface ArmadaConnectionState {
  /** Whether currently connected to Armada */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Whether a fetch operation is in progress */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Current connection configuration */
  config: ArmadaConnectionConfig;
  /** Graph statistics from Armada */
  stats: ArmadaStats | null;
  /** Available graph modes from server */
  availableModes: GraphMode[];
  /** Connect to Armada server (optionally with new config) */
  connect: (newConfig?: Partial<ArmadaConnectionConfig>) => Promise<void>;
  /** Disconnect from Armada */
  disconnect: () => void;
  /** Refresh current graph */
  refresh: () => Promise<void>;
  /** Update configuration */
  setConfig: (config: Partial<ArmadaConnectionConfig>) => void;
  /** Change mode and fetch new graph */
  setModeAndFetch: (mode: GraphMode) => Promise<void>;
}

const STORAGE_KEY = 'coral-armada-config';

const DEFAULT_CONFIG: ArmadaConnectionConfig = {
  serverUrl: 'http://localhost:8765',
  mode: 'call-graph',
};

/** Load config from localStorage */
function loadStoredConfig(): Partial<ArmadaConnectionConfig> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

/** Save config to localStorage */
function saveConfig(config: ArmadaConnectionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing Armada HTTP API connection
 */
export function useArmadaConnection(
  options: UseArmadaConnectionOptions = {}
): ArmadaConnectionState {
  const { onDocumentLoad, initialConfig } = options;

  // Load initial config from localStorage, then override with props
  const [config, setConfigState] = useState<ArmadaConnectionConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...loadStoredConfig(),
    ...initialConfig,
  }));

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ArmadaStats | null>(null);
  const [availableModes, setAvailableModes] = useState<GraphMode[]>([
    'call-graph',
    'dependency-graph',
    'inheritance-tree',
    'impact-graph',
    'full-graph',
  ]);

  // Keep callback ref stable
  const onDocumentLoadRef = useRef(onDocumentLoad);
  useEffect(() => {
    onDocumentLoadRef.current = onDocumentLoad;
  }, [onDocumentLoad]);

  /** Fetch graph from Armada */
  const fetchGraph = useCallback(async (serverUrl: string, mode: GraphMode): Promise<CoralDocument> => {
    const url = `${serverUrl}/api/graph?mode=${mode}&format=json`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }, []);

  /** Fetch stats from Armada */
  const fetchStats = useCallback(async (serverUrl: string): Promise<ArmadaStats> => {
    const url = `${serverUrl}/api/stats`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status}`);
    }

    return response.json();
  }, []);

  /** Fetch available modes from Armada */
  const fetchModes = useCallback(async (serverUrl: string): Promise<GraphMode[]> => {
    const url = `${serverUrl}/api/modes`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch modes: ${response.status}`);
    }

    return response.json();
  }, []);

  /** Check server health */
  const checkHealth = useCallback(async (serverUrl: string): Promise<boolean> => {
    const url = `${serverUrl}/health`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.status === 'ok';
  }, []);

  /** Connect to Armada server */
  const connect = useCallback(async (newConfig?: Partial<ArmadaConnectionConfig>) => {
    // Apply any new config first
    const effectiveConfig = newConfig ? { ...config, ...newConfig } : config;
    if (newConfig) {
      setConfigState(effectiveConfig);
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Check server health first
      await checkHealth(effectiveConfig.serverUrl);

      // Fetch initial graph
      const doc = await fetchGraph(effectiveConfig.serverUrl, effectiveConfig.mode);

      // Mark as connected
      setIsConnected(true);
      saveConfig(effectiveConfig);

      // Notify callback
      if (onDocumentLoadRef.current) {
        onDocumentLoadRef.current(doc);
      }

      // Fetch stats and modes in background (don't block connection)
      fetchStats(effectiveConfig.serverUrl)
        .then(setStats)
        .catch(() => {/* ignore */});

      fetchModes(effectiveConfig.serverUrl)
        .then(setAvailableModes)
        .catch(() => {/* ignore */});

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [config, checkHealth, fetchGraph, fetchStats, fetchModes]);

  /** Disconnect from Armada */
  const disconnect = useCallback(() => {
    setIsConnected(false);
    setStats(null);
    setError(null);
  }, []);

  /** Refresh current graph */
  const refresh = useCallback(async () => {
    if (!isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const doc = await fetchGraph(config.serverUrl, config.mode);

      if (onDocumentLoadRef.current) {
        onDocumentLoadRef.current(doc);
      }

      // Also refresh stats
      fetchStats(config.serverUrl)
        .then(setStats)
        .catch(() => {/* ignore */});

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, config, fetchGraph, fetchStats]);

  /** Update configuration */
  const setConfig = useCallback((updates: Partial<ArmadaConnectionConfig>) => {
    setConfigState(prev => ({ ...prev, ...updates }));
  }, []);

  /** Change mode and fetch new graph */
  const setModeAndFetch = useCallback(async (mode: GraphMode) => {
    setConfig({ mode });

    if (!isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const doc = await fetchGraph(config.serverUrl, mode);

      if (onDocumentLoadRef.current) {
        onDocumentLoadRef.current(doc);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mode switch failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, config.serverUrl, setConfig, fetchGraph]);

  return {
    isConnected,
    isConnecting,
    isLoading,
    error,
    config,
    stats,
    availableModes,
    connect,
    disconnect,
    refresh,
    setConfig,
    setModeAndFetch,
  };
}
