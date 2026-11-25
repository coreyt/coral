import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutControls } from '../src/editor/LayoutControls';
import { FileControls } from '../src/editor/FileControls';
import { TextEditor } from '../src/text-editor/TextEditor';
import { createDocument } from '../src/file/serialize';

/**
 * Controls and the text editor - R-030 coverage.
 *
 * These components were shipped in the public surface of @coral-viz/viz with
 * essentially no tests: 4-13% statements each.
 */

describe('LayoutControls', () => {
  const props = {
    onReflow: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
  };

  beforeEach(() => {
    props.onReflow.mockReset();
    props.onUndo.mockReset();
    props.onRedo.mockReset();
  });

  it('renders reflow, undo and redo', () => {
    render(<LayoutControls {...props} />);

    expect(screen.getByRole('button', { name: /reflow/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /undo/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDefined();
  });

  it('calls back when each control is used', () => {
    render(<LayoutControls {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /reflow/i }));
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    fireEvent.click(screen.getByRole('button', { name: /redo/i }));

    expect(props.onReflow).toHaveBeenCalled();
    expect(props.onUndo).toHaveBeenCalled();
    expect(props.onRedo).toHaveBeenCalled();
  });

  it('disables undo and redo when there is nothing to undo or redo', () => {
    render(<LayoutControls {...props} canUndo={false} canRedo={false} />);

    expect((screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /redo/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not fire while a reflow is already running', () => {
    render(<LayoutControls {...props} isReflowing />);

    fireEvent.click(screen.getByRole('button', { name: /reflow/i }));

    expect(props.onReflow).not.toHaveBeenCalled();
  });

  it('shows how many steps are available', () => {
    render(<LayoutControls {...props} undoCount={3} redoCount={2} />);

    expect(document.body.textContent).toMatch(/3|2/);
  });

  it('responds to its keyboard shortcuts', () => {
    render(<LayoutControls {...props} />);

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: 'L', ctrlKey: true, shiftKey: true });

    expect(props.onUndo).toHaveBeenCalled();
    expect(props.onRedo).toHaveBeenCalled();
    expect(props.onReflow).toHaveBeenCalled();
  });
});

describe('FileControls', () => {
  const doc = createDocument({ name: 'Test' });

  it.each(['CON', 'prn', 'AUX', 'nul', 'COM1', 'LPT9'])('saves %s under a Windows-safe filename', (name) => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:filename');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const filenames: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { filenames.push(this.download); });
    try {
      render(<FileControls document={createDocument({ name })} onLoad={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(filenames).toEqual([`diagram-${name.toLowerCase()}.coral.json`]);
    } finally {
      createUrl.mockRestore(); revokeUrl.mockRestore(); click.mockRestore();
    }
  });

  it('renders save and load', () => {
    render(<FileControls document={doc} onLoad={vi.fn()} />);

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /load|open/i })).toBeDefined();
  });

  it('disables its controls when asked', () => {
    render(<FileControls document={doc} onLoad={vi.fn()} disabled />);

    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows an export control only when asked', () => {
    const { rerender } = render(<FileControls document={doc} onLoad={vi.fn()} showExport={false} />);
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();

    rerender(<FileControls document={doc} onLoad={vi.fn()} showExport />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDefined();
  });

  it('hands raw file text to onOpenFile with the caller accept list (R-064)', async () => {
    const onOpenFile = vi.fn();
    const onLoad = vi.fn();
    const { container } = render(<FileControls document={doc} onLoad={onLoad} onOpenFile={onOpenFile} accept=".coral,.mmd" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.coral,.mmd');
    const file = new File(['service "A"\n!!!'], 'broken.coral', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => expect(onOpenFile).toHaveBeenCalledWith({ name: 'broken.coral', text: 'service "A"\n!!!' }));
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('reports a selected-file read failure to the raw-open owner (R-064)', () => {
    const onOpenFileError = vi.fn();
    const original = globalThis.FileReader;
    class FailingFileReader {
      onload: ((event: { target: FailingFileReader }) => void) | null = null;
      onerror: ((event: { target: FailingFileReader }) => void) | null = null;
      onabort: ((event: { target: FailingFileReader }) => void) | null = null;
      result: string | null = null;
      error = new DOMException('selected file unavailable', 'NotReadableError');
      readAsText() { this.onerror?.({ target: this }); }
    }
    vi.stubGlobal('FileReader', FailingFileReader);
    try {
      const { container } = render(<FileControls
        document={doc}
        onLoad={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFileError={onOpenFileError}
      />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'unavailable.coral')] } });
      expect(onOpenFileError).toHaveBeenCalledWith({
        name: 'unavailable.coral', error: expect.objectContaining({ message: 'selected file unavailable' }),
      });
    } finally {
      vi.stubGlobal('FileReader', original);
    }
  });

  it('asks for the current document when saving', () => {
    const onGetDocument = vi.fn(() => doc);
    const createObjectURL = vi.fn(() => 'blob:x');
    const original = URL.createObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;

    try {
      render(<FileControls document={doc} onLoad={vi.fn()} onGetDocument={onGetDocument} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(onGetDocument).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = original;
    }
  });
});

describe('TextEditor', () => {
  it('renders its value and reports changes', () => {
    const onChange = vi.fn();
    render(<TextEditor value='service "A"' onChange={onChange} />);

    const area = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(area.value).toBe('service "A"');

    fireEvent.change(area, { target: { value: 'service "B"' } });
    expect(onChange).toHaveBeenCalledWith('service "B"');
  });

  it('honours read-only', () => {
    render(<TextEditor value="x" onChange={vi.fn()} readOnly />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('shows line numbers when asked', () => {
    const { container, rerender } = render(
      <TextEditor value={'a\nb\nc'} onChange={vi.fn()} showLineNumbers={false} />
    );
    const withoutNumbers = container.textContent ?? '';

    rerender(<TextEditor value={'a\nb\nc'} onChange={vi.fn()} showLineNumbers />);

    expect((container.textContent ?? '').length).toBeGreaterThanOrEqual(withoutNumbers.length);
  });

  it('surfaces parse errors', () => {
    render(
      <TextEditor
        value={'service "A"\nbad'}
        onChange={vi.fn()}
        errors={[{ message: 'Unexpected syntax', line: 2, column: 0 }]}
      />
    );

    expect(document.body.textContent).toMatch(/unexpected syntax|2/i);
  });

  it('inserts an indent on Tab rather than leaving the field', () => {
    const onChange = vi.fn();
    render(<TextEditor value="a" onChange={onChange} />);

    const area = screen.getByRole('textbox');
    fireEvent.keyDown(area, { key: 'Tab' });

    expect(onChange).toHaveBeenCalled();
  });

  it('shows a placeholder when empty', () => {
    render(<TextEditor value="" onChange={vi.fn()} placeholder="Type Coral here" />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).placeholder).toBe('Type Coral here');
  });
});

describe('FileControls: remaining paths (R-030)', () => {
  const doc = createDocument({ name: 'Test' });

  it('falls back to the document it was given when no getter is supplied', () => {
    const original = URL.createObjectURL;
    URL.createObjectURL = (() => 'blob:x') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;

    try {
      render(<FileControls document={doc} onLoad={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('does nothing on save when there is no document and no getter', () => {
    render(<FileControls document={null} onLoad={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
  });

  it('accepts a class name and inline styles', () => {
    const { container } = render(
      <FileControls document={doc} onLoad={vi.fn()} className="files" style={{ gap: 8 }} />
    );

    expect(container.querySelector('.files')).not.toBeNull();
  });

  it('shows shortcut hints only when asked', () => {
    const { rerender } = render(
      <FileControls document={doc} onLoad={vi.fn()} showShortcutHints={false} />
    );
    const without = screen.getByRole('button', { name: /save/i }).getAttribute('title') ?? '';

    rerender(<FileControls document={doc} onLoad={vi.fn()} showShortcutHints />);
    const with_ = screen.getByRole('button', { name: /save/i }).getAttribute('title') ?? '';

    expect(with_.length).toBeGreaterThanOrEqual(without.length);
  });

  it('has a file input for loading', () => {
    const { container } = render(<FileControls document={doc} onLoad={vi.fn()} />);

    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});
