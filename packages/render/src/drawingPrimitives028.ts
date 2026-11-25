/** DOM-free drawing instructions shared by SVG export and the editor canvas.
 * Coordinates are local to the installed stencil viewBox. The caller applies
 * the same aspect-preserving fit for the containing node on either surface. */
import { shapeRegistry } from './shapes/index.js';
import { visualContour028, visualOverdraw028, type RenderStyle028 } from './visualStyle028.js';
import type { NodeLabelLayout } from './text/sizing.js';
import type { ResolvedFont } from './text/fonts.js';
import { fontMetrics } from './text/fonts.js';
import { measureText } from './text/metrics.js';
import type { ClassifierPresentation } from './scene.js';
import type { ShapeDefinition } from './types.js';

export interface StencilPathPrimitive028 {
  readonly id: string;
  readonly ownerId: string;
  readonly role: 'outline' | 'corner-overdraw' | 'inner-outline';
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  readonly transform?: string;
  readonly strokeLinecap: 'round';
  readonly strokeLinejoin: 'round';
}

export interface StencilPaint028 {
  ownerId: string;
  style: RenderStyle028;
  shapeId: string;
  /** A user-symbol outline, which no installed registry holds. */
  shape?: ShapeDefinition;
  parameters?: Readonly<Record<string, number | string | boolean>>;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  doubleOutline?: boolean;
  /** Uniform scale from the native stencil viewBox into scene coordinates. */
  scale: number;
  /** Elastic rectangle dimensions, only for an actual container frame. */
  containerFrame?: { width: number; height: number };
}

/** Resolve visual contour, corner overdraw, and inner rule once per stencil.
 * Catalog semantics and authored ports are untouched by these instructions. */
