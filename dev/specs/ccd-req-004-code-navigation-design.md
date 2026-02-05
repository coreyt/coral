# CCD-REQ-004: Code Navigation Design Proposal

> **Status**: Design Complete
> **Author**: Claude
> **Date**: 2026-02-05
> **Pass**: 2 of 2 (refined)

---

## Executive Summary

CCD-REQ-004 (Code Navigation) is **80% complete** in terms of infrastructure. The existing architecture provides:

- ✅ NavigationProvider with VS Code compatibility
- ✅ Inspector with action buttons (Code, Refs, Deps, Uses)
- ✅ DiagramRenderer with node selection callbacks
- ✅ CodePreview component for displaying source
- ✅ Breadcrumbs for abstraction level navigation

The remaining 20% is **wiring existing components together** and adding:

- 🔲 Hover tooltips on nodes
- 🔲 Edge click handling
- 🔲 Right-click context menu
- 🔲 Keyboard shortcuts

---

## Architecture Analysis

### Existing Components

#### NavigationProvider (`providers/NavigationProvider.tsx`)

```typescript
interface NavigationContextValue {
  navigate: (request: NavigationRequest) => Promise<void>;  // Open in editor
  canNavigate: (request: NavigationRequest) => boolean;
  previewFile: (file: string, line?: number) => void;       // Show in CodePreview
  preview: PreviewState | null;
}
```

**Key Design**: Supports external `navigationHandler` for VS Code integration. Standalone mode falls back to in-app preview.

#### Inspector (`components/Inspector/Inspector.tsx`)

Has four action buttons with callback props:
- `onViewCode?: (file: string, line?: number) => void`
- `onViewReferences?: (symbolId: SymbolId) => void`
- `onViewDependencies?: (symbolId: SymbolId) => void`
- `onViewUsages?: (symbolId: SymbolId) => void`

**Gap**: Callbacks exist but are not wired to NavigationProvider.

#### DiagramRenderer (`components/DiagramRenderer/DiagramRenderer.tsx`)

Has interaction callbacks:
- `onNodeSelect?: (nodeData: InspectorNodeData | null) => void`
- `onNodeDoubleClick?: (nodeData: InspectorNodeData) => void`

**Gap**: No edge click, hover, or right-click handling.

---

## Implementation Plan

### Phase 1: Basic Wiring (Already Done)

The WorkspaceLayout should wire:

```typescript
// WorkspaceLayout.tsx
<Inspector
  node={selectedNode}
  onViewCode={(file, line) => navigation.previewFile(file, line)}
  onViewReferences={(symbolId) => armada.search({ query: `references:${symbolId}` })}
  onViewDependencies={(symbolId) => armada.fetchDiagram('dependency-graph', symbolId)}
  onViewUsages={(symbolId) => armada.fetchDiagram('call-graph', symbolId)}
/>
```

**Status**: Needs implementation in WorkspaceLayout to connect Inspector to NavigationProvider.

### Phase 2: Click-to-Code Flow

When a node is selected:
1. DiagramRenderer fires `onNodeSelect(nodeData)`
2. WorkspaceLayout updates `selectedNode` state
3. Inspector renders with node data
4. User clicks "Code" button
5. Inspector calls `onViewCode(file, line)`
6. NavigationProvider's `previewFile` updates `preview` state
7. CodePreview renders the file with highlighted line

**Implementation**: Create a `useCodeNavigation` hook that encapsulates this flow.

### Phase 3: Double-Click to Editor

```typescript
// DiagramRenderer integration
<DiagramRenderer
  onNodeDoubleClick={(nodeData) => {
    navigation.navigate({
      type: 'open-file',
      target: {
        file: nodeData.file,
        line: nodeData.startLine,
        symbol: nodeData.name,
      }
    });
  }}
/>
```

**VS Code Behavior**: In VS Code extension, `navigationHandler.navigate()` sends a command to the extension host to open the file in the editor.

**Standalone Behavior**: Falls back to `previewFile()` (show in CodePreview pane).

### Phase 4: Hover Tooltips

Add a `NodeTooltip` component:

```typescript
interface NodeTooltipProps {
  node: InspectorNodeData;
  position: { x: number; y: number };
}

function NodeTooltip({ node, position }: NodeTooltipProps) {
  return (
    <div style={{ position: 'absolute', left: position.x, top: position.y }}>
      <div className="tooltip-header">{node.name}</div>
      <div className="tooltip-type">{node.type}</div>
      <div className="tooltip-file">{node.file}:{node.startLine}</div>
      {node.signature && <div className="tooltip-signature">{node.signature}</div>}
      {node.docstring && <div className="tooltip-docstring">{node.docstring}</div>}
    </div>
  );
}
```

**Integration**: Add `onNodeHover` and `onNodeHoverEnd` callbacks to DiagramRenderer.

### Phase 5: Edge Click Handling

When an edge is clicked, show call sites or import statements:

```typescript
// DiagramRenderer
const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
  // Get source and target nodes
  const sourceNode = nodes.find(n => n.id === edge.source);
  const targetNode = nodes.find(n => n.id === edge.target);

  if (sourceNode && targetNode) {
    // Show call sites where source calls target
    onEdgeSelect?.({
      sourceSymbolId: sourceNode.data.symbolId,
      targetSymbolId: targetNode.data.symbolId,
      relationshipType: edge.data?.type || 'calls',
    });
  }
}, [nodes, onEdgeSelect]);
```

