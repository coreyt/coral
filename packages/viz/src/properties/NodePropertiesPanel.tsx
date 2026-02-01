/**
 * NodePropertiesPanel Component
 *
 * A panel that displays and allows editing of node properties.
 * Shows node info (ID, type), basic properties (label, description),
 * and custom properties with type-appropriate input controls.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { CoralNode } from '../types.js';
import {
  extractPropertyFields,
  parsePropertyValue,
  type PropertyFieldMeta,
  type PropertyValue,
  type PropertyType,
} from './propertyUtils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Change event for property updates
 */
export interface PropertyChange {
  nodeId: string;
  field: 'label' | 'description' | 'property';
  propertyKey?: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Props for NodePropertiesPanel
 */
export interface NodePropertiesPanelProps {
  /** Currently selected node (null if none selected) */
  selectedNode: CoralNode | null;

  /** Callback when any property changes */
  onPropertyChange: (change: PropertyChange) => void;

  /** Callback to add a new custom property */
  onAddProperty?: (nodeId: string, key: string, value: PropertyValue) => void;

  /** Callback to remove a custom property */
  onRemoveProperty?: (nodeId: string, key: string) => void;

  /** Whether the panel is disabled (read-only mode) */
  disabled?: boolean;

  /** Panel width */
  width?: number | string;

  /** Show node ID (read-only info) */
  showNodeId?: boolean;

  /** Show node type (read-only info) */
  showNodeType?: boolean;

  /** Allow adding custom properties */
  allowAddProperties?: boolean;

  /** Allow removing custom properties */
  allowRemoveProperties?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const labelStyles: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: '#555',
  marginBottom: '4px',
  display: 'block',
};

const inputStyles: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  width: '100%',
  boxSizing: 'border-box',
};

const sectionHeaderStyles: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
  marginTop: '16px',
};

const formGroupStyles: React.CSSProperties = {
  marginBottom: '12px',
};

// ============================================================================
// PropertyInput Component
// ============================================================================

interface PropertyInputProps {
  meta: PropertyFieldMeta;
  onChange: (newValue: PropertyValue) => void;
  disabled?: boolean;
}

function PropertyInput({ meta, onChange, disabled }: PropertyInputProps): React.ReactElement {
  const { type, value, isEditable } = meta;

  // Non-editable types show as read-only
  if (!isEditable) {
    return (
      <div
        style={{
          padding: '6px 10px',
          fontSize: '12px',
          color: '#666',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          fontStyle: 'italic',
        }}
      >
        {type === 'object' ? '{...}' : type === 'array' ? '[...]' : String(value)}
      </div>
    );
  }

  // Boolean: checkbox
  if (type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    );
  }

  // Number: number input
  if (type === 'number') {
    return (
      <input
        type="number"
        value={value as number}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          onChange(isNaN(parsed) ? 0 : parsed);
        }}
        disabled={disabled}
        style={inputStyles}
      />
    );
  }

  // String (default): text input
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={inputStyles}
    />
  );
}

// ============================================================================
// NodePropertiesPanel Component
// ============================================================================

