/**
 * Text Editor components for Coral
 *
 * Provides text editing with bidirectional sync to the visual editor.
 */

// Components
export {
  TextEditor,
  getEntityColor,
  getDiagnosticColor,
  type TextEditorProps,
  type SyntaxLanguage,
  type EditorTheme,
  type EditorSourcePosition,
  type EditorSourceRange,
  type EditorDiagnostic,
  type EditorDecoration,
  type EditorAnalysisOwner,
} from './TextEditor.js';
export {
  SplitEditor,
  type SplitEditorProps,
  type SplitLayout,
  type PrimaryPane,
} from './SplitEditor.js';

// Hooks
export {
  useBidirectionalSync,
  type SyncState,
  type SyncActions,
  type SyncOptions,
  type ParseFunction,
  type PrintFunction,
  type DiagnosticPrintFunction,
  type SyncPrintResult,
  type SyncPrintDiagnostic,
  type SyncParseResult,
  type SyncParseError,
  // Deprecated aliases, kept for the 0.2.x line.
  type ParseResult,
  type ParseError,
  type ChangeSource,
} from './hooks/useBidirectionalSync.js';
