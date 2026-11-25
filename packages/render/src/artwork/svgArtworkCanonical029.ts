/** Canonical model construction and serialization of coral.svg-artwork 1
 * (profile §8 item 4, §12). Every written value is generated from a typed
 * model value; input bytes never reach the writer. The same element writer
 * serves canonical text and the `<symbol>` output. */
import type {
  SvgArtworkDiscard029, SvgArtworkModel029, SvgClipGeometry029, SvgClipPath029, SvgGeometry029, SvgLength029,
  SvgPaint029, SvgPaintServer029, SvgPaintValue029, SvgPrimitiveKind029, SvgRenderNode029, SvgStop029, SvgTransform029,
  SvgViewBox029,
} from './svgArtworkModel029.js';
import { templateChain029 } from './svgArtworkReferences029.js';
import type { ResolvedPaint029, StyleResult029 } from './svgArtworkStyle029.js';
import type { ArtworkNode029 } from './svgArtworkVocabulary029.js';

export interface CanonicalBuild029 {
  model: SvgArtworkModel029;
  /** Expanded elements and segments (profile §11.1). */
  elements: number;
  segments: number;
  discarded: SvgArtworkDiscard029[];
}

const length = (value: number, percent = false): SvgLength029 => ({ value, percent });
const freeze = <T>(value: T): T => Object.freeze(value);

