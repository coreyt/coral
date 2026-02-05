/**
 * AnnotationPanel Component
 *
 * UI for managing node/edge annotations, tags, and orphaned annotations.
 * Issue #23: CCD-REQ-006 Annotation Panel UI
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AnnotationStore,
  NodeAnnotation,
  TagDefinition,
} from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface SelectedNode {
  id: string;
  symbolId: string;
  label: string;
  type: string;
  file?: string;
  lines?: { start: number; end: number };
}

export interface AnnotationPanelProps {
  /** Currently selected node */
  selectedNode: SelectedNode | null;
  /** Annotations store */
  annotations: AnnotationStore;
  /** Callback when annotation changes */
  onAnnotationChange: (symbolId: string, annotation: Partial<NodeAnnotation>) => void;
  /** Callback when tag is added */
  onTagAdd: (tag: TagDefinition) => void;
  /** Callback when tag is removed from store */
  onTagRemove: (tagId: string) => void;
  /** Callback when orphan is relinked */
  onOrphanRelink: (originalSymbolId: string, newSymbolId: string) => void;
  /** Callback when orphan is deleted */
  onOrphanDelete: (originalSymbolId: string) => void;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const COLOR_OPTIONS = [
  '#f44336', // Red
  '#e91e63', // Pink
  '#9c27b0', // Purple
  '#673ab7', // Deep Purple
  '#3f51b5', // Indigo
  '#2196f3', // Blue
  '#03a9f4', // Light Blue
  '#00bcd4', // Cyan
  '#009688', // Teal
  '#4caf50', // Green
  '#8bc34a', // Light Green
  '#cddc39', // Lime
  '#ffeb3b', // Yellow
  '#ffc107', // Amber
  '#ff9800', // Orange
  '#ff5722', // Deep Orange
  '#795548', // Brown
  '#9e9e9e', // Grey
  '#607d8b', // Blue Grey
  undefined, // No color (reset)
];

// ============================================================================
// Styles
// ============================================================================

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    borderLeft: '1px solid var(--theme-border, #e0e0e0)',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--theme-border, #e0e0e0)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--theme-text-primary, #333)',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--theme-text-secondary, #666)',
    fontSize: '14px',
  },
  nodeInfo: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)',
    borderRadius: '8px',
  },
  nodeLabel: {
    fontWeight: 600,
    fontSize: '16px',
    marginBottom: '4px',
  },
  nodeType: {
    fontSize: '12px',
    color: 'var(--theme-text-secondary, #666)',
  },
  section: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--theme-text-secondary, #666)',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
    padding: '10px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    fontSize: '14px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  colorButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  colorSwatch: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '1px solid var(--theme-border, #ddd)',
  },
  colorPicker: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    padding: '8px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    position: 'absolute' as const,
    zIndex: 100,
  },
  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    marginBottom: '8px',
  },
  tag: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    backgroundColor: 'var(--theme-bg-secondary, #e8e8e8)',
    color: 'var(--theme-text-primary, #333)',
  },
  tagRemove: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '10px',
    lineHeight: 1,
  },
  tagSelector: {
    padding: '8px 12px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
  },
  expandableHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 6px',
    borderRadius: '9px',
    backgroundColor: 'var(--theme-warning, #ff9800)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
  },
  orphanCard: {
    padding: '12px',
    marginTop: '8px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
  },
  orphanActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  button: {
    padding: '6px 12px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '4px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  symbolId: {
    fontFamily: 'monospace',
    fontSize: '11px',
    backgroundColor: 'var(--theme-bg-secondary, #f0f0f0)',
    padding: '8px',
    borderRadius: '4px',
    marginTop: '8px',
    wordBreak: 'break-all' as const,
  },
  newTagInput: {
    width: '100%',
    padding: '8px',
    marginTop: '8px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '4px',
    fontSize: '14px',
  },
};

// ============================================================================
// Component
// ============================================================================

