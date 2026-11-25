/**
 * DOM adapters over the pure `render`. DOM globals are read only inside
 * functions, so evaluating this module touches nothing.
 */
import { CoralRenderError, type CoralDiagnostic } from './errors.js';
import { CORAL_SURFACE_CSS_029 } from '@coral-viz/render';
import { render, type CoralRenderOptions, type CoralRenderResult } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_LISTED_DIAGNOSTICS = 5;

export interface CoralScanResult {
  element: Element;
  status: 'rendered' | 'error';
  result?: CoralRenderResult;
  error?: CoralRenderError;
}

/** Where a render draws: state attributes go on `host`, output into `content`,
 * or into the surface `content` returns when the render writes. */
export interface RenderSurface {
  host: Element;
  content: Element | ShadowRoot | (() => ShadowRoot);
  onRendered?: (result: CoralRenderResult) => void;
  onError?: (error: CoralRenderError) => void;
}

const recordedSources = new WeakMap<Element, string>();
const ERROR_CSS = '.coral-error{font:14px/1.4 system-ui,sans-serif;color:#991b1b;background:#fff7f7;' +
  'border:1px solid #b91c1c;border-radius:4px;padding:8px 12px}.coral-error p{margin:0}.coral-error ul{margin:4px 0 0;padding-left:20px}';

/** The style of a Coral surface: host values stop at the drawing, and the
 * alert stays legible where page CSS cannot reach it. */
function surfaceStyle(content: Element | ShadowRoot, owner: Document): Element[] {
  // A document without a window (createHTMLDocument) has no ShadowRoot constructor to test against.
  if (!('host' in content) || !content.host.hasAttribute('data-coral-surface')) return [];
  const style = owner.createElement('style');
  style.textContent = CORAL_SURFACE_CSS_029 + ERROR_CSS;
  return [style];
}

/** Mark a shadow root as Coral's own, so `renderTo` on its host reuses it. The
 * host attribute also marks it for another copy of this package on the page. */
export function adoptCoralSurface029(root: ShadowRoot, host: Element): ShadowRoot {
  host.setAttribute('data-coral-surface', '');
  return root;
}

/**
 * The Coral shadow root of a target (c4-design.md "renderTo and scan"): one
 * Coral attached earlier, else a new one on the target, else one on a
 * `<span data-coral-surface>` child when the target cannot have a shadow root
 * of its own or the page already gave it one.
 */
function surfaceOf(target: Element): ShadowRoot {
  const own = target.shadowRoot;
  if (own && target.hasAttribute('data-coral-surface')) return own;
  if (!own) {
    try {
      const root = adoptCoralSurface029(target.attachShadow({ mode: 'open' }), target);
      target.replaceChildren();
      return root;
    } catch { /* this element type, or a closed root, cannot take one */ }
  }
  const span = [...target.children].find((child) => child.localName === 'span' && child.hasAttribute('data-coral-surface'));
  if (span?.shadowRoot) return span.shadowRoot;
  const created = target.ownerDocument.createElement('span');
  const root = adoptCoralSurface029(created.attachShadow({ mode: 'open' }), created);
  target.replaceChildren(created);
  return root;
}
const currentTokens = new WeakMap<Element, number>();
const scanned = new WeakSet<Element>();
let lastToken = 0;
let lastInsertion = 0;
// Separate copies of this package (ESM and IIFE, or two versions) share a page;
// a per-copy nonce keeps their inserted ids apart.
const idNonce = Math.random().toString(36).slice(2, 10).padEnd(6, '0');

function requireDom(): void {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined' || typeof Node === 'undefined') {
    throw new CoralRenderError('coral.browser.environment.unsupported', 'This Coral function needs a browser DOM.');
  }
}

function asCoralError(error: unknown): CoralRenderError {
  return error instanceof CoralRenderError
    ? error
    : new CoralRenderError('coral.browser.render.failed', 'The diagram could not be rendered.', [], { cause: error });
}

const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

/**
 * The node type of a real DOM node, or undefined. The `Node.prototype` getter
 * checks the platform brand, so it accepts nodes owned by another window (an
 * iframe) where `instanceof` would not, and refuses look-alike objects.
 */
