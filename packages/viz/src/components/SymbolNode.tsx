/**
 * SymbolNode - React Flow node component that renders symbols
 *
 * This component looks up the symbol and shape from registries
 * and renders them with proper styling and handles.
 *
 * Supports inline label editing via double-click.
 */

import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ShapeRenderer } from './ShapeRenderer';
import { symbolRegistry } from '../symbols';
import { shapeRegistry } from '../shapes';
import { useEditContext } from './EditContext';
import type { SymbolDefinition, SymbolPort, CoralNodeData } from '../types';

/**
 * Extended node data for symbol-aware rendering
 */
export interface SymbolNodeData extends CoralNodeData {
  /** Symbol ID (e.g., 'flowchart-process', 'arch-service') */
  symbolId?: string;
  /** Variant ID (e.g., 'start', 'end') */
  variant?: string;
  /** Override fill color */
  fill?: string;
  /** Override stroke color */
  stroke?: string;
  /** Override stroke width */
  strokeWidth?: number;
  /** Node width */
  width?: number;
  /** Node height */
  height?: number;
}

/**
 * Props passed to SymbolNode by React Flow
 */
interface SymbolNodeProps {
  id: string;
  data: SymbolNodeData;
  selected?: boolean;
}

/**
 * Map anchor direction to React Flow Position
 */
function anchorToPosition(anchor: string): Position {
  switch (anchor) {
    case 'NORTH':
      return Position.Top;
    case 'SOUTH':
      return Position.Bottom;
    case 'EAST':
      return Position.Right;
    case 'WEST':
      return Position.Left;
    default:
      return Position.Top;
  }
}

/**
 * Get port position offset based on port count and index
 */
function getPortOffset(port: SymbolPort, portIndex: number, totalPortsOnSide: number): string {
  if (port.position !== undefined) {
    return `${port.position * 100}%`;
  }
  // Distribute ports evenly
  const offset = ((portIndex + 1) / (totalPortsOnSide + 1)) * 100;
  return `${offset}%`;
}

/**
 * Get styling from symbol/variant defaults
 */
function getSymbolStyle(
  symbol: SymbolDefinition | undefined,
  variant?: string
): { fill: string; stroke: string; strokeWidth: number; strokeDasharray?: string } {
  const defaultStyle = {
    fill: '#ffffff',
    stroke: '#666666',
    strokeWidth: 2,
  };

  if (!symbol) {
    return defaultStyle;
  }

  // Start with symbol defaults
  const symbolDefaults = symbol.defaults || {};
  let style = {
    fill: (symbolDefaults.fill as string) || defaultStyle.fill,
    stroke: (symbolDefaults.stroke as string) || defaultStyle.stroke,
    strokeWidth: (symbolDefaults.strokeWidth as number) || defaultStyle.strokeWidth,
    strokeDasharray: symbolDefaults.strokeDasharray as string | undefined,
  };

  // Apply variant overrides
  if (variant && symbol.variants?.[variant]) {
    const variantDefaults = symbol.variants[variant].defaults || {};
    style = {
      ...style,
      fill: (variantDefaults.fill as string) || style.fill,
      stroke: (variantDefaults.stroke as string) || style.stroke,
      strokeWidth: (variantDefaults.strokeWidth as number) || style.strokeWidth,
      strokeDasharray: (variantDefaults.strokeDasharray as string) || style.strokeDasharray,
    };
  }

  return style;
}

/**
 * Get ports to render from symbol definition
 */
function getSymbolPorts(symbol: SymbolDefinition | undefined, variant?: string): SymbolPort[] {
  if (!symbol) {
    // Default ports
    return [
      { id: 'in', anchor: 'NORTH', direction: 'in' },
      { id: 'out', anchor: 'SOUTH', direction: 'out' },
    ];
  }

  // Check for variant-specific ports first
  if (variant && symbol.variants?.[variant]?.ports) {
    return symbol.variants[variant].ports!;
  }

  // Fall back to symbol ports
  if (symbol.ports && symbol.ports.length > 0) {
    return symbol.ports;
  }

  // Default ports
  return [
    { id: 'in', anchor: 'NORTH', direction: 'in' },
    { id: 'out', anchor: 'SOUTH', direction: 'out' },
  ];
}

/**
 * Fallback mapping from old node types to symbols
 */
const legacyTypeMapping: Record<string, string> = {
  service: 'arch-service',
  database: 'arch-database',
  module: 'flowchart-process',
  external_api: 'arch-external-api',
  actor: 'arch-actor',
  group: 'arch-container',
  process: 'flowchart-process',
  decision: 'flowchart-decision',
  terminal: 'flowchart-terminal',
  io: 'flowchart-io',
  document: 'flowchart-document',
};

/**
 * SymbolNode component - renders any symbol from the registry
 *
 * Supports inline label editing via double-click:
 * - Double-click to edit the label
 * - Press Enter or blur to save
 * - Press Escape to cancel
 */
