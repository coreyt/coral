import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import type { ParseError } from './hooks/useBidirectionalSync.js';

export type SyntaxLanguage = 'coral' | 'mermaid' | 'dot' | 'plain';
export type EditorTheme = 'light' | 'dark';

export interface EditorSourcePosition { line: number; column: number; offset: number }
export interface EditorSourceRange { start: EditorSourcePosition; end: EditorSourcePosition }
export interface EditorDiagnostic {
  message: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  /** One-based logical line when no exact position is available. */
  line?: number;
  position?: EditorSourcePosition;
  range?: EditorSourceRange;
  related?: readonly { message: string; position: EditorSourcePosition; range?: EditorSourceRange }[];
  source?: string;
  subject?: { kind: 'node' | 'edge' | 'graph'; id: string };
  hint?: string;
}
export interface EditorDecoration { start: number; end: number; entityId: string }
export interface EditorAnalysisOwner {
  source: string;
  language: SyntaxLanguage;
  entityHighlighting?: boolean;
}

export interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (start: number, end: number) => void;
  language?: SyntaxLanguage;
  /** Legacy locations use one-based columns. */
  errors?: ParseError[];
  diagnostics?: EditorDiagnostic[];
  decorations?: EditorDecoration[];
  analysisOwner?: EditorAnalysisOwner;
  /** Current preference; explicit decorations remain enabled by default for public callers. */
  entityHighlightingEnabled?: boolean;
  editorTheme?: EditorTheme;
  wrap?: 'soft' | 'off';
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
  showLineNumbers?: boolean;
  autoFocus?: boolean;
  tabSize?: number;
  minHeight?: string;
  'aria-label'?: string;
}

const font = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace';
const LIGHT_FILLS = ['#38bdf8', '#a78bfa', '#fb7185', '#eab308', '#4ade80'] as const;
const LIGHT_EDGES = ['#0369a1', '#6d28d9', '#be123c', '#a16207', '#15803d'] as const;
const DARK_FILLS = ['#164e63', '#4c1d95', '#881337', '#713f12', '#14532d'] as const;
const DARK_EDGES = ['#38bdf8', '#a78bfa', '#fb7185', '#facc15', '#4ade80'] as const;

export function getEntityColor(entityId: string, theme: EditorTheme) {
  let hash = 2166136261;
  for (let i = 0; i < entityId.length; i++) {
    hash ^= entityId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const slot = (hash >>> 0) % LIGHT_FILLS.length;
  return {
    slot,
    background: theme === 'dark' ? DARK_FILLS[slot] : LIGHT_FILLS[slot],
    edge: theme === 'dark' ? DARK_EDGES[slot] : LIGHT_EDGES[slot],
  };
}

export function getDiagnosticColor(theme: EditorTheme) {
  return theme === 'dark' ? '#ff8a80' : '#7f1d1d';
}

function offsetFromLegacy(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  const safeLine = Math.min(Math.max(1, line || 1), lines.length);
  let offset = 0;
  for (let i = 0; i < safeLine - 1; i++) offset += lines[i].length + 1;
  return offset + Math.min(Math.max(0, (column || 1) - 1), lines[safeLine - 1].length);
}

interface NormalizedDiagnostic extends EditorDiagnostic { offset?: number; line?: number; start?: number; end?: number }

function validRange(start: number, end: number, length: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= length;
}

function normalizeDiagnostics(value: string, errors: ParseError[], diagnostics: EditorDiagnostic[]): NormalizedDiagnostic[] {
  const compatible: EditorDiagnostic[] = errors.map((error) => {
    if (error.position || error.range) return { ...error, severity: error.severity ?? 'error' };
    const start = offsetFromLegacy(value, error.line, error.column);
    const position = { line: error.line, column: Math.max(0, (error.column || 1) - 1), offset: start };
    const end = Math.min(value.length, start + 1);
    return {
      ...error,
      severity: error.severity ?? 'error',
      position,
      range: { start: position, end: { ...position, column: position.column + end - start, offset: end } },
    };
  });
  return [...compatible, ...diagnostics].map((item) => {
    const start = item.range?.start.offset;
    const end = item.range?.end.offset;
    const position = item.position ?? item.range?.start;
    return {
      ...item,
      ...(position ? { position } : {}),
      line: position?.line ?? item.line,
      offset: position?.offset,
      ...(start !== undefined && end !== undefined && validRange(start, end, value.length)
        ? { start, end } : {}),
    };
  });
}

class DecorationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* isolated visual failure */ }
  render() { return this.state.failed ? null : this.props.children; }
}