export function NodePropertiesPanel({
  selectedNode,
  onPropertyChange,
  onAddProperty,
  onRemoveProperty,
  disabled = false,
  width = 320,
  showNodeId = true,
  showNodeType = true,
  allowAddProperties = true,
  allowRemoveProperties = true,
}: NodePropertiesPanelProps): React.ReactElement {
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [newPropertyType, setNewPropertyType] = useState<'string' | 'number' | 'boolean'>('string');

  // Extract custom properties
  const customProperties = useMemo(
    () => extractPropertyFields(selectedNode?.data?.properties as Record<string, unknown>),
    [selectedNode?.data?.properties]
  );

  // Handle label change
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedNode) return;
      onPropertyChange({
        nodeId: selectedNode.id,
        field: 'label',
        oldValue: selectedNode.data.label,
        newValue: e.target.value,
      });
    },
    [selectedNode, onPropertyChange]
  );

  // Handle description change
  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!selectedNode) return;
      onPropertyChange({
        nodeId: selectedNode.id,
        field: 'description',
        oldValue: selectedNode.data.description,
        newValue: e.target.value,
      });
    },
    [selectedNode, onPropertyChange]
  );

  // Handle custom property change
  const handlePropertyValueChange = useCallback(
    (key: string, oldValue: unknown, newValue: PropertyValue) => {
      if (!selectedNode) return;
      onPropertyChange({
        nodeId: selectedNode.id,
        field: 'property',
        propertyKey: key,
        oldValue,
        newValue,
      });
    },
    [selectedNode, onPropertyChange]
  );

  // Handle add new property
  const handleAddProperty = useCallback(() => {
    if (!selectedNode || !newPropertyKey.trim() || !onAddProperty) return;

    let value: PropertyValue;
    switch (newPropertyType) {
      case 'number':
        value = parseFloat(newPropertyValue) || 0;
        break;
      case 'boolean':
        value = newPropertyValue === 'true';
        break;
      default:
        value = newPropertyValue;
    }

    onAddProperty(selectedNode.id, newPropertyKey.trim(), value);
    setNewPropertyKey('');
    setNewPropertyValue('');
  }, [selectedNode, newPropertyKey, newPropertyValue, newPropertyType, onAddProperty]);

  // Empty state
  if (!selectedNode) {
    return (
      <div
        style={{
          width,
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          padding: '16px',
        }}
      >
        <div
          style={{
            color: '#999',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          No node selected
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 600,
          fontSize: '14px',
        }}
      >
        Node Properties
      </div>

      {/* Content */}
      <div style={{ padding: '12px', maxHeight: '500px', overflowY: 'auto' }}>
        {/* Node Info Section (read-only) */}
        <div style={sectionHeaderStyles}>Node Info</div>

        {showNodeId && (
          <div style={{ ...formGroupStyles, display: 'flex', gap: '8px' }}>
            <span style={{ ...labelStyles, width: '50px', marginBottom: 0 }}>ID:</span>
            <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              {selectedNode.id}
            </span>
          </div>
        )}

        {showNodeType && (
          <div style={{ ...formGroupStyles, display: 'flex', gap: '8px' }}>
            <span style={{ ...labelStyles, width: '50px', marginBottom: 0 }}>Type:</span>
            <span style={{ fontSize: '12px', color: '#666' }}>{selectedNode.data.nodeType}</span>
          </div>
        )}

        {/* Basic Properties Section */}
        <div style={sectionHeaderStyles}>Basic Properties</div>

        <div style={formGroupStyles}>
          <label style={labelStyles}>Label</label>
          <input
            type="text"
            value={selectedNode.data.label}
            onChange={handleLabelChange}
            disabled={disabled}
            style={inputStyles}
          />
        </div>

        <div style={formGroupStyles}>
          <label style={labelStyles}>Description</label>
          <textarea
            value={selectedNode.data.description ?? ''}
            onChange={handleDescriptionChange}
            disabled={disabled}
            placeholder="Optional description..."
            rows={3}
            style={{
              ...inputStyles,
              resize: 'vertical',
              minHeight: '60px',
            }}
          />
        </div>

        {/* Custom Properties Section */}
        <div style={sectionHeaderStyles}>Custom Properties</div>

        {customProperties.length === 0 ? (
          <div
            style={{
              fontSize: '12px',
              color: '#999',
              fontStyle: 'italic',
              marginBottom: '12px',
            }}
          >
            No custom properties
          </div>
        ) : (
          <div style={{ marginBottom: '12px' }}>
            {customProperties.map((prop) => (
              <div
                key={prop.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    minWidth: '80px',
                    color: '#555',
                  }}
                >
                  {prop.key}
                </span>
                <div style={{ flex: 1 }}>
                  <PropertyInput
                    meta={prop}
                    onChange={(newValue) =>
                      handlePropertyValueChange(prop.key, prop.value, newValue)
                    }
                    disabled={disabled}
                  />
                </div>
                {allowRemoveProperties && onRemoveProperty && (
                  <button
                    type="button"
                    onClick={() => onRemoveProperty(selectedNode.id, prop.key)}
                    disabled={disabled}
                    style={{
                      padding: '4px 8px',
                      border: 'none',
                      background: 'transparent',
                      color: '#d32f2f',
                      cursor: disabled ? 'default' : 'pointer',
                      fontSize: '14px',
                    }}
                    title="Remove property"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Property Form */}
        {allowAddProperties && onAddProperty && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              marginTop: '8px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Property name"
                value={newPropertyKey}
                onChange={(e) => setNewPropertyKey(e.target.value)}
                disabled={disabled}
                style={{ ...inputStyles, flex: 1 }}
              />
              <select
                value={newPropertyType}
                onChange={(e) =>
                  setNewPropertyType(e.target.value as 'string' | 'number' | 'boolean')
                }
                disabled={disabled}
                style={{ ...inputStyles, width: '80px' }}
              >
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
            </div>
            {newPropertyType !== 'boolean' && (
              <input
                type={newPropertyType === 'number' ? 'number' : 'text'}
                placeholder="Value"
                value={newPropertyValue}
                onChange={(e) => setNewPropertyValue(e.target.value)}
                disabled={disabled}
                style={{ ...inputStyles, marginBottom: '8px' }}
              />
            )}
            {newPropertyType === 'boolean' && (
              <select
                value={newPropertyValue}
                onChange={(e) => setNewPropertyValue(e.target.value)}
                disabled={disabled}
                style={{ ...inputStyles, marginBottom: '8px' }}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            )}
            <button
              type="button"
              onClick={handleAddProperty}
              disabled={disabled || !newPropertyKey.trim()}
              style={{
                width: '100%',
                padding: '8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: newPropertyKey.trim() && !disabled ? '#1976d2' : '#ccc',
                color: '#fff',
                cursor: newPropertyKey.trim() && !disabled ? 'pointer' : 'default',
                fontSize: '13px',
              }}
            >
              + Add Property
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
