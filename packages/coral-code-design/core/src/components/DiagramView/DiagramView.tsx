/**
 * DiagramView Component
 *
 * Container for diagram visualization with tabs and split views.
 */

import { type ReactNode } from 'react';
import type { LayoutMode, DiagramReference } from '../../types';

export interface DiagramViewProps {
  /** Open diagrams */
  diagrams: DiagramReference[];

  /** Active diagram ID */
  activeDiagramId: string | null;

  /** Layout mode */
  layoutMode: LayoutMode;

  /** Called when tab is selected */
  onSelectDiagram?: (diagramId: string) => void;

  /** Called when tab is closed */
  onCloseDiagram?: (diagramId: string) => void;

  /** Called when new diagram is requested */
  onNewDiagram?: () => void;

  /** Render function for diagram content */
  renderDiagram: (diagram: DiagramReference) => ReactNode;
}

export function DiagramView({
  diagrams,
  activeDiagramId,
  layoutMode,
  onSelectDiagram,
  onCloseDiagram,
  onNewDiagram,
  renderDiagram,
}: DiagramViewProps) {
  // Find active diagram
  const activeDiagram = diagrams.find(d => d.id === activeDiagramId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '36px',
          borderBottom: '1px solid var(--border-color, #e0e0e0)',
          backgroundColor: 'var(--tab-bar-bg, #f5f5f5)',
          overflow: 'auto',
        }}
      >
        {diagrams.map(diagram => (
          <DiagramTab
            key={diagram.id}
            diagram={diagram}
            isActive={diagram.id === activeDiagramId}
            onSelect={() => onSelectDiagram?.(diagram.id)}
            onClose={() => onCloseDiagram?.(diagram.id)}
          />
        ))}

        {/* New diagram button */}
        <button
          onClick={onNewDiagram}
          style={{
            padding: '4px 8px',
            marginLeft: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'var(--text-muted, #666)',
          }}
          title="New diagram"
        >
          +
        </button>
      </div>

      {/* Diagram content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {layoutMode === 'tabs' && activeDiagram && renderDiagram(activeDiagram)}

        {layoutMode === 'split-h' && (
          <div style={{ display: 'flex', height: '100%' }}>
            {diagrams.slice(0, 2).map((diagram, index) => (
              <div
                key={diagram.id}
                style={{
                  flex: 1,
                  borderRight: index === 0 ? '1px solid var(--border-color, #e0e0e0)' : undefined,
                  overflow: 'hidden',
                }}
              >
                {renderDiagram(diagram)}
              </div>
            ))}
          </div>
        )}

        {layoutMode === 'split-v' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {diagrams.slice(0, 2).map((diagram, index) => (
              <div
                key={diagram.id}
                style={{
                  flex: 1,
                  borderBottom: index === 0 ? '1px solid var(--border-color, #e0e0e0)' : undefined,
                  overflow: 'hidden',
                }}
              >
                {renderDiagram(diagram)}
              </div>
            ))}
          </div>
        )}

        {layoutMode === 'grid-2x2' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              height: '100%',
              gap: '1px',
              backgroundColor: 'var(--border-color, #e0e0e0)',
            }}
          >
            {diagrams.slice(0, 4).map(diagram => (
              <div
                key={diagram.id}
                style={{
                  backgroundColor: 'var(--bg-color, white)',
                  overflow: 'hidden',
                }}
              >
                {renderDiagram(diagram)}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {diagrams.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted, #666)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <p>No diagrams open</p>
              <button
                onClick={onNewDiagram}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                }}
              >
                Create Diagram
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab Component
// ============================================================================

interface DiagramTabProps {
  diagram: DiagramReference;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function DiagramTab({ diagram, isActive, onSelect, onClose }: DiagramTabProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        backgroundColor: isActive ? 'var(--tab-active-bg, white)' : 'transparent',
        borderRight: '1px solid var(--border-color, #e0e0e0)',
        cursor: 'pointer',
        fontSize: '13px',
      }}
      onClick={onSelect}
    >
      <span style={{ marginRight: '8px' }}>{diagram.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          padding: '2px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          color: 'var(--text-muted, #666)',
        }}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}