function DecorationLayer({
  value,
  diagnostics,
  decorations,
  theme,
  textStyle,
  overlayRef,
}: {
  value: string;
  diagnostics: NormalizedDiagnostic[];
  decorations: EditorDecoration[];
  theme: EditorTheme;
  textStyle: React.CSSProperties;
  overlayRef: React.RefObject<HTMLPreElement | null>;
}) {
  const safeDecorations = decorations.filter((item) => validRange(item.start, item.end, value.length));
  const boundaries = new Set([0, value.length]);
  for (const item of safeDecorations) { boundaries.add(item.start); boundaries.add(item.end); }
  for (const item of diagnostics) {
    if (item.start !== undefined && item.end !== undefined) { boundaries.add(item.start); boundaries.add(item.end); }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const pointIndex = new Map(points.map((point, index) => [point, index]));
  const diagnosticDepth = Array(points.length).fill(0) as number[];
  for (const item of diagnostics) {
    if (item.start === undefined || item.end === undefined) continue;
    diagnosticDepth[pointIndex.get(item.start)!] += 1;
    diagnosticDepth[pointIndex.get(item.end)!] -= 1;
  }
  for (let index = 1; index < diagnosticDepth.length; index++) {
    diagnosticDepth[index] += diagnosticDepth[index - 1];
  }
  const sortedDecorations = [...safeDecorations].sort((a, b) => a.start - b.start || a.end - b.end);
  let decorationIndex = 0;
  const segmentEntities = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    while (sortedDecorations[decorationIndex]?.end <= start) decorationIndex++;
    const candidate = sortedDecorations[decorationIndex];
    return candidate?.start <= start && candidate.end >= end ? candidate : undefined;
  });
  return (
    <pre
      ref={overlayRef}
      data-testid="text-editor-overlay"
      aria-hidden="true"
      style={{
        background: theme === 'dark' ? '#1e1e1e' : '#fafafa',
        ...textStyle,
        position: 'absolute', inset: 0, margin: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1,
        color: 'transparent', border: 'none', resize: 'none',
      }}
    >
      {points.slice(0, -1).map((start, index) => {
        const end = points[index + 1];
        const entity = segmentEntities[index];
        const diagnostic = diagnosticDepth[index] > 0;
        const color = entity ? getEntityColor(entity.entityId, theme) : undefined;
        return <span
          key={`${start}:${end}`}
          {...(entity ? { 'data-entity-id': entity.entityId } : {})}
          {...(diagnostic ? { 'data-diagnostic': 'true' } : {})}
          style={{
            ...(color ? { backgroundColor: color.background, boxShadow: `inset 0 -2px ${color.edge}` } : {}),
            ...(diagnostic ? { textDecoration: `underline wavy ${getDiagnosticColor(theme)} 2px`, textUnderlineOffset: '2px' } : {}),
          }}
        >{value.slice(start, end)}</span>;
      })}
    </pre>
  );
}

