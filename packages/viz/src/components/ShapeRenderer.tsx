/**
 * ShapeRenderer - Renders SVG shapes from ShapeDefinition
 *
 * This component takes a shape definition and renders the SVG path
 * with proper scaling and styling.
 */

import type { LayoutDirection } from '@coral-viz/render/layout';
import type { ShapeDefinition } from '../types.js';
import { bpmnEventFrame028, bpmnEventPathPrimitives028, isBpmnEventSymbol028, isUserOutlineShape029,
  resolveShapePath, stencilCaptionHeight028, stencilFit028, stencilPathPrimitives028, type RenderStyle028 } from '@coral-viz/render';

export interface ShapeRendererProps {
  layoutDirection?: LayoutDirection;
  /** Stable semantic owner; used for inspectable visual part IDs. */
  ownerId?: string;
  symbolId?: string;
  /** Shape definition to render */
  shape: ShapeDefinition;
  /** Width to render at (overrides defaultSize) */
  width?: number;
  /** Height to render at (overrides defaultSize) */
  height?: number;
  /** Fill color */
  fill?: string;
  /** Stroke color */
  stroke?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Stroke dash array (for dashed/dotted lines) */
  strokeDasharray?: string;
  /** Additional CSS class */
  className?: string;
  /** Parameter overrides for parametric shapes */
  parameters?: Record<string, number | string | boolean>;
  /** Enable hand-drawn sketch mode (SVG turbulence filter) */
  sketch?: boolean;
  /** Draw a second inset outline for catalog variants that require it. */
  doubleOutline?: boolean;
  renderStyle028?: RenderStyle028;
}

/**
 * Parse a viewBox string into values
 */
function parseViewBox(viewBox: string): { x: number; y: number; width: number; height: number } {
  const parts = viewBox.split(' ').map(Number);
  return {
    x: parts[0] || 0,
    y: parts[1] || 0,
    width: parts[2] || 100,
    height: parts[3] || 60,
  };
}

/**
 * Render an SVG shape from a ShapeDefinition
 */
export function ShapeRenderer({
  shape,
  ownerId,
  symbolId,
  width,
  height,
  fill = '#ffffff',
  stroke = '#000000',
  strokeWidth = 2,
  strokeDasharray,
  className,
  parameters,
  sketch,
  doubleOutline,
  renderStyle028,
  layoutDirection = 'RIGHT',
}: ShapeRendererProps) {
  const finalWidth = width ?? shape.defaultSize.width;
  const finalHeight = height ?? shape.defaultSize.height;
  const viewBox = parseViewBox(shape.viewBox);
  if (renderStyle028 && isBpmnEventSymbol028(symbolId)) {
    const frame = bpmnEventFrame028(finalWidth, finalHeight, layoutDirection);
    const eventParts = bpmnEventPathPrimitives028(ownerId ?? shape.id, symbolId!,
      renderStyle028, fill, stroke);
    return <svg width={finalWidth} height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`} className={className}
      style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`translate(${frame.x} ${frame.y})`}>
        {eventParts.map((part) => <path key={part.id} data-coral-part-id={part.id}
          d={part.d} fill={part.fill} stroke={part.stroke}
          strokeWidth={part.strokeWidth} strokeLinecap={part.strokeLinecap}
          strokeLinejoin={part.strokeLinejoin} />)}
      </g>
    </svg>;
  }

  const captionCtx = symbolId ? { symbolId } : undefined;
  const captioned = stencilCaptionHeight028(shape.id, captionCtx) > 0;
  const captionedFit = captioned ? stencilFit028(shape, finalWidth, finalHeight, captionCtx) : undefined;

  // Calculate scale factors
  const scaleX = captionedFit ? captionedFit.scale : finalWidth / viewBox.width;
  const scaleY = captionedFit ? captionedFit.scale : finalHeight / viewBox.height;

  // Determine the path to use
  const pathData = resolveShapePath(shape, parameters);

  // For strokeOnly shapes (like actor), don't fill
  const finalFill = shape.strokeOnly ? 'none' : fill;

  // Sketch mode: slightly thicker stroke for hand-drawn feel
  const finalStrokeWidth = sketch
    ? (strokeWidth + 0.5) / Math.min(scaleX, scaleY)
    : strokeWidth / Math.min(scaleX, scaleY);

  // Unique filter ID for sketch mode
  const filterId = sketch ? `sketch-wobble-${shape.id}` : undefined;

  const stencilParts = renderStyle028 ? stencilPathPrimitives028({
    ownerId: ownerId ?? shape.id, style: renderStyle028, shapeId: shape.id, parameters,
    // A user-symbol outline is in no installed registry; pass the shape itself.
    ...(isUserOutlineShape029(shape) ? { shape } : {}),
    fill, stroke, strokeWidth, strokeDasharray, doubleOutline,
    scale: Math.min(scaleX, scaleY),
  }) : undefined;

  const pathProps = {
    d: pathData,
    fill: finalFill,
    stroke,
    strokeWidth: finalStrokeWidth,
    strokeDasharray,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...(filterId ? { filter: `url(#${filterId})` } : {}),
  };

  const renderedParts = stencilParts ? stencilParts.map((part) =>
    <path key={part.id} data-coral-part-id={part.id} d={part.d} fill={part.fill}
      stroke={part.stroke} strokeWidth={part.strokeWidth}
      strokeDasharray={part.strokeDasharray} strokeLinecap={part.strokeLinecap}
      strokeLinejoin={part.strokeLinejoin} transform={part.transform} />)
    : <>
      <path {...pathProps} />
      {doubleOutline && <path {...pathProps} fill="none" transform="translate(2 2) scale(0.96 0.9333)" />}
    </>;

  if (captionedFit) {
    const tx = captionedFit.offsetX - captionedFit.viewX * captionedFit.scale;
    const ty = captionedFit.offsetY - captionedFit.viewY * captionedFit.scale;
    return (
      <svg
        width={finalWidth}
        height={finalHeight}
        viewBox={`0 0 ${finalWidth} ${finalHeight}`}
        className={className}
        style={{
          display: 'block',
          overflow: 'visible',
        }}
      >
        {sketch && (
          <defs>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3" seed={shape.id.length} result="turbulence" />
              <feDisplacementMap in="SourceGraphic" in2="turbulence" scale={1.5} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        )}
        <g transform={`translate(${tx} ${ty}) scale(${captionedFit.scale})`}>
          {renderedParts}
        </g>
      </svg>
    );
  }

  return (
    <svg
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      className={className}
      style={{
        display: 'block',
        overflow: 'visible',
      }}
    >
      {sketch && (
        <defs>
          <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3" seed={shape.id.length} result="turbulence" />
            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale={1.5} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}
      {renderedParts}
    </svg>
  );
}

export default ShapeRenderer;
