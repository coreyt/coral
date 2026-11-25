/**
 * useBidirectionalSync - Hook for bidirectional text ↔ Graph-IR ↔ visual sync
 *
 * Keeps text DSL, Graph-IR, and visual editor in sync with debounced updates.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { GraphIR, CoralNode, CoralEdge } from '../../types.js';
import type { EditorDiagnostic } from '../TextEditor.js';
import {
  convertFlowToGraphEdges,
  convertFlowToGraphNodes,
} from '../../editor/converter.js';

/**
 * Parse function signature - converts text to Graph-IR
 */
export type ParseFunction = (text: string) => SyncParseResult;

/**
 * Print function signature - converts Graph-IR to text
 */
export type PrintFunction = (graph: GraphIR) => string;

/** Additive diagnostic printer contract; structurally accepts language results. */
export interface SyncPrintDiagnostic extends EditorDiagnostic {
  message: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface SyncPrintResult {
  text: string;
  diagnostics: SyncPrintDiagnostic[];
}

export type DiagnosticPrintFunction = (graph: GraphIR) => SyncPrintResult;

/**
 * Result of the parse function a host injects.
 *
 * Deliberately more permissive than `@coral-viz/language`'s `ParseResult` — this
 * is the contract for any injected parser, Coral, Mermaid or DOT — and named
 * distinctly so the ecosystem does not ship two public types called
 * `SyncParseResult` (R-011 AC-7).
 */
export interface SyncParseResult {
  success: boolean;
  graph?: GraphIR;
  errors: SyncParseError[];
}

/**
 * Parse error with location information
 */
export interface SyncParseError extends EditorDiagnostic {
  message: string;
  line: number;
  column: number;
  offset?: number;
}

/** @deprecated Use {@link SyncParseResult}. Kept for the 0.2.x line. */
export type ParseResult = SyncParseResult;
/** @deprecated Use {@link SyncParseError}. Kept for the 0.2.x line. */
export type ParseError = SyncParseError;

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
  errors: SyncParseError[];
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
  /** Optional loss-reporting printer; preferred over print when supplied. */
  printWithDiagnostics?: DiagnosticPrintFunction;
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** Callback when graph changes */
  onGraphChange?: (graph: GraphIR | null) => void;
  /** Callback when errors change */
  onErrorsChange?: (errors: SyncParseError[]) => void;
  /** Replaced after every visual print, including an empty loss set. */
  onPrintDiagnosticsChange?: (diagnostics: SyncPrintDiagnostic[]) => void;
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
    printWithDiagnostics,
    debounceMs = 100,
    onGraphChange,
    onErrorsChange,
    onPrintDiagnosticsChange,
    onTextChange,
  } = options;

  // State
  const [text, setTextState] = useState(initialText);
  const [graph, setGraphState] = useState<GraphIR | null>(initialGraph ?? null);
  const [errors, setErrors] = useState<SyncParseError[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastChangeSource, setLastChangeSource] = useState<ChangeSource>('external');

  // Refs for debouncing and preventing feedback loops
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdateRef = useRef(false);

  // Parse text and update graph
  const parseText = useCallback(
    (newText: string): SyncParseResult => {
      const result = parse(newText);
      setErrors(result.errors);
      onErrorsChange?.(result.errors);

      // A failed parse still carries everything that did parse, so one bad
      // line must not blank the canvas (R-009 AC-8).
      if (result.graph) {
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
      const result = printWithDiagnostics?.(newGraph);
      const newText = result?.text ?? print(newGraph);
      if (result) onPrintDiagnosticsChange?.(result.diagnostics);
      isInternalUpdateRef.current = true;
      setTextState(newText);
      onTextChange?.(newText);
      isInternalUpdateRef.current = false;
      return newText;
    },
    [print, printWithDiagnostics, onPrintDiagnosticsChange, onTextChange]
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
        nodes: convertFlowToGraphNodes(nodes, originalGraph.nodes),
        edges: convertFlowToGraphEdges(edges, originalGraph.edges),
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