export const TextEditor: React.FC<TextEditorProps> = ({
  value,
  onChange,
  onSelectionChange,
  language = 'coral',
  errors = [],
  diagnostics = [],
  decorations = [],
  analysisOwner,
  entityHighlightingEnabled = true,
  editorTheme = 'light',
  wrap = 'soft',
  placeholder = 'Enter diagram code...',
  readOnly = false,
  className,
  style,
  showLineNumbers = true,
  autoFocus = false,
  tabSize = 2,
  minHeight = '200px',
  'aria-label': ariaLabel,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const owned = analysisOwner === undefined
    || (analysisOwner.source === value && analysisOwner.language === language);
  const primaryDiagnostics = useMemo(
    () => normalizeDiagnostics(value, errors, owned ? diagnostics : []),
    [value, errors, diagnostics, owned],
  );
  const currentDiagnostics = useMemo(() => primaryDiagnostics.flatMap((item, parent) => [
    { ...item, parent },
    ...normalizeDiagnostics(value, [], (item.related ?? []).map((related) => ({
      ...related, severity: item.severity,
    }))).map((related) => ({ ...related, parent })),
  ]), [value, primaryDiagnostics]);
  const errorCount = primaryDiagnostics.filter((item) => !item.severity || item.severity === 'error').length;
  const warningCount = primaryDiagnostics.filter((item) => item.severity === 'warning').length;
  const infoCount = primaryDiagnostics.filter((item) => item.severity === 'info').length;
  const navigate = (location: { position?: EditorSourcePosition; range?: EditorSourceRange; line?: number }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = location.range?.start.offset ?? location.position?.offset
      ?? (location.line ? offsetFromLegacy(value, location.line, 1) : undefined);
    if (start === undefined || !Number.isInteger(start) || start < 0 || start > value.length) return;
    const end = location.range?.end.offset;
    textarea.focus();
    textarea.setSelectionRange(start, end !== undefined && validRange(start, end, value.length) ? end : start);
  };
  const entityOwned = owned && entityHighlightingEnabled
    && (analysisOwner?.entityHighlighting === undefined || analysisOwner.entityHighlighting === true);
  const currentDecorations = entityOwned ? decorations : [];
  const lineCount = value.split('\n').length;
  const markerLanes: number[] = [];
  const markersPerLine = new Map<number, number>();
  let maxMarkerLanes = 1;
  for (const item of currentDiagnostics) {
    const line = item.line !== undefined && Number.isFinite(item.line)
      ? Math.min(Math.max(1, item.line), lineCount)
      : undefined;
    const lane = wrap === 'off' && line !== undefined ? (markersPerLine.get(line) ?? 0) : 0;
    markerLanes.push(lane);
    if (line !== undefined) markersPerLine.set(line, lane + 1);
    maxMarkerLanes = Math.max(maxMarkerLanes, lane + 1);
  }
  const gutterWidth = showLineNumbers ? Math.max(40, 28 + maxMarkerLanes * 12) : Math.max(16, 4 + maxMarkerLanes * 12);
  const paddingLeft = showLineNumbers ? `${gutterWidth + 12}px` : '12px';
  const textStyle: React.CSSProperties = {
    width: '100%', minHeight, padding: `12px 12px 12px ${paddingLeft}`,
    boxSizing: 'border-box', fontFamily: font, fontSize: 14, lineHeight: 1.5,
    whiteSpace: wrap === 'off' ? 'pre' : 'pre-wrap',
    overflowWrap: wrap === 'off' ? 'normal' : 'break-word', tabSize, ...style,
  };
  const fontSizePx = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : Number.parseFloat(String(textStyle.fontSize)) || 14;
  const lineHeightPx = typeof textStyle.lineHeight === 'number'
    ? textStyle.lineHeight * fontSizePx : Number.parseFloat(String(textStyle.lineHeight)) || fontSizePx * 1.5;

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const next = `${value.slice(0, start)}${' '.repeat(tabSize)}${value.slice(target.selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + tabSize; });
  }, [onChange, tabSize, value]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = event.currentTarget.scrollTop;
      overlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
  }, []);

  useEffect(() => { if (autoFocus) textareaRef.current?.focus(); }, [autoFocus]);

  const textColor = editorTheme === 'dark' ? '#f5f5f5' : '#111827';
  return (
    <div className={`coral-text-editor ${className || ''}`} style={{
      position: 'relative', width: '100%', minHeight,
      ...(style?.height !== undefined ? { height: style.height } : {}),
      background: (style?.backgroundColor ?? style?.background ?? (editorTheme === 'dark' ? '#1e1e1e' : '#fafafa')) as string,
    }}>
      <DecorationBoundary>
        <DecorationLayer value={value} diagnostics={currentDiagnostics} decorations={currentDecorations}
          theme={editorTheme} textStyle={textStyle} overlayRef={overlayRef} />
        <div ref={gutterRef} data-testid="text-editor-marker-gutter" style={{ position: 'absolute', inset: '0 auto 0 0', width: gutterWidth, overflow: 'hidden', zIndex: 3 }}>
          <span aria-hidden="true" style={{ display: 'block', height: 12 + lineCount * lineHeightPx }} />
          {showLineNumbers && Array.from({ length: lineCount }, (_, index) => <span key={index} aria-hidden="true" style={{ position: 'absolute', right: 10, top: 12 + index * lineHeightPx, color: '#777', font: `12px/${lineHeightPx}px ${font}` }}>{index + 1}</span>)}
          {currentDiagnostics.map((item, index) => {
            const knownLine = item.line !== undefined && Number.isFinite(item.line);
            const line = knownLine ? Math.min(Math.max(1, item.line!), lineCount) : undefined;
            const detail = item.code ? `[${item.code}] ${item.message}` : item.message;
            const label = `${item.severity === 'warning' ? 'Warning' : item.severity === 'info' ? 'Info' : 'Error'}: ${detail}`;
            return <button key={index} type="button" aria-label={label} title={detail}
              data-offset={item.offset} onFocus={() => setActiveMarker(index)} onBlur={() => setActiveMarker(null)}
              onMouseEnter={() => setActiveMarker(index)} onMouseLeave={() => setActiveMarker(null)}
              style={{ position: 'absolute', left: 2 + markerLanes[index] * 12, top: line === undefined || wrap === 'soft' ? 2 + index * 16 : 14 + (line - 1) * lineHeightPx, width: 10, height: 10, padding: 0, border: 0, borderRadius: '50%', background: '#dc2626', cursor: 'help' }} />;
          })}
        </div>
        {activeMarker !== null && currentDiagnostics[activeMarker] && <div role="tooltip" style={{ position: 'absolute', left: 16, top: 2, zIndex: 4, maxWidth: 320, padding: '4px 8px', background: editorTheme === 'dark' ? '#5c2626' : '#ffebee', color: editorTheme === 'dark' ? '#fff' : '#7f1d1d' }}>{currentDiagnostics[activeMarker].code ? `[${currentDiagnostics[activeMarker].code}] ` : ''}{currentDiagnostics[activeMarker].message}</div>}
      </DecorationBoundary>
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)}
        onSelect={(event) => onSelectionChange?.(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
        onKeyDown={handleKeyDown} onScroll={handleScroll} placeholder={placeholder} readOnly={readOnly}
        spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" data-language={language}
        aria-label={ariaLabel} wrap={wrap}
        style={{
          border: '1px solid #e0e0e0', borderRadius: 4, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
          ...textStyle,
          position: 'relative', zIndex: 2,
          background: 'transparent', color: textStyle.color ?? textColor, caretColor: textStyle.color ?? textColor,
        }} />
      {primaryDiagnostics.length > 0 && <div className="coral-text-editor-errors" role="region" aria-label="Source diagnostics" tabIndex={0} style={{ maxHeight: 240, overflow: 'auto', marginTop: 8, padding: '8px 12px', background: editorTheme === 'dark' ? '#5c2626' : '#ffebee', color: editorTheme === 'dark' ? '#fff' : '#7f1d1d', fontSize: 13 }}>
        <div>{errorCount} error{errorCount === 1 ? '' : 's'}, {warningCount} warning{warningCount === 1 ? '' : 's'}, {infoCount} info</div>
        {primaryDiagnostics.map((item, index) => <div key={index} style={{ marginTop: 4, fontFamily: font, fontSize: 12 }}>
          {item.line ? `Line ${item.line}${item.position ? `, Col ${item.position.column + 1}` : ''}: ` : ''}{item.code ? `[${item.code}] ` : ''}{item.message}
          {item.hint && <div>{item.hint}</div>}
          {(item.related ?? []).map((related, relatedIndex) => <div key={relatedIndex} style={{ marginLeft: 12 }}>
            <button type="button" aria-label={`Go to related location: ${related.message}`} onClick={() => navigate(related)}>
              Line {related.position.line}, Col {related.position.column + 1}: {related.message}
            </button>
          </div>)}
        </div>)}
      </div>}
    </div>
  );
};

export default TextEditor;
