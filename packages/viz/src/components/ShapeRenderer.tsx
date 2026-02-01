/**
 * ShapeRenderer - Renders SVG shapes from ShapeDefinition
 *
 * This component takes a shape definition and renders the SVG path
 * with proper scaling and styling.
 */

import type { ShapeDefinition } from '../types';

export interface ShapeRendererProps {
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
 * Generate an SVG path with rounded corners for rectangle shapes
 */
function getRoundedRectPath(
  width: number,
  height: number,
  cornerRadius: number
): string {
  const r = Math.min(cornerRadius, width / 2, height / 2);
  return `
    M ${r},0
    L ${width - r},0
    Q ${width},0 ${width},${r}
    L ${width},${height - r}
    Q ${width},${height} ${width - r},${height}
    L ${r},${height}
    Q 0,${height} 0,${height - r}
    L 0,${r}
    Q 0,0 ${r},0
    Z
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Render an SVG shape from a ShapeDefinition
 */
export function ShapeRenderer({
  shape,
  width,
  height,
  fill = '#ffffff',
  stroke = '#000000',
  strokeWidth = 2,
  strokeDasharray,
  className,
  parameters,
}: ShapeRendererProps) {
  const finalWidth = width ?? shape.defaultSize.width;
  const finalHeight = height ?? shape.defaultSize.height;
  const viewBox = parseViewBox(shape.viewBox);

  // Calculate scale factors
  const scaleX = finalWidth / viewBox.width;
  const scaleY = finalHeight / viewBox.height;

  // Determine the path to use
  let pathData = shape.path;

  // Handle parametric shapes (like rounded rectangles)
  if (shape.id === 'rectangle' && parameters?.cornerRadius) {
    const cornerRadius = Number(parameters.cornerRadius) || 0;
    if (cornerRadius > 0) {
      pathData = getRoundedRectPath(viewBox.width, viewBox.height, cornerRadius);
    }
  }

  // For strokeOnly shapes (like actor), don't fill
  const finalFill = shape.strokeOnly ? 'none' : fill;

  // Handle compound paths (multiple subpaths)
  const paths = pathData.split(' M ').map((p, i) => (i === 0 ? p : 'M ' + p));

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
      {paths.length === 1 ? (
        <path
          d={pathData}
          fill={finalFill}
          stroke={stroke}
          strokeWidth={strokeWidth / Math.min(scaleX, scaleY)}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        // Compound shapes may need multiple paths
        <g>
          <path
            d={pathData}
            fill={finalFill}
            stroke={stroke}
            strokeWidth={strokeWidth / Math.min(scaleX, scaleY)}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

export default ShapeRenderer;
