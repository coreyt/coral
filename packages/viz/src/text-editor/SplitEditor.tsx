/**
 * SplitEditor - Combined text and visual editor with bidirectional sync
 *
 * Renders a split view with text editor on one side and visual diagram
 * on the other, keeping them in sync through Graph-IR.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { CoralEditor } from '../editor/CoralEditor.js';
import { TextEditor, type SyntaxLanguage } from './TextEditor.js';
import {
  useBidirectionalSync,
  type ParseFunction,
  type PrintFunction,
  type DiagnosticPrintFunction,
  type SyncPrintDiagnostic,
  type ParseError,
} from './hooks/useBidirectionalSync.js';
import type { GraphIR, CoralNode, EditorConfig, EditorCallbacks } from '../types.js';
import { convertFlowToGraphNodes } from '../editor/converter.js';

/**
 * Layout orientation for the split view
 */
export type SplitLayout = 'horizontal' | 'vertical';

/**
 * Which pane is on the left/top
 */
export type PrimaryPane = 'text' | 'visual';

/**
 * SplitEditor props
 */
export interface SplitEditorProps {
  /** Initial text content */
  initialText?: string;
  /** Initial Graph-IR (if provided, takes precedence over text) */
  initialGraph?: GraphIR;
  /** Parser function (text → Graph-IR) */
  parse: ParseFunction;
  /** Printer function (Graph-IR → text) */
  print: PrintFunction;
  /** Optional loss-reporting printer used for visual → text synchronization. */
  printWithDiagnostics?: DiagnosticPrintFunction;
  /** Syntax language for text editor */
  language?: SyntaxLanguage;
  /** Layout orientation */
  layout?: SplitLayout;
  /** Which pane is primary (left/top) */
  primaryPane?: PrimaryPane;
  /** Split ratio (0-1, proportion of primary pane) */
  splitRatio?: number;
  /** Show resize handle between panes */
  resizable?: boolean;
  /** Visual editor configuration */
  editorConfig?: EditorConfig;
  /** Debounce delay for sync (ms) */
  debounceMs?: number;
  /** Callback when graph changes */
  onGraphChange?: (graph: GraphIR | null) => void;
  /** Callback when text changes */
  onTextChange?: (text: string) => void;
  /** Callback when errors change */
  onErrorsChange?: (errors: ParseError[]) => void;
  /** Callback when visual → text printing reports losses. */
  onPrintDiagnosticsChange?: (diagnostics: SyncPrintDiagnostic[]) => void;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Minimum pane size (px) */
  minPaneSize?: number;
}

/**
 * Container styles for split layout
 */
const containerStyles: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  minHeight: '400px',
  overflow: 'hidden',
};

/**
 * Pane styles
 */
