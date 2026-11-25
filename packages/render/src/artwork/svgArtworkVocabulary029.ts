/** Phase P3 of coral.svg-artwork 1: element and attribute allowlists, the
 * `style` attribute, value grammars and the raw segment count (profile §5,
 * §6, §7, §10 items 1–3, §11.1). It builds the typed tree that later phases
 * resolve; nothing in it holds unparsed input. */
import {
  SVG_NAMESPACE_029, XLINK_NAMESPACE_029, type SvgArtworkCode029, type SvgArtworkDiscard029,
  type SvgArtworkFailure029, type SvgGeometry029, type SvgLength029, type SvgPrimitiveKind029, type SvgTransform029,
  type SvgViewBox029,
} from './svgArtworkModel029.js';
import type { RawAttribute029, RawElement029 } from './svgArtworkTokenizer029.js';
import {
  describeValue029, isPreserveAspectRatio029, isRootDimension029, isSvgArtworkId029, parseColor029, parseDashArray029,
  parseHref029, parseKeyword029, parseLength029, parseLengthOrPercent029, parseNumber029, parsePaint029,
  parsePathData029, parsePoints029, parseTransformList029, parseUnitNumber029, parseViewBox029, type ParsedPaint029,
} from './svgArtworkValues029.js';

export const PRIMITIVES_029: ReadonlySet<string> = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const GRADIENTS = new Set(['linearGradient', 'radialGradient']);

/** A parsed presentation property value. */
export type PropertyValue029 = ParsedPaint029 | number | string | readonly number[] | 'none';
export interface Specified029 { value: PropertyValue029; start: number; end: number }

/** An admitted element after P3. */
export interface ArtworkNode029 {
  raw: RawElement029;
  name: string;
  parent?: ArtworkNode029;
  children: ArtworkNode029[];
  /** Inside a `clipPath`. */
  inClip: boolean;
  /** In the rendering tree: the root, `g` and primitives outside `defs` and `clipPath`. */
  rendering: boolean;
  /** Specified properties, `style` declarations overriding presentation attributes. */
  specified: Map<string, Specified029>;
  /** Every reference as written, for P4: property or attribute name, target ID and location. */
  references: { name: 'fill' | 'stroke' | 'clip-path' | 'href'; id: string; start: number; end: number }[];
  id?: { value: string; start: number; end: number };
  href?: { id: string; start: number; end: number };
  transform: SvgTransform029[];
  geometry?: SvgGeometry029;
  segments: number;
  /** Gradient and clip-path attributes, by name. */
  lengths: Map<string, SvgLength029>;
  keywords: Map<string, string>;
  /** Present on gradients: the attributes the gradient itself specifies. */
  specifiesTransform: boolean;
  offset?: SvgLength029;
}

export interface VocabularyResult029 {
  root?: ArtworkNode029;
  nodes: ArtworkNode029[];
  viewBox?: SvgViewBox029;
  failures: SvgArtworkFailure029[];
  discarded: SvgArtworkDiscard029[];
  rawSegments: number;
}

const INHERITED = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'clip-rule', 'color'] as const;
export const INHERITED_PROPERTIES_029: ReadonlySet<string> = new Set(INHERITED);

/** Profile §6.1 element attributes besides the common set. */
const ELEMENT_ATTRIBUTES: Record<string, readonly string[]> = {
  svg: ['viewBox', 'width', 'height', 'preserveAspectRatio', 'version'],
  g: ['transform'],
  defs: [],
  path: ['d', 'transform'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'transform'],
  circle: ['cx', 'cy', 'r', 'transform'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'transform'],
  line: ['x1', 'y1', 'x2', 'y2', 'transform'],
  polyline: ['points', 'transform'],
  polygon: ['points', 'transform'],
  linearGradient: ['x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href'],
  radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href'],
  stop: ['offset'],
  clipPath: ['clipPathUnits', 'transform'],
  title: [],
  desc: [],
};
const REQUIRED: Record<string, readonly string[]> = {
  path: ['d'], rect: ['width', 'height'], circle: ['r'], ellipse: ['rx', 'ry'], polyline: ['points'], polygon: ['points'],
};
/** Geometry attributes and properties report coral.artwork.svg.geometry.invalid (profile §7.1). */
const GEOMETRY = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'x1', 'y1', 'x2',
  'y2', 'd', 'points', 'transform', 'gradientTransform', 'stroke-width']);
const NON_NEGATIVE = new Set(['width', 'height', 'r', 'rx', 'ry', 'fr']);

