import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextEditor, getDiagnosticColor, getEntityColor } from '../src/text-editor/TextEditor.js';

const value = 'service "API" as api\napi -> db';
const owner = { source: value, language: 'coral' as const };

describe('R-036 structured TextEditor', () => {
  it.each([true, false])('preserves exact compatibility ranges with explicit position=%s', (withPosition) => {
    render(<TextEditor value="abc missing" onChange={() => {}} errors={[{
      message: 'primary range', line: 1, column: 1,
      ...(withPosition ? { position: { line: 1, column: 4, offset: 4 } } : {}),
      range: { start: { line: 1, column: 4, offset: 4 }, end: { line: 1, column: 8, offset: 8 } },
      related: [{ message: 'related range', position: { line: 1, column: 9, offset: 9 },
        range: { start: { line: 1, column: 9, offset: 9 }, end: { line: 1, column: 11, offset: 11 } } }],
    }]} />);
    expect([...document.querySelectorAll('[data-diagnostic="true"]')].map((element) => element.textContent)).toEqual(['miss', 'ng']);
    expect(screen.getByRole('button', { name: 'Error: primary range' }).getAttribute('data-offset')).toBe('4');
    expect(screen.getByRole('button', { name: 'Error: related range' }).getAttribute('data-offset')).toBe('9');
  });

  it('does not invent a range when the compatibility error has only an explicit position', () => {
    render(<TextEditor value="abc missing" onChange={() => {}} errors={[{
      message: 'position only', line: 1, column: 1, position: { line: 1, column: 4, offset: 4 },
    }]} />);
    expect(screen.getByRole('button', { name: 'Error: position only' }).getAttribute('data-offset')).toBe('4');
    expect(document.querySelector('[data-diagnostic="true"]')).toBeNull();
  });

  it('shows all primary diagnostics and navigable related locations without counting related errors', () => {
    render(<TextEditor value="abcdef" onChange={() => {}} diagnostics={[
      ...Array.from({ length: 6 }, (_, i) => ({ message: `problem ${i}`, severity: 'error' as const, position: { line: 1, column: i, offset: i } })),
      { message: 'grouped duplicate', severity: 'warning', position: { line: 1, column: 0, offset: 0 },
        related: [{ message: 'other spelling', position: { line: 1, column: 4, offset: 4 }, range: { start: { line: 1, column: 4, offset: 4 }, end: { line: 1, column: 5, offset: 5 } } }] },
    ]} />);
    expect(screen.getByText('problem 5', { exact: false })).toBeTruthy();
    expect(screen.getByText('6 errors, 1 warning, 0 info')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Warning: other spelling' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Go to related location.*other spelling/ }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).selectionStart).toBe(4);
    expect(document.querySelector('[data-diagnostic="true"]')?.textContent).toBe('e');
  });
  it('renders every exact error as a focusable squiggle and message', () => {
    render(<TextEditor value={value} onChange={() => {}} language="coral" analysisOwner={owner}
      diagnostics={[
        { message: 'bad declaration', severity: 'error', position: { line: 1, column: 8, offset: 8 }, range: { start: { line: 1, column: 8, offset: 8 }, end: { line: 1, column: 13, offset: 13 } } },
        { message: 'bad edge', severity: 'error', position: { line: 2, column: 0, offset: 21 } },
      ]} />);

    expect(screen.getAllByRole('button', { name: /error:/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Error: bad declaration' }).getAttribute('title')).toBe('bad declaration');
    expect(document.querySelector('[data-diagnostic="true"]')?.textContent).toBe('"API"');
  });

  it('retains structured diagnostic codes in accessible details', () => {
    render(<TextEditor value="bad" onChange={() => {}}
      diagnostics={[{ code: 'coral.line.unparsed', message: 'bad syntax', line: 1 }]} />);
    expect(screen.getByRole('button', { name: 'Error: [coral.line.unparsed] bad syntax' }).title)
      .toBe('[coral.line.unparsed] bad syntax');
  });

  it('suppresses stale decorations whose owner does not match controlled props', () => {
    const { rerender } = render(<TextEditor value={value} onChange={() => {}} language="coral"
      analysisOwner={owner} decorations={[{ start: 8, end: 13, entityId: 'api' }]} />);
    expect(document.querySelector('[data-entity-id="api"]')).not.toBeNull();
    rerender(<TextEditor value={`${value} `} onChange={() => {}} language="coral"
      analysisOwner={owner} decorations={[{ start: 8, end: 13, entityId: 'api' }]} />);
    expect(document.querySelector('[data-entity-id="api"]')).toBeNull();
  });

  it('keeps legacy one-based columns and drops invalid ranges safely', () => {
    render(<TextEditor value="abc" onChange={() => {}} errors={[{ line: 1, column: 1, message: 'legacy' }]}
      analysisOwner={{ source: 'abc', language: 'coral' }}
      decorations={[{ start: -1, end: 99, entityId: 'bad' }]} />);
    expect(screen.getByRole('button', { name: 'Error: legacy' }).getAttribute('data-offset')).toBe('0');
    expect(document.querySelector('[data-entity-id="bad"]')).toBeNull();
    expect(screen.getByRole('textbox')).not.toBeNull();
  });

  it('uses deterministic theme-specific entity colors', () => {
    expect(getEntityColor('api', 'light')).toEqual(getEntityColor('api', 'light'));
    expect(getEntityColor('api', 'dark')).not.toEqual(getEntityColor('api', 'light'));
    expect(getEntityColor('api', 'light').slot).toBe(getEntityColor('api', 'dark').slot);
  });

  it('meets the fixed palette contrast thresholds in both themes', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const ratio = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    for (const theme of ['light', 'dark'] as const) {
      const editor = theme === 'light' ? '#fafafa' : '#1e1e1e';
      const text = theme === 'light' ? '#111827' : '#f5f5f5';
      const seen = new Map<number, ReturnType<typeof getEntityColor>>();
      for (let index = 0; seen.size < 5; index++) {
        const color = getEntityColor(`entity-${index}`, theme);
        seen.set(color.slot, color);
      }
      for (const color of seen.values()) {
        expect(ratio(text, color.background)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(editor, color.background)).toBeGreaterThanOrEqual(1.5);
        expect(ratio(editor, color.edge)).toBeGreaterThanOrEqual(3);
        expect(ratio(getDiagnosticColor(theme), color.background)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('uses identical typography, spacing, and tab metrics for overlay and textarea', () => {
    render(<TextEditor value={value} onChange={() => {}} tabSize={4}
      style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '20px', padding: '8px 12px 8px 48px' }} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const overlay = document.querySelector('[data-testid="text-editor-overlay"]') as HTMLElement;
    for (const property of ['fontFamily', 'fontSize', 'lineHeight', 'padding', 'tabSize'] as const) {
      expect(overlay.style[property]).toBe(textarea.style[property]);
    }
  });

  it('preserves caller visual styles while keeping the editable surface transparent', () => {
    render(<TextEditor value={value} onChange={() => {}}
      style={{ border: 'none', resize: 'none', boxSizing: 'content-box', backgroundColor: 'rgb(1, 2, 3)' }} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const overlay = document.querySelector('[data-testid="text-editor-overlay"]') as HTMLElement;
    expect(textarea.style.borderStyle).toBe('none');
    expect(textarea.style.resize).toBe('none');
    expect(textarea.style.boxSizing).toBe('content-box');
    expect(textarea.style.background).toBe('transparent');
    expect(overlay.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('gives the wrapper a definite requested height for percentage-sized editors', () => {
    const { container } = render(<TextEditor value={value} onChange={() => {}}
      minHeight="100%" style={{ width: '100%', height: '100%' }} />);
    const wrapper = container.querySelector('.coral-text-editor') as HTMLElement;
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(wrapper.style.height).toBe('100%');
    expect(textarea.style.height).toBe('100%');
  });

  it('gives same-line diagnostics separate hover and focus targets', () => {
    render(<TextEditor value="bad" onChange={() => {}} wrap="off"
      diagnostics={[{ message: 'first', line: 1 }, { message: 'second', line: 1 }]} />);
    const first = screen.getByRole('button', { name: 'Error: first' });
    const second = screen.getByRole('button', { name: 'Error: second' });
    expect(first.style.left).not.toBe(second.style.left);
    fireEvent.mouseEnter(second);
    expect(screen.getByRole('tooltip').textContent).toBe('second');
  });

  it('represents line-only and unknown diagnostics without fabricating offsets', () => {
    render(<TextEditor value={'a\nb'} onChange={() => {}} analysisOwner={{ source: 'a\nb', language: 'coral' }}
      diagnostics={[{ message: 'line only', line: 2 }, { message: 'unknown' }]} />);
    expect(screen.getByRole('button', { name: 'Error: line only' }).hasAttribute('data-offset')).toBe(false);
    expect(screen.getByRole('button', { name: 'Error: unknown' }).hasAttribute('data-offset')).toBe(false);
  });

  it('keeps the native controlled input and synchronizes overlay scroll', () => {
    const onChange = vi.fn();
    render(<TextEditor value={value} onChange={onChange} wrap="off" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'next' } });
    expect(onChange).toHaveBeenCalledWith('next');
    textarea.scrollTop = 20;
    textarea.scrollLeft = 12;
    fireEvent.scroll(textarea);
    const overlay = document.querySelector('[data-testid="text-editor-overlay"]') as HTMLElement;
    const gutter = document.querySelector('[data-testid="text-editor-marker-gutter"]') as HTMLElement;
    expect(overlay.scrollTop).toBe(20);
    expect(overlay.scrollLeft).toBe(12);
    expect(gutter.scrollTop).toBe(20);
    expect(gutter.scrollLeft).toBe(0);
    expect(textarea.wrap).toBe('off');
  });

  it('does not intercept selection, paste, or IME composition events', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TextEditor value="abc" onChange={onChange} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(1, 2);
    fireEvent.compositionStart(textarea);
    fireEvent.paste(textarea, { clipboardData: { getData: () => 'x' } });
    fireEvent.compositionEnd(textarea, { data: '語' });
    rerender(<TextEditor value="abc" onChange={onChange}
      decorations={[{ start: 0, end: 1, entityId: 'a' }]}
      analysisOwner={{ source: 'abc', language: 'coral' }} />);
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(2);
  });
});
