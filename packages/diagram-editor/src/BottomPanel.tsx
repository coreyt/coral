/**
 * BottomPanel Component
 *
 * Tabbed panel consolidating Diagnostics and AI into the editor bottom area.
 * Replaces the separate DiagnosticsPanel and PromptBar components.
 * Part of issue #48: LLM-Assisted Diagnostics.
 */

import { AI_FEATURES_AVAILABLE } from './releaseFeatures029.js';
import { memo, useState, useCallback, useRef, useEffect, useId, type ReactNode } from 'react';
import type { SpeechRecognitionMode } from '@coral-viz/viz';
import type { ConformanceLevel, ConformanceReport, NotificationLevel } from '@coral-viz/render';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { Tabs } from 'radix-ui';
import type { GenerateResult } from './llm/types';

export type BottomPanelTab = 'diagnostics' | 'ai' | 'activity';

export type ChatEntryKind = 'user' | 'assistant' | 'info' | 'error';

export interface DiagnosticEntry {
  edgeId: string;
  severity: 'error' | 'warning' | 'info';
  sourceLabel: string;
  targetLabel: string;
  message: string;
  code?: string;
  position?: { line: number; column: number; offset: number };
  range?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } };
  related?: readonly { message: string; position: { line: number; column: number; offset: number }; range?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } } }[];
  source?: string;
  subject?: { kind: 'node' | 'edge' | 'graph'; id: string };
  hint?: string;
}

export interface ChatEntry {
  id: number;
  kind: ChatEntryKind;
  text: string;
  explanation?: string;
  diagnosticCode?: string;
  diagnostics?: GenerateResult['diagnostics'];
  action?: {
    kind: 'convert-to-coral' | 'retry-candidate';
    status: 'pending' | 'running' | 'cancelled' | 'complete';
  };
}

export interface ActivityEntry {
  id: number;
  transactionSequence: number;
  label: string;
  status: 'applied' | 'reverted' | 'reapplied' | 'failed';
  at: number;
}

function CandidateDiagnostics({ diagnostics }: { diagnostics: ChatEntry['diagnostics'] }) {
  if (!diagnostics?.length) return null;
  return <details><summary>All candidate diagnostics ({diagnostics.length})</summary>
    {diagnostics.map((item, index) => <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
      {item.severity ?? 'error'} [{item.code}] {item.message}{item.position ? ` (line ${item.position.line}, column ${item.position.column + 1})` : ''}
      <div>Attempt {item.attempt + 1}, {item.format}</div>
      {item.hint && <div>{item.hint}</div>}
      {item.related?.map((related, i) => <div key={i}>Related line {related.position.line}, column {related.position.column + 1}: {related.message}</div>)}
    </div>)}
  </details>;
}

export interface BottomPanelTheme {
  bg: string;
  text: string;
  textMuted: string;
  border: string;
  errorText: string;
  warningText: string;
  hoverBg: string;
  inputBg: string;
  inputText: string;
  buttonBg: string;
  buttonText: string;
  successText: string;
  infoBg: string;
  userBg: string;
  assistantBg: string;
  codeBg: string;
}

export interface BottomPanelProps {
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;

  // Diagnostics tab
  diagnosticEntries: DiagnosticEntry[];
  onDiagnosticHover: (edgeId: string | null, severity: 'error' | 'warning' | null) => void;
  onAskAboutDiagnostic: (entry: DiagnosticEntry) => void;
  canCheckConformance?: boolean;
  onCheckConformance?: (level?: ConformanceLevel, notificationLevel?: NotificationLevel) => void;
  notificationLevel?: NotificationLevel;
  onNotificationLevelChange?: (level: NotificationLevel) => void;
  conformanceReport?: ConformanceReport | null;
  conformanceCheckError?: string;
  /** Set instead of a report when the document is not conformance-checked. */
  conformanceNotChecked?: string;

