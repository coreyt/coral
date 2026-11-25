// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoralRenderError, defineCustomElement, renderTo, scan, type CoralDiagramElement } from '../src/index.js';
import { drawnText029, surface029 as surface } from './support/surface029.js';

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const SVG_NS = 'http://www.w3.org/2000/svg';

function host(source: string, attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement('div');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.textContent = source;
  document.body.append(element);
  return element;
}

async function rejection(promise: Promise<unknown>): Promise<CoralRenderError> {
  try { await promise; } catch (error) { return error as CoralRenderError; }
  throw new Error('expected rejection');
}

afterEach(() => { document.body.replaceChildren(); });

describe('module evaluation', () => {
  it('defines no global and registers no element', async () => {
    const before = new Set(Object.getOwnPropertyNames(globalThis));
    vi.resetModules();
    await import('../src/index.js?fresh');
    expect(Object.getOwnPropertyNames(globalThis).filter((name) => !before.has(name))).toEqual([]);
    expect(customElements.get('coral-diagram')).toBeUndefined();
  });
});

describe('renderTo', () => {
  it('replaces the target content with an accessible SVG', async () => {
    const target = host(fixture('bpmn.coral'));
    const result = await renderTo(target);
    const svg = surface(target).firstElementChild!;
    expect(target.childNodes).toHaveLength(0);
    // The drawing and the surface style that stops inherited host values.
    expect([...surface(target).childNodes].map((node) => (node as Element).localName)).toEqual(['svg', 'style']);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Coral diagram');
    expect(target.getAttribute('data-coral-state')).toBe('rendered');
    expect(target.hasAttribute('aria-busy')).toBe(false);
    expect(result.graph.nodes).toHaveLength(5);
  });

  it('labels from explicit host titles without changing authored source', async () => {
    const titled = host(fixture('bpmn.coral'));
    await renderTo(titled, undefined, { title: 'Invoices' });
    expect(surface(titled).firstElementChild!.getAttribute('aria-label')).toBe('Invoices');
    const sequence = host(fixture('uml-sequence.coral'));
    await renderTo(sequence, undefined, { title: 'Sign-in sequence' });
    expect(surface(sequence).firstElementChild!.getAttribute('aria-label')).toBe('Sign-in sequence');
    expect(drawnText029(sequence)).toContain('Passwords are never logged');
  });

  it('resolves a selector and re-renders from the recorded source, not its own SVG', async () => {
    const target = host(fixture('uml-class.coral'), { id: 'diagram' });
    await renderTo('#diagram');
    await renderTo('#diagram', undefined, { theme: 'dark' });
    expect(target.getAttribute('data-coral-state')).toBe('rendered');
    await renderTo(target, '@diagram architecture\nreplacement service as "Replaced"\n');
    expect(drawnText029(target)).toContain('Replaced');
    await renderTo(target);
    expect(drawnText029(target)).toContain('Replaced');
  });

  it.each<[string, unknown]>([
    ['a missing selector', '#absent'],
    ['an invalid selector', '[['],
    ['a non-element', { nodeType: 1 }],
  ])('refuses %s without changing any element', async (_label, target) => {
    const source = '@diagram architecture\nother service as "Other"\n';
    const other = host(source);
    const error = await rejection(renderTo(target as Element));
    expect(error.code).toBe('coral.browser.target.missing');
    expect(other.textContent).toBe(source);
  });

  it('renders into an element owned by another window', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const target = frameDocument.createElement('div');
    target.textContent = fixture('bpmn.coral');
    frameDocument.body.append(target);
    expect(target instanceof Element).toBe(false);
    await renderTo(target);
    expect(surface(target).firstElementChild!.namespaceURI).toBe(SVG_NS);
    expect(surface(target).firstElementChild!.ownerDocument).toBe(frameDocument);
    expect(target.getAttribute('data-coral-state')).toBe('rendered');
  });

  it('shows an accessible inline error only in its own target', async () => {
    const sibling = host(fixture('bpmn.coral'));
    await renderTo(sibling);
    const siblingSvg = surface(sibling).innerHTML;
    const target = host('@diagram architecture\na service as "A"\n  bogus ((( line');
    const error = await rejection(renderTo(target));
    expect(error.code).toBe('coral.browser.input.invalid');
    const alert = surface(target).querySelector('[role="alert"]')!;
    expect(target.children).toHaveLength(0);
    expect(surface(target).querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(alert.getAttribute('data-coral-error-code')).toBe('coral.browser.input.invalid');
    expect(alert.textContent).toContain('3:3 coral.syntax.node.kind-required');
    expect(target.getAttribute('data-coral-state')).toBe('error');
    expect(target.hasAttribute('aria-busy')).toBe(false);
    expect(surface(sibling).innerHTML).toBe(siblingSvg);
  });

  it('inserts hostile labels as text only', async () => {
    const target = host('@diagram architecture\na service as "<img src=x onerror=alert(1)><script>alert(2)</script>"\n' +
      'b service as "&amp; &lt;b&gt;"\na -> b');
    await renderTo(target);
    expect(surface(target).querySelector('svg')).not.toBeNull();
    expect(surface(target).querySelector('img, script, foreignObject')).toBeNull();
    for (const element of surface(target).querySelectorAll('*')) {
      for (const attribute of element.attributes) expect(attribute.name.startsWith('on')).toBe(false);
    }
    const labels = [...surface(target).querySelectorAll('text')].map((text) => text.textContent).join(' ');
    expect(labels).toContain('<img src=x onerror=alert(1)><script>alert(2)</script>');
    expect(labels).toContain('&amp; &lt;b&gt;');
  });

  it('prefixes inserted ids with a per-copy nonce and a per-insertion counter', async () => {
    const target = host(fixture('relationship-ends.coral'));
    const source = fixture('relationship-ends.coral');
    expect(source).toMatch(/^@diagram uml-class\n/);
    const result = await renderTo(target);
    expect(result.graph.edges).toMatchObject([
      { source: 'whole', target: 'part', sourceEnd: { marker: { kind: 'diamond', fill: 'open' } } },
      { source: 'part', target: 'whole', targetEnd: { marker: { kind: 'arrow', fill: 'open' } } },
    ]);
    const ids = [...surface(target).querySelectorAll('[id]')].map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^coral-[a-z0-9]{6,}-\d+-/);
  });

  it('refuses an XML-illegal character in a saved source directive with its character code', async () => {
    const target = host('@diagram architecture\n@profileVersion "1.\u0001"\na service\n');
    const error = await rejection(renderTo(target));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics[0]?.message).toContain('U+0001');
    expect(surface(target).querySelector('[role="alert"]')!.getAttribute('data-coral-error-code')).toBe('coral.browser.input.invalid');
  });

  it('refuses XML-illegal characters inline', async () => {
    const target = host('@diagram architecture\na service as "A\u0001"\n');
    expect((await rejection(renderTo(target))).code).toBe('coral.browser.input.invalid');
    expect(surface(target).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps ids and their references unique across diagrams that share node ids', async () => {
    const first = host(fixture('relationship-ends.coral'));
    const second = host(fixture('relationship-ends.coral'));
    await Promise.all([renderTo(first), renderTo(second)]);
    // IDs stay unique across every surface, as if both drawings shared one tree.
    const ids = [first, second].flatMap((target) => [...surface(target).querySelectorAll('[id]')].map((element) => element.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of [first, second].map((target) => surface(target).firstElementChild!)) {
      const local = new Set([...svg.querySelectorAll('[id]')].map((element) => element.id));
      for (const element of svg.querySelectorAll('*')) {
        for (const { name, value } of element.attributes) {
          const references = [
            ...[...value.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]),
            ...(/(^|:)href$/.test(name) && value.startsWith('#') ? [value.slice(1)] : []),
            ...(name === 'aria-labelledby' || name === 'aria-describedby' ? value.split(/\s+/) : []),
          ];
          for (const reference of references) expect(local.has(reference), `${name}=${value}`).toBe(true);
        }
      }
    }
  });
});