### Phase 6: Right-Click Context Menu

Create a `NodeContextMenu` component:

```typescript
interface NodeContextMenuProps {
  node: InspectorNodeData;
  position: { x: number; y: number };
  onClose: () => void;
  actions: {
    viewCode: () => void;
    viewReferences: () => void;
    viewDependencies: () => void;
    viewUsages: () => void;
    drillDown: () => void;
    copySymbolId: () => void;
  };
}
```

**Menu Items**:
- View Code (Ctrl+Enter)
- View References (Ctrl+R)
- View Dependencies (Ctrl+D)
- View Usages (Ctrl+U)
- Drill Down (Enter)
- ---
- Copy Symbol ID

---

## New Types

```typescript
// types/navigation.ts

/** Edge selection data for showing call sites */
interface EdgeSelectionData {
  sourceSymbolId: SymbolId;
  targetSymbolId: SymbolId;
  relationshipType: 'calls' | 'imports' | 'extends' | 'uses';
}

/** Context menu position */
interface MenuPosition {
  x: number;
  y: number;
}

/** Tooltip state */
interface TooltipState {
  node: InspectorNodeData;
  position: MenuPosition;
  visible: boolean;
}
```

---

## New Hook: useCodeNavigation

Encapsulates the code navigation logic:

```typescript
interface UseCodeNavigationOptions {
  onPreviewFile?: (file: string, line?: number) => void;
  onOpenInEditor?: (file: string, line?: number) => void;
  onFetchReferences?: (symbolId: SymbolId) => void;
  onFetchDependencies?: (symbolId: SymbolId) => void;
  onFetchUsages?: (symbolId: SymbolId) => void;
}

interface UseCodeNavigationResult {
  // Node actions
  handleNodeClick: (nodeData: InspectorNodeData) => void;
  handleNodeDoubleClick: (nodeData: InspectorNodeData) => void;
  handleNodeHover: (nodeData: InspectorNodeData, position: MenuPosition) => void;
  handleNodeHoverEnd: () => void;
  handleNodeRightClick: (nodeData: InspectorNodeData, position: MenuPosition) => void;

  // Edge actions
  handleEdgeClick: (edgeData: EdgeSelectionData) => void;

  // State
  hoveredNode: TooltipState | null;
  contextMenu: { node: InspectorNodeData; position: MenuPosition } | null;

  // Actions
  closeContextMenu: () => void;
}
```

---

## File Structure

```
packages/coral-code-design/core/src/
├── hooks/
│   └── useCodeNavigation.ts          # NEW: Navigation logic hook
├── components/
│   ├── NodeTooltip/                  # NEW: Hover tooltip
│   │   ├── NodeTooltip.tsx
│   │   └── index.ts
│   ├── NodeContextMenu/              # NEW: Right-click menu
│   │   ├── NodeContextMenu.tsx
│   │   └── index.ts
│   └── DiagramRenderer/
│       └── DiagramRenderer.tsx       # MODIFY: Add hover/edge/context handlers
└── providers/
    └── NavigationProvider.tsx        # EXISTING: Already complete
```

---

## Implementation Phases

| Phase | Scope | Effort | Description |
|-------|-------|--------|-------------|
| 1 | Wiring | 1-2h | Connect Inspector callbacks to NavigationProvider |
| 2 | Click-to-Code | 2-3h | Auto-preview on selection, test flow |
| 3 | Double-Click | 1-2h | Navigate to editor on double-click |
| 4 | Hover Tooltips | 3-4h | NodeTooltip component, hover handlers |
| 5 | Edge Click | 2-3h | Show call sites/imports on edge click |
| 6 | Context Menu | 3-4h | Right-click menu with all actions |
| 7 | Keyboard | 2-3h | Keyboard shortcuts for navigation |

**Total Estimated**: 14-21 hours

---

## Acceptance Criteria

- [ ] Click node → Inspector shows node properties
- [ ] Click "Code" button in Inspector → CodePreview shows file
- [ ] Double-click node → Opens in VS Code (extension) or previews (standalone)
- [ ] Hover node → Tooltip shows signature, docstring, file path
- [ ] Click edge → Shows call sites or import locations
- [ ] Right-click node → Context menu with navigation options
- [ ] Keyboard: Enter to drill down, Escape to go back
- [ ] All navigation works in both standalone and VS Code extension modes

---

## VS Code Integration Notes

The NavigationProvider's `navigationHandler` prop enables VS Code integration:

```typescript
// In VS Code extension webview host
const navigationHandler: NavigationProvider = {
  navigate: async (request) => {
    vscode.postMessage({ type: 'navigate', payload: request });
  },
  canNavigate: () => true,
};

<NavigationProvider navigationHandler={navigationHandler}>
  <WorkspaceLayout />
</NavigationProvider>
```

The extension host receives the message and opens the file in VS Code's editor.

---

## Conclusion

The architecture is solid and VS Code-ready. Implementation is primarily wiring existing components:

1. **Inspector** → **NavigationProvider** (callbacks)
2. **DiagramRenderer** → **useCodeNavigation** (handlers)
3. Add **NodeTooltip** and **NodeContextMenu** components

No architectural changes needed. The design separates concerns well and will support both standalone and VS Code modes seamlessly.
