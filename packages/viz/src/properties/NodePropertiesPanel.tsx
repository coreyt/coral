/**
 * NodePropertiesPanel Component
 *
 * A panel that displays and allows editing of node properties.
 * Shows node info (ID, type), basic properties (label, description),
 * and custom properties with type-appropriate input controls.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Classifier, ClassifierCompartment, ClassifierKind } from '@graph-ir/core';
import {
  formatUmlMember,
  parseCoralUmlMember,
  type UmlMember,
  type UmlMemberKind,
} from '@coral-viz/language';
import type { CoralNode } from '../types.js';
import {
  extractPropertyFields,
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
  field: 'label' | 'description' | 'property' | 'classifier';
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

  /** Timing-independent transaction boundaries for draft fields. */
  onEditSessionStart?: (field: string) => void;
  onEditSessionEnd?: (field: string) => void;
  onEditSessionCancel?: (field: string) => void;

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
  const [draft, setDraft] = useState(String(value ?? ''));
  const skipBlur = useRef(false);
  useEffect(() => setDraft(String(value ?? '')), [value]);
  const commitDraft = () => {
    if (skipBlur.current) { skipBlur.current = false; return; }
    if (type === 'number') {
      const parsed = Number(draft);
      if (draft.trim() === '' || !Number.isFinite(parsed)) { setDraft(String(value ?? '')); return; }
      if (parsed !== value) onChange(parsed);
    } else if (draft !== String(value ?? '')) onChange(draft);
  };
  const handleDraftKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitDraft();
      skipBlur.current = true;
      event.currentTarget.blur();
    }
    else if (event.key === 'Escape') {
      skipBlur.current = true;
      setDraft(String(value ?? ''));
      event.currentTarget.blur();
    }
  };

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
        aria-label={`Property ${meta.key}`}
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
        aria-label={`Property ${meta.key}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleDraftKey}
        disabled={disabled}
        style={inputStyles}
      />
    );
  }

  // String (default): text input
  return (
    <input
      type="text"
      aria-label={`Property ${meta.key}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={handleDraftKey}
      disabled={disabled}
      style={inputStyles}
    />
  );
}

