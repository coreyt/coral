/**
 * Text Editor components for Coral
 *
 * Provides text editing with bidirectional sync to the visual editor.
 */

// Components
export { TextEditor, type TextEditorProps, type SyntaxLanguage } from './TextEditor.js';
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
  type ParseResult,
  type ParseError,
  type ChangeSource,
} from './hooks/useBidirectionalSync.js';