describe('scan', () => {
  it('renders each [data-coral] element once, in document order, with per-element failures', async () => {
    const a = host(fixture('bpmn.coral'), { 'data-coral': '' });
    const b = host('flowchart TD\nA-->B', { 'data-coral': '' });
    const plain = host('@diagram architecture\nother service as "Not scanned"\n');
    const c = host(fixture('uml-class.coral'), { 'data-coral': '' });
    const results = await scan();
    expect(results.map(({ element, status }) => [element, status])).toEqual([
      [a, 'rendered'], [b, 'error'], [c, 'rendered'],
    ]);
    expect(results[1].error!.code).toBe('coral.browser.input.format');
    expect(plain.textContent).toContain('Not scanned');
    expect(await scan()).toEqual([]);
  });

  it('never renders one element twice under concurrent scans, and includes a matching root', async () => {
    const root = host(fixture('bpmn.coral'), { 'data-coral': '' });
    const [first, second] = await Promise.all([scan(root), scan(document)]);
    expect([...first, ...second].map((result) => result.element)).toEqual([root]);
  });

  it('scans a document owned by another window', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const target = frameDocument.createElement('pre');
    target.setAttribute('data-coral', '');
    target.textContent = fixture('uml-class.coral');
    frameDocument.body.append(target);
    const results = await scan(frameDocument);
    expect(results.map(({ element, status }) => [element, status])).toEqual([[target, 'rendered']]);
  });

  it.each<[string, () => unknown]>([
    ['null', () => null],
    ['a string', () => '#diagram'],
    ['a plain object', () => ({ nodeType: 9, querySelectorAll: () => [] })],
    ['a text node', () => document.createTextNode('x')],
  ])('rejects a root that is %s with a typed error', async (_label, root) => {
    const error = await rejection(scan(root() as ParentNode));
    expect(error).toBeInstanceOf(CoralRenderError);
    expect(error.code).toBe('coral.browser.target.missing');
  });
});

