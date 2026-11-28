/**
 * EditorPane - Left pane of the editor extracted from App.tsx
 *
 * Contains the DSL text editor with:
 * - Header with segmented control for DSL format (Mermaid/Coral)
 * - Optional LIVE badge when DSL is read-only
 * - Line count display
 * - Textarea with line numbers
 * - Status bar (green for success, red for parse errors)
 * - BottomPanel (Diagnostics + AI tabs)
 */

import { AI_FEATURES_AVAILABLE } from '../releaseFeatures029.js';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { TextEditor, type EditorDecoration, type EditorDiagnostic } from '@coral-viz/viz';
import type { ActivityEntry, ChatEntry, BottomPanelTab, DiagnosticEntry } from '../BottomPanel';
import {
  MermaidConversionBanner,
  type MermaidConversionState,
  type MermaidConvertRequestOptions,
} from './MermaidConversionBanner';

export interface EditorPaneProps {
  dsl: string;
  dslType: 'coral' | 'mermaid' | 'dot' | 'plantuml';
  /** Raw/saved Mermaid import whose source must not be changed by canvas edits. */
  sourceOwnedImport?: boolean;
  isDslReadOnly: boolean;
  isDslReadOnlyReason?: string;
  parseErrors: Array<{ line?: number; code?: string; message: string; severity?: 'error' | 'warning' | 'info'; hint?: string }>;
  /** The canvas shows the graph recovered from an opened file with errors (R-064). */
  recoveredGraph?: boolean;
  editorAnalysis: {
    source: string;
    language: 'coral' | 'mermaid' | 'dot' | 'plantuml';
    diagnostics: EditorDiagnostic[];
    decorations: EditorDecoration[];
    entityHighlighting: boolean;
  };
  entityHighlightingEnabled: boolean;
  debugInfo: string;
  onDslChange: (text: string) => void;
  onEditSessionStart?: () => void;
  onEditSessionEnd?: () => void;
  onDslTypeChange: (type: 'coral' | 'mermaid') => void;
  /** Deterministic zero-LLM Mermaid-to-Coral conversion action & pre-commit review banner. */
  mermaidConversion?: MermaidConversionState | null;
  onConvertMermaidToCoral?: (options?: MermaidConvertRequestOptions) => void;
  onCancelMermaidConversion?: () => void;
  // Bottom panel
  bottomPanelTab: BottomPanelTab;
  onBottomPanelTabChange: (tab: BottomPanelTab) => void;
  diagnosticsCollapsed: boolean;
  onToggleDiagnostics: () => void;
  diagnosticEntries: DiagnosticEntry[];
  onDiagnosticHover: (edgeId: string | null) => void;
  onAskAboutDiagnostic: (entry: DiagnosticEntry) => void;
  chatEntries: ChatEntry[];
  turnCount: number;
  activityEntries?: ActivityEntry[];
  isGenerating: boolean;
  hasApiKey: boolean;
  onPromptSubmit: (prompt: string) => boolean | void;
  promptDisabledReason?: string;
  onFixSourceError?: () => void;
  /** Quick fix for `coral.symbol.local.edition`: pin `@coralVersion "0.2.9"` (Slice 60 C5). */
  onPinEdition029?: () => void;
  onConfirmChatAction?: (entryId: number) => void;
  onCancelChatAction?: (entryId: number) => void;
  theme: Record<string, string>;
  themeName?: 'light' | 'dark';
}

