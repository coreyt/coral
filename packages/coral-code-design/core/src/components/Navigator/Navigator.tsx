/**
 * Navigator Component
 *
 * Left sidebar with file tree, symbol outline, and orphaned annotations.
 */

import { useState } from 'react';

export interface NavigatorProps {
  /** Workspace root path */
  workspacePath?: string;

  /** File tree data */
  fileTree?: FileTreeNode[];

  /** Symbol outline for current file/diagram */
  symbols?: SymbolOutlineNode[];

  /** Orphaned annotations count */
  orphanedCount?: number;

  /** Called when file is selected */
  onFileSelect?: (path: string) => void;

  /** Called when symbol is selected */
  onSymbolSelect?: (symbolId: string) => void;

  /** Called when orphaned annotations is clicked */
  onOrphanedClick?: () => void;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  expanded?: boolean;
}

export interface SymbolOutlineNode {
  id: string;
  name: string;
  type: string; // class, function, interface, etc.
  symbolId: string;
  children?: SymbolOutlineNode[];
}

type NavigatorSection = 'files' | 'outline' | 'orphaned';

export function Navigator({
  workspacePath,
  fileTree = [],
  symbols = [],
  orphanedCount = 0,
  onFileSelect,
  onSymbolSelect,
  onOrphanedClick,
}: NavigatorProps) {
  const [activeSection, setActiveSection] = useState<NavigatorSection>('files');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontSize: '13px',
      }}
    >
      {/* Section tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color, #e0e0e0)',
        }}
      >
        <SectionTab
          label="Files"
          isActive={activeSection === 'files'}
          onClick={() => setActiveSection('files')}
        />
        <SectionTab
          label="Outline"
          isActive={activeSection === 'outline'}
          onClick={() => setActiveSection('outline')}
        />
        {orphanedCount > 0 && (
          <SectionTab
            label={`Orphaned (${orphanedCount})`}
            isActive={activeSection === 'orphaned'}
            onClick={() => setActiveSection('orphaned')}
            hasWarning
          />
        )}
      </div>

      {/* Section content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {activeSection === 'files' && (
          <FileTreeView
            nodes={fileTree}
            onSelect={onFileSelect}
          />
        )}

        {activeSection === 'outline' && (
          <SymbolOutlineView
            nodes={symbols}
            onSelect={onSymbolSelect}
          />
        )}

        {activeSection === 'orphaned' && (
          <OrphanedView
            count={orphanedCount}
            onClick={onOrphanedClick}
          />
        )}
      </div>

      {/* Workspace path */}
      {workspacePath && (
        <div
          style={{
            padding: '8px',
            fontSize: '11px',
            color: 'var(--text-muted, #666)',
            borderTop: '1px solid var(--border-color, #e0e0e0)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={workspacePath}
        >
          {workspacePath}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Section Tab
// ============================================================================

interface SectionTabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  hasWarning?: boolean;
}

function SectionTab({ label, isActive, onClick, hasWarning }: SectionTabProps) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px',
        background: isActive ? 'var(--tab-active-bg, white)' : 'transparent',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--accent-color, #0066cc)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: isActive ? 600 : 400,
        color: hasWarning ? 'var(--warning-color, #f59e0b)' : 'inherit',
      }}
    >
      {hasWarning && '⚠️ '}{label}
    </button>
  );
}

// ============================================================================
// File Tree View
// ============================================================================

interface FileTreeViewProps {
  nodes: FileTreeNode[];
  onSelect?: (path: string) => void;
  depth?: number;
}

function FileTreeView({ nodes, onSelect, depth = 0 }: FileTreeViewProps) {
  return (
    <div>
      {nodes.map(node => (
        <FileTreeItem
          key={node.id}
          node={node}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
      {nodes.length === 0 && (
        <div style={{ color: 'var(--text-muted, #666)', padding: '8px' }}>
          No files
        </div>
      )}
    </div>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  onSelect?: (path: string) => void;
  depth: number;
}

function FileTreeItem({ node, onSelect, depth }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(node.expanded ?? false);
  const icon = node.type === 'directory' ? (expanded ? '📂' : '📁') : '📄';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          paddingLeft: `${depth * 16 + 4}px`,
          cursor: 'pointer',
        }}
        onClick={() => {
          if (node.type === 'directory') {
            setExpanded(!expanded);
          } else {
            onSelect?.(node.path);
          }
        }}
      >
        <span style={{ marginRight: '4px' }}>{icon}</span>
        <span>{node.name}</span>
      </div>
      {expanded && node.children && (
        <FileTreeView nodes={node.children} onSelect={onSelect} depth={depth + 1} />
      )}
    </div>
  );
}

// ============================================================================
// Symbol Outline View
// ============================================================================

interface SymbolOutlineViewProps {
  nodes: SymbolOutlineNode[];
  onSelect?: (symbolId: string) => void;
  depth?: number;
}

function SymbolOutlineView({ nodes, onSelect, depth = 0 }: SymbolOutlineViewProps) {
  return (
    <div>
      {nodes.map(node => (
        <SymbolOutlineItem
          key={node.id}
          node={node}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
      {nodes.length === 0 && (
        <div style={{ color: 'var(--text-muted, #666)', padding: '8px' }}>
          No symbols
        </div>
      )}
    </div>
  );
}

interface SymbolOutlineItemProps {
  node: SymbolOutlineNode;
  onSelect?: (symbolId: string) => void;
  depth: number;
}

function SymbolOutlineItem({ node, onSelect, depth }: SymbolOutlineItemProps) {
  const [expanded, setExpanded] = useState(true);
  const icon = getSymbolIcon(node.type);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          paddingLeft: `${depth * 16 + 4}px`,
          cursor: 'pointer',
        }}
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded);
          }
          onSelect?.(node.symbolId);
        }}
      >
        <span style={{ marginRight: '4px' }}>{icon}</span>
        <span>{node.name}</span>
      </div>
      {expanded && node.children && (
        <SymbolOutlineView nodes={node.children} onSelect={onSelect} depth={depth + 1} />
      )}
    </div>
  );
}

function getSymbolIcon(type: string): string {
  switch (type) {
    case 'class': return '🔷';
    case 'interface': return '🔶';
    case 'function': return '🔹';
    case 'method': return '🔸';
    case 'variable': return '📌';
    case 'constant': return '🔒';
    default: return '•';
  }
}

// ============================================================================
// Orphaned View
// ============================================================================

interface OrphanedViewProps {
  count: number;
  onClick?: () => void;
}

function OrphanedView({ count, onClick }: OrphanedViewProps) {
  return (
    <div
      style={{
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
        {count} Orphaned Annotation{count !== 1 ? 's' : ''}
      </div>
      <div style={{ color: 'var(--text-muted, #666)', marginBottom: '16px', fontSize: '12px' }}>
        These annotations reference symbols that no longer exist.
      </div>
      <button
        onClick={onClick}
        style={{
          padding: '8px 16px',
          cursor: 'pointer',
        }}
      >
        Review & Clean Up
      </button>
    </div>
  );
}