  // AI tab
  chatEntries: ChatEntry[];
  isGenerating: boolean;
  hasApiKey: boolean;
  /** Returns false when the prompt was refused, so the typed prompt is kept. */
  onSubmit: (prompt: string) => boolean | void;
  /** Why a new prompt cannot be sent now; shown and set as the Send title. */
  submitDisabledReason?: string;
  onCancelGeneration?: () => void;
  onConfirmChatAction?: (entryId: number) => void;
  onCancelChatAction?: (entryId: number) => void;
  onClearChat?: () => void;
  turnCount?: number;
  activityEntries?: ActivityEntry[];
  /** The on-device model's request panel; when present it is the AI tab, without provider chat or voice. */
  onDevicePanel?: ReactNode;

  // Voice input (#49)
  speechMode?: SpeechRecognitionMode;

  theme: BottomPanelTheme;
}

/** Accessible name of a diagnostic row: severity, code, message, and location (C52-5). */
function diagnosticLabel(entry: DiagnosticEntry): string {
  const severity = entry.severity === 'error' ? 'Error' : entry.severity === 'warning' ? 'Warning' : 'Note';
  const position = entry.position ?? entry.range?.start;
  const location = `${entry.sourceLabel} → ${entry.targetLabel}`
    + (position ? `, line ${position.line}, column ${position.column + 1}` : '');
  return `${severity}: ${entry.code ? `[${entry.code}] ` : ''}${entry.message} (${location})`;
}

/** Severity icon for diagnostic entries */
function SeverityIcon({ severity, color }: { severity: 'error' | 'warning' | 'info'; color: string }) {
  return (
    <span
      style={{
        fontSize: '10px',
        color,
        flexShrink: 0,
        width: '14px',
        textAlign: 'center',
      }}
      aria-label={severity}
    >
      {severity === 'error' ? '✗' : '⚠'}
    </span>
  );
}

/**
 * Lightweight inline markdown renderer for compact chat.
 *
 * Supports:
 * - **bold** → <strong>
 * - `code` → <code> with background
 * - ## Header → <strong> on own line
 * - - bullet → indent + · prefix
 * - ```code blocks``` → <pre> with background
 */
function renderMarkdown(text: string, codeBg: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```...```
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre
          key={`code-${result.length}`}
          style={{
            background: codeBg,
            padding: '4px 6px',
            borderRadius: '3px',
            margin: '2px 0',
            fontSize: '11px',
            overflow: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {codeLines.join('\n')}
        </pre>,
      );
      continue;
    }

    // Header: ## text → bold on own line
    if (/^#{1,3}\s+/.test(line)) {
      const headerText = line.replace(/^#{1,3}\s+/, '');
      result.push(
        <div key={`h-${result.length}`} style={{ fontWeight: 600, marginTop: '4px' }}>
          {renderInline(headerText, codeBg)}
        </div>,
      );
      i++;
      continue;
    }

    // Bullet: - text or * text
    if (/^\s*[-*]\s+/.test(line)) {
      const bulletText = line.replace(/^\s*[-*]\s+/, '');
      result.push(
        <div key={`b-${result.length}`} style={{ paddingLeft: '12px' }}>
          <span style={{ marginRight: '4px' }}>·</span>
          {renderInline(bulletText, codeBg)}
        </div>,
      );
      i++;
      continue;
    }

    // Regular line with inline formatting
    if (line.trim() === '') {
      result.push(<div key={`br-${result.length}`} style={{ height: '4px' }} />);
    } else {
      result.push(
        <div key={`l-${result.length}`}>{renderInline(line, codeBg)}</div>,
      );
    }
    i++;
  }

  return result;
}