export function EditorPane({
  dsl,
  dslType,
  sourceOwnedImport = false,
  isDslReadOnly,
  isDslReadOnlyReason,
  parseErrors,
  recoveredGraph = false,
  editorAnalysis,
  entityHighlightingEnabled,
  debugInfo,
  onDslChange,
  onEditSessionStart,
  onEditSessionEnd,
  onDslTypeChange,
  mermaidConversion = null,
  onConvertMermaidToCoral,
  onCancelMermaidConversion,
  onFixSourceError,
  onPinEdition029,
  isGenerating,
  theme,
  themeName = 'light',
}: EditorPaneProps) {
  const lineCount = useMemo(() => dsl.split('\n').length, [dsl]);
  const hasSourceError = editorAnalysis.source === dsl
    && editorAnalysis.language === dslType
    && editorAnalysis.diagnostics.some(
      (diagnostic) => diagnostic.severity !== 'warning' && diagnostic.severity !== 'info',
    );
  const sourceExitArmed = useRef(false);
  const paneRef = useRef<HTMLElement>(null);
  const blockingErrors = parseErrors.filter((item) => item.severity === undefined || item.severity === 'error');
  const noteCount = parseErrors.length - blockingErrors.length;
  // The status bar counts every diagnostic, including layout diagnostics the
  // source-owned list never renders, so it owns the list it counts (C52-2).
  const [showAllDiagnostics, setShowAllDiagnostics] = useState(false);
  const focusAllDiagnostics = useRef(false);
  const allDiagnosticsRef = useRef<HTMLDivElement>(null);
  const showAllButtonRef = useRef<HTMLButtonElement>(null);
  const allDiagnosticsId = useId();
  const allDiagnosticsOpen = showAllDiagnostics && parseErrors.length > 0;
  useEffect(() => {
    if (!allDiagnosticsOpen || !focusAllDiagnostics.current) return;
    focusAllDiagnostics.current = false;
    allDiagnosticsRef.current?.focus();
  }, [allDiagnosticsOpen]);
  const singleChangeBoundary = useRef(false);
  const activeSourceSpan = useRef<{ start: number; end: number; entityId?: string } | null>(null);
  const endSourceSession = () => {
    activeSourceSpan.current = null;
    onEditSessionEnd?.();
  };
  const handleSourceChange = (text: string) => {
    let start = 0;
    while (start < dsl.length && start < text.length && dsl[start] === text[start]) start += 1;
    let oldEnd = dsl.length;
    let newEnd = text.length;
    while (oldEnd > start && newEnd > start && dsl[oldEnd - 1] === text[newEnd - 1]) {
      oldEnd -= 1;
      newEnd -= 1;
    }
    const entityId = editorAnalysis.decorations.find((item) => start >= item.start && start <= item.end)?.entityId;
    const active = activeSourceSpan.current;
    if (active && (start < active.start || start > active.end + 1 || active.entityId !== entityId)) {
      endSourceSession();
    }
    const next = activeSourceSpan.current;
    activeSourceSpan.current = next
      ? { ...next, start: Math.min(next.start, start), end: Math.max(next.end, newEnd) }
      : { start, end: newEnd, ...(entityId ? { entityId } : {}) };
    onDslChange(text);
    if (singleChangeBoundary.current) {
      singleChangeBoundary.current = false;
      endSourceSession();
    }
  };
  const handleFormatKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: 'mermaid' | 'coral',
  ) => {
    const order = ['mermaid', 'coral'] as const;
    const index = order.indexOf(current);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? order.length - 1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % order.length
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? (index - 1 + order.length) % order.length : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = order[nextIndex];
    onDslTypeChange(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <section
      ref={paneRef}
      aria-label="DSL editor region"
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) onEditSessionStart?.();
      }}
      onCompositionStartCapture={() => { sourceExitArmed.current = false; endSourceSession(); onEditSessionStart?.(); }}
      onCompositionEndCapture={() => { sourceExitArmed.current = false; endSourceSession(); }}
      onPasteCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) endSourceSession();
        singleChangeBoundary.current = true;
      }}
      onCutCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) endSourceSession();
        singleChangeBoundary.current = true;
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) endSourceSession();
        if (event.target instanceof HTMLTextAreaElement
          || !event.currentTarget.contains(event.relatedTarget as Node | null)) sourceExitArmed.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) return;
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
          endSourceSession();
          return;
        }
        if (event.key === 'Escape') {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          sourceExitArmed.current = !sourceExitArmed.current;
          return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key !== 'Tab' || !sourceExitArmed.current) return;
        event.preventDefault();
        event.stopPropagation();
        sourceExitArmed.current = false;
        const target = event.shiftKey
          ? event.currentTarget.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
            ?? document.querySelector<HTMLElement>('[aria-label="Format before source"]')
          : document.querySelector<HTMLElement>('[aria-label="Resize source"]');
        target?.focus();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: theme.editorBg,
      }}
    >
      {/* Editor Header with Format Toggle */}
      <div
        style={{
          padding: '4px 12px',
          background: theme.editorHeaderBg,
          fontSize: '11px',
          fontWeight: 500,
          color: theme.editorHeaderText,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* DSL Format - Segmented Control */}
        {(dslType === 'coral' || (dslType === 'mermaid' && !sourceOwnedImport)) ? <div
          role="radiogroup"
          aria-label="DSL format"
          style={{
            display: 'flex',
            background: theme.controlBg,
            borderRadius: '4px',
            padding: '1px',
          }}
        >
          <button
            role="radio"
            aria-checked={dslType === 'mermaid'}
            tabIndex={dslType === 'mermaid' ? 0 : -1}
            onClick={() => onDslTypeChange('mermaid')}
            onKeyDown={(event) => handleFormatKeyDown(event, 'mermaid')}
            style={{
              padding: '2px 8px',
              fontSize: '10px',
              borderRadius: '3px',
              border: 'none',
              background:
                dslType === 'mermaid' ? theme.controlBgActive : 'transparent',
              color:
                dslType === 'mermaid'
                  ? theme.controlText
                  : theme.controlTextMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Mermaid
          </button>
          <button
            role="radio"
            aria-checked={dslType === 'coral'}
            tabIndex={dslType === 'coral' ? 0 : -1}
            onClick={() => onDslTypeChange('coral')}
            onKeyDown={(event) => handleFormatKeyDown(event, 'coral')}
            style={{
              padding: '2px 8px',
              fontSize: '10px',
              borderRadius: '3px',
              border: 'none',
              background:
                dslType === 'coral' ? theme.controlBgActive : 'transparent',
              color:
                dslType === 'coral'
                  ? theme.controlText
                  : theme.controlTextMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Coral
          </button>
        </div> : <span aria-label="Source format">{dslType === 'dot' ? 'DOT source'
          : dslType === 'plantuml' ? 'PlantUML source' : 'Mermaid source'}</span>}

        {isDslReadOnly && (
          <span
            // A lock reason is progress, not the AI's success-styled LIVE badge.
            data-read-only-reason={isDslReadOnlyReason ? 'updating' : 'live'}
            style={{
              fontSize: '9px',
              padding: '1px 4px',
              borderRadius: '3px',
              ...(isDslReadOnlyReason
                ? { backgroundColor: 'transparent', color: theme.warningText, border: `1px solid ${theme.warningText}` }
                : { backgroundColor: theme.successBg, color: theme.successText }),
            }}
          >
            {isDslReadOnlyReason ?? 'LIVE'}
          </span>
        )}

        {dslType === 'mermaid' && onConvertMermaidToCoral && (
          <button
            type="button"
            className="coral-button coral-button--quiet"
            disabled={isDslReadOnly}
            onClick={() => onConvertMermaidToCoral()}
            style={{
              padding: '2px 8px',
              fontSize: '10px',
              borderRadius: '3px',
              border: `1px solid ${theme.lineNumbersBorder}`,
              background: theme.controlBg,
              color: theme.controlText,
              cursor: isDslReadOnly ? 'default' : 'pointer',
            }}
          >
            Convert to Editable Coral
          </button>
        )}

        <span style={{ marginLeft: 'auto', color: theme.lineNumbersText }}>
          {lineCount} lines
        </span>
      </div>

      {mermaidConversion && onConvertMermaidToCoral && onCancelMermaidConversion && (
        <MermaidConversionBanner
          conversion={mermaidConversion}
          onConvert={onConvertMermaidToCoral}
          onCancel={onCancelMermaidConversion}
          theme={theme}
        />
      )}

      {/* Editor Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>
        <TextEditor
          value={dsl}
          onChange={(text) => !isDslReadOnly && handleSourceChange(text)}
          onSelectionChange={(start, end) => {
            const active = activeSourceSpan.current;
            if (active && (start < active.start || end > active.end + 1)) endSourceSession();
          }}
          readOnly={isDslReadOnly}
          aria-label="DSL editor"
          language={dslType === 'plantuml' ? 'plain' : dslType}
          analysisOwner={{ source: editorAnalysis.source,
            language: editorAnalysis.language === 'plantuml' ? 'plain' : editorAnalysis.language,
            entityHighlighting: editorAnalysis.entityHighlighting }}
          entityHighlightingEnabled={entityHighlightingEnabled}
          diagnostics={editorAnalysis.diagnostics}
          decorations={editorAnalysis.decorations}
          editorTheme={themeName}
          wrap="off"
          minHeight="100%"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            resize: 'none',
            backgroundColor: 'transparent',
            color: isDslReadOnly ? theme.controlTextMuted : theme.editorText,
            cursor: isDslReadOnly ? 'default' : 'text',
          }}
        />
      </div>

      {/* Status Bar */}
      <div
        data-testid="status-bar"
        style={{
          padding: '4px 12px',
          background:
            blockingErrors.length > 0 ? theme.errorBg : theme.successBg,
          fontSize: '11px',
          color:
            blockingErrors.length > 0 ? theme.errorText : theme.successText,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '10px' }}>
          {blockingErrors.length > 0 ? '\u2717' : '\u2713'}
        </span>
        {parseErrors.length > 0 ? (
          <>
            <span style={{ flex: 1 }}>{blockingErrors.length > 0 ? (recoveredGraph ? 'Recovered graph — ' : 'Last successful diagram retained — ') : ''}{blockingErrors.length} {blockingErrors.length === 1 ? 'error' : 'errors'}; {noteCount} {noteCount === 1 ? 'note' : 'notes'}. {parseErrors[0].line ? `Line ${parseErrors[0].line}: ` : ''}{parseErrors[0].message}</span>
            <button
              ref={showAllButtonRef}
              type="button"
              aria-expanded={allDiagnosticsOpen}
              aria-controls={allDiagnosticsId}
              onClick={() => {
                if (allDiagnosticsOpen) allDiagnosticsRef.current?.focus();
                else {
                  focusAllDiagnostics.current = true;
                  setShowAllDiagnostics(true);
                }
              }}
            >
              Show all diagnostics
            </button>
            {onPinEdition029 && parseErrors.some((item) => item.code === 'coral.symbol.local.edition') && (
              <button type="button" onClick={onPinEdition029}>Pin edition 0.2.9</button>
            )}
            {AI_FEATURES_AVAILABLE && hasSourceError && onFixSourceError && (
              <button
                type="button"
                aria-label="Fix current source error with AI"
                disabled={isGenerating}
                onClick={onFixSourceError}
              >
                Fix
              </button>
            )}
          </>
        ) : (
          <span>{debugInfo}</span>
        )}
      </div>
      {allDiagnosticsOpen && (
        <div
          ref={allDiagnosticsRef}
          id={allDiagnosticsId}
          role="region"
          aria-label="All diagnostics"
          tabIndex={-1}
          style={{ maxHeight: '160px', overflow: 'auto', padding: '4px 12px', fontSize: '11px', background: theme.editorBg, color: theme.editorText }}
        >
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {parseErrors.map((item, index) => (
              <li key={index}>
                {item.severity === undefined || item.severity === 'error' ? 'Error' : 'Note'}: {item.line ? `Line ${item.line}: ` : ''}{item.code ? `[${item.code}] ` : ''}{item.message}{item.hint ? ` — ${item.hint}` : ''}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setShowAllDiagnostics(false);
              showAllButtonRef.current?.focus();
            }}
          >
            Hide all diagnostics
          </button>
        </div>
      )}

    </section>
  );
}
