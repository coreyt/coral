/**
 * Inspector Component
 *
 * Right sidebar showing node properties, symbol ID, and annotations.
 */

import { useState, useCallback } from 'react';
import type { InspectorNodeData, NodeAnnotation, SymbolId } from '../../types';

export interface InspectorProps {
  /** Selected node data (null if nothing selected) */
  node: InspectorNodeData | null;

  /** Called when annotation is updated */
  onAnnotationChange?: (symbolId: SymbolId, annotation: Partial<NodeAnnotation>) => void;

  /** Called when "View Code" is clicked */
  onViewCode?: (file: string, line?: number) => void;

  /** Called when "View References" is clicked */
  onViewReferences?: (symbolId: SymbolId) => void;

  /** Called when "View Dependencies" is clicked */
  onViewDependencies?: (symbolId: SymbolId) => void;

  /** Called when "View Usages" is clicked */
  onViewUsages?: (symbolId: SymbolId) => void;
}

export function Inspector({
  node,
  onAnnotationChange,
  onViewCode,
  onViewReferences,
  onViewDependencies,
  onViewUsages,
}: InspectorProps) {
  const [symbolIdExpanded, setSymbolIdExpanded] = useState(false);
  const [noteText, setNoteText] = useState(node?.annotation?.note ?? '');

  // Handle note change
  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNoteText(e.target.value);
  }, []);

  const handleNoteBlur = useCallback(() => {
    if (node && onAnnotationChange) {
      onAnnotationChange(node.symbolId, { note: noteText });
    }
  }, [node, noteText, onAnnotationChange]);

  // Copy symbol ID to clipboard
  const copySymbolId = useCallback(() => {
    if (node) {
      navigator.clipboard.writeText(node.symbolId);
    }
  }, [node]);

  // Empty state
  if (!node) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted, #666)',
          fontSize: '13px',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        Select a node to view its properties
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontSize: '13px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid var(--border-color, #e0e0e0)',
          backgroundColor: 'var(--header-bg, #f5f5f5)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '14px' }}>{node.name}</div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Identity section */}
        <InspectorSection title="Identity">
          <PropertyRow label="Type" value={node.type} />
          <PropertyRow label="File" value={node.file} />
          {node.startLine !== undefined && (
            <PropertyRow
              label="Lines"
              value={node.endLine !== undefined
                ? `${node.startLine}-${node.endLine}`
                : `${node.startLine}`
              }
            />
          )}
          {node.signature && (
            <PropertyRow label="Signature" value={node.signature} mono />
          )}
        </InspectorSection>

        {/* Symbol ID section (collapsible) */}
        <InspectorSection
          title="Symbol ID"
          collapsible
          expanded={symbolIdExpanded}
          onToggle={() => setSymbolIdExpanded(!symbolIdExpanded)}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              backgroundColor: 'var(--code-bg, #f5f5f5)',
              padding: '8px',
              borderRadius: '4px',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {node.symbolId}
          </div>
          <button
            onClick={copySymbolId}
            style={{
              marginTop: '8px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Copy to Clipboard
          </button>
        </InspectorSection>

        {/* Actions section */}
        <InspectorSection title="Actions">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}
          >
            <ActionButton
              label="Code"
              onClick={() => onViewCode?.(node.file, node.startLine)}
            />
            <ActionButton
              label="Refs"
              onClick={() => onViewReferences?.(node.symbolId)}
            />
            <ActionButton
              label="Deps"
              onClick={() => onViewDependencies?.(node.symbolId)}
            />
            <ActionButton
              label="Uses"
              onClick={() => onViewUsages?.(node.symbolId)}
            />
          </div>
        </InspectorSection>

        {/* Annotations section */}
        <InspectorSection title="Annotations">
          <div style={{ marginBottom: '8px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--text-muted, #666)',
              }}
            >
              Note
            </label>
            <textarea
              value={noteText}
              onChange={handleNoteChange}
              onBlur={handleNoteBlur}
              placeholder="Add a note..."
              style={{
                width: '100%',
                minHeight: '60px',
                padding: '8px',
                fontSize: '12px',
                border: '1px solid var(--border-color, #e0e0e0)',
                borderRadius: '4px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--text-muted, #666)',
              }}
            >
              Tags
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {(node.annotation?.tags ?? []).map(tag => (
                <span
                  key={tag}
                  style={{
                    padding: '2px 8px',
                    backgroundColor: 'var(--tag-bg, #e0e0e0)',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                >
                  {tag}
                </span>
              ))}
              <button
                style={{
                  padding: '2px 8px',
                  border: '1px dashed var(--border-color, #ccc)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted, #666)',
                }}
              >
                + Add Tag
              </button>
            </div>
          </div>
        </InspectorSection>

        {/* Docstring section (if available) */}
        {node.docstring && (
          <InspectorSection title="Documentation">
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted, #666)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {node.docstring}
            </div>
          </InspectorSection>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Inspector Section
// ============================================================================

interface InspectorSectionProps {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

function InspectorSection({
  title,
  children,
  collapsible = false,
  expanded = true,
  onToggle,
}: InspectorSectionProps) {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-color, #e0e0e0)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          color: 'var(--text-muted, #666)',
          backgroundColor: 'var(--section-header-bg, #fafafa)',
          cursor: collapsible ? 'pointer' : 'default',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        onClick={collapsible ? onToggle : undefined}
      >
        <span>{title}</span>
        {collapsible && (
          <span style={{ fontSize: '10px' }}>{expanded ? '▾' : '▸'}</span>
        )}
      </div>
      {(!collapsible || expanded) && (
        <div style={{ padding: '12px' }}>{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// Property Row
// ============================================================================

interface PropertyRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function PropertyRow({ label, value, mono }: PropertyRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '4px',
        fontSize: '12px',
      }}
    >
      <span style={{ color: 'var(--text-muted, #666)' }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? 'monospace' : 'inherit',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Action Button
// ============================================================================

interface ActionButtonProps {
  label: string;
  onClick?: () => void;
}

function ActionButton({ label, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 8px',
        fontSize: '12px',
        cursor: 'pointer',
        border: '1px solid var(--border-color, #e0e0e0)',
        borderRadius: '4px',
        background: 'var(--button-bg, white)',
      }}
    >
      {label}
    </button>
  );
}
