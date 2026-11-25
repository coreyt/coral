export function isNativeEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

export function isAuthoringShortcutEligible(
  event: Pick<KeyboardEvent, 'target'>,
  modalOpen: boolean,
): boolean {
  return !modalOpen && !isNativeEditingTarget(event.target);
}
