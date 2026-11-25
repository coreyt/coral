/**
 * EditorPane Tests
 *
 * Behavioral tests for the extracted EditorPane component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorPane, type EditorPaneProps } from '../../src/components/EditorPane';

// Mock BottomPanel as a simple div
vi.mock('../../src/BottomPanel', () => ({
  BottomPanel: ({ turnCount }: { turnCount?: number }) => (
    <div data-testid="bottom-panel">BottomPanel turns: {turnCount ?? 'missing'}</div>
  ),
}));

const defaultTheme: Record<string, string> = {
  editorBg: '#1e1e1e',
  editorText: '#d4d4d4',
  editorHeaderBg: '#252526',
  editorHeaderText: '#888888',
  lineNumbersBg: '#1e1e1e',
  lineNumbersText: '#555555',
  lineNumbersBorder: '#333333',
  controlBg: '#333333',
  controlBgHover: '#444444',
  controlBgActive: '#555555',
  controlText: '#ffffff',
  controlTextMuted: '#aaaaaa',
  successBg: '#1e3a1e',
  successText: '#89d185',
  errorBg: '#5c2626',
  errorText: '#f48771',
  warningText: '#f0ad4e',
};

function defaultProps(overrides: Partial<EditorPaneProps> = {}): EditorPaneProps {
  return {
    dsl: 'service "Hello"\nservice "World"',
    dslType: 'mermaid',
    isDslReadOnly: false,
    parseErrors: [],
    editorAnalysis: { source: '', language: 'mermaid', diagnostics: [], decorations: [], entityHighlighting: false },
    entityHighlightingEnabled: false,
    debugInfo: 'Parsed 2 nodes, 0 edges',
    onDslChange: vi.fn(),
    onDslTypeChange: vi.fn(),
    bottomPanelTab: 'ai',
    onBottomPanelTabChange: vi.fn(),
    diagnosticsCollapsed: false,
    onToggleDiagnostics: vi.fn(),
    diagnosticEntries: [],
    onDiagnosticHover: vi.fn(),
    onAskAboutDiagnostic: vi.fn(),
    chatEntries: [],
    turnCount: 0,
    isGenerating: false,
    hasApiKey: false,
    onPromptSubmit: vi.fn(),
    onFixSourceError: vi.fn(),
    theme: defaultTheme,
    ...overrides,
  };
}

describe('EditorPane', () => {
  it('links status to the complete diagnostics list and does not label notes as blocking', () => {
    const props = defaultProps({ dsl: 'abc', dslType: 'coral', parseErrors: [{ message: 'advice', severity: 'warning' }],
      editorAnalysis: { source: 'abc', language: 'coral', diagnostics: [{ message: 'advice', severity: 'warning' }], decorations: [], entityHighlighting: false } });
    render(<EditorPane {...props} />);
    expect(screen.queryByText(/Last successful diagram retained/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all diagnostics' }));
    const region = screen.getByRole('region', { name: 'All diagnostics' });
    expect(document.activeElement).toBe(region);
    expect(region.textContent).toContain('advice');
  });
  it('shows an editor diagnostic hint in the complete diagnostics list (S93-WI-02)', () => {
    const error = { line: 2, code: 'coral.editor.node-type.unknown', message: 'Unknown node type: gateway',
      severity: 'error' as const, hint: 'Use `load_balancer` (symbol `arch-load-balancer`).' };
    render(<EditorPane {...defaultProps({ dsl: 'abc', dslType: 'coral', parseErrors: [error],
      editorAnalysis: { source: 'abc', language: 'coral', diagnostics: [error], decorations: [], entityHighlighting: false } })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all diagnostics' }));
    expect(screen.getByRole('region', { name: 'All diagnostics' }).textContent)
      .toContain('Unknown node type: gateway — Use `load_balancer` (symbol `arch-load-balancer`).');
  });
  // Code review C52-2: the button reveals every counted diagnostic, including
  // layout diagnostics that the source-owned list never renders.
  it('reveals a layout-only note that is not a source diagnostic', () => {
    const note = { line: 0, code: 'layout.worker.fallback', message: 'Layout ran on the main thread.', severity: 'warning' as const };
    render(<EditorPane {...defaultProps({ dsl: 'abc', dslType: 'coral', parseErrors: [note],
      editorAnalysis: { source: 'abc', language: 'coral', diagnostics: [], decorations: [], entityHighlighting: false } })} />);
    expect(screen.queryByRole('region', { name: 'All diagnostics' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Show all diagnostics' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    const region = screen.getByRole('region', { name: 'All diagnostics' });
    expect(document.activeElement).toBe(region);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(region.id);
    expect(region.textContent).toContain('[layout.worker.fallback] Layout ran on the main thread.');
    fireEvent.click(screen.getByRole('button', { name: 'Hide all diagnostics' }));
    expect(screen.queryByRole('region', { name: 'All diagnostics' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it('lists every counted diagnostic with its location', () => {
    const parseErrors = [
      { line: 2, message: 'first error' },
      { line: 3, message: 'second error', severity: 'error' as const },
      { line: 0, message: 'layout note', severity: 'info' as const },
    ];
    render(<EditorPane {...defaultProps({ parseErrors })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all diagnostics' }));
    const items = screen.getByRole('region', { name: 'All diagnostics' }).querySelectorAll('li');
    expect([...items].map((item) => item.textContent)).toEqual([
      'Error: Line 2: first error', 'Error: Line 3: second error', 'Note: layout note',
    ]);
  });
  it.each([
    [[{ message: 'e' }], [{ message: 'n', severity: 'warning' as const }], '1 error; 1 note.'],
    [[{ message: 'e' }, { message: 'f' }], [], '2 errors; 0 notes.'],
    [[], [{ message: 'n', severity: 'info' as const }, { message: 'm', severity: 'warning' as const }], '0 errors; 2 notes.'],
  ])('pluralizes status counts', (errors, notes, text) => {
    render(<EditorPane {...defaultProps({ parseErrors: [...errors, ...notes] })} />);
    expect(screen.getByTestId('status-bar').textContent).toContain(text);
  });
  it('renders textarea with provided DSL text', () => {
    const dsl = 'service "Auth"\nservice "DB"';
    render(<EditorPane {...defaultProps({ dsl })} />);

    const textarea = screen.getByLabelText('DSL editor') as HTMLTextAreaElement;
    expect(textarea.value).toBe(dsl);
  });

  it('calls onDslChange when textarea changes and not read-only', () => {
    const onDslChange = vi.fn();
    render(<EditorPane {...defaultProps({ onDslChange })} />);

    const textarea = screen.getByLabelText('DSL editor');
    fireEvent.change(textarea, { target: { value: 'service "Updated"' } });

    expect(onDslChange).toHaveBeenCalledWith('service "Updated"');
  });

  it('shows error in status bar when parseErrors is non-empty', () => {
    const parseErrors = [{ line: 3, message: 'Unexpected token' }];
    render(<EditorPane {...defaultProps({ parseErrors })} />);

    const statusBar = screen.getByTestId('status-bar');
    expect(statusBar.textContent).toContain('Line 3');
    expect(statusBar.textContent).toContain('Unexpected token');
    expect(statusBar.textContent).toContain('Last successful diagram retained');
  });

  it('labels a recovered graph from an opened file, not as a last successful diagram (R-064)', () => {
    const parseErrors = [{ line: 3, message: 'Unexpected token' }];
    render(<EditorPane {...defaultProps({ parseErrors, recoveredGraph: true })} />);
    const statusBar = screen.getByTestId('status-bar');
    expect(statusBar.textContent).toContain('Recovered graph — 1 error');
    expect(statusBar.textContent).not.toContain('Last successful diagram retained');
  });

  it('does not offer Fix for analysis owned by an older source', () => {
    render(<EditorPane {...defaultProps({
      dsl: 'service "Now valid"',
      dslType: 'coral',
      parseErrors: [{ line: 2, message: 'Unexpected token' }],
      editorAnalysis: {
        source: 'service "API" as api\napi -> ???',
        language: 'coral',
        diagnostics: [{ line: 2, message: 'Unexpected token', severity: 'error' }],
        decorations: [],
        entityHighlighting: false,
      },
    })} />);

    expect(screen.queryByRole('button', { name: 'Fix current source error with AI' })).toBeNull();
  });

  it('uses roving focus and arrow activation for the format radio group', () => {
    const onDslTypeChange = vi.fn();
    render(<EditorPane {...defaultProps({ onDslTypeChange })} />);
    const mermaid = screen.getByRole('radio', { name: 'Mermaid' });
    const coral = screen.getByRole('radio', { name: 'Coral' });
    expect(mermaid.tabIndex).toBe(0);
    expect(coral.tabIndex).toBe(-1);
    mermaid.focus();
    fireEvent.keyDown(mermaid, { key: 'ArrowRight' });
    expect(onDslTypeChange).toHaveBeenCalledOnce();
    expect(onDslTypeChange).toHaveBeenCalledWith('coral');
    expect(document.activeElement).toBe(coral);
  });

  it('renders only analysis owned by the current source and format', () => {
    const dsl = 'service "API" as api';
    render(<EditorPane {...defaultProps({
      dsl,
      dslType: 'coral',
      editorAnalysis: {
        source: dsl,
        language: 'coral',
        diagnostics: [],
        decorations: [{ start: 8, end: 13, entityId: 'api' }],
        entityHighlighting: true,
      },
      entityHighlightingEnabled: true,
    })} />);
    expect(document.querySelector('[data-entity-id="api"]')?.textContent).toBe('"API"');
  });

  it('hides enabled analysis immediately when the live preference is disabled', () => {
    const dsl = 'service "API" as api';
    const props = defaultProps({
      dsl,
      dslType: 'coral',
      editorAnalysis: {
        source: dsl,
        language: 'coral',
        diagnostics: [],
        decorations: [{ start: 8, end: 13, entityId: 'api' }],
        entityHighlighting: true,
      },
      entityHighlightingEnabled: true,
    });
    const { rerender } = render(<EditorPane {...props} />);
    expect(document.querySelector('[data-entity-id="api"]')).not.toBeNull();
    rerender(<EditorPane {...props} entityHighlightingEnabled={false} />);
    expect(document.querySelector('[data-entity-id="api"]')).toBeNull();
  });

  it('shows debugInfo in status bar when no errors', () => {
    const debugInfo = 'Parsed 5 nodes, 4 edges';
    render(<EditorPane {...defaultProps({ debugInfo })} />);

    const statusBar = screen.getByTestId('status-bar');
    expect(statusBar.textContent).toContain('Parsed 5 nodes, 4 edges');
  });

  it('does not embed the full-width bottom dock inside Source', () => {
    render(<EditorPane {...defaultProps({ turnCount: 7 })} />);

    expect(screen.queryByTestId('bottom-panel')).toBeNull();
  });

  it('does not call onDslChange when isDslReadOnly is true', () => {
    const onDslChange = vi.fn();
    render(<EditorPane {...defaultProps({ onDslChange, isDslReadOnly: true })} />);

    const textarea = screen.getByLabelText('DSL editor');
    fireEvent.change(textarea, { target: { value: 'should not fire' } });

    expect(onDslChange).not.toHaveBeenCalled();
  });

  it('ends timing-free source sessions when the caret leaves the active span', () => {
    const onEditSessionEnd = vi.fn();
    const props = defaultProps({ dsl: 'service "One"\nservice "Two"', onEditSessionEnd });
    const { rerender } = render(<EditorPane {...props} />);
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'service "One!"\nservice "Two"' } });
    rerender(<EditorPane {...props} dsl={'service "One!"\nservice "Two"'} />);
    fireEvent.select(editor, { target: { selectionStart: 24, selectionEnd: 24 } });
    expect(onEditSessionEnd).toHaveBeenCalled();
  });

  it('keeps paste/cut as one-change sessions and separates IME from prior typing', () => {
    const onEditSessionEnd = vi.fn();
    render(<EditorPane {...defaultProps({ onEditSessionEnd })} />);
    const editor = screen.getByRole('textbox');
    fireEvent.paste(editor);
    fireEvent.change(editor, { target: { value: 'pasted' } });
    const afterPaste = onEditSessionEnd.mock.calls.length;
    expect(afterPaste).toBeGreaterThanOrEqual(2);
    fireEvent.compositionStart(editor);
    expect(onEditSessionEnd.mock.calls.length).toBeGreaterThan(afterPaste);
  });

  it('arms one unmodified Tab exit after Escape and leaves modifier chords armed', () => {
    render(<>
      <EditorPane {...defaultProps()} />
      <div role="separator" aria-label="Resize source" tabIndex={0} />
    </>);
    const editor = screen.getByLabelText('DSL editor');
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.keyDown(editor, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('separator', { name: 'Resize source' }));

    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Mermaid' }));
  });

  it('does not arm source exit for a modified Escape chord', () => {
    render(<EditorPane {...defaultProps()} />);
    const editor = screen.getByRole('textbox');
    const splitter = document.createElement('div');
    splitter.setAttribute('aria-label', 'Resize source');
    splitter.tabIndex = 0;
    document.body.append(splitter);
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape', ctrlKey: true });
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(document.activeElement).toBe(editor);
    splitter.remove();
  });

  it('disarms source exit when the textarea loses focus inside Source', () => {
    render(<>
      <EditorPane {...defaultProps()} />
      <div role="separator" aria-label="Resize source" tabIndex={0} />
    </>);
    const editor = screen.getByRole('textbox');
    const format = screen.getByRole('radio', { name: 'Mermaid' });
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.blur(editor, { relatedTarget: format });
    format.focus();
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(document.activeElement).toBe(editor);
  });

  it('styles a structural read-only reason as progress, not the success LIVE badge (DR94-F7)', () => {
    const { rerender } = render(<EditorPane {...defaultProps({ isDslReadOnly: true })} />);
    const live = screen.getByText('LIVE');
    expect(live.style.color).toBe('rgb(137, 209, 133)');

    rerender(<EditorPane {...defaultProps({ isDslReadOnly: true, isDslReadOnlyReason: 'Updating diagram' })} />);
    const updating = screen.getByText('Updating diagram');
    expect(updating.style.color).toBe('rgb(240, 173, 78)');
    expect(updating.style.backgroundColor).not.toBe('rgb(30, 58, 30)');
  });
});

describe('EditorPane edition quick fix (Slice 60 C5, Q-C5-2)', () => {
  const edition = { line: 3, code: 'coral.symbol.local.edition', message: '@symbol needs edition 0.2.9' };

  it('offers Pin edition 0.2.9 when the source reports coral.symbol.local.edition', () => {
    const onPinEdition029 = vi.fn();
    render(<EditorPane {...defaultProps({ dsl: 'abc', dslType: 'coral', parseErrors: [edition], onPinEdition029 })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin edition 0.2.9' }));
    expect(onPinEdition029).toHaveBeenCalledTimes(1);
  });

  it('offers nothing for other diagnostics or without a handler', () => {
    const { unmount } = render(<EditorPane {...defaultProps({ dsl: 'abc', dslType: 'coral',
      parseErrors: [{ message: 'other' }], onPinEdition029: vi.fn() })} />);
    expect(screen.queryByRole('button', { name: 'Pin edition 0.2.9' })).toBeNull();
    unmount();
    render(<EditorPane {...defaultProps({ dsl: 'abc', dslType: 'coral', parseErrors: [edition] })} />);
    expect(screen.queryByRole('button', { name: 'Pin edition 0.2.9' })).toBeNull();
  });
});

describe('0.2.9 AI source repair deferral', () => {
  it('keeps error diagnostics without an AI Fix action', () => {
    render(<EditorPane {...defaultProps({ dsl: '', dslType: 'coral', parseErrors: [{ message: 'Invalid source', severity: 'error' }],
      editorAnalysis: { source: '', language: 'coral', diagnostics: [{ message: 'Invalid source', severity: 'error' }],
        decorations: [], entityHighlighting: false } })} />);
    expect(screen.getByRole('button', { name: 'Show all diagnostics' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Fix current source error with AI' })).toBeNull();
  });
});
