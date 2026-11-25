/** Phase P5 of coral.svg-artwork 1: specified and computed values and
 * `currentColor` (profile §9). Resolution uses the document tree only; no
 * value from a host document enters it. */
import type { SvgArtworkFailure029 } from './svgArtworkModel029.js';
import type { ParsedPaint029 } from './svgArtworkValues029.js';
import { PRIMITIVES_029, type ArtworkNode029 } from './svgArtworkVocabulary029.js';

/** Paint after `currentColor` resolution; `url` keeps the input ID until P7 renames it. */
export type ResolvedPaint029 = { kind: 'none' } | { kind: 'color'; hex: string } | { kind: 'url'; id: string };

export interface ComputedStyle029 {
  fill: ParsedPaint029;
  fillOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
  stroke: ParsedPaint029;
  strokeOpacity: number;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'miter' | 'round' | 'bevel';
  strokeMiterlimit: number;
  strokeDasharray: readonly number[] | 'none';
  strokeDashoffset: number;
  clipRule: 'nonzero' | 'evenodd';
  color?: string;
  /** Non-inherited properties. */
  opacity: number;
  clipPath?: string;
}

export interface StyleResult029 {
  computed: Map<ArtworkNode029, ComputedStyle029>;
  /** Resolved paint of each painted primitive. */
  paint: Map<ArtworkNode029, { fill: ResolvedPaint029; stroke: ResolvedPaint029 }>;
  /** Resolved stop colour and opacity of every stop. */
  stops: Map<ArtworkNode029, { color: string; opacity: number }>;
  failures: SvgArtworkFailure029[];
}

const INITIAL: ComputedStyle029 = {
  fill: { kind: 'color', hex: '#000000' }, fillOpacity: 1, fillRule: 'nonzero', stroke: { kind: 'none' }, strokeOpacity: 1,
  strokeWidth: 1, strokeLinecap: 'butt', strokeLinejoin: 'miter', strokeMiterlimit: 4, strokeDasharray: 'none',
  strokeDashoffset: 0, clipRule: 'nonzero', opacity: 1,
};
const PROPERTY_KEYS: Record<string, keyof ComputedStyle029> = {
  fill: 'fill', 'fill-opacity': 'fillOpacity', 'fill-rule': 'fillRule', stroke: 'stroke', 'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit', 'stroke-dasharray': 'strokeDasharray', 'stroke-dashoffset': 'strokeDashoffset',
  'clip-rule': 'clipRule', color: 'color',
};

export function resolveStyle029(nodes: readonly ArtworkNode029[]): StyleResult029 {
  const computed = new Map<ArtworkNode029, ComputedStyle029>();
  const paint = new Map<ArtworkNode029, { fill: ResolvedPaint029; stroke: ResolvedPaint029 }>();
  const stops = new Map<ArtworkNode029, { color: string; opacity: number }>();
  const failures: SvgArtworkFailure029[] = [];

  // Nodes are in document order, so every parent is computed before its children.
  for (const node of nodes) {
    const inherited = node.parent ? computed.get(node.parent)! : INITIAL;
    const style: ComputedStyle029 = { ...inherited, opacity: 1 };
    delete style.clipPath;
    for (const [property, specified] of node.specified) {
      const key = PROPERTY_KEYS[property];
      if (key) (style as unknown as Record<string, unknown>)[key] = specified.value;
    }
    const opacity = node.specified.get('opacity');
    if (opacity) style.opacity = opacity.value as number;
    const clip = node.specified.get('clip-path')?.value as ParsedPaint029 | undefined;
    if (clip?.kind === 'url') style.clipPath = clip.id;
    computed.set(node, style);

    const unresolved = () => failures.push({ code: 'coral.artwork.svg.attribute.unsupported', phase: 'P5',
      detail: `<${node.name}> unresolved currentColor`, start: node.raw.start, end: node.raw.end });
    const resolve = (value: ParsedPaint029): ResolvedPaint029 | undefined => {
      if (value.kind !== 'current') return value;
      return style.color === undefined ? undefined : { kind: 'color', hex: style.color };
    };
    if (PRIMITIVES_029.has(node.name) && node.rendering) {
      const fill = resolve(style.fill);
      const stroke = resolve(style.stroke);
      if (!fill || !stroke) unresolved();
      else paint.set(node, { fill, stroke });
    } else if (node.name === 'stop') {
      const specified = node.specified.get('stop-color')?.value as ParsedPaint029 | undefined;
      const color = specified ? resolve(specified) : { kind: 'color' as const, hex: '#000000' };
      if (!color || color.kind !== 'color') unresolved();
      else stops.set(node, { color: color.hex, opacity: (node.specified.get('stop-opacity')?.value as number | undefined) ?? 1 });
    }
  }
  return { computed, paint, stops, failures };
}
