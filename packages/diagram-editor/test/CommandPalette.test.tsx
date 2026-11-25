import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, type CommandPaletteTheme } from '../src/CommandPalette';

const theme: CommandPaletteTheme = {
  overlayBg: '#0008', bg: '#fff', border: '#ccc', text: '#111', mutedText: '#555',
  inputBg: '#fff', inputText: '#111', hoverBg: '#eee', shortcutBg: '#ddd', shortcutText: '#222',
};

describe('CommandPalette focus handoff', () => {
  it('wraps Tab focus inside the modal', async () => {
    render(<CommandPalette
      isOpen
      onClose={() => {}}
      commands={[{ id: 'one', label: 'One', category: 'Test', action: () => {} }]}
      theme={theme}
    />);
    const input = screen.getByLabelText('Search commands');
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('does not restore its invoker when a command transfers focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const targetRef = useRef<HTMLButtonElement>(null);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open palette</button>
        <button ref={targetRef} type="button">Follow-on target</button>
        <CommandPalette
          isOpen={open}
          onClose={() => setOpen(false)}
          commands={[{
            id: 'handoff', label: 'Handoff', category: 'Test', transfersFocus: true,
            action: () => targetRef.current?.focus(),
          }]}
          theme={theme}
        />
      </>;
    }

    render(<Harness />);
    const invoker = screen.getByRole('button', { name: 'Open palette' });
    invoker.focus();
    fireEvent.click(invoker);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Search commands')));
    fireEvent.click(screen.getByRole('option', { name: /handoff/i }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Follow-on target' })));
  });
});

describe('CommandPalette query selection', () => {
  it('runs the first match of a new query, not a row hovered in the previous list', async () => {
    const run = vi.fn();
    render(<CommandPalette
      isOpen
      onClose={() => {}}
      commands={['Reflow layout', 'Export SVG', 'Export PNG'].map((label) => ({
        id: label, label, category: 'Test', action: () => run(label),
      }))}
      theme={theme}
    />);
    const input = screen.getByLabelText('Search commands');
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Export SVG' }));
    fireEvent.change(input, { target: { value: 'export' } });
    expect(screen.getByRole('option', { name: 'Export SVG' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalledExactlyOnceWith('Export SVG');
  });
});