/** Build the canonical model from the admitted tree (after P6). */
export function buildCanonicalModel029(root: ArtworkNode029, viewBox: SvgViewBox029, nodes: readonly ArtworkNode029[],
  ids: ReadonlyMap<string, ArtworkNode029>, style: StyleResult029): CanonicalBuild029 {
  const serverIds = new Map<ArtworkNode029, string>();
  const clipIds = new Map<ArtworkNode029, string>();
  const paintServers: SvgPaintServer029[] = [];
  const clipPaths: SvgClipPath029[] = [];
  const discarded: SvgArtworkDiscard029[] = [];
  let elements = 1;
  let segments = 0;

  const stopsOf = (gradient: ArtworkNode029) => gradient.children.filter((child) => child.name === 'stop');
  const resolvedStops = (gradient: ArtworkNode029) =>
    stopsOf(templateChain029(gradient, ids).find((item) => stopsOf(item).length > 0) ?? gradient);

  const serverFor = (id: string): string => {
    const gradient = ids.get(id)!;
    let canonical = serverIds.get(gradient);
    if (canonical === undefined) {
      canonical = `p${serverIds.size + 1}`;
      serverIds.set(gradient, canonical);
      paintServers.push(buildGradient(gradient, canonical));
    }
    return canonical;
  };
  const clipFor = (id: string): string => {
    const clip = ids.get(id)!;
    let canonical = clipIds.get(clip);
    if (canonical === undefined) {
      canonical = `c${clipIds.size + 1}`;
      clipIds.set(clip, canonical);
      clipPaths.push(buildClip(clip, canonical));
    }
    // Each reference charges the clip path at its full size (profile §8 item 7, §11.1).
    elements += 1 + clip.children.length;
    for (const child of clip.children) segments += child.segments;
    return canonical;
  };
  const paintValue = (paint: ResolvedPaint029): SvgPaintValue029 => {
    if (paint.kind !== 'url') return paint;
    const gradient = ids.get(paint.id)!;
    const id = serverFor(paint.id);
    elements += 1 + resolvedStops(gradient).length;
    return { kind: 'server', id };
  };

  function buildGradient(gradient: ArtworkNode029, id: string): SvgPaintServer029 {
    const chain = templateChain029(gradient, ids);
    const keyword = (name: string) => chain.find((item) => item.keywords.has(name))?.keywords.get(name);
    const coordinate = (name: string) => chain.find((item) => item.name === gradient.name && item.lengths.has(name))?.lengths.get(name);
    const transform = chain.find((item) => item.specifiesTransform)?.transform ?? [];
    const stops: SvgStop029[] = resolvedStops(gradient).map((stop) => {
      const resolved = style.stops.get(stop)!;
      return freeze({ offset: stop.offset ?? length(0), color: resolved.color, opacity: resolved.opacity });
    });
    const base = {
      id, units: (keyword('gradientUnits') ?? 'objectBoundingBox') as SvgPaintServer029['units'],
      spreadMethod: (keyword('spreadMethod') ?? 'pad') as SvgPaintServer029['spreadMethod'],
      transform: freeze([...transform]), stops: freeze(stops),
    };
    if (gradient.name === 'linearGradient') {
      return freeze({ kind: 'linearGradient', ...base, x1: coordinate('x1') ?? length(0, true), y1: coordinate('y1') ?? length(0, true),
        x2: coordinate('x2') ?? length(100, true), y2: coordinate('y2') ?? length(0, true) });
    }
    const cx = coordinate('cx') ?? length(50, true);
    const cy = coordinate('cy') ?? length(50, true);
    return freeze({ kind: 'radialGradient', ...base, cx, cy, r: coordinate('r') ?? length(50, true),
      fx: coordinate('fx') ?? cx, fy: coordinate('fy') ?? cy, fr: coordinate('fr') ?? length(0, true) });
  }

  function buildClip(clip: ArtworkNode029, id: string): SvgClipPath029 {
    const children: SvgClipGeometry029[] = clip.children.map((child) => {
      for (const property of child.specified.keys()) {
        if (property !== 'clip-rule') discarded.push({ kind: 'clip-geometry-property', name: property, start: child.raw.start, end: child.raw.end });
      }
      return freeze({ kind: child.name as SvgPrimitiveKind029, geometry: freezeGeometry(child.geometry!),
        transform: freeze([...child.transform]), clipRule: style.computed.get(child)!.clipRule });
    });
    return freeze({ id, units: (clip.keywords.get('clipPathUnits') ?? 'userSpaceOnUse') as SvgClipPath029['units'],
      transform: freeze([...clip.transform]), children: freeze(children) });
  }

  const visit = (node: ArtworkNode029): SvgRenderNode029 => {
    elements++;
    const clipReference = node.specified.get('clip-path')?.value;
    const clipPath = typeof clipReference === 'object' && 'kind' in clipReference && clipReference.kind === 'url'
      ? clipFor(clipReference.id) : undefined;
    const computed = style.computed.get(node)!;
    if (node.name === 'g') {
      const children = node.children.filter((child) => child.rendering).map(visit);
      return freeze({ kind: 'g', transform: freeze([...node.transform]), ...(clipPath ? { clipPath } : {}),
        opacity: computed.opacity, children: freeze(children) });
    }
    segments += node.segments;
    const resolved = style.paint.get(node)!;
    const paint: SvgPaint029 = freeze({
      fill: paintValue(resolved.fill), fillOpacity: computed.fillOpacity, fillRule: computed.fillRule,
      stroke: paintValue(resolved.stroke), strokeOpacity: computed.strokeOpacity, strokeWidth: computed.strokeWidth,
      strokeLinecap: computed.strokeLinecap, strokeLinejoin: computed.strokeLinejoin,
      strokeMiterlimit: computed.strokeMiterlimit,
      strokeDasharray: computed.strokeDasharray === 'none' ? 'none' : freeze([...computed.strokeDasharray]),
      strokeDashoffset: computed.strokeDashoffset, opacity: computed.opacity,
    });
    return freeze({ kind: node.name as SvgPrimitiveKind029, geometry: freezeGeometry(node.geometry!),
      transform: freeze([...node.transform]), ...(clipPath ? { clipPath } : {}), paint });
  };
  const children = root.children.filter((child) => child.rendering).map(visit);

  const templates = new Set<ArtworkNode029>();
  for (const gradient of serverIds.keys()) for (const template of templateChain029(gradient, ids).slice(1)) templates.add(template);
  for (const node of nodes) {
    if ((node.name === 'linearGradient' || node.name === 'radialGradient') && !serverIds.has(node)) {
      discarded.push({ kind: templates.has(node) ? 'gradient-template' : 'unreferenced-paint-server', start: node.raw.start, end: node.raw.end });
    } else if (node.name === 'clipPath' && !clipIds.has(node)) {
      discarded.push({ kind: 'unreferenced-clip-path', start: node.raw.start, end: node.raw.end });
    }
  }
  return {
    model: freeze({ viewBox: freeze({ ...viewBox }), paintServers: freeze(paintServers), clipPaths: freeze(clipPaths),
      children: freeze(children) }),
    elements, segments, discarded,
  };
}