const paneStyles: React.CSSProperties = {
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

/**
 * Resize handle styles
 */
const resizeHandleStyles: React.CSSProperties = {
  backgroundColor: '#e0e0e0',
  cursor: 'col-resize',
  transition: 'background-color 0.2s',
  flexShrink: 0,
};

/**
 * SplitEditor component
 *
 * A split-pane editor that shows both text DSL and visual diagram,
 * keeping them synchronized through Graph-IR.
 *
 * Features:
 * - Bidirectional sync between text and visual
 * - Configurable layout (horizontal/vertical)
 * - Resizable panes
 * - Parse error display
 */
export const SplitEditor: React.FC<SplitEditorProps> = ({
  initialText = '',
  initialGraph,
  parse,
  print,
  printWithDiagnostics,
  language = 'coral',
  layout = 'horizontal',
  primaryPane = 'text',
  splitRatio: initialSplitRatio = 0.5,
  resizable = true,
  editorConfig,
  debounceMs = 100,
  onGraphChange,
  onTextChange,
  onErrorsChange,
  onPrintDiagnosticsChange,
  className,
  style,
  minPaneSize = 200,
}) => {
  // Split ratio state for resizing
  const [splitRatio, setSplitRatio] = useState(initialSplitRatio);
  const [isResizing, setIsResizing] = useState(false);

  // Bidirectional sync hook
  const [syncState, syncActions] = useBidirectionalSync({
    initialText,
    initialGraph,
    parse,
    print,
    printWithDiagnostics,
    debounceMs,
    onGraphChange,
    onTextChange,
    onErrorsChange,
    onPrintDiagnosticsChange,
  });

  // Handle text editor changes
  const handleTextChange = useCallback(
    (newText: string) => {
      syncActions.setText(newText);
    },
    [syncActions]
  );

  // Handle visual editor node changes
  const handleNodesChange = useCallback(
    (nodes: CoralNode[]) => {
      if (syncState.graph) {
        // Get current edges from the visual editor state
        // For now, just update nodes - full implementation would track edges too
        const updatedGraph: GraphIR = {
          ...syncState.graph,
          nodes: convertFlowToGraphNodes(nodes, syncState.graph.nodes),
        };
        syncActions.setGraph(updatedGraph);
      }
    },
    [syncState.graph, syncActions]
  );

  // Editor callbacks for visual editor
  const editorCallbacks: EditorCallbacks = useMemo(
    () => ({
      onNodesChange: handleNodesChange,
    }),
    [handleNodesChange]
  );

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Resize mouse move handler
  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.coral-split-editor');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isHorizontal = layout === 'horizontal';
      const position = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;
      const total = isHorizontal ? rect.width : rect.height;
      const newRatio = Math.max(
        minPaneSize / total,
        Math.min(1 - minPaneSize / total, position / total)
      );
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, layout, minPaneSize]);

  // Compute pane dimensions
  const primarySize = `${splitRatio * 100}%`;
  const secondarySize = `${(1 - splitRatio) * 100}%`;

  // Build pane content
  const textPane = (
    <div
      className="coral-split-editor-text-pane"
      style={{
        ...paneStyles,
        width: layout === 'horizontal' ? primaryPane === 'text' ? primarySize : secondarySize : '100%',
        height: layout === 'vertical' ? primaryPane === 'text' ? primarySize : secondarySize : '100%',
        flexShrink: 0,
      }}
    >
      <TextEditor
        value={syncState.text}
        onChange={handleTextChange}
        language={language}
        errors={syncState.errors}
        showLineNumbers
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );

  const visualPane = (
    <div
      className="coral-split-editor-visual-pane"
      style={{
        ...paneStyles,
        width: layout === 'horizontal' ? primaryPane === 'visual' ? primarySize : secondarySize : '100%',
        height: layout === 'vertical' ? primaryPane === 'visual' ? primarySize : secondarySize : '100%',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {syncState.graph ? (
        <CoralEditor
          graph={syncState.graph}
          config={editorConfig}
          callbacks={editorCallbacks}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#999',
            fontStyle: 'italic',
          }}
        >
          {syncState.errors.length > 0
            ? 'Fix syntax errors to see the diagram'
            : 'Enter diagram code to see the visualization'}
        </div>
      )}
    </div>
  );

  // Resize handle
  const resizeHandle = resizable ? (
    <div
      className="coral-split-editor-resize-handle"
      onMouseDown={handleResizeStart}
      style={{
        ...resizeHandleStyles,
        width: layout === 'horizontal' ? '6px' : '100%',
        height: layout === 'horizontal' ? '100%' : '6px',
        cursor: layout === 'horizontal' ? 'col-resize' : 'row-resize',
        backgroundColor: isResizing ? '#bdbdbd' : '#e0e0e0',
      }}
    />
  ) : null;

  // Order panes based on primary
  const firstPane = primaryPane === 'text' ? textPane : visualPane;
  const secondPane = primaryPane === 'text' ? visualPane : textPane;

  return (
    <div
      className={`coral-split-editor ${className || ''}`}
      style={{
        ...containerStyles,
        ...style,
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        userSelect: isResizing ? 'none' : undefined,
      }}
    >
      {firstPane}
      {resizeHandle}
      {secondPane}
    </div>
  );
};

export default SplitEditor;