function admittedIn(name: string, parent: ArtworkNode029 | undefined): boolean {
  if (name === 'svg') return parent === undefined;
  if (!parent) return false;
  const host = parent.name;
  switch (name) {
    case 'g': case 'defs': return host === 'svg' || host === 'g';
    case 'linearGradient': case 'radialGradient': case 'clipPath': return host === 'svg' || host === 'g' || host === 'defs';
    case 'stop': return GRADIENTS.has(host);
    case 'title': case 'desc': return host === 'svg' || host === 'g' || (PRIMITIVES_029.has(host) && parent.rendering);
    default: return PRIMITIVES_029.has(name) && (host === 'svg' || host === 'g' || host === 'clipPath');
  }
}

/** Properties admitted on an element, as attributes or `style` declarations. */
function admitsProperty(node: ArtworkNode029, property: string): boolean {
  if (node.name === 'title' || node.name === 'desc') return false;
  if (INHERITED_PROPERTIES_029.has(property)) return true;
  if (property === 'opacity' || property === 'clip-path') {
    return node.name === 'g' || (PRIMITIVES_029.has(node.name) && node.rendering);
  }
  if (property === 'stop-color' || property === 'stop-opacity') return node.name === 'stop';
  return false;
}

type Parsed<T> = { value: T } | { code: SvgArtworkCode029; reason: string };
const ok = <T>(value: T): Parsed<T> => ({ value });

function codeFor(name: string): SvgArtworkCode029 {
  return GEOMETRY.has(name) ? 'coral.artwork.svg.geometry.invalid' : 'coral.artwork.svg.attribute.unsupported';
}

/** Parse one presentation property value (profile §6.2). */
function parseProperty(name: string, raw: string): Parsed<PropertyValue029> {
  const grammar = (): Parsed<PropertyValue029> => ({ code: codeFor(name), reason: `${name} value ${describeValue029(raw)} fails its grammar` });
  const value = ((): PropertyValue029 | 'reference' | undefined => {
    switch (name) {
      case 'fill': case 'stroke': case 'clip-path': {
        const paint = parsePaint029(raw, name !== 'clip-path');
        return paint === 'grammar' ? undefined : paint;
      }
      case 'fill-opacity': case 'stroke-opacity': case 'opacity': case 'stop-opacity': return parseUnitNumber029(raw);
      case 'fill-rule': case 'clip-rule': return parseKeyword029(raw, ['nonzero', 'evenodd']);
      case 'stroke-width': {
        const width = parseLength029(raw);
        return width !== undefined && width >= 0 ? width : undefined;
      }
      case 'stroke-linecap': return parseKeyword029(raw, ['butt', 'round', 'square']);
      case 'stroke-linejoin': return parseKeyword029(raw, ['miter', 'round', 'bevel']);
      case 'stroke-miterlimit': {
        const limit = parseNumber029(raw);
        return limit !== undefined && limit >= 1 ? limit : undefined;
      }
      case 'stroke-dasharray': return parseDashArray029(raw);
      case 'stroke-dashoffset': return parseLength029(raw);
      case 'color': return parseColor029(raw);
      case 'stop-color': {
        const paint = parsePaint029(raw, true);
        return typeof paint === 'object' && (paint.kind === 'color' || paint.kind === 'current') ? paint : undefined;
      }
      default: return undefined;
    }
  })();
  if (value === 'reference') {
    return { code: 'coral.artwork.svg.reference.unsupported', reason: `${name} value ${describeValue029(raw)} is not a local reference` };
  }
  return value === undefined ? grammar() : ok(value);
}