function freezeGeometry(geometry: SvgGeometry029): SvgGeometry029 {
  if (geometry.kind === 'path') {
    return freeze({ kind: 'path', commands: freeze(geometry.commands.map((command) =>
      freeze({ command: command.command, values: freeze([...command.values]) }))) });
  }
  if (geometry.kind === 'polyline' || geometry.kind === 'polygon') return freeze({ kind: geometry.kind, points: freeze([...geometry.points]) });
  return freeze({ ...geometry });
}

// ── Writer ────────────────────────────────────────────────────────────────

/** Profile §7.1: ECMAScript Number::toString, with negative zero written `0`. */
export const formatNumber029 = (value: number): string => Object.is(value, -0) ? '0' : String(value);
const formatLength = (value: SvgLength029) => `${formatNumber029(value.value)}${value.percent ? '%' : ''}`;
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function formatTransforms029(transforms: readonly SvgTransform029[]): string {
  return transforms.map((transform) => {
    switch (transform.kind) {
      case 'matrix': return `matrix(${transform.values.map(formatNumber029).join(' ')})`;
      case 'translate': case 'scale': return `${transform.kind}(${formatNumber029(transform.x)} ${formatNumber029(transform.y)})`;
      case 'rotate': return `rotate(${[transform.angle, ...(transform.center ?? [])].map(formatNumber029).join(' ')})`;
      default: return `${transform.kind}(${formatNumber029(transform.angle)})`;
    }
  }).join(' ');
}

type Attributes = [string, string][];

function geometryAttributes(geometry: SvgGeometry029): Attributes {
  const numbers = (pairs: [string, number][]): Attributes => pairs.map(([name, value]) => [name, formatNumber029(value)]);
  switch (geometry.kind) {
    case 'path': return [['d', geometry.commands.map(({ command, values }) =>
      [command, ...values.map(formatNumber029)].join(' ')).join(' ')]];
    case 'rect': return numbers([['x', geometry.x], ['y', geometry.y], ['width', geometry.width], ['height', geometry.height],
      ['rx', geometry.rx], ['ry', geometry.ry]]);
    case 'circle': return numbers([['cx', geometry.cx], ['cy', geometry.cy], ['r', geometry.r]]);
    case 'ellipse': return numbers([['cx', geometry.cx], ['cy', geometry.cy], ['rx', geometry.rx], ['ry', geometry.ry]]);
    case 'line': return numbers([['x1', geometry.x1], ['y1', geometry.y1], ['x2', geometry.x2], ['y2', geometry.y2]]);
    default: return [['points', geometry.points.map(formatNumber029).join(' ')]];
  }
}

export interface WriterOptions029 {
  /** Maps a canonical ID (`p1`, `c1`) to the written ID. */
  id: (canonical: string) => string;
  /** Paint every non-`none` stroke with `currentColor` (the provisional SA-6 rule). */
  tintStroke: boolean;
}

/** The provisional SA-6 rule: `tint stroke` replaces every stroke that is not `none`. */
export const svgArtworkTintsStroke029 = (paint: SvgPaint029): boolean => paint.stroke.kind !== 'none';

/** One written line: depth below the root and its text. */
export type WrittenLine029 = [number, string];