function nodeType(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(Node.prototype, 'nodeType')!.get!.call(value) as number;
  } catch {
    return undefined;
  }
}

function resolveTarget(target: Element | string): Element {
  let element: unknown = target;
  if (typeof target === 'string') {
    try {
      element = document.querySelector(target);
    } catch (cause) {
      throw new CoralRenderError('coral.browser.target.missing', `"${target}" is not a valid selector.`, [], { cause });
    }
  }
  if (nodeType(element) !== ELEMENT_NODE) {
    throw new CoralRenderError('coral.browser.target.missing', typeof target === 'string'
      ? `No element matches "${target}".`
      : 'The render target is not an element.');
  }
  return element as Element;
}

/** Give every id a per-insertion prefix and rewrite the references to it. */
function isolateIds(svg: Element): void {
  const prefix = `coral-${idNonce}-${++lastInsertion}-`;
  const renamed = new Map<string, string>();
  for (const element of [svg, ...svg.querySelectorAll('[id]')]) {
    const id = element.getAttribute('id');
    if (id === null) continue;
    renamed.set(id, prefix + id);
    element.setAttribute('id', prefix + id);
  }
  if (renamed.size === 0) return;
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const { name, value } = attribute;
      let next = value;
      if (name === 'aria-labelledby' || name === 'aria-describedby') {
        next = value.split(/\s+/).map((token) => renamed.get(token) ?? token).join(' ');
      } else if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
        next = `#${renamed.get(value.slice(1)) ?? value.slice(1)}`;
      } else if (value.includes('url(#')) {
        next = value.replace(/url\(#([^)]+)\)/g, (match, id: string) => (renamed.has(id) ? `url(#${renamed.get(id)})` : match));
      }
      if (next !== value) element.setAttributeNS(attribute.namespaceURI, name, next);
    }
  }
}

function svgElement(result: CoralRenderResult, owner: Document): Element {
  const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (parsed.getElementsByTagName('parsererror').length > 0 || root.namespaceURI !== SVG_NS || root.localName !== 'svg') {
    throw new CoralRenderError('coral.browser.render.failed', 'The rendered SVG is not well-formed XML.');
  }
  const svg = owner.importNode(root, true);
  isolateIds(svg);
  const title = [...svg.children].find((child) => child.localName === 'title')?.textContent;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title || result.graph.name || 'Coral diagram');
  return svg;
}

const adoptedFaces = new WeakMap<Document, Set<string>>();
const FONT_FACE = /@font-face\{font-family:'([^']+)';font-style:(\w+);font-weight:(\d+(?:\s+\d+)?);[^}]*?src:url\((?:'([^']+)'|([^\s)]+))\)/g;

/**
 * Chromium ignores `@font-face` declared inside a shadow root, so a diagram
 * drawn there registers its embedded faces once per document instead.
 */
function adoptFontFaces(svg: Element, owner: Document): void {
  const OwnerFontFace = (owner.defaultView as (Window & typeof globalThis) | null)?.FontFace
    ?? (typeof FontFace === 'undefined' ? undefined : FontFace);
  if (!OwnerFontFace || !owner.fonts) return;
  let adopted = adoptedFaces.get(owner);
  if (!adopted) adoptedFaces.set(owner, adopted = new Set());
  for (const style of svg.querySelectorAll('style')) {
    for (const [, family, faceStyle, weight, quotedUrl, bareUrl] of (style.textContent ?? '').matchAll(FONT_FACE)) {
      const url = quotedUrl ?? bareUrl;
      const key = `${family}:${faceStyle}:${weight}`;
      if (adopted.has(key)) continue;
      adopted.add(key);
      const face = new OwnerFontFace(family, `url(${url})`, { style: faceStyle, weight, display: 'block' });
      owner.fonts.add(face);
      face.load().catch(() => { /* the text falls back to the next family */ });
    }
  }
}

function describeDiagnostic({ line, column, code, message }: CoralDiagnostic): string {
  return `${line !== undefined ? `${line}:${column ?? 1} ` : ''}${code} ${message}`;
}

