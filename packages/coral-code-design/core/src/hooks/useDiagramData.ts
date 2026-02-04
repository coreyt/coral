/**
 * useDiagramData Hook
 *
 * Fetches diagram data from Armada and transforms it to GraphIR.
 */

import { useState, useEffect, useCallback } from 'react';
import { useArmada } from '../providers/ArmadaProvider';
import type { DiagramReference, GraphIR, CoralDocument } from '../types';

export interface UseDiagramDataOptions {
  /** Whether to auto-fetch when diagram ref changes */
  autoFetch?: boolean;
}

export interface UseDiagramDataResult {
  /** The fetched GraphIR data */
  graphIR: GraphIR | null;

  /** The full document (for settings, metadata) */
  document: CoralDocument | null;

  /** Whether data is currently being fetched */
  isLoading: boolean;

  /** Error message if fetch failed */
  error: string | null;

  /** Manually trigger a fetch/refresh */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching and managing diagram data from Armada
 */
export function useDiagramData(
  diagramRef: DiagramReference | null,
  options: UseDiagramDataOptions = {}
): UseDiagramDataResult {
  const { autoFetch = true } = options;
  const { isConnected, fetchDiagram } = useArmada();

  const [graphIR, setGraphIR] = useState<GraphIR | null>(null);
  const [document, setDocument] = useState<CoralDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isConnected || !diagramRef) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const doc = await fetchDiagram(diagramRef.type, diagramRef.scope);
      setDocument(doc);

      // Extract GraphIR from document
      if (doc.content.format === 'graph-ir' && doc.content.graphIR) {
        setGraphIR(doc.content.graphIR);
      } else {
        // If it's DSL format, we'd need to parse it
        // For now, we only support graph-ir format
        setError('Unsupported content format');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch diagram';
      setError(message);
      setGraphIR(null);
      setDocument(null);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, diagramRef, fetchDiagram]);

  // Auto-fetch when diagram ref changes
  useEffect(() => {
    if (autoFetch && isConnected && diagramRef) {
      fetchData();
    }
  }, [autoFetch, isConnected, diagramRef?.id, fetchData]);

  // Clear data when disconnected
  useEffect(() => {
    if (!isConnected) {
      setGraphIR(null);
      setDocument(null);
      setError(null);
    }
  }, [isConnected]);

  return {
    graphIR,
    document,
    isLoading,
    error,
    refetch: fetchData,
  };
}