describe('defineCustomElement', () => {
  it.each([
    ['array', []],
    ['date', new Date(0)],
    ['instance', new (class Options { theme = 'dark'; })()],
  ])('rejects %s presentation options without rendering defaults', async (label, options) => {
    const tag = `invalid-${label}-options-diagram`;
    defineCustomElement(tag);
    const element = document.createElement(tag) as CoralDiagramElement;
    const source = '@diagram flowchart\nwork process as "Work"';
    element.source = source;
    element.renderOptions = options as CoralDiagramElement['renderOptions'];
    const rendered = vi.fn();
    element.addEventListener('coral-render', rendered);
    const failed = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-error',
      (event) => resolve(event as CustomEvent), { once: true }));
    document.body.append(element);
    await vi.waitFor(() => expect(element.getAttribute('data-coral-state')).toBe('error'));
    expect((await failed).detail.code).toBe('coral.browser.option.invalid');
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.getAttribute('data-coral-error-code'))
      .toBe('coral.browser.option.invalid');
    expect(element.shadowRoot?.querySelector('svg')).toBeNull();
    expect(rendered).not.toHaveBeenCalled();
    expect(element.source).toBe(source);
  });

  it('upgrades presentation options and preserves source through later option changes', async () => {
    const element = document.createElement('upgraded-options-diagram') as CoralDiagramElement;
    element.source = '@diagram flowchart\nwork process as "Work"';
    element.renderOptions = { style: 'hifi', theme: 'dark' };
    const first = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-render',
      (event) => resolve(event as CustomEvent), { once: true }));
    document.body.append(element);
    defineCustomElement('upgraded-options-diagram');
    const baseline = (await first).detail.sourceGraph;
    expect(element.shadowRoot?.querySelector('text')?.getAttribute('fill')).toBe('#f1f5f9');
    const second = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-render',
      (event) => resolve(event as CustomEvent), { once: true }));
    const options = { style: 'lowfi' as const, theme: 'light' as const };
    element.renderOptions = options;
    const exposed = element.renderOptions!;
    exposed.theme = 'dark';
    expect(element.renderOptions?.theme).toBe('light');
    expect((await second).detail.sourceGraph).toEqual(baseline);
    expect(element.source).toBe('@diagram flowchart\nwork process as "Work"');
    expect(element.shadowRoot?.querySelector('text')?.getAttribute('fill')).toBe('#363430');
  });

  it.each(['lowfi', 'hifi'] as const)('passes %s and both themes through the custom-element renderer', async (style) => {
    for (const theme of ['light', 'dark'] as const) {
      const tag = `styled-${style}-${theme}-diagram`;
      defineCustomElement(tag);
      const element = document.createElement(tag) as HTMLElement & {
        source: string; renderOptions: { style: typeof style; theme: typeof theme };
      };
      element.source = '@diagram flowchart\nwork process as "Work"';
      element.renderOptions = { style, theme };
      const done = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-render',
        (event) => resolve(event as CustomEvent), { once: true }));
      document.body.append(element);
      const rendered = await done;
      expect(element.shadowRoot?.querySelector('text')?.getAttribute('font-family'))
        .toBe(style === 'hifi' ? 'Coral Inter' : 'Coral Lowfi Caveat');
      expect(element.shadowRoot?.querySelector('text')?.getAttribute('fill'))
        .toBe(theme === 'dark' ? '#f1f5f9' : style === 'hifi' ? '#22272b' : '#363430');
      expect(rendered.detail.sourceGraph.nodes[0]).toMatchObject({ id: 'work', type: 'process', label: 'Work' });
      element.remove();
    }
  });

  it('registers idempotently and refuses conflicts', () => {
    const Element = defineCustomElement();
    expect(customElements.get('coral-diagram')).toBe(Element);
    expect(defineCustomElement('coral-diagram')).toBe(Element);
    const Other = defineCustomElement('other-diagram');
    expect(Other).not.toBe(Element);
    customElements.define('foreign-diagram', class extends HTMLElement {});
    expect(() => defineCustomElement('foreign-diagram')).toThrow(expect.objectContaining({ code: 'coral.browser.element.conflict' }));
    expect(() => defineCustomElement('nodash')).toThrow(expect.objectContaining({ code: 'coral.browser.element.conflict' }));
  });

  it('renders its light-DOM source into a shadow root and reports events', async () => {
    defineCustomElement();
    const element = document.createElement('coral-diagram') as CoralDiagramElement;
    element.textContent = fixture('bpmn.coral');
    element.renderOptions = { title: 'Approve invoice' };
    const rendered = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-render', (event) => resolve(event as CustomEvent), { once: true }));
    document.body.append(element);
    const event = await rendered;
    expect(event.bubbles).toBe(false);
    expect(event.detail.graph.nodes).toHaveLength(5);
    expect(element.shadowRoot!.querySelector('svg')!.getAttribute('aria-label')).toBe('Approve invoice');
    expect(element.textContent).toBe(fixture('bpmn.coral'));
    expect(element.getAttribute('data-coral-state')).toBe('rendered');

    const failed = new Promise<CustomEvent>((resolve) => element.addEventListener('coral-error', (event) => resolve(event as CustomEvent), { once: true }));
    element.source = 'digraph { a -> b }';
    expect((await failed).detail.code).toBe('coral.browser.input.format');
    expect(element.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.getAttribute('data-coral-state')).toBe('error');
  });

  it('applies a source property set before upgrade', async () => {
    const element = document.createElement('late-diagram') as HTMLElement & { source: string };
    element.source = '@diagram architecture\na service as "Before upgrade"\n';
    document.body.append(element);
    const rendered = new Promise((resolve) => element.addEventListener('coral-render', resolve, { once: true }));
    defineCustomElement('late-diagram');
    await rendered;
    expect(element.shadowRoot!.textContent).toContain('Before upgrade');
  });
});