function errorElement(error: CoralRenderError, owner: Document): Element {
  const alert = owner.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.setAttribute('class', 'coral-error');
  alert.setAttribute('data-coral-error-code', error.code);
  const summary = owner.createElement('p');
  summary.textContent = `Coral diagram could not be rendered: ${error.message}`;
  alert.append(summary);
  const errors = error.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length) {
    const list = owner.createElement('ul');
    for (const diagnostic of errors.slice(0, MAX_LISTED_DIAGNOSTICS)) {
      const item = owner.createElement('li');
      item.textContent = describeDiagnostic(diagnostic);
      list.append(item);
    }
    if (errors.length > MAX_LISTED_DIAGNOSTICS) {
      const item = owner.createElement('li');
      item.textContent = `and ${errors.length - MAX_LISTED_DIAGNOSTICS} more`;
      list.append(item);
    }
    alert.append(list);
  }
  return alert;
}

/**
 * Render into a surface. Only the newest render of a host writes anything;
 * an older one still settles with its own outcome.
 */
export async function renderSurface(surface: RenderSurface, source: string, options?: CoralRenderOptions): Promise<CoralRenderResult> {
  const { host } = surface;
  const resolve = (): Element | ShadowRoot => typeof surface.content === 'function' ? surface.content() : surface.content;
  const token = ++lastToken;
  currentTokens.set(host, token);
  const current = (): boolean => currentTokens.get(host) === token;
  host.setAttribute('aria-busy', 'true');
  host.setAttribute('data-coral-state', 'rendering');
  const owner = host.ownerDocument;
  try {
    const result = await render(source, options);
    if (current()) {
      const svg = svgElement(result, owner);
      const content = resolve();
      // Chromium ignores @font-face in any shadow tree, including a host page's.
      if (content.getRootNode() !== owner) adoptFontFaces(svg, owner);
      content.replaceChildren(svg, ...surfaceStyle(content, owner));
      host.setAttribute('data-coral-state', 'rendered');
      host.removeAttribute('aria-busy');
      surface.onRendered?.(result);
    }
    return result;
  } catch (caught) {
    const error = asCoralError(caught);
    if (current()) {
      const content = resolve();
      content.replaceChildren(errorElement(error, owner), ...surfaceStyle(content, owner));
      host.setAttribute('data-coral-state', 'error');
      host.removeAttribute('aria-busy');
      surface.onError?.(error);
    }
    throw error;
  }
}

/** Render Coral source into `target`, replacing its content. */
export async function renderTo(target: Element | string, source?: string, options?: CoralRenderOptions): Promise<CoralRenderResult> {
  requireDom();
  const element = resolveTarget(target);
  const text = source ?? recordedSources.get(element) ?? element.textContent ?? '';
  recordedSources.set(element, text);
  return renderSurface({ host: element, content: () => surfaceOf(element) }, text, options);
}

/**
 * Render every `[data-coral]` element under `root` (and `root` itself) that no
 * earlier scan claimed. A claimed element is never scanned again, even after a
 * failure; call `renderTo` to retry it.
 */
export async function scan(root: ParentNode = globalThis.document, options?: CoralRenderOptions): Promise<CoralScanResult[]> {
  requireDom();
  const type = nodeType(root);
  if (type !== ELEMENT_NODE && type !== DOCUMENT_NODE && type !== DOCUMENT_FRAGMENT_NODE) {
    throw new CoralRenderError('coral.browser.target.missing', 'The scan root is not an element, document, or document fragment.');
  }
  const candidates = [
    ...(type === ELEMENT_NODE && (root as Element).matches('[data-coral]') ? [root as Element] : []),
    ...root.querySelectorAll('[data-coral]'),
  ];
  const claimed = candidates.filter((element) => !scanned.has(element));
  for (const element of claimed) scanned.add(element);
  return Promise.all(claimed.map((element) => renderTo(element, undefined, options).then(
    (result): CoralScanResult => ({ element, status: 'rendered', result }),
    (error: CoralRenderError): CoralScanResult => ({ element, status: 'error', error }),
  )));
}
