/**
 * IncompatibilityTooltip Component (CORAL-REQ-010)
 *
 * Displays a tooltip explaining why an edge connection is incompatible
 * or has a warning based on notation rules.
 */

import { useState, useCallback, type CSSProperties, type ReactNode } from 'react';
import type { ConnectionValidation, EdgeCompatibilityStatus } from '../types';

/**
 * Props for the IncompatibilityTooltip component
 */
export interface IncompatibilityTooltipProps {
  /** Validation result from edge compatibility check */
  validation?: ConnectionValidation;
  /** Compatibility status */
  status?: EdgeCompatibilityStatus;
  /** Child element that triggers the tooltip on hover */
  children: ReactNode;
  /** Position of tooltip relative to trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Custom styles for the tooltip */
  style?: CSSProperties;
  /** Whether to show the tooltip (controlled mode) */
  show?: boolean;
  /** Callback when tooltip visibility changes */
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * Default styles for the tooltip container
 */
const defaultTooltipStyle: CSSProperties = {
  position: 'absolute',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 500,
  maxWidth: '250px',
  zIndex: 1000,
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  whiteSpace: 'normal',
  lineHeight: 1.4,
};

/**
 * Get position styles based on position prop
 */
function getPositionStyles(position: 'top' | 'bottom' | 'left' | 'right'): CSSProperties {
  switch (position) {
    case 'top':
      return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' };
    case 'bottom':
      return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' };
    case 'left':
      return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' };
    case 'right':
      return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' };
  }
}

/**
 * Get background color based on status
 */
function getBackgroundColor(status: EdgeCompatibilityStatus | undefined): string {
  switch (status) {
    case 'incompatible':
      return '#fee2e2'; // red-100
    case 'warning':
      return '#fef3c7'; // amber-100
    case 'compatible':
      return '#d1fae5'; // green-100
    default:
      return '#f3f4f6'; // gray-100
  }
}

/**
 * Get border color based on status
 */
function getBorderColor(status: EdgeCompatibilityStatus | undefined): string {
  switch (status) {
    case 'incompatible':
      return '#ef4444'; // red-500
    case 'warning':
      return '#f59e0b'; // amber-500
    case 'compatible':
      return '#10b981'; // green-500
    default:
      return '#9ca3af'; // gray-400
  }
}

/**
 * Get text color based on status
 */
function getTextColor(status: EdgeCompatibilityStatus | undefined): string {
  switch (status) {
    case 'incompatible':
      return '#991b1b'; // red-800
    case 'warning':
      return '#92400e'; // amber-800
    case 'compatible':
      return '#065f46'; // green-800
    default:
      return '#374151'; // gray-700
  }
}

/**
 * Get status label
 */
function getStatusLabel(status: EdgeCompatibilityStatus | undefined): string {
  switch (status) {
    case 'incompatible':
      return 'Incompatible Connection';
    case 'warning':
      return 'Warning';
    case 'compatible':
      return 'Compatible';
    default:
      return 'Unknown Status';
  }
}

/**
 * IncompatibilityTooltip - Shows a tooltip explaining edge compatibility issues
 *
 * @example
 * ```tsx
 * <IncompatibilityTooltip
 *   validation={edgeValidation}
 *   status="incompatible"
 *   position="top"
 * >
 *   <div className="edge-label">My Edge</div>
 * </IncompatibilityTooltip>
 * ```
 */
export function IncompatibilityTooltip({
  validation,
  status,
  children,
  position = 'top',
  style,
  show: controlledShow,
  onVisibilityChange,
}: IncompatibilityTooltipProps): JSX.Element {
  const [internalShow, setInternalShow] = useState(false);

  const isControlled = controlledShow !== undefined;
  const isVisible = isControlled ? controlledShow : internalShow;

  const handleMouseEnter = useCallback(() => {
    if (!isControlled) {
      setInternalShow(true);
    }
    onVisibilityChange?.(true);
  }, [isControlled, onVisibilityChange]);

  const handleMouseLeave = useCallback(() => {
    if (!isControlled) {
      setInternalShow(false);
    }
    onVisibilityChange?.(false);
  }, [isControlled, onVisibilityChange]);

  // Don't show tooltip for compatible edges unless explicitly requested
  const shouldShow = isVisible && (status !== 'compatible' || validation?.hasWarning);

  // Get the message to display
  const message = validation?.message || 'Unknown issue with this connection';
  const statusLabel = getStatusLabel(status);

  const tooltipStyle: CSSProperties = {
    ...defaultTooltipStyle,
    ...getPositionStyles(position),
    backgroundColor: getBackgroundColor(status),
    border: `1px solid ${getBorderColor(status)}`,
    color: getTextColor(status),
    ...style,
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {shouldShow && (
        <div style={tooltipStyle} role="tooltip">
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{statusLabel}</div>
          <div>{message}</div>
        </div>
      )}
    </div>
  );
}

export default IncompatibilityTooltip;
