/** The Coral surface root of a render target: its own shadow root, or the
 * shadow root of its `<span data-coral-surface>` child. Fails when there is
 * none, so a query can never pass by finding nothing (c4-design.md R1-3). */
export function surface029(target: Element): ShadowRoot {
  const span = [...target.children].find((child) => child.localName === 'span' && child.hasAttribute('data-coral-surface'));
  const root = span?.shadowRoot ?? (target.hasAttribute('data-coral-surface') ? target.shadowRoot : null);
  if (!root) throw new Error(`no Coral surface on <${target.localName}>`);
  return root;
}

/** The text a render drew in the surface, without the surface style. */
export function drawnText029(target: Element): string {
  return [...surface029(target).children].filter((child) => child.localName !== 'style')
    .map((child) => child.textContent ?? '').join('');
}
