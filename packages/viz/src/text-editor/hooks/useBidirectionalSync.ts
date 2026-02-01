/**
 * useBidirectionalSync - Hook for bidirectional text ↔ Graph-IR ↔ visual sync
 *
 * Keeps text DSL, Graph-IR, and visual editor in sync with debounced updates.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { GraphIR, CoralNode, CoralEdge } from '../../types.js';

/**
 * Parse function signature - converts text to Graph-IR
 */
export type ParseFunction = (text: string) => ParseResult;

/**
 * Print function signature - converts Graph-IR to text
 */
export type PrintFunction = (graph: GraphIR) => string;

/**
 * Parse result with optional errors
 */
export interface ParseResult {
  success: boolean;
  graph?: GraphIR;
  errors: ParseError[];
}

/**
 * Parse error with location information
 */
export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset?: number;
}

/**
 * Source of the last change
 */
export type ChangeSource = 'text' | 'visual' | 'external';

/**
 * Sync state returned by the hook
 */
export interface SyncState {
  /** Current text content */
  text: string;
  /** Current Graph-IR (null if parse failed) */
  graph: GraphIR | null;
  /** Current parse errors */
  errors: ParseError[];
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Source of the last change */
  lastChangeSource: ChangeSource;
}

/**
 * Sync actions returned by the hook
 */
export interface SyncActions {
  /** Update text (from text editor) */
  setText: (text: string) => void;
  /** Update graph (from visual editor) */
  setGraph: (graph: GraphIR) => void;
  /** Update from visual editor nodes/edges changes */
  setFromVisual: (nodes: CoralNode[], edges: CoralEdge[], originalGraph: GraphIR) => void;
  /** Force sync from external source */
  forceSync: (text: string) => void;
}

/**
 * Options for the sync hook
 */
export interface SyncOptions {
  /** Initial text content */
  initialText?: string;
  /** Initial Graph-IR */
  initialGraph?: GraphIR;
  /** Parse function (text → Graph-IR) */
  parse: ParseFunction;
  /** Print function (Graph-IR → text) */
  print: PrintFunction;
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** Callback when graph changes */
  onGraphChange?: (graph: GraphIR | null) => void;
  /** Callback when errors change */
  onErrorsChange?: (errors: ParseError[]) => void;
  /** Callback when text changes */
  onTextChange?: (text: string) => void;
}

/**
 * Hook for bidirectional synchronization between text and visual editors.
 *
 * Maintains consistency between:
 * - Text DSL (Coral, Mermaid, DOT)
 * - Graph-IR (intermediate representation)
 * - Visual editor state (React Flow nodes/edges)
 *
 * Changes are debounced to avoid excessive updates during typing.
 */
export function useBidirectionalSync(options: SyncOptions): [SyncState, SyncActions] {
  const {
    initialText = '',
    initialGraph,
    parse,
    print,
    debounceMs = 100,
    onGraphChange,
    onErrorsChange,
    onTextChange,
  } = options;

  // State
  const [text, setTextState] = useState(initialText);
  const [graph, setGraphState] = useState<GraphIR | null>(initialGraph ?? null);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastChangeSource, setLastChangeSource] = useState<ChangeSource>('external');

  // Refs for debouncing and preventing feedback loops
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdateRef = useRef(false);

  // Parse text and update graph
  const parseText = useCallback(
    (newText: string): ParseResult => {
      const result = parse(newText);
      setErrors(result.errors);
      onErrorsChange?.(result.errors);

      if (result.success && result.graph) {
        setGraphState(result.graph);
        onGraphChange?.(result.graph);
      }

      return result;
    },
    [parse, onErrorsChange, onGraphChange]
  );

  // Print graph and update text
  const printGraph = useCallback(
    (newGraph: GraphIR): string => {
      const newText = print(newGraph);
      isInternalUpdateRef.current = true;
      setTextState(newText);
      onTextChange?.(newText);
      isInternalUpdateRef.current = false;
      return newText;
    },
    [print, onTextChange]
  );

  // Debounced text update
  const setText = useCallback(
    (newText: string) => {
      // Skip if this is an internal update from printing
      if (isInternalUpdateRef.current) {
        return;
      }

      setTextState(newText);
      setLastChangeSource('text');
      setIsSyncing(true);
      onTextChange?.(newText);

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Debounce parse
      debounceTimeoutRef.current = setTimeout(() => {
        parseText(newText);
        setIsSyncing(false);
      }, debounceMs);
    },
    [debounceMs, parseText, onTextChange]
  );

  // Update from graph (visual editor changes)
  const setGraph = useCallback(
    (newGraph: GraphIR) => {
      setGraphState(newGraph);
      setLastChangeSource('visual');
      setIsSyncing(true);
      onGraphChange?.(newGraph);

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Debounce print
      debounceTimeoutRef.current = setTimeout(() => {
        printGraph(newGraph);
        setErrors([]); // Clear errors when updating from visual
        setIsSyncing(false);
      }, debounceMs);
    },
    [debounceMs, printGraph, onGraphChange]
  );

  // Update from visual editor nodes/edges
  const setFromVisual = useCallback(
    (nodes: CoralNode[], edges: CoralEdge[], originalGraph: GraphIR) => {
      // Convert React Flow nodes/edges back to Graph-IR
      const newGraph: GraphIR = {
        ...originalGraph,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.data.nodeType,
          label: node.data.label,
          description: node.data.description,
          properties: node.data.properties,
          position: node.position,
          dimensions: node.measured
            ? { width: node.measured.width ?? 0, height: node.measured.height ?? 0 }
            : undefined,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.data?.edgeType,
          label: edge.data?.label,
          properties: edge.data?.properties,
        })),
      };

      setGraph(newGraph);
    },
    [setGraph]
  );

  // Force sync from external source
  const forceSync = useCallback(
    (newText: string) => {
      setTextState(newText);
      setLastChangeSource('external');
      onTextChange?.(newText);
      parseText(newText);
    },
    [parseText, onTextChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Initial parse if text provided
  useEffect(() => {
    if (initialText && !initialGraph) {
      parseText(initialText);
    }
  }, []); // Only run once on mount

  const state: SyncState = useMemo(
    () => ({
      text,
      graph,
      errors,
      isSyncing,
      lastChangeSource,
    }),
    [text, graph, errors, isSyncing, lastChangeSource]
  );

  const actions: SyncActions = useMemo(
    () => ({
      setText,
      setGraph,
      setFromVisual,
      forceSync,
    }),
    [setText, setGraph, setFromVisual, forceSync]
  );

  return [state, actions];
}

export default useBidirectionalSync;
