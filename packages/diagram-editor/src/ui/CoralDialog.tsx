import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';

export interface CoralDialogProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  initialFocus?: 'close' | 'first';
  restoreFocusTo?: HTMLElement | null;
  shouldRestoreFocus?: () => boolean;
  overlayTestId?: string;
  themeName?: 'light' | 'dark';
  children: ReactNode;
}

/** Private controlled modal wrapper. State and callbacks stay Coral-owned. */
export function CoralDialog({
  open,
  title,
  closeLabel,
  onClose,
  initialFocus = 'close',
  restoreFocusTo,
  shouldRestoreFocus,
  overlayTestId,
  themeName = 'light',
  children,
}: CoralDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const shouldRestoreFocusRef = useRef(shouldRestoreFocus);
  shouldRestoreFocusRef.current = shouldRestoreFocus;

  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    invokerRef.current = restoreFocusTo ?? document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open && wasOpen && (shouldRestoreFocusRef.current?.() ?? true)) {
      queueMicrotask(() => {
        if (document.activeElement?.closest('[role="dialog"][aria-modal="true"]')) return;
        if (invokerRef.current?.isConnected) invokerRef.current.focus();
      });
    }
    return () => {
      if (wasOpenRef.current && (shouldRestoreFocusRef.current?.() ?? true) && invokerRef.current?.isConnected) {
        const invoker = invokerRef.current;
        queueMicrotask(() => {
          if (!document.activeElement?.closest('[role="dialog"][aria-modal="true"]') && invoker.isConnected) invoker.focus();
        });
      }
    };
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <div className="coral-dialog__portal-theme" data-coral-theme={themeName}>
          <Dialog.Overlay
            className="coral-dialog__overlay"
            data-testid={overlayTestId}
            onClick={onClose}
          />
          <Dialog.Content
            ref={contentRef}
            className="coral-dialog__content"
            aria-modal="true"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const primary = contentRef.current?.querySelector<HTMLElement>('[data-initial-focus], [data-primary]')
                ?? contentRef.current?.querySelector<HTMLElement>(
                  'input:not([disabled]), select:not([disabled]), button:not([disabled])',
                );
              (initialFocus === 'first' ? primary : closeRef.current)?.focus();
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div className="coral-dialog__header">
              <Dialog.Title className="coral-dialog__title">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <button ref={closeRef} className="coral-button coral-button--quiet" type="button" aria-label={closeLabel}>×</button>
              </Dialog.Close>
            </div>
            <div className="coral-dialog__body">{children}</div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
