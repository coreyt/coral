import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AboutDialog, HelpDialog, WelcomeDialog } from '../src/GuidanceDialogs';
import { bundledSourceExamples028 } from '../src/exampleSources028';

const theme = {
  overlayBg: '#0008', inspectorBg: '#fff', inspectorBorder: '#aaa',
  inspectorText: '#111', controlTextMuted: '#555', controlBg: '#eee',
  controlBgActive: '#ddd', controlText: '#111',
};

describe('guidance dialogs', () => {
  it('offers recovery first and all examples without an install surface', async () => {
    const recover = vi.fn();
    const openExample = vi.fn();
    render(<WelcomeDialog
      isOpen
      hasRecovery
      announcement="Recovery is available."
      onRecover={recover}
      onDiscardRecovery={vi.fn()}
      onBlank={vi.fn()}
      onExample={openExample}
      onClose={vi.fn()}
      onOpenFile={vi.fn()}
      onAnnouncement={vi.fn()}
      theme={theme}
    />);

    const dialog = screen.getByRole('dialog', { name: 'Welcome to Coral' });
    expect(dialog.classList.contains('coral-dialog__content')).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Recover your work' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Recover your work' }).className).toContain('coral-button--primary');
    expect(screen.getByRole('button', { name: 'Discard recovery' }).className).toContain('coral-button--quiet');
    expect(screen.getByRole('button', { name: 'Blank diagram' }).className).toContain('coral-button--secondary');
    expect(screen.queryByRole('button', { name: /Blank diagram with Create Node/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Open .* example/ }))
      .toHaveLength(bundledSourceExamples028.length);
    for (const [index, exampleButton] of screen.getAllByRole('button', { name: /Open .* example/ }).entries()) {
      expect(exampleButton.className).toContain('coral-button--quiet');
      fireEvent.click(exampleButton);
      expect(openExample).toHaveBeenNthCalledWith(index + 1, bundledSourceExamples028[index]?.id);
    }
    expect(screen.queryByText(/install coral|installation is not offered/i)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Recover your work' })));
    fireEvent.click(screen.getByRole('button', { name: 'Recover your work' }));
    expect(recover).toHaveBeenCalledOnce();
  });

  it('keeps linked examples explicit, recovery first, and errors visible', async () => {
    const onExample = vi.fn();
    const props = { isOpen: true, hasRecovery: true, announcement: '', onRecover: vi.fn(),
      onDiscardRecovery: vi.fn(), onBlank: vi.fn(), onExample, onClose: vi.fn(),
      onOpenFile: vi.fn(), onAnnouncement: vi.fn(), theme };
    const { rerender } = render(<WelcomeDialog {...props}
      linkedExample={{ id: 'order-service', name: 'Order service', description: 'Architecture' }} />);
    expect(onExample).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Recover your work' })));
    fireEvent.click(screen.getByRole('button', { name: 'Open requested example' }));
    expect(onExample).toHaveBeenCalledExactlyOnceWith('order-service');
    rerender(<WelcomeDialog {...props} exampleLinkError="The example is unavailable. Your current work is unchanged." />);
    expect(screen.getByRole('alert').textContent).toContain('Your current work is unchanged');
    expect(screen.queryByRole('button', { name: 'Open requested example' })).toBeNull();
  });

  it('hands the chosen file to the shared open pipeline and shows a blocked open (R-064)', async () => {
    const onOpenFile = vi.fn(() => false);
    const { container } = render(<WelcomeDialog
      isOpen hasRecovery={false} announcement="" onRecover={vi.fn()} onDiscardRecovery={vi.fn()}
      onBlank={vi.fn()} onExample={vi.fn()} onClose={vi.fn()} onOpenFile={onOpenFile} onAnnouncement={vi.fn()}
      openFailure={{ fileName: 'bad.json', reasons: [{ message: 'Unexpected token', code: 'coral.open.json.invalid' }, { message: 'Second reason' }] }}
      theme={theme}
    />);
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('.mmd');
    expect(input.accept).toContain('.coral');
    fireEvent.change(input, { target: { files: [new File(['flowchart LR\nA-->B'], 'a.mmd')] } });
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledWith({ name: 'a.mmd', text: 'flowchart LR\nA-->B' }));
    const failure = screen.getByRole('alert');
    expect(failure.textContent).toContain('Could not open bad.json');
    expect(failure.textContent).toContain('coral.open.json.invalid');
    expect(failure.textContent).toContain('Second reason');
  });

  // TR94-C4-F4: the open pipeline announces its own reason for a refusal.
  it('leaves the open pipeline refusal announcement in place', async () => {
    const onOpenFile = vi.fn(() => false);
    const onAnnouncement = vi.fn();
    const { container } = render(<WelcomeDialog
      isOpen hasRecovery={false} announcement="" onRecover={vi.fn()} onDiscardRecovery={vi.fn()}
      onBlank={vi.fn()} onExample={vi.fn()} onClose={vi.fn()} onOpenFile={onOpenFile} onAnnouncement={onAnnouncement}
      theme={theme}
    />);
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['flowchart LR\nA-->B'], 'a.mmd')] } });
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledOnce());
    await waitFor(() => expect(input.value).toBe(''));
    expect(onAnnouncement).not.toHaveBeenCalled();
  });

  it('uses the Coral secondary action for the Welcome entry from Help', () => {
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenWelcome={vi.fn()} theme={theme} />);
    expect(screen.getByRole('button', { name: 'Open Welcome and examples' }).className)
      .toContain('coral-button--secondary');
  });

  it('traps focus, closes on Escape, and restores the invoker', async () => {
    const close = vi.fn();
    const invoker = document.createElement('button');
    document.body.append(invoker);
    invoker.focus();
    const { rerender } = render(<HelpDialog isOpen onClose={close} theme={theme} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close help' })));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).not.toBe(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    rerender(<HelpDialog isOpen={false} onClose={close} theme={theme} />);
    await waitFor(() => expect(document.activeElement).toBe(invoker));
    invoker.remove();
  });

  it('shows supplied identity and refuses unavailable identity', () => {
    const valid = { product: 'coral' as const, version: '0.2.6', commit: 'a'.repeat(40) };
    const { rerender } = render(<AboutDialog isOpen identity={valid} onClose={vi.fn()} theme={theme} />);
    expect(screen.getByText('Version 0.2.6')).toBeDefined();
    expect(screen.getByText(`Commit ${valid.commit}`)).toBeDefined();
    rerender(<AboutDialog isOpen identity={null} onClose={vi.fn()} theme={theme} />);
    expect(screen.getByText('Version unavailable')).toBeDefined();
    expect(screen.getByText('Commit unavailable')).toBeDefined();
  });

  it('links the on-device Use page from Help and About and lists the licences About owes (R-066 AC-7)', () => {
    const { unmount } = render(<AboutDialog isOpen identity={null} onClose={vi.fn()} theme={theme} onDevice={false} />);
    const licences = () => screen.getByRole('table', { name: 'Third-party licenses' }).textContent;
    expect(licences()).toBe('Transformers.jsApache-2.0ONNX Runtime WebMIT');
    expect(screen.queryByRole('link', { name: 'Understanding the on-device editing model' })).toBeNull();
    unmount();
    render(<AboutDialog isOpen identity={null} onClose={vi.fn()} theme={theme} onDevice />);
    expect(licences()).toContain('On-device editing model (separate download)LFM Open License v1.0, not Apache-2.0');
    expect(screen.getByRole('link', { name: 'Understanding the on-device editing model' }).getAttribute('href'))
      .toBe('/coral/docs/use/explain/on-device-editing-model');
    cleanup();
    render(<HelpDialog isOpen onClose={vi.fn()} theme={theme} onDevice />);
    for (const [name, href] of [['Understanding the on-device editing model', '/coral/docs/use/explain/on-device-editing-model'],
      ['How to edit with the on-device model', '/coral/docs/use/how-to/edit-with-the-on-device-model']]) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href);
    }
  });
});
