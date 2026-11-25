/** Types and constants of the coral.svg-artwork profile version 1 admitter
 * (packages/render/spec/svg-artwork-1.md). The model holds only admitted,
 * resolved values; no input text survives admission. */

export const SVG_ARTWORK_PROFILE_029 = Object.freeze({ id: 'coral.svg-artwork', version: '1' } as const);
/** Frozen profile §15; spec/svg-artwork-1/freeze.json pins its artifacts. */
export const SVG_ARTWORK_PROFILE_FROZEN_029: boolean = true;
export const SVG_NAMESPACE_029 = 'http://www.w3.org/2000/svg';
export const XLINK_NAMESPACE_029 = 'http://www.w3.org/1999/xlink';
export const XML_NAMESPACE_029 = 'http://www.w3.org/XML/1998/namespace';

export type SvgArtworkCode029 =
  | 'coral.artwork.svg.parse'
  | 'coral.artwork.svg.element.unsupported'
  | 'coral.artwork.svg.attribute.unsupported'
  | 'coral.artwork.svg.reference.unsupported'
  | 'coral.artwork.svg.reference.cycle'
  | 'coral.artwork.svg.budget.exceeded'
  | 'coral.artwork.svg.geometry.invalid'
  | 'coral.artwork.svg.viewbox.invalid';
export type SvgArtworkBudget029 = 'input.bytes' | 'input.elements' | 'input.segments' | 'nesting' |
  'reference-depth' | 'bytes' | 'elements' | 'segments';
export type SvgArtworkPhase029 = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7';

/** Profile §11.2; calibrated frozen limits for portable version 1. */
export const SVG_ARTWORK_BUDGETS_029 = Object.freeze({
  'input.bytes': 2_097_152,
  'input.elements': 10_000,
  nesting: 32,
  'input.segments': 100_000,
  'reference-depth': 32,
  bytes: { standard: 65_536, detailed: 262_144 },
  elements: { standard: 256, detailed: 1_024 },
  segments: { standard: 4_096, detailed: 16_384 },
} as const);

export interface SvgArtworkBudgetExcess029 { name: SvgArtworkBudget029; measure: number; limit: number }

export interface SvgArtworkFailure029 {
  code: SvgArtworkCode029;
  phase: SvgArtworkPhase029;
  /** Names the element, attribute, value or budget concerned. */
  detail: string;
  /** Half-open UTF-16 span in the input as given; P1 and P7 span the whole input. */
  start: number;
  end: number;
  /** Present for budget failures, in profile order. */
  budgets?: readonly SvgArtworkBudgetExcess029[];
}

export type SvgArtworkDiscardKind029 = 'xml-declaration' | 'comment' | 'title' | 'desc' | 'root-attribute' | 'id' |
  'unreferenced-paint-server' | 'unreferenced-clip-path' | 'gradient-template' | 'clip-geometry-property';
/** A construct that admission removed, for disclosure in the import preview (profile §12.2 item 4). */
export interface SvgArtworkDiscard029 { kind: SvgArtworkDiscardKind029; name?: string; start: number; end: number }

export interface SvgViewBox029 { minX: number; minY: number; width: number; height: number }

export type SvgTransform029 =
  | { kind: 'matrix'; values: readonly [number, number, number, number, number, number] }
  | { kind: 'translate'; x: number; y: number }
  | { kind: 'scale'; x: number; y: number }
  | { kind: 'rotate'; angle: number; center?: readonly [number, number] }
  | { kind: 'skewX' | 'skewY'; angle: number };

/** A gradient coordinate or stop offset in its authored kind. */
export interface SvgLength029 { value: number; percent: boolean }

/** One explicit path command: implicit repetitions are already split out. */
export interface SvgPathCommand029 { command: string; values: readonly number[] }

export type SvgGeometry029 =
  | { kind: 'path'; commands: readonly SvgPathCommand029[] }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number; ry: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline' | 'polygon'; points: readonly number[] };
export type SvgPrimitiveKind029 = SvgGeometry029['kind'];

/** `#rrggbb` in lowercase, or a canonical paint-server ID such as `p1`. */
export type SvgPaintValue029 = { kind: 'none' } | { kind: 'color'; hex: string } | { kind: 'server'; id: string };

export interface SvgPaint029 {
  fill: SvgPaintValue029;
  fillOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
  stroke: SvgPaintValue029;
  strokeOpacity: number;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'miter' | 'round' | 'bevel';
  strokeMiterlimit: number;
  strokeDasharray: readonly number[] | 'none';
  strokeDashoffset: number;
  opacity: number;
}

export interface SvgPrimitive029 {
  kind: SvgPrimitiveKind029;
  geometry: SvgGeometry029;
  transform: readonly SvgTransform029[];
  /** Canonical clip-path ID such as `c1`. */
  clipPath?: string;
  paint: SvgPaint029;
}
export interface SvgGroup029 {
  kind: 'g';
  transform: readonly SvgTransform029[];
  clipPath?: string;
  opacity: number;
  children: readonly SvgRenderNode029[];
}
export type SvgRenderNode029 = SvgGroup029 | SvgPrimitive029;

export interface SvgStop029 { offset: SvgLength029; color: string; opacity: number }
interface SvgGradientBase029 {
  id: string;
  units: 'userSpaceOnUse' | 'objectBoundingBox';
  spreadMethod: 'pad' | 'reflect' | 'repeat';
  transform: readonly SvgTransform029[];
  stops: readonly SvgStop029[];
}
export interface SvgLinearGradient029 extends SvgGradientBase029 {
  kind: 'linearGradient'; x1: SvgLength029; y1: SvgLength029; x2: SvgLength029; y2: SvgLength029;
}
export interface SvgRadialGradient029 extends SvgGradientBase029 {
  kind: 'radialGradient'; cx: SvgLength029; cy: SvgLength029; r: SvgLength029;
  fx: SvgLength029; fy: SvgLength029; fr: SvgLength029;
}
export type SvgPaintServer029 = SvgLinearGradient029 | SvgRadialGradient029;

export interface SvgClipGeometry029 {
  kind: SvgPrimitiveKind029;
  geometry: SvgGeometry029;
  transform: readonly SvgTransform029[];
  clipRule: 'nonzero' | 'evenodd';
}
export interface SvgClipPath029 {
  id: string;
  units: 'userSpaceOnUse' | 'objectBoundingBox';
  transform: readonly SvgTransform029[];
  children: readonly SvgClipGeometry029[];
}

export interface SvgArtworkModel029 {
  viewBox: SvgViewBox029;
  /** Referenced paint servers in canonical ID order (p1, p2, …). */
  paintServers: readonly SvgPaintServer029[];
  /** Referenced clip paths in canonical ID order (c1, c2, …). */
  clipPaths: readonly SvgClipPath029[];
  /** The rendering tree under the root, in document order. */
  children: readonly SvgRenderNode029[];
}

export interface AdmittedSvgArtwork029 {
  profile: typeof SVG_ARTWORK_PROFILE_029;
  tier: 'standard' | 'detailed';
  canonicalText: string;
  /** True when the input, as given, equals `canonicalText`. */
  inputIsCanonical: boolean;
  viewBox: SvgViewBox029;
  model: SvgArtworkModel029;
  measures: { bytes: number; elements: number; segments: number };
  discarded: readonly SvgArtworkDiscard029[];
}

export type SvgArtworkAdmission029 =
  | { ok: true; artwork: AdmittedSvgArtwork029 }
  | { ok: false; failures: readonly SvgArtworkFailure029[] };
