/** Bounded SVG import normalization. Portable admission remains the final gate. */
import { SaxesParser } from 'saxes';
import { optimize } from 'svgo/browser';
import { admitSvgArtwork029 } from './svgArtworkAdmission029.js';
import { parseSvgArtworkXml029, utf8Length029 } from './svgArtworkTokenizer029.js';
import { parsePathData029, parsePoints029 } from './svgArtworkValues029.js';
import { checkVocabulary029 } from './svgArtworkVocabulary029.js';
import type { AdmittedSvgArtwork029, SvgGeometry029 } from './svgArtworkModel029.js';

export const ICON_IMPORT_LIMITS_029 = Object.freeze({ bytes: 131_072, operations: 3_000, shapes: 100, depth: 8 });
export interface IconImportMeasures029 { inputBytes: number; canonicalBytes: number; operations: number; shapes: number; depth: number; references: number }
export interface PreparedIconImport029 { artwork: AdmittedSvgArtwork029; measures: IconImportMeasures029; notices: string[] }
interface Element { name: string; attrs: Record<string, string>; children: Element[] }
function fail(message: string): never { throw new Error(message); }
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const write = (node: Element): string => `<${node.name}${Object.entries(node.attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}>${node.children.map(write).join('')}</${node.name}>`;
const shapes = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const allowed = new Set(['svg', 'g', 'defs', 'use', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient', 'stop', ...shapes]);
function operations(geometry: SvgGeometry029): number {
  switch (geometry.kind) {
    case 'path': return geometry.commands.filter((item) => item.command.toUpperCase() !== 'M').length;
    case 'rect': return geometry.rx > 0 || geometry.ry > 0 ? 8 : 4;
    case 'circle': case 'ellipse': return 4;
    case 'line': return 1;
    case 'polyline': return Math.max(0, geometry.points.length / 2 - 1);
    case 'polygon': return Math.max(0, geometry.points.length / 2 - 1) + 1;
  }
}
export function prepareSvgIconImport029(text: string): PreparedIconImport029 {
  const inputBytes = utf8Length029(text);
  if (inputBytes > ICON_IMPORT_LIMITS_029.bytes) fail(`SVG input is ${inputBytes} bytes; the limit is 131,072.`);
  const removals = new Map<string, number>();
  const removed = (kind: string) => removals.set(kind, (removals.get(kind) ?? 0) + 1);
  const stack: Element[] = [], ids = new Map<string, Element>();
  let root: Element | undefined, elements = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('comment', () => { removed('comment'); });
  parser.on('xmldecl', () => { removed('XML declaration'); });
  parser.on('processinginstruction', () => fail('SVG processing instructions are unsupported.'));
  parser.on('doctype', () => fail('SVG document types and entities are unsupported.'));
  parser.on('error', (error) => { throw error; });
  parser.on('text', (value) => { if (value.trim() && !stack.some((node) => ['title', 'desc', 'metadata'].includes(node.name))) fail('Unexpected SVG text.'); });
  parser.on('opentag', (tag) => {
    if (++elements > 10_000 || stack.length > 32) fail('SVG input nesting or element limit exceeded.');
    if (!allowed.has(tag.name)) fail(`Unsupported SVG element: ${tag.name}.`);
    if (['title', 'desc', 'metadata'].includes(tag.name)) removed(tag.name);
    const attrs = { ...tag.attributes } as Record<string, string>;
    for (const [key, value] of Object.entries(attrs)) {
      if (/^on/i.test(key) || ['filter', 'mask', 'clip-path'].includes(key) || /(?:filter|mask|clip-path)\s*:/i.test(value)) fail(`Unsupported SVG property: ${key}.`);
      if ((key === 'href' || key === 'xlink:href') && !/^#[A-Za-z_][\w.:-]*$/.test(value)) fail('Only internal SVG fragment references are supported.');
      for (const match of value.matchAll(/url\([^)]*\)/gi)) if (!/^url\(#[A-Za-z_][\w.:-]*\)$/.test(match[0])) fail('Only internal SVG paint references are supported.');
    }
    const node = { name: tag.name, attrs, children: [] } as Element;
    if (attrs.id) { if (ids.has(attrs.id)) fail(`Duplicate SVG ID: ${attrs.id}.`); ids.set(attrs.id, node); }
    if (stack.length) stack.at(-1)!.children.push(node); else if (root) fail('SVG requires one root.'); else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => { stack.pop(); });
  parser.write(text).close();
  if (!root || root.name !== 'svg') fail('SVG requires an svg root.');
  let references = 0, depth = 0, shapeCount = 0, expandedOperations = 0, expandedElements = 0, expandedBytes = 0;
  const costs = new WeakMap<Element, number>();
  const cost = (node: Element): number => {
    const cached = costs.get(node); if (cached !== undefined) return cached;
    const a = node.attrs;
    const value = node.name === 'path' ? (parsePathData029(a.d ?? '') ?? fail('Invalid path geometry.')).filter((c) => c.command.toUpperCase() !== 'M').length
      : node.name === 'rect' ? (Number(a.rx ?? a.ry ?? 0) > 0 || Number(a.ry ?? a.rx ?? 0) > 0 ? 8 : 4)
      : node.name === 'line' ? 1 : ['circle', 'ellipse'].includes(node.name) ? 4
      : Math.max(0, (parsePoints029(a.points ?? '') ?? fail('Invalid points.')).length / 2 - 1) + (node.name === 'polygon' ? 1 : 0);
    costs.set(node, value); return value;
  };
  const expand = (node: Element, level: number, active: ReadonlySet<Element>): Element => {
    expandedElements++;
    expandedBytes += utf8Length029(write({ ...node, children: [] }));
    if (expandedElements > 10_000 || expandedBytes > 2_097_152) fail('Expanded SVG input limit exceeded (10,000 elements / 2 MiB).');
    if (level > 8) fail('SVG nesting exceeds eight container/reference levels.');
    depth = Math.max(depth, level);
    if (node.name === 'use') {
      references++;
      const href = node.attrs.href ?? node.attrs['xlink:href'];
      const target = href ? ids.get(href.slice(1)) : undefined;
      if (!target || active.has(target)) fail('SVG reference is missing or circular.');
      const attrs = { ...node.attrs }; delete attrs.href; delete attrs['xlink:href']; delete attrs.id;
      const x = Number(attrs.x ?? 0), y = Number(attrs.y ?? 0); delete attrs.x; delete attrs.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) fail('SVG reference offsets must be finite numbers.');
      attrs.transform = `${attrs.transform ?? ''} translate(${x} ${y})`.trim();
      return { name: 'g', attrs, children: [expand(target, level + 1, new Set([...active, target]))] };
    }
    if (shapes.has(node.name)) {
      if (++shapeCount > 100) fail('This icon contains more than 100 rendered shapes.');
      expandedOperations += cost(node);
      if (expandedOperations > 3000) fail(`This icon contains ${expandedOperations} geometry operations; the limit is 3,000.`);
    }
    const next = node.name === 'g' || (node.name === 'svg' && node !== root) ? level + 1 : level;
    if (next > 8) fail('SVG nesting exceeds eight container/reference levels.');
    depth = Math.max(depth, next);
    const attrs = { ...node.attrs }; if ((shapes.has(node.name) || node.name === 'g') && attrs.id) { removed('internal shape/group ID'); delete attrs.id; }
    return { ...node, attrs, children: node.children.filter((child) => !['title', 'desc', 'metadata'].includes(child.name))
      .filter((child) => child.name !== 'defs').map((child) => expand(child, next, active)) };
  };
  // Paint definitions are retained and validated; shape definitions are copied only where used.
  const definitions = [...ids.values()].filter((node) => ['linearGradient', 'radialGradient'].includes(node.name));
  const expanded = expand(root!, 0, new Set());
  if (definitions.length) expanded.children.unshift({ name: 'defs', attrs: {}, children: definitions });
  const normalized = optimize(write(expanded), { multipass: false, plugins: ['convertStyleToAttrs', 'convertColors', 'removeComments', 'removeMetadata'] }).data;
  const raw = parseSvgArtworkXml029(normalized, { elements: 10_000, nesting: 32 });
  const vocabulary = checkVocabulary029(raw.root, 100_000);
  if (vocabulary.failures.length) fail(vocabulary.failures.map((item) => item.detail).join('; '));
  const count = vocabulary.nodes.reduce((total, node) => total + (node.geometry ? operations(node.geometry) : 0), 0);
  if (count > 3_000) fail(`This icon contains ${count} geometry operations; the limit is 3,000.`);
  const admitted = admitSvgArtwork029(normalized);
  if (!admitted.ok) fail(admitted.failures.map((item) => item.detail).join('; '));
  if (admitted.artwork.measures.bytes > 131_072) fail('Canonical SVG exceeds 131,072 bytes.');
  return { artwork: admitted.artwork, measures: { inputBytes, canonicalBytes: admitted.artwork.measures.bytes,
    operations: count, shapes: shapeCount, depth, references },
  notices: [...[...removals].map(([kind, count]) => `Removed ${count} ${kind}.`),
    ...admitted.artwork.discarded.map((item) => `Removed ${item.name ?? item.kind}.`)] };
}

/** resvg's unclipped bounds estimate is a practical resource proxy, not an
 * exact full-stroke envelope (acute miters and butt caps may differ). */
export function checkSvgIconBounds029(artwork: AdmittedSvgArtwork029, create: (svg: string) => {
  getBBox(): { x: number; y: number; width: number; height: number } | undefined; free(): void;
}): { overhang: number; allowance: number } {
  const engine = create(artwork.canonicalText);
  try {
    const b = engine.getBBox();
    const v = artwork.viewBox;
    const overhang = b ? Math.max(0, v.minX - b.x, v.minY - b.y,
      b.x + b.width - v.minX - v.width, b.y + b.height - v.minY - v.height) : 0;
    const allowance = Math.max(v.width, v.height) * 0.01;
    (b as { free?: () => void } | undefined)?.free?.();
    if (!Number.isFinite(overhang) || overhang > allowance + Math.max(v.width, v.height) * 1e-6)
      fail(`Artwork bounds exceed the 1% frame allowance (${overhang.toFixed(3)} source units).`);
    return { overhang, allowance };
  } finally { engine.free(); }
}
