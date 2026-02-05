/**
 * FilterPanel Component
 *
 * UI for filtering and focus mode controls.
 * Issue #26: CCD-REQ-007 Filter and Focus
 */

import React, { useState, useCallback } from 'react';
import type { FilterConfig, FilterPreset } from '../../hooks/useFilteredDiagram';

// ============================================================================
// Types
// ============================================================================

export interface FilterPanelProps {
  /** Available node types for filtering */
  availableNodeTypes: string[];
  /** Available tags for filtering */
  availableTags: string[];
  /** Current filter configuration */
  filter: FilterConfig;
  /** Callback when filter changes */
  onFilterChange: (filter: FilterConfig) => void;
  /** Callback when focus mode depth changes */
  onFocusModeChange: (depth: number) => void;
  /** Callback to clear all filters */
  onClearFilter: () => void;
  /** Saved filter presets */
  presets: FilterPreset[];
  /** Callback to save current filter as preset */
  onSavePreset: (name: string) => void;
  /** Callback to apply a preset */
  onApplyPreset: (presetId: string) => void;
  /** Callback to delete a preset */
  onDeletePreset: (presetId: string) => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '16px',
    backgroundColor: 'var(--surface, #ffffff)',
    borderRadius: '8px',
    border: '1px solid var(--border, #e0e0e0)',
  } as React.CSSProperties,
  section: {
    marginBottom: '16px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  input: {
    padding: '8px 12px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  chipsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginTop: '8px',
  } as React.CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: 'var(--primary-light, #e3f2fd)',
    borderRadius: '16px',
    fontSize: '12px',
    color: 'var(--primary, #1976d2)',
  } as React.CSSProperties,
  chipRemove: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: '14px',
    color: 'inherit',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: 'var(--primary, #1976d2)',
    color: 'white',
  } as React.CSSProperties,
  buttonSecondary: {
    padding: '8px 16px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  presetList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  presetItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
  } as React.CSSProperties,
  focusModeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  depthInput: {
    width: '60px',
    padding: '4px 8px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function FilterPanel({
  availableNodeTypes,
  availableTags,
  filter,
  onFilterChange,
  onFocusModeChange,
  onClearFilter,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: FilterPanelProps): React.ReactElement {
  const [pathPatternInput, setPathPatternInput] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [focusDepth, setFocusDepth] = useState(1);

  // Handle node type toggle
  const handleNodeTypeToggle = useCallback(
    (nodeType: string) => {
      const currentTypes = filter.nodeTypes || [];
      const isChecked = currentTypes.includes(nodeType);

      const newTypes = isChecked
        ? currentTypes.filter((t) => t !== nodeType)
        : [...currentTypes, nodeType];

      onFilterChange({
        ...filter,
        nodeTypes: newTypes,
      });
    },
    [filter, onFilterChange]
  );

  // Handle path pattern add
  const handlePathPatternKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && pathPatternInput.trim()) {
        const currentPatterns = filter.pathPatterns || [];
        onFilterChange({
          ...filter,
          pathPatterns: [...currentPatterns, pathPatternInput.trim()],
        });
        setPathPatternInput('');
      }
    },
    [filter, onFilterChange, pathPatternInput]
  );

  // Handle chip remove for node types
  const handleRemoveNodeType = useCallback(
    (nodeType: string) => {
      const currentTypes = filter.nodeTypes || [];
      onFilterChange({
        ...filter,
        nodeTypes: currentTypes.filter((t) => t !== nodeType),
      });
    },
    [filter, onFilterChange]
  );

  // Handle chip remove for path patterns
  const handleRemovePathPattern = useCallback(
    (pattern: string) => {
      const currentPatterns = filter.pathPatterns || [];
      onFilterChange({
        ...filter,
        pathPatterns: currentPatterns.filter((p) => p !== pattern),
      });
    },
    [filter, onFilterChange]
  );

  // Handle focus depth change
  const handleDepthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const depth = parseInt(e.target.value, 10);
      if (!isNaN(depth) && depth > 0) {
        setFocusDepth(depth);
        onFocusModeChange(depth);
      }
    },
    [onFocusModeChange]
  );

  // Handle save preset
  const handleSavePreset = useCallback(() => {
    if (showPresetInput) {
      if (presetNameInput.trim()) {
        onSavePreset(presetNameInput.trim());
        setPresetNameInput('');
        setShowPresetInput(false);
      }
    } else {
      setShowPresetInput(true);
    }
  }, [showPresetInput, presetNameInput, onSavePreset]);

  // Handle preset name input keydown
  const handlePresetNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && presetNameInput.trim()) {
        onSavePreset(presetNameInput.trim());
        setPresetNameInput('');
        setShowPresetInput(false);
      }
    },
    [presetNameInput, onSavePreset]
  );

  const hasActiveFilters =
    (filter.nodeTypes && filter.nodeTypes.length > 0) ||
    (filter.pathPatterns && filter.pathPatterns.length > 0) ||
    (filter.excludePatterns && filter.excludePatterns.length > 0) ||
    (filter.tags && filter.tags.length > 0) ||
    filter.connectedTo;

  return (
    <div style={styles.container}>
      <div style={styles.sectionTitle}>Filter</div>

      {/* Node Types */}
      <div style={styles.section}>
        <div style={styles.checkboxGroup}>
          {availableNodeTypes.map((nodeType) => (
            <label key={nodeType} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={(filter.nodeTypes || []).includes(nodeType)}
                onChange={() => handleNodeTypeToggle(nodeType)}
                aria-label={nodeType}
              />
              {nodeType}
            </label>
          ))}
        </div>
      </div>

      {/* Path Pattern */}
      <div style={styles.section}>
        <input
          type="text"
          placeholder="Path pattern (e.g., src/auth/*)"
          value={pathPatternInput}
          onChange={(e) => setPathPatternInput(e.target.value)}
          onKeyDown={handlePathPatternKeyDown}
          style={styles.input}
        />
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div style={styles.chipsContainer}>
          {(filter.nodeTypes || []).map((nodeType) => (
            <span key={`type-${nodeType}`} style={styles.chip} data-chip>
              {nodeType}
              <button
                style={styles.chipRemove}
                onClick={() => handleRemoveNodeType(nodeType)}
                aria-label={`Remove ${nodeType} filter`}
              >
                ×
              </button>
            </span>
          ))}
          {(filter.pathPatterns || []).map((pattern) => (
            <span key={`path-${pattern}`} style={styles.chip} data-chip>
              {pattern}
              <button
                style={styles.chipRemove}
                onClick={() => handleRemovePathPattern(pattern)}
                aria-label={`Remove ${pattern} filter`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Focus Mode */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Focus Mode</div>
        <div style={styles.focusModeSection}>
          <label htmlFor="focus-depth">Depth:</label>
          <input
            id="focus-depth"
            type="number"
            min="1"
            max="10"
            value={focusDepth}
            onChange={handleDepthChange}
            style={styles.depthInput}
          />
        </div>
      </div>

      {/* Presets */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Presets</div>
        {presets.length > 0 && (
          <div style={styles.presetList}>
            {presets.map((preset) => (
              <div
                key={preset.id}
                style={styles.presetItem}
                onClick={() => onApplyPreset(preset.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onApplyPreset(preset.id);
                  }
                }}
              >
                <span>{preset.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePreset(preset.id);
                  }}
                  style={styles.chipRemove}
                  aria-label={`Delete ${preset.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {showPresetInput ? (
          <input
            type="text"
            placeholder="Preset name"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            onKeyDown={handlePresetNameKeyDown}
            style={{ ...styles.input, marginTop: '8px' }}
            autoFocus
          />
        ) : null}
        <button
          onClick={handleSavePreset}
          style={{ ...styles.buttonSecondary, marginTop: '8px' }}
          aria-label="Save Preset"
        >
          Save Preset
        </button>
      </div>

      {/* Actions */}
      <div style={styles.buttonGroup}>
        <button onClick={onClearFilter} style={styles.buttonSecondary}>
          Clear
        </button>
      </div>
    </div>
  );
}
