/**
 * Custom Node Components for Coral Editor
 *
 * Each node type gets a distinct visual style.
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CoralNodeProps } from '../types.js';

/**
 * Base node wrapper with common styling
 */
interface NodeWrapperProps {
  children: React.ReactNode;
  selected?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const NodeWrapper: React.FC<NodeWrapperProps> = ({
  children,
  selected,
  className = '',
  style = {},
}) => (
  <div
    className={`coral-node ${className} ${selected ? 'selected' : ''}`}
    style={{
      padding: '10px 15px',
      borderRadius: '4px',
      border: selected ? '2px solid #1a73e8' : '1px solid #ccc',
      backgroundColor: '#fff',
      boxShadow: selected ? '0 0 0 2px rgba(26, 115, 232, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
      minWidth: '100px',
      textAlign: 'center',
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * Service Node - rectangular with rounded corners
 */
export const ServiceNode = memo(({ data, selected }: CoralNodeProps) => (
  <NodeWrapper
    selected={selected}
    className="coral-node-service"
    style={{
      backgroundColor: '#e3f2fd',
      borderColor: selected ? '#1a73e8' : '#90caf9',
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: 500 }}>{data.label}</div>
    {data.description && (
      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
        {data.description}
      </div>
    )}
    <Handle type="source" position={Position.Bottom} />
  </NodeWrapper>
));
ServiceNode.displayName = 'ServiceNode';

/**
 * Database Node - cylinder-like appearance
 */
export const DatabaseNode = memo(({ data, selected }: CoralNodeProps) => (
  <NodeWrapper
    selected={selected}
    className="coral-node-database"
    style={{
      backgroundColor: '#fff3e0',
      borderColor: selected ? '#1a73e8' : '#ffb74d',
      borderRadius: '8px',
      position: 'relative',
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div
      style={{
        position: 'absolute',
        top: '-8px',
        left: '10%',
        right: '10%',
        height: '16px',
        backgroundColor: '#fff3e0',
        borderRadius: '50%',
        border: selected ? '2px solid #1a73e8' : '1px solid #ffb74d',
        borderBottom: 'none',
      }}
    />
    <div style={{ fontWeight: 500, marginTop: '8px' }}>{data.label}</div>
    <Handle type="source" position={Position.Bottom} />
  </NodeWrapper>
));
DatabaseNode.displayName = 'DatabaseNode';

/**
 * External API Node - cloud-like appearance
 */
export const ExternalApiNode = memo(({ data, selected }: CoralNodeProps) => (
  <NodeWrapper
    selected={selected}
    className="coral-node-external-api"
    style={{
      backgroundColor: '#fce4ec',
      borderColor: selected ? '#1a73e8' : '#f48fb1',
      borderStyle: 'dashed',
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: 500 }}>{data.label}</div>
    <div style={{ fontSize: '10px', color: '#888' }}>External</div>
    <Handle type="source" position={Position.Bottom} />
  </NodeWrapper>
));
ExternalApiNode.displayName = 'ExternalApiNode';

/**
 * Actor Node - stick figure / person shape
 */
export const ActorNode = memo(({ data, selected }: CoralNodeProps) => (
  <NodeWrapper
    selected={selected}
    className="coral-node-actor"
    style={{
      backgroundColor: '#e8f5e9',
      borderColor: selected ? '#1a73e8' : '#81c784',
      borderRadius: '50%',
      width: '80px',
      height: '80px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div style={{ fontSize: '24px' }}>👤</div>
    <div style={{ fontWeight: 500, fontSize: '12px' }}>{data.label}</div>
    <Handle type="source" position={Position.Bottom} />
  </NodeWrapper>
));
ActorNode.displayName = 'ActorNode';

/**
 * Module Node - smaller, component-like
 */
export const ModuleNode = memo(({ data, selected }: CoralNodeProps) => (
  <NodeWrapper
    selected={selected}
    className="coral-node-module"
    style={{
      backgroundColor: '#f3e5f5',
      borderColor: selected ? '#1a73e8' : '#ce93d8',
      padding: '6px 12px',
      fontSize: '13px',
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: 500 }}>{data.label}</div>
    <Handle type="source" position={Position.Bottom} />
  </NodeWrapper>
));
ModuleNode.displayName = 'ModuleNode';

/**
 * Group Node - container for other nodes
 */
export const GroupNode = memo(({ data, selected }: CoralNodeProps) => (
  <div
    className={`coral-node-group ${selected ? 'selected' : ''}`}
    style={{
      padding: '10px',
      borderRadius: '8px',
      border: selected ? '2px dashed #1a73e8' : '2px dashed #bdbdbd',
      backgroundColor: 'rgba(245, 245, 245, 0.5)',
      minWidth: '200px',
      minHeight: '150px',
    }}
  >
    <div
      style={{
        fontWeight: 600,
        fontSize: '14px',
        color: '#616161',
        marginBottom: '10px',
        paddingBottom: '5px',
        borderBottom: '1px solid #e0e0e0',
      }}
    >
      {data.label}
    </div>
    {data.childCount !== undefined && data.childCount > 0 && (
      <div style={{ fontSize: '11px', color: '#9e9e9e' }}>
        {data.childCount} items
      </div>
    )}
  </div>
));
GroupNode.displayName = 'GroupNode';

/**
 * Node type registry for React Flow
 */
export const nodeTypes = {
  coralService: ServiceNode,
  coralDatabase: DatabaseNode,
  coralExternalApi: ExternalApiNode,
  coralActor: ActorNode,
  coralModule: ModuleNode,
  coralGroup: GroupNode,
};