export const SymbolNode = memo(function SymbolNode({ id, data, selected }: SymbolNodeProps) {
  // Edit context for label editing
  const { onLabelEdit, editingNodeId, startEditing, stopEditing } = useEditContext();
  const isEditing = editingNodeId === id;

  // Local state for edit value
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve symbol ID (support legacy types)
  const symbolId = data.symbolId || legacyTypeMapping[data.nodeType] || 'flowchart-process';

  // Look up symbol and shape
  const symbol = symbolRegistry.get(symbolId);
  const shape = symbol ? shapeRegistry.get(symbol.shape) : shapeRegistry.get('rectangle');

  // Get styling
  const baseStyle = getSymbolStyle(symbol, data.variant);
  const style = {
    fill: data.fill || baseStyle.fill,
    stroke: data.stroke || baseStyle.stroke,
    strokeWidth: data.strokeWidth || baseStyle.strokeWidth,
    strokeDasharray: baseStyle.strokeDasharray,
  };

  // Get dimensions
  const width = data.width || shape?.defaultSize?.width || 120;
  const height = data.height || shape?.defaultSize?.height || 60;

  // Get ports
  const ports = getSymbolPorts(symbol, data.variant);

  // Group ports by side for positioning
  const portsBySide = useMemo(() => {
    const grouped: Record<string, SymbolPort[]> = {};
    ports.forEach((port) => {
      const side = port.anchor;
      if (!grouped[side]) grouped[side] = [];
      grouped[side].push(port);
    });
    return grouped;
  }, [ports]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync edit value when data.label changes (external updates)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(data.label);
    }
  }, [data.label, isEditing]);

  // Handle double-click to start editing
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent React Flow from handling
      setEditValue(data.label);
      startEditing(id);
    },
    [id, data.label, startEditing]
  );

  // Handle save (Enter or blur)
  const handleSave = useCallback(() => {
    if (editValue.trim() !== data.label && onLabelEdit) {
      onLabelEdit(id, editValue.trim());
    }
    stopEditing();
  }, [id, editValue, data.label, onLabelEdit, stopEditing]);

  // Handle cancel (Escape)
  const handleCancel = useCallback(() => {
    setEditValue(data.label);
    stopEditing();
  }, [data.label, stopEditing]);

  // Handle key down events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        cursor: isEditing ? 'text' : 'grab',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Render the shape */}
      {shape && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <ShapeRenderer
            shape={shape}
            width={width}
            height={height}
            fill={style.fill}
            stroke={selected ? '#0066ff' : style.stroke}
            strokeWidth={selected ? style.strokeWidth + 1 : style.strokeWidth}
            strokeDasharray={style.strokeDasharray}
            parameters={symbol?.defaults as Record<string, number | string | boolean>}
          />
        </div>
      )}

      {/* Label overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px',
          boxSizing: 'border-box',
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'center',
              width: '100%',
              maxWidth: '100%',
              padding: '2px 4px',
              border: '1px solid #0066ff',
              borderRadius: '2px',
              outline: 'none',
              background: 'white',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'center',
              wordWrap: 'break-word',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.label}
          </div>
        )}
      </div>

      {/* Render handles for each port */}
      {ports.map((port, idx) => {
        const portsOnSide = portsBySide[port.anchor] || [];
        const indexOnSide = portsOnSide.indexOf(port);
        const offset = getPortOffset(port, indexOnSide, portsOnSide.length);

        const position = anchorToPosition(port.anchor);
        const isVertical = position === Position.Top || position === Position.Bottom;

        const handleStyle: React.CSSProperties = {
          position: 'absolute',
          ...(isVertical
            ? { left: offset, transform: 'translateX(-50%)' }
            : { top: offset, transform: 'translateY(-50%)' }),
        };

        // Handle type based on direction
        const handleType =
          port.direction === 'in'
            ? 'target'
            : port.direction === 'out'
              ? 'source'
              : undefined; // inout gets both

        if (port.direction === 'inout') {
          // Render both source and target for bidirectional ports
          return (
            <div key={port.id}>
              <Handle
                type="target"
                position={position}
                id={`${port.id}-in`}
                style={{
                  ...handleStyle,
                  background: '#555',
                  width: 8,
                  height: 8,
                }}
              />
              <Handle
                type="source"
                position={position}
                id={`${port.id}-out`}
                style={{
                  ...handleStyle,
                  background: '#555',
                  width: 8,
                  height: 8,
                }}
              />
            </div>
          );
        }

        return (
          <Handle
            key={port.id}
            type={handleType!}
            position={position}
            id={port.id}
            style={{
              ...handleStyle,
              background: '#555',
              width: 8,
              height: 8,
            }}
          />
        );
      })}
    </div>
  );
});

export default SymbolNode;