function ClassifierMemberInput({
  member, compartment, ordinal, disabled, onCommit,
}: {
  member: UmlMember;
  compartment: UmlMemberKind;
  ordinal: number;
  disabled: boolean;
  onCommit: (member: UmlMember) => string | undefined;
}): React.ReactElement {
  const canonical = useMemo(
    () => formatUmlMember(member, `${member.kind}-${ordinal}`),
    [member, ordinal],
  );
  const [draft, setDraft] = useState(canonical);
  const [error, setError] = useState<string>();
  const skipBlur = useRef(false);
  useEffect(() => { setDraft(canonical); setError(undefined); }, [canonical]);
  const commit = () => {
    if (skipBlur.current) { skipBlur.current = false; return; }
    const parsed = parseCoralUmlMember(draft.trim(), compartment, ordinal);
    if (!parsed.value) { setError(parsed.error ?? 'Invalid UML member'); return; }
    const conflict = onCommit(parsed.value);
    if (conflict) { setError(conflict); return; }
    setError(undefined);
  };
  return (
    <div style={{ flex: 1 }}>
      <input
        type="text"
        aria-label={`${compartment} ${ordinal} member`}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setError(undefined); }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            skipBlur.current = true;
            setDraft(canonical);
            setError(undefined);
            event.currentTarget.blur();
          }
        }}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        style={inputStyles}
      />
      {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '11px' }}>{error}</div>}
    </div>
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
  onEditSessionStart,
  onEditSessionEnd,
  onEditSessionCancel,
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
  const [labelDraft, setLabelDraft] = useState(selectedNode?.data.label ?? '');
  const [labelError, setLabelError] = useState<string>();
  const [descriptionDraft, setDescriptionDraft] = useState(selectedNode?.data.description ?? '');
  const cancelledBlur = useRef<string | null>(null);
  useEffect(() => {
    setLabelDraft(selectedNode?.data.label ?? '');
    setLabelError(undefined);
    setDescriptionDraft(selectedNode?.data.description ?? '');
  }, [selectedNode?.id, selectedNode?.data.label, selectedNode?.data.description]);

  // Extract custom properties
  const customProperties = useMemo(
    () => extractPropertyFields(selectedNode?.data?.properties as Record<string, unknown>),
    [selectedNode?.data?.properties]
  );
  const classifier = selectedNode?.data.canonical?.classifier;
  const updateClassifier = useCallback((next: Classifier) => {
    if (!selectedNode || !classifier) return;
    onPropertyChange({
      nodeId: selectedNode.id,
      field: 'classifier',
      oldValue: classifier,
      newValue: next,
    });
  }, [classifier, onPropertyChange, selectedNode]);

  const changeClassifierKind = useCallback((kind: ClassifierKind) => {
    if (!classifier || kind === classifier.kind) return;
    const incompatible = classifier.compartments.some((part) => kind === 'enum'
      ? part.kind === 'attributes'
      : part.kind === 'literals')
      || kind === 'interface' && Boolean(classifier.modifiers?.includes('static'))
      || kind === 'enum' && Boolean(classifier.modifiers?.length);
    if (incompatible) return;
    const members = classifier.compartments.filter((part) => part.kind !== 'name');
    updateClassifier({
      ...classifier,
      kind,
      compartments: [
        { id: 'name', kind: 'name' },
        ...members,
        ...(kind === 'enum' && !members.some((part) => part.kind === 'literals')
          ? [{ id: 'literals', kind: 'literals' as const, items: [] }]
          : !members.length ? [{ id: 'attributes', kind: 'attributes' as const, items: [] }] : []),
      ] as ClassifierCompartment[],
    });
  }, [classifier, updateClassifier]);

  const changeClassifierModifier = useCallback((modifier: 'abstract' | 'static', checked: boolean) => {
    if (!classifier) return;
    const modifiers = (classifier.modifiers ?? []).filter((value) => value !== modifier);
    if (checked) modifiers.push(modifier);
    modifiers.sort((left, right) => ['abstract', 'static'].indexOf(left) - ['abstract', 'static'].indexOf(right));
    updateClassifier({ ...classifier, ...(modifiers.length ? { modifiers } : { modifiers: undefined }) });
  }, [classifier, updateClassifier]);

  const replaceCompartment = useCallback((next: ClassifierCompartment) => {
    if (!classifier) return;
    updateClassifier({
      ...classifier,
      compartments: classifier.compartments.map((part) => part.id === next.id ? next : part),
    });
  }, [classifier, updateClassifier]);

  const replaceClassifierMember = useCallback((
    part: Exclude<ClassifierCompartment, { kind: 'name' }>, index: number, member: UmlMember,
  ): string | undefined => {
    if (!classifier) return 'No classifier is selected';
    const collision = classifier.compartments.some((candidate) => candidate.id === member.id
      || ('items' in candidate && candidate.items.some((item, candidateIndex) =>
        item.id === member.id && !(candidate.id === part.id && candidateIndex === index))));
    if (!member.id || collision) return member.id
      ? `Classifier identity "${member.id}" is already used`
      : 'Classifier member id must not be empty';
    replaceCompartment({
      ...part,
      items: part.items.map((candidate, itemIndex) => itemIndex === index ? member : candidate),
    } as ClassifierCompartment);
    return undefined;
  }, [classifier, replaceCompartment]);

  const addClassifierMember = useCallback((kind: 'attributes' | 'operations' | 'literals') => {
    if (!classifier) return;
    const existing = classifier.compartments.find((part) => part.kind === kind);
    const prefix = kind === 'attributes' ? 'attribute' : kind === 'operations' ? 'operation' : 'literal';
    const used = new Set(classifier.compartments.flatMap((part) => [
      part.id, ...('items' in part ? part.items.map((item) => item.id) : []),
    ]));
    let ordinal = 1;
    while (used.has(`${prefix}-${ordinal}`)) ordinal++;
    const item = kind === 'attributes'
      ? { id: `attribute-${ordinal}`, kind: 'attribute' as const, name: `attribute${ordinal}` }
      : kind === 'operations'
        ? { id: `operation-${ordinal}`, kind: 'operation' as const, name: `operation${ordinal}`, parameters: [] }
        : { id: `literal-${ordinal}`, kind: 'literal' as const, name: `VALUE_${ordinal}` };
    if (existing && 'items' in existing) {
      replaceCompartment({ ...existing, items: [...existing.items, item] } as ClassifierCompartment);
      return;
    }
    updateClassifier({
      ...classifier,
      compartments: [...classifier.compartments, { id: kind, kind, items: [item] } as ClassifierCompartment],
    });
  }, [classifier, replaceCompartment, updateClassifier]);

  // Handle label change
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLabelDraft(e.target.value);
      setLabelError(undefined);
    },
    []
  );
  const commitLabel = useCallback(() => {
    if (!selectedNode || cancelledBlur.current === 'label') { cancelledBlur.current = null; return; }
    if (classifier && !labelDraft.trim()) {
      setLabelError('UML classifier names must not be empty');
      return;
    }
    if (labelDraft !== selectedNode.data.label) onPropertyChange({
      nodeId: selectedNode.id, field: 'label', oldValue: selectedNode.data.label, newValue: labelDraft,
    });
  }, [classifier, labelDraft, onPropertyChange, selectedNode]);

  // Handle description change
  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescriptionDraft(e.target.value);
    },
    []
  );
  const commitDescription = useCallback(() => {
    if (!selectedNode || cancelledBlur.current === 'description') { cancelledBlur.current = null; return; }
    if (descriptionDraft !== (selectedNode.data.description ?? '')) onPropertyChange({
      nodeId: selectedNode.id, field: 'description', oldValue: selectedNode.data.description, newValue: descriptionDraft,
    });
  }, [descriptionDraft, onPropertyChange, selectedNode]);

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
            aria-label="Node label"
            value={labelDraft}
            onChange={handleLabelChange}
            onFocus={() => onEditSessionStart?.('label')}
            onBlur={() => { commitLabel(); onEditSessionEnd?.('label'); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitLabel();
                cancelledBlur.current = 'label';
                onEditSessionEnd?.('label');
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                cancelledBlur.current = 'label';
                setLabelDraft(selectedNode.data.label);
                onEditSessionCancel?.('label');
                event.currentTarget.blur();
              }
            }}
            disabled={disabled}
            aria-invalid={labelError ? true : undefined}
            style={inputStyles}
          />
          {labelError && <div role="alert" style={{ color: '#b91c1c', fontSize: '11px' }}>{labelError}</div>}
        </div>

        <div style={formGroupStyles}>
          <label style={labelStyles}>Description</label>
          <textarea
            aria-label="Node description"
            value={descriptionDraft}
            onChange={handleDescriptionChange}
            onFocus={() => onEditSessionStart?.('description')}
            onBlur={() => { commitDescription(); onEditSessionEnd?.('description'); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                cancelledBlur.current = 'description';
                setDescriptionDraft(selectedNode.data.description ?? '');
                onEditSessionCancel?.('description');
                event.currentTarget.blur();
              }
            }}
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

        {classifier && (
          <div data-coral-classifier-editor>
            <div style={sectionHeaderStyles}>UML Classifier</div>
            <div style={formGroupStyles}>
              <label style={labelStyles}>Kind</label>
              <select
                aria-label="Classifier kind"
                value={classifier.kind}
                onChange={(event) => changeClassifierKind(event.target.value as ClassifierKind)}
                disabled={disabled}
                style={inputStyles}
              >
                {(['class', 'interface', 'enum'] as const).map((kind) => {
                  const incompatible = classifier.compartments.some((part) => kind === 'enum'
                    ? part.kind === 'attributes'
                    : part.kind === 'literals')
                    || kind === 'interface' && Boolean(classifier.modifiers?.includes('static'))
                    || kind === 'enum' && Boolean(classifier.modifiers?.length);
                  return <option key={kind} value={kind} disabled={incompatible}>{kind}</option>;
                })}
              </select>
              <div style={{ color: '#666', fontSize: '11px' }}>
                Kind choices that would discard compartments or modifiers are disabled.
              </div>
            </div>
            <div style={{ ...formGroupStyles, display: 'flex', gap: '12px' }}>
              {(['abstract', 'static'] as const).map((modifier) => (
                <label key={modifier} style={{ ...labelStyles, display: 'flex', gap: '4px' }}>
                  <input
                    type="checkbox"
                    aria-label={`Classifier ${modifier}`}
                    checked={classifier.modifiers?.includes(modifier) ?? false}
                    onChange={(event) => changeClassifierModifier(modifier, event.target.checked)}
                    disabled={disabled || classifier.kind === 'enum'
                      || (modifier === 'static' && classifier.kind === 'interface')}
                  />
                  {modifier}
                </label>
              ))}
            </div>
            {classifier.compartments.filter((part) => part.kind !== 'name').map((part) => (
              <div key={part.id} style={formGroupStyles}>
                <label style={labelStyles}>{part.kind}</label>
                {part.items.map((item, index) => (
                  <div key={item.id} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <ClassifierMemberInput
                      member={item}
                      compartment={part.kind}
                      ordinal={index + 1}
                      disabled={disabled}
                      onCommit={(member) => replaceClassifierMember(part, index, member)}
                    />
                    <button type="button" aria-label={`Move ${item.name} up`} disabled={disabled || index === 0} onClick={() => {
                      const items = [...part.items];
                      [items[index - 1], items[index]] = [items[index], items[index - 1]];
                      replaceCompartment({ ...part, items } as ClassifierCompartment);
                    }}>↑</button>
                    <button type="button" aria-label={`Move ${item.name} down`} disabled={disabled || index === part.items.length - 1} onClick={() => {
                      const items = [...part.items];
                      [items[index], items[index + 1]] = [items[index + 1], items[index]];
                      replaceCompartment({ ...part, items } as ClassifierCompartment);
                    }}>↓</button>
                    <button type="button" aria-label={`Remove ${item.name}`} disabled={disabled} onClick={() => replaceCompartment({
                      ...part, items: part.items.filter((_, itemIndex) => itemIndex !== index),
                    } as ClassifierCompartment)}>×</button>
                  </div>
                ))}
                <button type="button" disabled={disabled} onClick={() => addClassifierMember(part.kind)}>
                  Add {part.kind === 'literals' ? 'literal' : part.kind === 'operations' ? 'operation' : 'attribute'}
                </button>
              </div>
            ))}
            {!classifier.compartments.some((part) => part.kind === 'operations') && (
              <button type="button" disabled={disabled} onClick={() => addClassifierMember('operations')}>Add operation</button>
            )}
            {classifier.kind !== 'enum' && !classifier.compartments.some((part) => part.kind === 'attributes') && (
              <button type="button" disabled={disabled} onClick={() => addClassifierMember('attributes')}>Add attribute</button>
            )}
          </div>
        )}

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
                  <div
                    onFocusCapture={() => onEditSessionStart?.(`property:${prop.key}`)}
                    onBlurCapture={() => onEditSessionEnd?.(`property:${prop.key}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onEditSessionEnd?.(`property:${prop.key}`);
                      else if (event.key === 'Escape') onEditSessionCancel?.(`property:${prop.key}`);
                    }}
                  >
                    <PropertyInput
                      meta={prop}
                      onChange={(newValue) =>
                        handlePropertyValueChange(prop.key, prop.value, newValue)
                      }
                      disabled={disabled}
                    />
                  </div>
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
                    aria-label={`Remove property ${prop.key}`}
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
                aria-label="New property name"
                placeholder="Property name"
                value={newPropertyKey}
                onChange={(e) => setNewPropertyKey(e.target.value)}
                disabled={disabled}
                style={{ ...inputStyles, flex: 1 }}
              />
              <select
                aria-label="New property type"
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
                aria-label="New property value"
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
                aria-label="New property value"
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
