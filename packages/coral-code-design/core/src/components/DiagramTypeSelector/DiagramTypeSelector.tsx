/**
 * DiagramTypeSelector Component
 *
 * Selector for diagram abstraction level/type.
 * Issue #28: CCD-REQ-003 Diagram Types (C4-Inspired)
 */

import React from 'react';
import type { DiagramType } from '../../hooks/useDiagramNavigation';

// ============================================================================
// Types
// ============================================================================

export interface DiagramTypeSelectorProps {
  /** Currently selected diagram type */
  currentType: DiagramType;
  /** Available diagram types */
  availableTypes: string[];
  /** Callback when type changes */
  onTypeChange: (type: DiagramType) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Variant: 'default' for dropdown, 'compact' for icon buttons */
  variant?: 'default' | 'compact';
}

// ============================================================================
// Constants
// ============================================================================

const TYPE_LABELS: Record<string, string> = {
  'codebase-overview': 'Codebase Overview',
  'module-graph': 'Module Graph',
  'component-detail': 'Component Detail',
  'call-graph': 'Call Graph',
  'dependency-graph': 'Dependency Graph',
  'inheritance-tree': 'Inheritance Tree',
  'data-flow': 'Data Flow',
  'impact-analysis': 'Impact Analysis',
  'custom': 'Custom',
};

const TYPE_ICONS: Record<string, string> = {
  'codebase-overview': '🏗️',
  'module-graph': '📦',
  'component-detail': '🧩',
  'call-graph': '📞',
  'dependency-graph': '🔗',
  'inheritance-tree': '🌳',
  'data-flow': '➡️',
  'impact-analysis': '💥',
  'custom': '⚙️',
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
  } as React.CSSProperties,
  select: {
    padding: '6px 12px',
    fontSize: '14px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface, #ffffff)',
    color: 'var(--text-primary, #1a1a1a)',
    cursor: 'pointer',
    minWidth: '160px',
  } as React.CSSProperties,
  compactContainer: {
    display: 'flex',
    gap: '4px',
  } as React.CSSProperties,
  iconButton: {
    padding: '6px 10px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface, #ffffff)',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  iconButtonActive: {
    backgroundColor: 'var(--primary, #1976d2)',
    borderColor: 'var(--primary, #1976d2)',
    color: 'white',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function DiagramTypeSelector({
  currentType,
  availableTypes,
  onTypeChange,
  disabled = false,
  variant = 'default',
}: DiagramTypeSelectorProps): React.ReactElement {
  if (variant === 'compact') {
    return (
      <div style={styles.compactContainer}>
        {availableTypes.map((type) => {
          const isActive = type === currentType;
          return (
            <button
              key={type}
              onClick={() => onTypeChange(type as DiagramType)}
              disabled={disabled}
              aria-pressed={isActive}
              title={TYPE_LABELS[type] || type}
              style={{
                ...styles.iconButton,
                ...(isActive ? styles.iconButtonActive : {}),
              }}
            >
              {TYPE_ICONS[type] || '📊'}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <select
        value={currentType}
        onChange={(e) => onTypeChange(e.target.value as DiagramType)}
        disabled={disabled}
        style={styles.select}
      >
        {availableTypes.map((type) => (
          <option key={type} value={type}>
            {TYPE_LABELS[type] || type}
          </option>
        ))}
      </select>
    </div>
  );
}