/** Render inline markdown: **bold** and `code` */
function renderInline(text: string, codeBg: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** or `code`
  const regex = /(\*\*(.+?)\*\*|`([^`]+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={`bold-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // `code`
      parts.push(
        <code
          key={`code-${match.index}`}
          style={{
            background: codeBg,
            padding: '1px 4px',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          {match[3]}
        </code>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export const BottomPanel = memo(function BottomPanel({
  activeTab: requestedTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  diagnosticEntries,
  onDiagnosticHover,
  onAskAboutDiagnostic,
  canCheckConformance = false,
  onCheckConformance,
  notificationLevel = 'error',
  onNotificationLevelChange,
  conformanceReport,
  conformanceCheckError,
  conformanceNotChecked,
  chatEntries,
  isGenerating,
  hasApiKey,
  onSubmit,
  submitDisabledReason,
  onCancelGeneration,
  onConfirmChatAction,
  onCancelChatAction,
  onClearChat,
  turnCount,
  activityEntries = [],
  speechMode = 'off',
  onDevicePanel,
  theme,
}: BottomPanelProps) {
  const providerAi = AI_FEATURES_AVAILABLE && !onDevicePanel;
  const aiTab = providerAi || Boolean(onDevicePanel);
  const activeTab = !aiTab && requestedTab === 'ai' ? 'diagnostics' : requestedTab;
  const [prompt, setPrompt] = useState('');
  const [conformanceLevel, setConformanceLevel] = useState<'saved' | ConformanceLevel>('saved');
  const [hasUnreadResponse, setHasUnreadResponse] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatWasAtBottomRef = useRef(true);
  const previousChatCountRef = useRef(chatEntries.length);

  // Voice input (#49)
  const speech = useSpeechRecognition({ mode: providerAi ? speechMode : 'off' });

  // Follow new responses only while the reader is already at the bottom.
  useEffect(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    const grew = chatEntries.length > previousChatCountRef.current;
    previousChatCountRef.current = chatEntries.length;
    if (!grew || chatWasAtBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
      setHasUnreadResponse(false);
    } else setHasUnreadResponse(true);
  }, [chatEntries]);

  const scrollToLatestResponse = useCallback(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    chatWasAtBottomRef.current = true;
    setHasUnreadResponse(false);
  }, []);

  // When speech produces a final transcript, append to prompt
  const prevTranscriptRef = useRef('');
  useEffect(() => {
    if (speech.transcript && speech.transcript !== prevTranscriptRef.current) {
      setPrompt((prev) => {
        const separator = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + separator + speech.transcript;
      });
      prevTranscriptRef.current = speech.transcript;
      speech.resetTranscript();
    }
  }, [speech.transcript, speech.resetTranscript]);

  const handleMicToggle = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
    } else {
      speech.startListening();
    }
  }, [speech.isListening, speech.startListening, speech.stopListening]);

  const submitReasonId = useId();
  // Cancel stays available while generating; the reason only gates a new send.
  const submitRefused = !isGenerating && Boolean(submitDisabledReason);
  // The refusal hint covers the chat log's corner, so it shows only while
  // the composer is in use; otherwise it is only the controls' description.
  const [composerFocused, setComposerFocused] = useState(false);
  const showSubmitHint = submitRefused && (composerFocused || prompt.trim().length > 0);
  const sendDisabled = isGenerating ? !onCancelGeneration : !prompt.trim() || submitRefused;

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;
    // A refused prompt (Slice 94 update owner) is kept for a later retry.
    if (onSubmit(trimmed) === false) return;
    setPrompt('');
  }, [prompt, isGenerating, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const diagCount = diagnosticEntries.length;
  const chatCount = chatEntries.length;

  return (
    <Tabs.Root
      value={activeTab}
      activationMode="manual"
      onValueChange={(value) => onTabChange(value as BottomPanelTab)}
      data-testid="bottom-panel"
      className="coral-bottom-panel"
      style={{
        borderTop: `1px solid ${theme.border}`,
        background: theme.bg,
        fontSize: '11px',
        flexShrink: 0,
      }}
    >
      {/* Tab Bar + Collapse Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        <button
          onClick={onToggleCollapsed}
          aria-label="Toggle bottom panel"
          style={{
            background: 'none',
            border: 'none',
            color: theme.textMuted,
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '8px',
            transition: 'transform 0.15s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </button>

        <Tabs.List aria-label="Bottom panel tabs" className="coral-tab-list" style={{ display: 'flex', gap: '0' }}>
          {aiTab && (
          <Tabs.Trigger
            value="ai"
            onClick={() => { if (collapsed) onToggleCollapsed(); }}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'ai' ? `2px solid ${theme.text}` : '2px solid transparent',
              color: activeTab === 'ai' ? theme.text : theme.textMuted,
              cursor: 'pointer',
            }}
          >
            {onDevicePanel ? 'AI' : 'AI Conversation'}{onDevicePanel ? '' : turnCount && turnCount > 0 ? ` (${turnCount} turns)` : chatCount > 0 ? ` (${chatCount})` : ''}
          </Tabs.Trigger>)}
          <Tabs.Trigger
            value="diagnostics"
            onClick={() => { if (collapsed) onToggleCollapsed(); }}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'diagnostics' ? `2px solid ${theme.text}` : '2px solid transparent',
              color: activeTab === 'diagnostics' ? theme.text : theme.textMuted,
              cursor: 'pointer',
            }}
          >
            Diagnostics{diagCount > 0 ? ` (${diagCount})` : ''}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="activity"
            onClick={() => { if (collapsed) onToggleCollapsed(); }}
            style={{
              padding: '4px 12px', fontSize: '11px', fontWeight: 500,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === 'activity' ? `2px solid ${theme.text}` : '2px solid transparent',
              color: activeTab === 'activity' ? theme.text : theme.textMuted,
              cursor: 'pointer',
            }}
          >
            Activity Log
          </Tabs.Trigger>
        </Tabs.List>

        {/* Clear conversation button */}
        {providerAi && activeTab === 'ai' && chatCount > 0 && onClearChat && (
          <button
            onClick={onClearChat}
            aria-label="Clear conversation"
            style={{
              marginLeft: 'auto',
              marginRight: '8px',
              padding: '2px 8px',
              fontSize: '10px',
              background: 'none',
              border: `1px solid ${theme.border}`,
              borderRadius: '3px',
              color: theme.textMuted,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Content Area */}
      <>
          {/* Diagnostics Tab */}
          <Tabs.Content
            value="diagnostics"
            forceMount
            hidden={collapsed || activeTab !== 'diagnostics'}
            className="coral-bottom-panel__content"
          >
            {onCheckConformance && canCheckConformance && <section aria-label="Conformance check"
              style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.text }}>
              <label>
                Conformance level for this check{' '}
                <select aria-label="Conformance level for this check" value={conformanceLevel}
                  style={{ color: theme.inputText, background: theme.inputBg, border: `1px solid ${theme.border}` }}
                  onChange={(event) => setConformanceLevel(event.target.value as 'saved' | ConformanceLevel)}>
                  <option value="saved">Saved setting</option>
                  <option value="none">None</option>
                  <option value="typical">Typical</option>
                  <option value="strict">Strict</option>
                </select>
              </label>{' '}
              <label>
                Notice threshold for this check{' '}
                <select aria-label="Notice threshold for this check" value={notificationLevel}
                  style={{ color: theme.inputText, background: theme.inputBg, border: `1px solid ${theme.border}` }}
                  onChange={(event) => onNotificationLevelChange?.(event.target.value as NotificationLevel)}>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </label>{' '}
              <button type="button" style={{ color: theme.buttonText, background: theme.buttonBg,
                border: `1px solid ${theme.border}` }} onClick={() => onCheckConformance(
                conformanceLevel === 'saved' ? undefined : conformanceLevel, notificationLevel)}>Check conformance</button>
              {conformanceCheckError && <p role="alert">{conformanceCheckError}</p>}
              {conformanceNotChecked && <p role="status" aria-label="Conformance not checked">
                Conformance check: {conformanceNotChecked}</p>}
              {conformanceReport && <div role="region" aria-label="Conformance report">
                <p>{conformanceReport.evaluatedLevel[0].toUpperCase() + conformanceReport.evaluatedLevel.slice(1)} · {conformanceReport.claimStatus}</p>
                {conformanceReport.ruleset?.scope === 'coral-bounded-profile' && <p>Coral bounded profile; full external-standard conformance is not claimed.</p>}
                {conformanceReport.ruleset && <p>Ruleset: {conformanceReport.ruleset.id} {conformanceReport.ruleset.version}</p>}
                {conformanceReport.catalog && <p>Catalog: {conformanceReport.catalog.id} {conformanceReport.catalog.version} ({conformanceReport.catalog.digest})</p>}
                <div aria-label="Notices for last check">Notices for last check ({conformanceReport.notices.length})
                  {conformanceReport.notices.map((finding, index) => <div key={`${finding.id}-${index}`}>
                    {finding.severity} [{finding.id}] {finding.message}
                  </div>)}
                </div>
                <div>All findings ({conformanceReport.findings.length})
                  {conformanceReport.findings.map((finding, index) => <div key={`${finding.id}-${index}`}>
                    {finding.category} · {finding.severity} [{finding.id}] {finding.message}
                    {finding.range && ` (line ${finding.range.start.line}, column ${finding.range.start.column})`}
                    {finding.path && ` (${finding.path})`}
                    {finding.provenance && <div>{finding.provenance.kind}: {finding.provenance.reference}</div>}
                    {finding.remediation && <div>{finding.remediation}</div>}
                  </div>)}
                </div>
                {conformanceReport.exceptions.length > 0 && <div>Exceptions
                  {conformanceReport.exceptions.map((exception, index) => <div key={index}>
                    {exception.nodeId}: {exception.symbol} ({exception.affectedRuleIds.join(', ') || 'no affected rules'})
                  </div>)}
                </div>}
                <div>Unverified obligations ({conformanceReport.unverifiedObligations.length})
                  {conformanceReport.unverifiedObligations.map((obligation) => <div key={obligation.id}>
                    [{obligation.id}] {obligation.message}
                  </div>)}
                </div>
              </div>}
            </section>}
            <div
              style={{ maxHeight: '200px', overflowY: 'auto', padding: diagCount > 0 ? '0 0 4px 0' : '0' }}
              role="log"
              aria-label="Diagnostics log"
            >
              {diagCount === 0 ? (
                <div
                  data-testid="diagnostics-empty"
                  style={{ padding: '8px 12px', color: theme.textMuted, fontStyle: 'italic' }}
                >
                  {conformanceReport ? 'No editor diagnostics' : 'No issues'}
                </div>
              ) : (
                diagnosticEntries.map((entry) => (
                  <div
                    key={entry.edgeId}
                    data-testid={`diagnostic-entry-${entry.edgeId}`}
                    onMouseEnter={() => onDiagnosticHover(entry.edgeId, entry.severity === 'info' ? null : entry.severity)}
                    onMouseLeave={() => onDiagnosticHover(null, null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 12px',
                      cursor: 'default',
                      transition: 'background 0.1s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = theme.hoverBg)}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <SeverityIcon
                      severity={entry.severity}
                      color={entry.severity === 'error' ? theme.errorText : theme.warningText}
                    />
                    <span style={{ color: theme.text, flexShrink: 0 }}>
                      {entry.sourceLabel} → {entry.targetLabel}
                    </span>
                    <div
                      tabIndex={0}
                      role="group"
                      aria-label={diagnosticLabel(entry)}
                      onFocus={() => onDiagnosticHover(entry.edgeId, entry.severity === 'info' ? null : entry.severity)}
                      onBlur={() => onDiagnosticHover(null, null)}
                      style={{ color: theme.textMuted, flex: 1, whiteSpace: 'pre-wrap' }}
                    >
                      {entry.code ? `[${entry.code}] ` : ''}{entry.message}
                      {entry.hint && <div>{entry.hint}</div>}
                      {entry.related?.map((location, index) => <div key={index}>Related line {location.position.line}, column {location.position.column + 1}: {location.message}</div>)}
                    </div>
                    {AI_FEATURES_AVAILABLE && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAskAboutDiagnostic(entry);
                      }}
                      aria-label={`Ask about ${entry.sourceLabel} → ${entry.targetLabel}`}
                      title="Ask AI about this issue"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: '10px',
                        flexShrink: 0,
                        opacity: 0.6,
                        borderRadius: '3px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.background = theme.hoverBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.6';
                        e.currentTarget.style.background = 'none';
                      }}
                    >
                      ?
                    </button>)}
                  </div>
                ))
              )}
            </div>
          </Tabs.Content>

          {onDevicePanel && (
          <Tabs.Content value="ai" forceMount hidden={collapsed || activeTab !== 'ai'}
            className="coral-bottom-panel__content coral-bottom-panel__content--ai" style={{ overflowY: 'auto' }}>
            {onDevicePanel}
          </Tabs.Content>)}
          {/* AI Tab */}
          {providerAi && (
          <Tabs.Content
            value="ai"
            forceMount
            hidden={collapsed || activeTab !== 'ai'}
            className="coral-bottom-panel__content coral-bottom-panel__content--ai"
          >
              {/* Chat History */}
              <div
                ref={chatScrollRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  chatWasAtBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 8;
                  if (chatWasAtBottomRef.current) setHasUnreadResponse(false);
                }}
                style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: chatCount > 0 ? '4px 0' : '0' }}
                role="log"
                aria-label="Chat log"
              >
                {chatCount === 0 && (
                  <div style={{ padding: '8px 12px', color: theme.textMuted, fontStyle: 'italic' }}>
                    {hasApiKey
                      ? 'Ask about your diagram or type a prompt...'
                      : 'Spatial edits work locally; configure an API key for other AI requests.'}
                  </div>
                )}
                {chatEntries.map((entry) => {
                  if (entry.kind === 'user') {
                    // User messages: right-aligned, muted, italic
                    return (
                      <div
                        key={entry.id}
                        data-testid={`chat-entry-${entry.id}`}
                        style={{
                          padding: '3px 12px',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          fontSize: '12px',
                        }}
                      >
                        <div
                          style={{
                            color: theme.textMuted,
                            fontStyle: 'italic',
                            maxWidth: '80%',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={entry.text}
                        >
                          {entry.text}
                        </div>
                      </div>
                    );
                  }

                  if (entry.kind === 'assistant' || entry.kind === 'info') {
                    // AI responses: left-aligned with subtle background, rendered markdown
                    const content = entry.explanation || entry.text;
                    const bg = entry.kind === 'info' ? theme.infoBg : theme.assistantBg;
                    return (
                      <div
                        key={entry.id}
                        data-testid={`chat-entry-${entry.id}`}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: bg,
                          color: theme.text,
                          lineHeight: '1.4',
                        }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {renderMarkdown(content, theme.codeBg)}
                          <CandidateDiagnostics diagnostics={entry.diagnostics} />
                        </div>
                        {entry.action?.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={() => onConfirmChatAction?.(entry.id)}
                              aria-label={entry.action.kind === 'retry-candidate'
                                ? 'Retry rejected AI candidate'
                                : 'Convert to Coral and continue'}
                            >
                              {entry.action.kind === 'retry-candidate' ? 'Retry' : 'Convert and continue'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelChatAction?.(entry.id)}
                              aria-label={entry.action.kind === 'retry-candidate'
                                ? 'Cancel retry'
                                : 'Cancel conversion'}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Error messages: left-aligned with error color
                  return (
                    <div
                      key={entry.id}
                      data-testid={`chat-entry-${entry.id}`}
                      style={{
                        padding: '3px 12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: theme.errorText, flexShrink: 0, fontSize: '10px', lineHeight: '18px' }}>✗</span>
                      <div
                        style={{
                          color: theme.errorText,
                          whiteSpace: 'pre-wrap',
                          overflow: 'auto',
                          maxHeight: 240,
                          flex: 1,
                        }}
                        title={entry.text}
                      >
                        {entry.text}
                        <CandidateDiagnostics diagnostics={entry.diagnostics} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* The composer anchors the send refusal hint out of flow. */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Displayed, not announced: a refused Enter announces once through
                    the shell guidance region (Slice 94 design §5.4, §12). The hint
                    sits above the composer, out of flow, so a refusal that toggles
                    while the user types adds no space and shifts nothing
                    (CR94-C2-F1). It shows only while the composer has text or
                    focus (CR94-C3-F3), and passes pointer events through. */}
                {submitRefused && (
                  <p
                    id={submitReasonId}
                    style={showSubmitHint ? {
                      position: 'absolute', right: '12px', bottom: '100%', zIndex: 1, maxWidth: 'calc(100% - 24px)',
                      margin: '0 0 4px', padding: '2px 6px', fontSize: '11px', lineHeight: '15px',
                      color: theme.textMuted, backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                      borderRadius: '4px', pointerEvents: 'none',
                    } : {
                      position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
                      overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
                    }}
                  >
                    {submitDisabledReason}
                  </p>
                )}
                {hasUnreadResponse && (
                  <button type="button" className="coral-button" onClick={scrollToLatestResponse}>
                    New response
                  </button>
                )}

                {/* Input */}
                <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Mic button (#49) */}
                  {speech.isAvailable && (
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      disabled={isGenerating || !hasApiKey}
                      aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
                      aria-pressed={speech.isListening}
                      style={{
                        padding: '4px 6px',
                        fontSize: '14px',
                        background: 'none',
                        border: `1px solid ${speech.isListening ? theme.errorText : theme.border}`,
                        borderRadius: '4px',
                        color: speech.isListening ? theme.errorText : theme.textMuted,
                        cursor: isGenerating || !hasApiKey ? 'not-allowed' : 'pointer',
                        opacity: isGenerating || !hasApiKey ? 0.5 : 1,
                        flexShrink: 0,
                        position: 'relative',
                        lineHeight: 1,
                      }}
                    >
                      {speech.isModelLoading ? '...' : '\uD83C\uDFA4'}
                      {speech.isListening && (
                        <span
                          data-testid="recording-indicator"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: theme.errorText,
                            animation: 'pulse 1.5s infinite',
                          }}
                        />
                      )}
                    </button>
                  )}
                  <input
                    type="text"
                    value={prompt + (speech.interimTranscript ? (prompt ? ' ' : '') + speech.interimTranscript : '')}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setComposerFocused(true)}
                    onBlur={() => setComposerFocused(false)}
                    placeholder={
                      isGenerating
                          ? 'Generating...'
                          : speech.isListening
                            ? 'Listening...'
                            : 'Ask about your diagram or describe a change...'
                    }
                    disabled={isGenerating}
                    aria-label="AI prompt"
                    aria-describedby={submitRefused ? submitReasonId : undefined}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: `1px solid ${speech.isListening ? theme.errorText : theme.border}`,
                      backgroundColor: theme.inputBg,
                      color: theme.inputText,
                      outline: 'none',
                      opacity: hasApiKey ? 1 : 0.6,
                    }}
                  />
                  <button
                    type="button"
                    onClick={isGenerating ? onCancelGeneration : handleSubmit}
                    disabled={sendDisabled}
                    aria-label={isGenerating ? 'Cancel generation' : 'Send prompt'}
                    aria-describedby={submitRefused ? submitReasonId : undefined}
                    title={submitRefused ? submitDisabledReason : undefined}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: theme.buttonBg,
                      color: theme.buttonText,
                      cursor: sendDisabled ? 'not-allowed' : 'pointer',
                      opacity: sendDisabled ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {isGenerating ? 'Cancel' : 'Send'}
                  </button>
                </div>
              </div>
          </Tabs.Content>)}
          <Tabs.Content
            value="activity"
            forceMount
            hidden={collapsed || activeTab !== 'activity'}
            className="coral-bottom-panel__content"
          >
            <div role="log" aria-label="Activity log" style={{ padding: '8px 12px', color: theme.textMuted }}>
              {activityEntries.length === 0
                ? 'No activity recorded in this session.'
                : activityEntries.map((entry) => (
                    <div key={entry.id} data-status={entry.status}>
                      {entry.label} — {entry.status}
                    </div>
                  ))}
            </div>
          </Tabs.Content>
      </>
    </Tabs.Root>
  );
});

export default BottomPanel;
