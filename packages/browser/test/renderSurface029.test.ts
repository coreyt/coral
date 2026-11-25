// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineCustomElement, renderTo, scan } from '../src/index.js';
import { surface029 } from './support/surface029.js';

// C4 style boundary for renderTo and scan (c4-design.md "renderTo and scan"):
// every render draws inside a Coral-owned shadow root.

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const BPMN_LABEL = 'Approve invoice';
const add = (tag: string, source: string, owner: Document = document): HTMLElement => {
  const element = owner.createElement(tag);
  element.textContent = source;
  owner.body.append(element);
  return element;
};
afterEach(() => { document.body.replaceChildren(); });

describe('renderTo surfaces', () => {
  it('renders into a host whose document has no window', async () => {
    const owner = document.implementation.createHTMLDocument('detached');
    expect(owner.defaultView).toBeNull();
    const target = add('div', fixture('bpmn.coral'), owner);
    await renderTo(target);
    expect(target.getAttribute('data-coral-state')).toBe('rendered');
    expect(target.shadowRoot!.querySelector('svg')).not.toBeNull();
    expect(target.shadowRoot!.querySelector('style')).not.toBeNull();
  });

  it('reports a render error in a window-less document as a Coral error', async () => {
    const owner = document.implementation.createHTMLDocument('detached');
    const target = add('div', '@diagram nonsense', owner);
    await expect(renderTo(target)).rejects.toMatchObject({ name: 'CoralRenderError' });
    expect(target.getAttribute('data-coral-state')).toBe('error');
    expect(target.shadowRoot!.querySelector('.coral-error')).not.toBeNull();
  });

  it('attaches an open shadow root to a host that can have one, and reuses it', async () => {
    const target = add('div', fixture('bpmn.coral'));
    await renderTo(target);
    const root = target.shadowRoot!;
    expect(root.mode).toBe('open');
    expect(root.querySelector('svg')).not.toBeNull();
    expect(target.childNodes).toHaveLength(0);
    await renderTo(target, undefined, { theme: 'dark' });
    expect(target.shadowRoot).toBe(root);
    expect(root.querySelectorAll('svg')).toHaveLength(1);
  });

  it('uses a surface span inside a host that cannot have a shadow root', async () => {
    const target = add('pre', fixture('bpmn.coral'));
    await renderTo(target);
    expect(target.shadowRoot).toBeNull();
    expect([...target.childNodes].map((node) => (node as Element).localName)).toEqual(['span']);
    const span = target.firstElementChild!;
    expect(span.hasAttribute('data-coral-surface')).toBe(true);
    expect(span.shadowRoot!.querySelector('svg')).not.toBeNull();
    await renderTo(target);
    expect(target.firstElementChild).toBe(span);
  });

  it('keeps a page-owned shadow root untouched and draws into light DOM the page can slot', async () => {
    const target = add('div', fixture('bpmn.coral'));
    const pageRoot = target.attachShadow({ mode: 'open' });
    pageRoot.innerHTML = '<p>page</p><slot></slot>';
    await renderTo(target);
    expect(pageRoot.innerHTML).toBe('<p>page</p><slot></slot>');
    expect(surface029(target).querySelector('svg')).not.toBeNull();
  });

  it('reuses the shadow root of a <coral-diagram> element', async () => {
    defineCustomElement('surface-test-diagram');
    const element = add('surface-test-diagram', '@diagram architecture\na service\n');
    await new Promise<void>((done) => element.addEventListener('coral-render', () => done(), { once: true }));
    const root = element.shadowRoot!;
    await renderTo(element, fixture('bpmn.coral'));
    expect(element.shadowRoot).toBe(root);
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.querySelector('svg')!.textContent).toContain(BPMN_LABEL);
    expect(element.querySelector('svg, span[data-coral-surface]')).toBeNull();
  });

  it('creates the surface span in the target\'s own document', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const target = add('pre', fixture('bpmn.coral'), frame.contentDocument!);
    await renderTo(target);
    expect(target.firstElementChild!.ownerDocument).toBe(frame.contentDocument);
    expect(surface029(target).querySelector('svg')!.ownerDocument).toBe(frame.contentDocument);
  });

  it('keeps the error alert and its own style inside the surface', async () => {
    const target = add('div', '@diagram architecture\na service as "A"\n  bogus ((( line');
    await renderTo(target).catch(() => undefined);
    const root = surface029(target);
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(root.querySelector('style')!.textContent).toContain('.coral-error');
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });

  it('gives scan targets the same surfaces', async () => {
    const pre = add('pre', fixture('uml-class.coral'));
    pre.setAttribute('data-coral', '');
    const div = add('div', fixture('bpmn.coral'));
    div.setAttribute('data-coral', '');
    await scan();
    expect(surface029(pre).querySelector('svg')).not.toBeNull();
    expect(div.shadowRoot!.querySelector('svg')).not.toBeNull();
  });
});

describe('surfaces across package copies', () => {
  it('recognizes a root another copy attached by its host marker', async () => {
    const target = add('div', fixture('bpmn.coral'));
    const root = target.attachShadow({ mode: 'open' });
    target.setAttribute('data-coral-surface', '');
    await renderTo(target);
    expect(target.shadowRoot).toBe(root);
    expect(root.querySelector('svg')).not.toBeNull();
    expect(target.querySelector('span')).toBeNull();
  });
});