export function stencilPathPrimitives028(paint: StencilPaint028): readonly StencilPathPrimitive028[] {
  const shape = paint.shape ?? shapeRegistry.get(paint.shapeId);
  if (!shape) throw new Error(`render.capability.stencil: ${paint.shapeId} is not installed`);
  if (!Number.isFinite(paint.scale) || paint.scale <= 0) {
    throw new Error(`render.capability.stencil: invalid scale for ${paint.ownerId}`);
  }
  const d = visualContour028(paint.shape ?? paint.shapeId, paint.style, paint.parameters, paint.containerFrame);
  const base = { ownerId: paint.ownerId, stroke: paint.stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const outline: StencilPathPrimitive028 = {
    ...base, id: `${paint.ownerId}:outline`, role: 'outline', d,
    fill: shape.strokeOnly ? 'none' : paint.fill,
    strokeWidth: paint.strokeWidth / paint.scale,
    ...(paint.strokeDasharray ? { strokeDasharray: paint.strokeDasharray } : {}),
  };
  // Independent M subpaths retain each hand-overdrawn cap and join while one
  // compound path avoids eight SVG elements (and wrappers) per lowfi box.
  const overdrawPaths = visualOverdraw028(paint.shape ?? paint.shapeId, paint.style, paint.parameters, paint.containerFrame);
  const overdraw: StencilPathPrimitive028[] = overdrawPaths.length ? [{
    ...base, id: `${paint.ownerId}:corners`, role: 'corner-overdraw',
    d: overdrawPaths.join(' '), fill: 'none', strokeWidth: 1.1 / paint.scale,
  }] : [];
  const inner: StencilPathPrimitive028[] = paint.doubleOutline ? [{
    ...base, id: `${paint.ownerId}:inner-outline`, role: 'inner-outline',
    d, fill: 'none', strokeWidth: paint.strokeWidth / paint.scale,
    transform: 'translate(2 2) scale(0.96 0.9333)',
  }] : [];
  return [outline, ...overdraw, ...inner];
}

export interface TextRunPrimitive028 {
  readonly id: string;
  readonly ownerId: string;
  readonly role: 'node-label' | 'classifier-stereotype' | 'classifier-name' | 'classifier-row';
  readonly text: string;
  /** Baseline and bounds are local to the node box. */
  readonly x: number;
  readonly y: number;
  readonly inkBounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly anchor: 'middle' | 'start';
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly fill: string;
  readonly fontStyle?: 'italic';
  readonly textDecoration?: 'underline';
  readonly compartmentId?: string;
  readonly endpoint?: 'source' | 'target';
  readonly endpointLabelKind?: 'role' | 'multiplicity';
}

export interface ClassifierSeparatorPrimitive028 {
  readonly id: string;
  readonly ownerId: string;
  readonly role: 'classifier-separator';
  readonly compartmentId: string;
  readonly x1: number; readonly y1: number;
  readonly x2: number; readonly y2: number;
  readonly stroke: string; readonly strokeWidth: number;
}

export interface ClassifierDrawing028 {
  readonly text: readonly TextRunPrimitive028[];
  readonly separators: readonly ClassifierSeparatorPrimitive028[];
  readonly requiredHeight: number;
}

/** Measured UML classifier rows and dividers in node-local coordinates. */
export function classifierPrimitives028(
  ownerId: string, classifier: ClassifierPresentation, width: number,
  font: ResolvedFont, ink: string,
): ClassifierDrawing028 {
  const metrics = fontMetrics(font.id, font.weight);
  const rowHeight = Math.ceil(font.size * font.lineHeight);
  const ascent = metrics.ascent * font.size;
  const text: TextRunPrimitive028[] = [];
  const separators: ClassifierSeparatorPrimitive028[] = [];
  let baseline = 8 + ascent;
  const add = (value: string, id: string, role: TextRunPrimitive028['role'],
    anchor: 'middle' | 'start', extra: Pick<TextRunPrimitive028, 'fontStyle' | 'textDecoration' | 'compartmentId'> = {}) => {
    const x = anchor === 'middle' ? width / 2 : 12;
    const measuredWidth = measureText({ text: value, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight }).width;
    text.push({ id, ownerId, role, text: value, x, y: baseline, anchor,
      inkBounds: { x: anchor === 'middle' ? x - measuredWidth / 2 : x,
        y: baseline - ascent, width: measuredWidth,
        height: (metrics.ascent + metrics.descent) * font.size },
      fontFamily: font.cssFamily, fontSize: font.size, fontWeight: font.weight,
      lineHeight: font.lineHeight, fill: ink, ...extra });
    baseline += rowHeight;
  };
  if (classifier.stereotype) add(classifier.stereotype, `${ownerId}:stereotype`, 'classifier-stereotype', 'middle');
  add(classifier.name, `${ownerId}:name`, 'classifier-name', 'middle', {
    ...(classifier.abstract ? { fontStyle: 'italic' } : {}),
    ...(classifier.static ? { textDecoration: 'underline' } : {}),
  });
  for (const compartment of classifier.compartments) {
    const separatorY = baseline - ascent + 2;
    separators.push({ id: `${ownerId}:${compartment.id}:divider`, ownerId,
      role: 'classifier-separator', compartmentId: compartment.id,
      x1: 0, y1: separatorY, x2: width, y2: separatorY,
      stroke: ink, strokeWidth: 1.3 });
    baseline += 5;
    if (compartment.rows.length === 0) baseline += rowHeight;
    compartment.rows.forEach((row, index) => add(row,
      `${ownerId}:${compartment.id}:row:${index + 1}`, 'classifier-row', 'start',
      { compartmentId: compartment.id }));
  }
  return { text, separators, requiredHeight: Math.ceil(baseline - rowHeight + metrics.descent * font.size + 8) };
}

/** The exact measured text rows used by the SVG exporter and node canvas. */
export function nodeLabelPrimitives028(
  ownerId: string, layout: NodeLabelLayout, font: ResolvedFont, fill: string,
): readonly TextRunPrimitive028[] {
  const metrics = layout.inkMetrics ?? fontMetrics(font.id, font.weight);
  const leftAligned = layout.anchor === 'start';
  return layout.lines.map((line, index) => {
    const width = measureText({ text: line, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight }).width;
    const x = leftAligned ? layout.textBox.x : layout.width / 2;
    const y = layout.baselines[index]!;
    return { id: `${ownerId}:label:${index + 1}`, ownerId, role: 'node-label' as const,
      text: line, x, y, anchor: leftAligned ? 'start' as const : 'middle' as const, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight,
      fill, inkBounds: { x: leftAligned ? x : x - width / 2, y: y - metrics.ascent * font.size,
        width, height: (metrics.ascent + metrics.descent) * font.size } };
  });
}