/** Write the root's content (defs and rendering tree) as tagged lines. */
export function writeArtworkContent029(model: SvgArtworkModel029, options: WriterOptions029): WrittenLine029[] {
  const lines: WrittenLine029[] = [];
  const tag = (depth: number, name: string, attributes: Attributes, children?: () => void) => {
    const written = attributes.map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
    const before = lines.length;
    lines.push([depth, `<${name}${written}>`]);
    children?.();
    if (lines.length === before + 1) lines[before] = [depth, `<${name}${written}/>`];
    else lines.push([depth, `</${name}>`]);
  };
  const url = (canonical: string) => `url(#${options.id(canonical)})`;
  const paint = (value: SvgPaintValue029) => value.kind === 'none' ? 'none' : value.kind === 'color' ? value.hex : url(value.id);
  const transform = (transforms: readonly SvgTransform029[]): Attributes =>
    transforms.length > 0 ? [['transform', formatTransforms029(transforms)]] : [];

  if (model.paintServers.length > 0 || model.clipPaths.length > 0) {
    tag(1, 'defs', [], () => {
      for (const server of model.paintServers) {
        const coordinates: Attributes = server.kind === 'linearGradient'
          ? [['x1', formatLength(server.x1)], ['y1', formatLength(server.y1)], ['x2', formatLength(server.x2)], ['y2', formatLength(server.y2)]]
          : [['cx', formatLength(server.cx)], ['cy', formatLength(server.cy)], ['r', formatLength(server.r)],
            ['fx', formatLength(server.fx)], ['fy', formatLength(server.fy)], ['fr', formatLength(server.fr)]];
        tag(2, server.kind, [['id', options.id(server.id)], ['gradientUnits', server.units], ...coordinates,
          ['spreadMethod', server.spreadMethod],
          ...(server.transform.length > 0 ? [['gradientTransform', formatTransforms029(server.transform)] as [string, string]] : [])], () => {
          for (const stop of server.stops) {
            tag(3, 'stop', [['offset', formatLength(stop.offset)], ['stop-color', stop.color], ['stop-opacity', formatNumber029(stop.opacity)]]);
          }
        });
      }
      for (const clip of model.clipPaths) {
        tag(2, 'clipPath', [['id', options.id(clip.id)], ['clipPathUnits', clip.units], ...transform(clip.transform)], () => {
          for (const child of clip.children) {
            tag(3, child.kind, [...geometryAttributes(child.geometry), ...transform(child.transform),
              ...(child.clipRule === 'evenodd' ? [['clip-rule', 'evenodd'] as [string, string]] : [])]);
          }
        });
      }
    });
  }
  const visit = (node: SvgRenderNode029, depth: number) => {
    const clip: Attributes = node.clipPath ? [['clip-path', url(node.clipPath)]] : [];
    if (node.kind === 'g') {
      tag(depth, 'g', [...transform(node.transform), ...clip,
        ...(node.opacity !== 1 ? [['opacity', formatNumber029(node.opacity)] as [string, string]] : [])],
      () => { for (const child of node.children) visit(child, depth + 1); });
      return;
    }
    const style = node.paint;
    const optional = (name: string, written: boolean, value: string): Attributes => written ? [[name, value]] : [];
    const stroke = options.tintStroke && svgArtworkTintsStroke029(style) ? 'currentColor' : paint(style.stroke);
    tag(depth, node.kind, [
      ...geometryAttributes(node.geometry), ...transform(node.transform), ...clip,
      ['fill', paint(style.fill)],
      ...optional('fill-opacity', style.fillOpacity !== 1, formatNumber029(style.fillOpacity)),
      ...optional('fill-rule', style.fillRule !== 'nonzero', style.fillRule),
      ['stroke', stroke],
      ...optional('stroke-opacity', style.strokeOpacity !== 1, formatNumber029(style.strokeOpacity)),
      ['stroke-width', formatNumber029(style.strokeWidth)],
      ...optional('stroke-linecap', style.strokeLinecap !== 'butt', style.strokeLinecap),
      ...optional('stroke-linejoin', style.strokeLinejoin !== 'miter', style.strokeLinejoin),
      ...optional('stroke-miterlimit', style.strokeMiterlimit !== 4, formatNumber029(style.strokeMiterlimit)),
      ...optional('stroke-dasharray', style.strokeDasharray !== 'none',
        style.strokeDasharray === 'none' ? '' : style.strokeDasharray.map(formatNumber029).join(' ')),
      ...optional('stroke-dashoffset', style.strokeDashoffset !== 0, formatNumber029(style.strokeDashoffset)),
      ['opacity', formatNumber029(style.opacity)],
    ]);
  };
  for (const child of model.children) visit(child, 1);
  return lines;
}

export const formatViewBox029 = (viewBox: SvgViewBox029): string =>
  [viewBox.minX, viewBox.minY, viewBox.width, viewBox.height].map(formatNumber029).join(' ');

/** Canonical text (profile §12.1): two-space indentation and LF after every line. */
export function serializeCanonical029(model: SvgArtworkModel029): string {
  const lines = writeArtworkContent029(model, { id: (canonical) => canonical, tintStroke: false });
  return [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatViewBox029(model.viewBox)}">`,
    ...lines.map(([depth, text]) => `${'  '.repeat(depth)}${text}`), '</svg>', ''].join('\n');
}