export function AnnotationPanel({
  selectedNode,
  annotations,
  onAnnotationChange,
  onTagAdd,
  onTagRemove,
  onOrphanRelink,
  onOrphanDelete,
  className,
}: AnnotationPanelProps) {
  const [note, setNote] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showSymbolId, setShowSymbolId] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Get current annotation
  const currentAnnotation = selectedNode
    ? annotations.nodes[selectedNode.symbolId]
    : undefined;

  // Update local note state when node changes
  useEffect(() => {
    setNote(currentAnnotation?.note ?? '');
  }, [currentAnnotation?.note, selectedNode?.symbolId]);

  // Debounced note update
  const handleNoteChange = useCallback(
    (value: string) => {
      setNote(value);

      if (noteDebounceRef.current) {
        clearTimeout(noteDebounceRef.current);
      }

      noteDebounceRef.current = setTimeout(() => {
        if (selectedNode) {
          onAnnotationChange(selectedNode.symbolId, {
            ...currentAnnotation,
            symbolId: selectedNode.symbolId,
            note: value,
          });
        }
      }, 500);
    },
    [selectedNode, currentAnnotation, onAnnotationChange]
  );

  const handleColorSelect = useCallback(
    (color: string | undefined) => {
      setShowColorPicker(false);
      if (selectedNode) {
        onAnnotationChange(selectedNode.symbolId, {
          ...currentAnnotation,
          symbolId: selectedNode.symbolId,
          color,
        });
      }
    },
    [selectedNode, currentAnnotation, onAnnotationChange]
  );

  const handleTagAdd = useCallback(
    (tagId: string) => {
      setShowTagDropdown(false);
      if (selectedNode) {
        const currentTags = currentAnnotation?.tags ?? [];
        if (!currentTags.includes(tagId)) {
          onAnnotationChange(selectedNode.symbolId, {
            ...currentAnnotation,
            symbolId: selectedNode.symbolId,
            tags: [...currentTags, tagId],
          });
        }
      }
    },
    [selectedNode, currentAnnotation, onAnnotationChange]
  );

  const handleTagRemove = useCallback(
    (tagId: string) => {
      if (selectedNode) {
        const currentTags = currentAnnotation?.tags ?? [];
        onAnnotationChange(selectedNode.symbolId, {
          ...currentAnnotation,
          symbolId: selectedNode.symbolId,
          tags: currentTags.filter((t) => t !== tagId),
        });
      }
    },
    [selectedNode, currentAnnotation, onAnnotationChange]
  );

  const handleNewTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && newTagName.trim()) {
        const tagId = newTagName.toLowerCase().replace(/\s+/g, '-');
        onTagAdd({
          id: tagId,
          name: newTagName.trim(),
          color: '#9e9e9e',
        });
        setNewTagName('');
        // Also add to current node
        handleTagAdd(tagId);
      }
    },
    [newTagName, onTagAdd, handleTagAdd]
  );

  const handleCopySymbolId = useCallback(async () => {
    if (selectedNode?.symbolId) {
      await navigator.clipboard.writeText(selectedNode.symbolId);
    }
  }, [selectedNode?.symbolId]);

  // Get tags available to add (not already on node)
  const availableTags = annotations.tags.filter(
    (tag) => !currentAnnotation?.tags?.includes(tag.id)
  );

  // Get tag definitions for current tags
  const currentTagDefs = (currentAnnotation?.tags ?? [])
    .map((tagId) => annotations.tags.find((t) => t.id === tagId))
    .filter(Boolean) as TagDefinition[];

  // Empty state
  if (!selectedNode) {
    return (
      <div style={styles.panel} className={className}>
        <div style={styles.header}>Annotations</div>
        <div style={styles.body}>
          <div style={styles.emptyState}>Select a node to add annotations</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel} className={className}>
      <div style={styles.header}>Annotations</div>
      <div style={styles.body}>
        {/* Node Info */}
        <div style={styles.nodeInfo}>
          <div style={styles.nodeLabel}>{selectedNode.label}</div>
          <div style={styles.nodeType}>{selectedNode.type}</div>
        </div>

        {/* Note */}
        <div style={styles.section}>
          <label htmlFor="annotation-note" style={styles.label}>
            Note
          </label>
          <textarea
            id="annotation-note"
            aria-label="Note"
            style={styles.textarea}
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Add a note about this node..."
          />
        </div>

        {/* Color */}
        <div style={{ ...styles.section, position: 'relative' }}>
          <label style={styles.label}>Color</label>
          <button
            type="button"
            aria-label="Color"
            style={styles.colorButton}
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <span
              style={{
                ...styles.colorSwatch,
                backgroundColor: currentAnnotation?.color ?? 'transparent',
              }}
            />
            <span>{currentAnnotation?.color ? 'Change color' : 'Set color'}</span>
          </button>
          {showColorPicker && (
            <div style={styles.colorPicker} role="listbox">
              {COLOR_OPTIONS.map((color, i) => (
                <button
                  key={color ?? 'none'}
                  type="button"
                  role="option"
                  aria-selected={currentAnnotation?.color === color}
                  style={{
                    ...styles.colorOption,
                    backgroundColor: color ?? 'transparent',
                    border: color ? 'none' : '2px dashed #ccc',
                  }}
                  onClick={() => handleColorSelect(color)}
                  title={color ?? 'No color'}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div style={styles.section}>
          <label style={styles.label}>Tags</label>
          {currentTagDefs.length > 0 && (
            <div style={styles.tagsContainer}>
              {currentTagDefs.map((tag) => (
                <span
                  key={tag.id}
                  data-tag={tag.id}
                  style={{
                    ...styles.tag,
                    backgroundColor: tag.color ?? 'var(--theme-bg-secondary, #e8e8e8)',
                    color: '#fff',
                  }}
                >
                  {tag.name}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag.name}`}
                    style={styles.tagRemove}
                    onClick={() => handleTagRemove(tag.id)}
                  >
                    \u2715
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <select
              aria-label="Add tag"
              style={styles.tagSelector}
              value=""
              onChange={(e) => handleTagAdd(e.target.value)}
              onClick={() => setShowTagDropdown(true)}
            >
              <option value="" disabled>
                Add a tag...
              </option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Type new tag name and press Enter"
              style={styles.newTagInput}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleNewTag}
            />
          </div>
        </div>

        {/* Symbol ID */}
        <div style={styles.section}>
          <button
            type="button"
            aria-label="Symbol ID"
            style={styles.expandableHeader}
            onClick={() => setShowSymbolId(!showSymbolId)}
          >
            <span>Symbol ID {showSymbolId ? '\u25BC' : '\u25B6'}</span>
          </button>
          {showSymbolId && (
            <div>
              <div style={styles.symbolId}>{selectedNode.symbolId}</div>
              <button
                type="button"
                aria-label="Copy"
                style={{ ...styles.button, marginTop: '8px' }}
                onClick={handleCopySymbolId}
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {/* Orphaned Annotations */}
        {annotations.orphaned.length > 0 && (
          <div style={styles.section}>
            <button
              type="button"
              aria-label="Orphaned annotations"
              style={styles.expandableHeader}
              onClick={() => setShowOrphans(!showOrphans)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>\u26A0 Orphaned</span>
                <span style={styles.badge}>{annotations.orphaned.length}</span>
              </span>
              <span>{showOrphans ? '\u25BC' : '\u25B6'}</span>
            </button>
            {showOrphans &&
              annotations.orphaned.map((orphan) => (
                <div key={orphan.originalSymbolId} style={styles.orphanCard}>
                  <div style={{ fontWeight: 500 }}>{orphan.lastKnownName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--theme-text-secondary, #666)' }}>
                    {orphan.lastKnownPath}
                  </div>
                  {orphan.annotation.note && (
                    <div style={{ marginTop: '8px', fontSize: '13px' }}>
                      {orphan.annotation.note}
                    </div>
                  )}
                  <div style={styles.orphanActions}>
                    <button
                      type="button"
                      aria-label="Re-link"
                      style={styles.button}
                      onClick={() => {
                        // In real implementation, would open a symbol picker
                        // For now, just a placeholder
                      }}
                    >
                      Re-link
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      style={styles.button}
                      onClick={() => onOrphanDelete(orphan.originalSymbolId)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