/** Run P3 over the parsed document tree. */
export function checkVocabulary029(root: RawElement029, limit: number): VocabularyResult029 {
  const failures: SvgArtworkFailure029[] = [];
  const discarded: SvgArtworkDiscard029[] = [];
  const nodes: ArtworkNode029[] = [];
  let viewBox: SvgViewBox029 | undefined;
  let rawSegments = 0;
  let stopped = false;
  const fail = (code: SvgArtworkCode029, detail: string, start: number, end: number) =>
    failures.push({ code, phase: 'P3', detail, start, end });

  const visit = (raw: RawElement029, parent: ArtworkNode029 | undefined): ArtworkNode029 | undefined => {
    const name = raw.namespace === SVG_NAMESPACE_029 && Object.hasOwn(ELEMENT_ATTRIBUTES, raw.local) ? raw.local : undefined;
    const shown = describeValue029(raw.qname);
    if (!name || !admittedIn(name, parent)) {
      fail('coral.artwork.svg.element.unsupported', `element ${shown} is not admitted${parent ? ` in <${parent.name}>` : ''}`,
        raw.start, raw.end);
      return undefined;
    }
    const inClip = parent ? parent.inClip || parent.name === 'clipPath' : false;
    const node: ArtworkNode029 = {
      raw, name, ...(parent ? { parent } : {}), children: [], inClip,
      rendering: name === 'svg' || ((name === 'g' || PRIMITIVES_029.has(name)) && !inClip),
      specified: new Map(), references: [], transform: [], segments: 0, lengths: new Map(), keywords: new Map(),
      specifiesTransform: false,
    };
    const attributes = new Map<string, unknown>();
    const declared = new Set<string>();
    const attributeFail = (attribute: RawAttribute029, code: SvgArtworkCode029, reason: string) =>
      fail(code, `<${name}> ${reason}`, attribute.start, attribute.end);
    const unsupported = (attribute: RawAttribute029) =>
      attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `attribute ${describeValue029(attribute.qname)} is not admitted`);

    for (const attribute of raw.attributes) {
      if (attribute.namespace === 'http://www.w3.org/2000/xmlns/') {
        const admitted = name === 'svg' && ((attribute.qname === 'xmlns' && attribute.value === SVG_NAMESPACE_029) ||
          (attribute.qname === 'xmlns:xlink' && attribute.value === XLINK_NAMESPACE_029));
        if (!admitted) unsupported(attribute);
        else if (attribute.qname === 'xmlns:xlink') discarded.push({ kind: 'root-attribute', name: 'xmlns:xlink', start: attribute.start, end: attribute.end });
        continue;
      }
      if (attribute.namespace !== undefined) {
        if (attribute.namespace === XLINK_NAMESPACE_029 && attribute.local === 'href' && GRADIENTS.has(name)) {
          handleHref(attribute);
        } else unsupported(attribute);
        continue;
      }
      const local = attribute.local;
      if (name !== 'title' && name !== 'desc' && local === 'id') {
        if (!isSvgArtworkId029(attribute.value)) {
          attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `id ${describeValue029(attribute.value)} is malformed`);
        } else {
          node.id = { value: attribute.value, start: attribute.start, end: attribute.end };
          discarded.push({ kind: 'id', start: attribute.start, end: attribute.end });
        }
        continue;
      }
      if (name !== 'title' && name !== 'desc' && local === 'style') {
        handleStyle(attribute);
        continue;
      }
      if (admitsProperty(node, local)) {
        const parsed = parseProperty(local, attribute.value);
        if ('code' in parsed) attributeFail(attribute, parsed.code, parsed.reason);
        else {
          noteReference(local, parsed.value, attribute.start, attribute.end);
          if (!node.specified.has(local)) node.specified.set(local, { value: parsed.value, start: attribute.start, end: attribute.end });
        }
        continue;
      }
      if (!ELEMENT_ATTRIBUTES[name]!.includes(local) || (name === 'svg' && local === 'transform')) {
        unsupported(attribute);
        continue;
      }
      if (local === 'href') {
        handleHref(attribute);
        continue;
      }
      const parsed = parseAttribute(attribute);
      if ('code' in parsed) attributeFail(attribute, parsed.code, parsed.reason);
      else attributes.set(local, parsed.value);
    }

    function handleHref(attribute: RawAttribute029) {
      if (node.href) {
        attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', 'carries both href and xlink:href');
        return;
      }
      const id = parseHref029(attribute.value);
      if (id === undefined) {
        attributeFail(attribute, 'coral.artwork.svg.reference.unsupported', `href ${describeValue029(attribute.value)} is not a local reference`);
        // Record the attempt so a later href on the same element still reports both forms.
        node.href = { id: '', start: attribute.start, end: attribute.end };
        return;
      }
      node.href = { id, start: attribute.start, end: attribute.end };
      node.references.push({ name: 'href', id, start: attribute.start, end: attribute.end });
    }

    function noteReference(property: string, value: PropertyValue029, start: number, end: number) {
      if ((property === 'fill' || property === 'stroke' || property === 'clip-path') && typeof value === 'object' &&
        'kind' in value && value.kind === 'url') {
        node.references.push({ name: property, id: value.id, start, end });
      }
    }

    function handleStyle(attribute: RawAttribute029) {
      const text = attribute.value;
      if (/[{}@\\"'!<]/.test(text) || text.includes('/*')) {
        attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `style ${describeValue029(text)} contains a forbidden construct`);
        return;
      }
      for (const declaration of text.split(';')) {
        if (/^[ \t\n\r]*$/.test(declaration)) continue;
        const colon = declaration.indexOf(':');
        const property = (colon < 0 ? declaration : declaration.slice(0, colon)).replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
        if (colon < 0 || !admitsProperty(node, property)) {
          attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `style declaration ${describeValue029(property)} is not admitted`);
          continue;
        }
        if (declared.has(property)) {
          attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `style declares ${property} twice`);
          continue;
        }
        declared.add(property);
        const parsed = parseProperty(property, declaration.slice(colon + 1));
        if ('code' in parsed) attributeFail(attribute, parsed.code, `style ${parsed.reason}`);
        else {
          noteReference(property, parsed.value, attribute.start, attribute.end);
          node.specified.set(property, { value: parsed.value, start: attribute.start, end: attribute.end });
        }
      }
    }

    function parseAttribute(attribute: RawAttribute029): Parsed<unknown> {
      const local = attribute.local;
      const value = attribute.value;
      const bad = (reason = `${local} value ${describeValue029(value)} fails its grammar`): Parsed<unknown> =>
        ({ code: local === 'viewBox' ? 'coral.artwork.svg.viewbox.invalid' : codeFor(local), reason });
      switch (local) {
        case 'viewBox': {
          const parsed = parseViewBox029(value);
          return parsed ? ok(parsed) : bad();
        }
        case 'version': discarded.push({ kind: 'root-attribute', name: local, start: attribute.start, end: attribute.end }); return ok(value);
        case 'preserveAspectRatio':
          if (!isPreserveAspectRatio029(value)) return { code: 'coral.artwork.svg.attribute.unsupported', reason: `preserveAspectRatio ${describeValue029(value)} fails its grammar` };
          discarded.push({ kind: 'root-attribute', name: local, start: attribute.start, end: attribute.end });
          return ok(value);
        case 'd': {
          const parsed = parsePathData029(value);
          return parsed ? ok(parsed) : bad(/^[ \t\n\r]*$/.test(value) ? 'd is empty' : undefined);
        }
        case 'points': {
          const parsed = parsePoints029(value);
          return parsed ? ok(parsed) : bad();
        }
        case 'transform': case 'gradientTransform': {
          const parsed = parseTransformList029(value);
          return parsed ? ok(parsed) : bad();
        }
        case 'gradientUnits': case 'clipPathUnits': {
          const parsed = parseKeyword029(value, ['userSpaceOnUse', 'objectBoundingBox'], true);
          return parsed ? ok(parsed) : bad();
        }
        case 'spreadMethod': {
          const parsed = parseKeyword029(value, ['pad', 'reflect', 'repeat'], true);
          return parsed ? ok(parsed) : bad();
        }
        case 'offset': {
          const parsed = parseLengthOrPercent029(value.replace(/px$/i, '\u0000'));
          if (!parsed) return bad();
          const fraction = parsed.percent ? parsed.value / 100 : parsed.value;
          if (fraction < 0 || fraction > 1) return bad(`offset ${describeValue029(value)} is out of range`);
          return ok(parsed);
        }
        default: {
          if (name === 'svg') {
            // Root width and height are validated and discarded (profile §7.7).
            if (!isRootDimension029(value)) return bad();
            discarded.push({ kind: 'root-attribute', name: local, start: attribute.start, end: attribute.end });
            return ok(value);
          }
          if (GRADIENTS.has(name!)) {
            const parsed = parseLengthOrPercent029(value);
            if (!parsed) return bad();
            if (NON_NEGATIVE.has(local) && parsed.value < 0) return bad(`${local} is negative`);
            return ok(parsed);
          }
          const parsed = parseLength029(value);
          if (parsed === undefined) return bad();
          if (NON_NEGATIVE.has(local) && parsed < 0) return bad(`${local} is negative`);
          return ok(parsed);
        }
      }
    }

    // Required geometry and the view box (profile §7.6, §10 item 1).
    for (const required of REQUIRED[name] ?? []) {
      if (!raw.attributes.some((attribute) => attribute.namespace === undefined && attribute.local === required)) {
        fail('coral.artwork.svg.geometry.invalid', `<${name}> requires ${required}`, raw.start, raw.end);
      }
    }
    if (name === 'svg') {
      viewBox = attributes.get('viewBox') as SvgViewBox029 | undefined;
      if (!raw.attributes.some((attribute) => attribute.qname === 'viewBox')) {
        fail('coral.artwork.svg.viewbox.invalid', '<svg> requires viewBox', raw.start, raw.end);
      }
    }
    if (raw.text && name !== 'title' && name !== 'desc') {
      fail('coral.artwork.svg.element.unsupported', `character data in <${name}>`, raw.text.start, raw.text.end);
    }

    node.transform = (attributes.get('transform') ?? attributes.get('gradientTransform') ?? []) as SvgTransform029[];
    node.specifiesTransform = attributes.has('transform') || attributes.has('gradientTransform');
    for (const [key, value] of attributes) {
      if (typeof value === 'string' && key !== 'version' && name !== 'svg') node.keywords.set(key, value);
      else if (GRADIENTS.has(name) && typeof value === 'object' && value !== null && 'percent' in value) {
        node.lengths.set(key, value as SvgLength029);
      }
    }
    if (name === 'stop') {
      const offset = attributes.get('offset') as SvgLength029 | undefined;
      if (offset) {
        node.offset = offset;
        const fraction = (length: SvgLength029) => length.percent ? length.value / 100 : length.value;
        const previous = [...parent!.children].reverse().find((sibling) => sibling.name === 'stop' && sibling.offset);
        if (previous && fraction(offset) < fraction(previous.offset!)) {
          const attribute = raw.attributes.find((item) => item.local === 'offset')!;
          attributeFail(attribute, 'coral.artwork.svg.attribute.unsupported', `offset ${describeValue029(attribute.value)} is less than the previous stop's`);
        }
      }
    }

    if (PRIMITIVES_029.has(name)) {
      const geometry = buildGeometry(name as SvgPrimitiveKind029, attributes);
      if (geometry) {
        node.geometry = geometry;
        node.segments = segmentsOf(geometry);
        rawSegments += node.segments;
        if (rawSegments > limit) {
          failures.push({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P3', detail: `input.segments ${rawSegments} > ${limit}`,
            start: raw.start, end: raw.end, budgets: [{ name: 'input.segments', measure: rawSegments, limit }] });
          stopped = true;
          return node;
        }
      }
    }

    nodes.push(node);
    if (parent) parent.children.push(node);
    if (name === 'title' || name === 'desc') {
      discarded.push({ kind: name, start: raw.start, end: raw.end });
      return node;
    }
    for (const child of raw.children) {
      if (stopped) break;
      visit(child, node);
    }
    return node;
  };

  const rootNode = visit(root, undefined);
  return { ...(rootNode ? { root: rootNode } : {}), nodes, ...(viewBox ? { viewBox } : {}), failures, discarded, rawSegments };
}

