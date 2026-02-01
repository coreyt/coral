/**
 * CompatibilityEdge Component (CORAL-REQ-010)
 *
 * A custom React Flow edge component that displays visual feedback
 * for edge compatibility status (incompatible, warning, compatible).
 */

import { memo, useState, useCallback, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { IncompatibilityTooltip } from './IncompatibilityTooltip';
import type { EdgeCompatibilityStatus, ConnectionValidation } from '../types';

/**
 * Edge style configuration for each compatibility status
 */
export interface EdgeStyleConfig {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
}

/**
 * Get edge style based on compatibility status
 */
export function getEdgeStyleForStatus(
  status: EdgeCompatibilityStatus | undefined,
  baseStyle?: CSSProperties
): CSSProperties {
  const baseStroke = (baseStyle?.stroke as string) || '#666666';
  const baseWidth = (baseStyle?.strokeWidth as number) || 1.5;

  switch (status) {
    case 'incompatible':
      return {
        ...baseStyle,
        stroke: '#ef4444', // red-500
        strokeWidth: baseWidth + 0.5,
      };
    case 'warning':
      return {
        ...baseStyle,
        stroke: '#f59e0b', // amber-500
        strokeWidth: baseWidth + 0.5,
        strokeDasharray: '5,3',
      };
    case 'compatible':
    default:
      return {
        ...baseStyle,
        stroke: baseStroke,
        strokeWidth: baseWidth,
      };
  }
}

/**
 * Extended edge data for compatibility-aware edges
 */
export interface CompatibilityEdgeData {
  /** Compatibility status */
  compatibilityStatus?: EdgeCompatibilityStatus;
  /** Validation result with message */
  validation?: ConnectionValidation;
  /** Edge label */
  label?: string;
  /** Custom properties */
  [key: string]: unknown;
}

/**
 * Props for the CompatibilityEdge component
 */
export interface CompatibilityEdgeProps extends EdgeProps<CompatibilityEdgeData> {
  /** Path type for the edge */
  pathType?: 'bezier' | 'smoothstep';
}

/**
 * CompatibilityEdge - React Flow edge with compatibility feedback
 *
 * This component renders an edge with visual styling based on its
 * compatibility status (from notation rules). Incompatible edges
 * are shown in red, warnings in amber, and compatible in the default color.
 *
 * A tooltip is shown on hover for incompatible/warning edges explaining
 * the issue.
 *
 * @example
 * ```tsx
 * // In your React Flow configuration
 * const edgeTypes = {
 *   compatibility: CompatibilityEdge,
 * };
 *
 * // Usage with useEdgeCompatibility hook
 * const { edgeCompatibility } = useEdgeCompatibility({ nodes, edges, notationId });
 *
 * const styledEdges = edges.map(edge => {
 *   const compat = edgeCompatibility.find(ec => ec.edgeId === edge.id);
 *   return {
 *     ...edge,
 *     type: 'compatibility',
 *     data: {
 *       ...edge.data,
 *       compatibilityStatus: compat?.status,
 *       validation: compat?.validation,
 *     },
 *   };
 * });
 * ```
 */
export const CompatibilityEdge = memo(function CompatibilityEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  pathType = 'bezier',
}: CompatibilityEdgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const status = data?.compatibilityStatus;
  const validation = data?.validation;
  const label = data?.label;

  // Compute edge path
  const [edgePath, labelX, labelY] =
    pathType === 'smoothstep'
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        })
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        });

  // Apply compatibility styling
  const edgeStyle = getEdgeStyleForStatus(status, style as CSSProperties);

  // Show tooltip on hover for incompatible/warning edges
  const handleMouseEnter = useCallback(() => {
    if (status === 'incompatible' || status === 'warning') {
      setShowTooltip(true);
    }
  }, [status]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Visible edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
      />

      {/* Edge label with tooltip */}
      {(label || showTooltip) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <IncompatibilityTooltip
              status={status}
              validation={validation}
              show={showTooltip}
              position="top"
            >
              {label && (
                <div
                  style={{
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    border: `1px solid ${edgeStyle.stroke || '#666'}`,
                  }}
                >
                  {label}
                </div>
              )}
              {!label && showTooltip && (
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor:
                      status === 'incompatible' ? '#ef4444' : '#f59e0b',
                    borderRadius: '50%',
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              )}
            </IncompatibilityTooltip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default CompatibilityEdge;