function buildGeometry(kind: SvgPrimitiveKind029, attributes: Map<string, unknown>): SvgGeometry029 | undefined {
  const number = (key: string) => attributes.get(key) as number | undefined;
  const has = (...keys: string[]) => keys.every((key) => attributes.has(key));
  switch (kind) {
    case 'path': return has('d') ? { kind, commands: attributes.get('d') as never } : undefined;
    case 'rect': {
      if (!has('width', 'height')) return undefined;
      const rx = number('rx') ?? number('ry') ?? 0;
      const ry = number('ry') ?? number('rx') ?? 0;
      return { kind, x: number('x') ?? 0, y: number('y') ?? 0, width: number('width')!, height: number('height')!, rx, ry };
    }
    case 'circle': return has('r') ? { kind, cx: number('cx') ?? 0, cy: number('cy') ?? 0, r: number('r')! } : undefined;
    case 'ellipse': return has('rx', 'ry')
      ? { kind, cx: number('cx') ?? 0, cy: number('cy') ?? 0, rx: number('rx')!, ry: number('ry')! } : undefined;
    case 'line': return { kind, x1: number('x1') ?? 0, y1: number('y1') ?? 0, x2: number('x2') ?? 0, y2: number('y2') ?? 0 };
    default: return has('points') ? { kind, points: attributes.get('points') as number[] } : undefined;
  }
}

/** Segments of a primitive's SVG 2 equivalent path (profile §11.1). */
export function segmentsOf029(geometry: SvgGeometry029): number {
  return segmentsOf(geometry);
}
function segmentsOf(geometry: SvgGeometry029): number {
  switch (geometry.kind) {
    case 'path': return geometry.commands.length;
    case 'rect': return geometry.rx > 0 || geometry.ry > 0 ? 10 : 5;
    case 'circle': case 'ellipse': return 6;
    case 'line': return 2;
    case 'polyline': return geometry.points.length / 2;
    case 'polygon': return geometry.points.length / 2 + 1;
  }
}
