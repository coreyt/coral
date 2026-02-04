# Coral Component Requirements

> **Location**: This file should be placed at `coral/dev/requirements.md`
> **Authority**: System requirements are in `graph-ir-tools/ecosystem/requirements/`

---

## Applications

### coral-code-design

**Status**: Proposed
**Requirements Document**: [coral-code-design-requirements.md](./coral-code-design-requirements.md)

A dedicated application for software architecture visualization and codebase exploration. Purpose-built for developers who need to understand and document code structure, with deep Armada integration and VS Code compatibility.

Key features:
- Workspace-based (open a codebase, not a file)
- Multi-diagram views (tabs, splits, linked selection)
- C4-inspired abstraction levels (codebase → module → component → code)
- Bidirectional code navigation (diagram ↔ source)
- Annotation layer for documentation
- Designed for future VS Code extension

See full requirements: [coral-code-design-requirements.md](./coral-code-design-requirements.md)

---

## Component Requirements

### CORAL-REQ-001: Text Editor Components

**Traces To**: SYS-REQ-001 (Bidirectional Text/Visual Editor)
**Status**: Complete
**Priority**: High
**Created**: 2026-01-31
**Completed**: 2026-01-31

#### Description

Implement text editing components in `@coral/viz`:

1. **TextEditor** — Textarea-based editor for DSL input with line numbers and error display
2. **SplitEditor** — Combined text + visual pane with bidirectional sync
3. **useBidirectionalSync** — Hook to keep text ↔ Graph-IR ↔ visual in sync

#### Implementation Location

```
packages/viz/src/
├── text-editor/
│   ├── TextEditor.tsx
│   ├── SplitEditor.tsx
│   ├── index.ts
│   └── hooks/
│       └── useBidirectionalSync.ts
```

#### Acceptance Criteria

- [x] TextEditor accepts Coral DSL, Mermaid, DOT syntax (via `language` prop)
- [x] TextEditor shows parse errors inline (error panel with line/column info)
- [x] SplitEditor renders text left, visual right (configurable via `primaryPane` prop)
- [x] Changes sync bidirectionally within 100ms (via debounced `useBidirectionalSync`)
- [x] Components exported from `@coral/viz` (22 tests passing)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | useBidirectionalSync hook | Complete |
| 2 | TextEditor component | Complete |
| 3 | SplitEditor component | Complete |
| 4 | Tests | Complete (22 tests) |

---

### CORAL-REQ-002: Armada MCP Client

**Traces To**: SYS-REQ-002 (Code-to-Diagram Workflow)
**Status**: Complete
**Priority**: High
**Created**: 2026-01-31

#### Description

MCP client to query Armada tools from Coral.

#### Implementation Location

`packages/mcp-server/src/armada/client.ts`

#### PROGRESS.md Steps

Phase 4 Step 1 (Complete)

---

### CORAL-REQ-003: Knowledge Graph to IR Transformer

**Traces To**: SYS-REQ-002 (Code-to-Diagram Workflow)
**Status**: Complete
**Priority**: High
**Created**: 2026-01-31

#### Description

Transform Armada query results into valid Graph-IR.

#### Implementation Location

`packages/mcp-server/src/armada/transformer.ts`

#### PROGRESS.md Steps

Phase 4 Step 2 (Complete)

---

### CORAL-REQ-004: coral_from_codebase Tool

**Traces To**: SYS-REQ-002 (Code-to-Diagram Workflow)
**Status**: Complete
**Priority**: High
**Created**: 2026-01-31

#### Description

MCP tool and skill for generating diagrams from codebase analysis.

#### Implementation Location

- `packages/mcp-server/src/tools/fromCodebase.ts`
- `.claude/skills/coral/SKILL.md` (updated)

#### PROGRESS.md Steps

Phase 4 Steps 3-4 (Complete)

---

### CORAL-REQ-005: Incremental Update Support

**Traces To**: SYS-REQ-002 (Code-to-Diagram Workflow)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-01-31
**Completed**: 2026-02-01

#### Description

Detect code changes and automatically update diagrams.

#### Implementation Location

```
packages/mcp-server/src/armada/incremental.ts
```

#### Acceptance Criteria

- [x] Watch mode detects file changes
- [x] Changed files trigger re-indexing (via Armada impactOf)
- [x] Diagram updates without full regeneration (via graph diffing)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create IncrementalWatcher with file watching | Complete |
| 2 | Implement debounced change detection | Complete |
| 3 | Integrate with Armada impactOf for smart updates | Complete |
| 4 | Graph diffing for added/removed/modified detection | Complete |
| 5 | Direct Graph-IR transformation for updates | Complete |
| 6 | Tests | Complete (14 tests) |

---

### CORAL-REQ-006: Coral Shapes and Diagram Notations

**Traces To**: SYS-REQ-003 (Symbol/Notation Architecture)
**Status**: Complete
**Priority**: High
**Created**: 2026-01-31
**Completed**: 2026-02-01

#### Description

Define shape geometries, diagram symbols (flowchart, BPMN, ERD), and notations for Coral visual rendering using the three-layer architecture.

#### Implementation Location

```
packages/viz/src/
├── shapes/
│   ├── primitives/           # YAML with SVG geometry (14 shapes)
│   └── index.ts              # ShapeRegistry with 14 shapes
├── symbols/
│   ├── flowchart.ts          # 7 flowchart symbols
│   ├── bpmn.ts               # 13 BPMN symbols
│   ├── erd.ts                # 5 ERD symbols
│   ├── code.ts               # 7 code symbols (Armada)
│   ├── architecture.ts       # 10 architecture symbols
│   └── index.ts              # SymbolRegistry (40+ symbols)
├── notations/
│   ├── flowchart.ts          # Connection rules, validation
│   ├── bpmn.ts               # BPMN grammar
│   ├── erd.ts                # ERD grammar
│   ├── code.ts               # Code diagram grammar
│   ├── architecture.ts       # Architecture diagram grammar
│   └── index.ts              # NotationRegistry with validation
├── components/
│   ├── ShapeRenderer.tsx     # SVG rendering from ShapeDefinition
│   └── SymbolNode.tsx        # React Flow node using registries
└── types.ts                  # ShapeDefinition, SymbolDefinition, NotationDefinition
```

#### Acceptance Criteria

- [x] Shape geometries defined: rectangle, diamond, ellipse, cylinder, parallelogram, hexagon, document, stadium, actor (14 shapes)
- [x] Shapes include `portAnchors` for connection points
- [x] Flowchart symbols defined: terminal, process, decision, io, document, predefined, connector (7 symbols)
- [x] Flowchart notation defined with connection rules
- [x] BPMN symbols defined: start-event, end-event, task, gateway variants (13 symbols)
- [x] ERD symbols defined: entity, relationship, attribute, cardinality, isa (5 symbols)
- [x] Code symbols defined for Armada integration: function, class, module, variable, type, namespace, external (7 symbols)
- [x] Symbol variants work (e.g., terminal start/end, entity strong/weak, task user/service)
- [x] Notation validation enforces connection rules
- [x] Rendering uses symbol registry (ShapeRenderer + SymbolNode)
- [x] Tests for shape loading, symbol resolution, notation validation (63 tests)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create `shapes/primitives/` with 14 base shapes | Complete |
| 2 | Create `shapes/index.ts` to load shapes into registry | Complete |
| 3 | Create `symbols/flowchart.ts` with 7 flowchart symbols | Complete |
| 4 | Create `notations/flowchart.ts` with connection rules | Complete |
| 5 | Create `symbols/bpmn.ts` and `notations/bpmn.ts` | Complete |
| 6 | Create `symbols/erd.ts` and `notations/erd.ts` | Complete |
| 7 | Create `symbols/code.ts` for Armada visual mappings | Complete |
| 8 | Create `ShapeRenderer.tsx` (YAML → SVG) | Complete |
| 9 | Create `SymbolNode.tsx` (symbol → React Flow node) | Complete |
| 10 | Update editor to use symbol registry | Complete |
| 11 | Add notation validation to editor | Complete |
| 12 | Tests (shape loading, symbol resolution, notation validation) | Complete (63 tests)

---

### CORAL-REQ-007: Diagram Reflow with Undo

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-01-31
**Completed**: 2026-02-01
**Unblocked By**: CORAL-REQ-013 (position stability fix)

#### Description

Allow users to re-apply automatic layout (reflow) to a diagram and revert to previous node positions if the result is unsatisfactory.

#### User Story

As a user editing a diagram, I want to:
1. Click a "Reflow" button to re-run automatic layout (ELK)
2. See the diagram reorganize with the new layout
3. Click "Undo" to restore previous node positions if I prefer the old layout
4. Optionally redo the reflow if I change my mind

#### Implementation Location

```
packages/viz/src/
├── layout/
│   └── useLayoutHistory.ts    # Undo/redo stack for node positions
└── editor/
    └── LayoutControls.tsx     # Reflow button, undo/redo buttons
```

#### Acceptance Criteria

- [x] "Reflow" button triggers ELK layout on current nodes
- [x] Previous node positions are saved before reflow
- [x] "Undo" button restores previous positions
- [x] "Redo" button re-applies the reflow
- [x] Visual feedback during reflow (loading indicator)
- [x] Keyboard shortcuts: Ctrl+Shift+L (reflow), Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- [x] History stack limited to reasonable depth (e.g., 10 states)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | useLayoutHistory hook | Complete |
| 2 | LayoutControls component | Complete |
| 3 | Integration with viz-demo | Complete |
| 4 | Keyboard shortcuts | Complete |
| 5 | Tests | Complete (via CORAL-REQ-013)

---

### CORAL-REQ-008: Coral File Format and Save/Load

**Traces To**: SYS-REQ-005 (Document Persistence and File Format)
**Status**: Complete
**Priority**: High
**Created**: 2026-02-01
**Completed**: 2026-02-01

#### Description

Implement a versioned file format for Coral diagrams and save/load/export functionality in the visual editor.

#### Implementation Location

```
packages/viz/src/
├── file/
│   ├── schema.ts              # CoralDocument TypeScript types
│   ├── validate.ts            # Validation with error messages
│   ├── serialize.ts           # Document → JSON
│   ├── deserialize.ts         # JSON → Document
│   ├── migrate.ts             # Schema migration utilities
│   └── index.ts               # Public exports
└── editor/
    └── FileControls.tsx       # Save, Load, Export buttons
```

#### File Format Schema

```typescript
interface CoralDocument {
  schemaVersion: "1.0.0";
  metadata: {
    name: string;
    description?: string;
    tags?: string[];
    version?: string;
    created: string;
    modified: string;
  };
  content: {
    format: "dsl" | "graph-ir";
    dslType?: "coral" | "mermaid" | "dot";
    text?: string;
    graphIR?: GraphIR;
  };
  settings: {
    notation: string;
    layout: {
      algorithm: string;
      direction: "UP" | "DOWN" | "LEFT" | "RIGHT";
      spacing: { nodeNode?: number; edgeNode?: number; layerSpacing?: number; };
      elkOptions?: Record<string, string | number | boolean>;
    };
  };
  viewState?: {
    zoom: number;
    pan: { x: number; y: number };
    selectedNodes?: string[];
  };
  nodePositions?: Record<string, { x: number; y: number }>;
}
```

#### Acceptance Criteria

- [x] `CoralDocument` TypeScript interface defined
- [x] JSON Schema for validation (TypeScript-based validation with helpful error messages)
- [x] `serialize(nodes, edges, settings) → CoralDocument`
- [x] `deserialize(json) → { nodes, edges, settings }`
- [x] Schema validation on load
- [x] Migration framework for version upgrades
- [x] "Save" button downloads `.coral.json` file
- [x] "Load" button opens file picker
- [x] "Export Graph-IR" exports Graph-IR portion
- [x] Tests (28 tests passing)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Define CoralDocument schema | Complete |
| 2 | Implement serialize/deserialize | Complete |
| 3 | Implement validation | Complete |
| 4 | Implement migration framework | Complete |
| 5 | Create FileControls component | Complete |
| 6 | Integrate with viz-demo | Complete |
| 7 | Tests | Complete (28 tests)

---

### CORAL-REQ-009: Settings Panel with Layout Configuration

**Traces To**: SYS-REQ-006 (Settings Architecture)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-02-01
**Completed**: 2026-02-01

#### Description

Implement a settings panel with two sections:
1. **Document Settings**: Saved with the diagram file
2. **User Preferences**: Saved to localStorage

Expose ELK layout parameters through the UI.

#### Key ELK Options to Expose

| Option | ELK Key | Default |
|--------|---------|---------|
| Algorithm | `elk.algorithm` | `layered` |
| Direction | `elk.direction` | `DOWN` |
| Node-Node Spacing | `elk.spacing.nodeNode` | `50` |
| Layer Spacing | `elk.layered.spacing.nodeNodeBetweenLayers` | `70` |
| Edge Routing | `elk.edgeRouting` | `ORTHOGONAL` |

#### Presets

| Preset | Algorithm | Direction | Notes |
|--------|-----------|-----------|-------|
| Flowchart | layered | DOWN | Top-to-bottom |
| Org Chart | mrtree | DOWN | Tree layout |
| Network | stress | - | Even distribution |

#### Implementation Location

```
packages/viz/src/
├── file/
│   └── schema.ts              # UserPreferences, LayoutPreset, DEFAULT_* constants, LAYOUT_PRESETS
├── settings/
│   ├── useSettings.ts         # Settings state management with localStorage
│   ├── LayoutSettingsForm.tsx # Layout configuration form
│   ├── SettingsPanel.tsx      # Two-tab panel (Document/Preferences)
│   └── index.ts               # Public exports
```

#### Acceptance Criteria

- [x] `DocumentSettings` and `UserPreferences` types
- [x] `useSettings` hook
- [x] localStorage persistence for user preferences
- [x] Settings panel with Document/Preferences tabs
- [x] Layout settings form with controls
- [x] Presets dropdown (5 presets: Flowchart, Org Chart, Network, Radial, Custom)
- [x] Advanced JSON editor for ELK options
- [x] "Apply" triggers reflow
- [x] Integration with file save (CORAL-REQ-008)
- [x] Tests (41 tests passing)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Define settings types | Complete |
| 2 | Implement localStorage persistence | Complete |
| 3 | Create useSettings hook | Complete |
| 4 | Create LayoutSettingsForm | Complete |
| 5 | Create SettingsPanel with tabs | Complete |
| 6 | Add presets | Complete |
| 7 | Integrate with viz-demo | Complete |
| 8 | Connect to file save/load | Complete |
| 9 | Tests | Complete (41 tests)

---

### CORAL-REQ-010: Port Compatibility Feedback

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-02-01
**Completed**: 2026-02-01

#### Description

Provide visual feedback for notation-aware port compatibility during edge connections. Some notations assign semantic meaning to ports (e.g., input vs output, true vs false branches). Users need clear visual cues when:

1. An existing edge connects incompatible ports
2. While dragging an edge to a new port

This addresses user feedback that "connectors seem to fail to anchor" when the actual issue is port incompatibility.

#### Visual Feedback

| Scenario | Visual Feedback |
|----------|-----------------|
| Existing incompatible edge | Warning color (orange/amber) |
| Hover on incompatible edge | Tooltip explaining incompatibility |
| Dragging to compatible port | Green anchor |
| Dragging to incompatible port | Yellow anchor |

#### Acceptance Criteria

- [x] Edge color changes to warning for incompatible connections
- [x] Tooltip on hover explains incompatibility reason
- [ ] Port anchors show green (compatible) or yellow (incompatible) during drag (deferred - complex feature)
- [x] Compatibility rules are notation-specific
- [x] Does not block connection (warning only)
- [x] Tests for compatibility validation

#### Implementation Details

**Compatibility Module** (`packages/viz/src/compatibility/`):
- `validateConnection.ts` - Core validation logic for symbol-to-symbol rules, port direction, max connections
- `useEdgeCompatibility.ts` - React hook for managing edge compatibility state
- `IncompatibilityTooltip.tsx` - Tooltip component showing incompatibility messages
- `CompatibilityEdge.tsx` - Custom React Flow edge with visual feedback (red/amber colors)

**Types Added** (`packages/viz/src/types.ts`):
- `IncompatibilityReason` - 'symbol-not-allowed' | 'port-direction-mismatch' | 'max-connections-exceeded' | 'self-connection' | 'constraint-violation'
- `ConnectionValidation` - Validation result with valid, hasWarning, reason, message
- `EdgeCompatibilityStatus` - 'compatible' | 'warning' | 'incompatible'
- `NodeConnectionInfo` - Node info for validation context

**Visual Feedback**:
- Incompatible edges: Red stroke, thicker line
- Warning edges: Amber stroke with dashed pattern
- Hover tooltip: Shows incompatibility reason with icon

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Define PortCompatibility types | Complete |
| 2 | Implement validateConnection utility | Complete |
| 3 | Add compatibility rules to notation definitions | Complete (using existing notation connectionRules) |
| 4 | Create useEdgeCompatibility hook | Complete |
| 5 | Style edges based on compatibility | Complete |
| 6 | Create IncompatibilityTooltip component | Complete |
| 7 | Implement drag-time anchor coloring | Deferred (complex feature) |
| 8 | Integrate with viz-demo | Complete |
| 9 | Tests | Complete (49 tests)

---

### CORAL-REQ-013: Position Stability and Incremental Layout

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Complete
**Priority**: Critical (Blocks Undo/Redo functionality)
**Created**: 2026-02-01
**Completed**: 2026-02-01
**Fixes**: Undo not working after reflow; user-moved nodes reset on DSL edit

#### Problem Statement

The current architecture conflates "parsing" with "layout". Every DSL text change triggers a full ELK layout, which:
1. **Breaks Undo**: User clicks Undo → positions restore → debounce triggers → full reflow → positions overwritten
2. **Ignores User Positioning**: User drags node → edits DSL text → full reflow → user's position lost
3. **Unnecessary Computation**: Changing a label re-layouts the entire graph

#### Root Cause

In `viz-demo/App.tsx`, `updateDiagram()` always calls `layoutNodes()`:
```typescript
const layoutedNodes = await layoutNodes(...);  // Always full ELK
```

There is no concept of "render with current positions" vs "compute new positions".

#### Solution: Separate Parse, Render, and Layout

Introduce three distinct operations:

| Operation | Trigger | Effect |
|-----------|---------|--------|
| **Parse** | DSL text changes | Extract nodes/edges from text |
| **Render** | Parse completes, node drag, undo/redo | Update visual with current positions |
| **Layout** | Explicit "Reflow" button | Run ELK to compute new positions |

#### Incremental Position Resolution

When DSL changes, compare old graph to new graph:

| Change Type | Position Resolution |
|-------------|---------------------|
| Label changed | Keep existing position |
| Node unchanged | Keep existing position |
| Node added | Option A: Place at (0,0) with "needs layout" indicator<br>Option B: Incremental ELK (pin existing, layout new)<br>Option C: Place near connected node |
| Node removed | Remove from diagram |
| Edge added/removed | Re-route edges only (no node movement) |

**Recommended**: Option B (Incremental ELK) with fallback to Option C.

#### ELK Incremental Layout Support

ELK can "pin" existing nodes using position constraints:

```typescript
const elkGraph = {
  children: nodes.map(node => ({
    id: node.id,
    width: node.width,
    height: node.height,
    // Pin existing nodes
    ...(node.isExisting ? {
      'elk.position': `(${node.position.x}, ${node.position.y})`,
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    } : {}),
  })),
};
```

New nodes (without `elk.position`) will be laid out by ELK while existing nodes stay pinned.

#### Position Storage Options

**Option 1: In-Memory Only (Current)**
- Positions stored in React Flow state
- Lost on page refresh
- Simplest implementation

**Option 2: In Document (CORAL-REQ-008)**
- `CoralDocument.nodePositions` already exists
- Persists across save/load
- Recommended for save/load scenarios

**Option 3: In DSL Text**
- Human-readable position annotations
- Example: `service "API" @pos(100, 50)`
- Survives copy/paste of DSL text
- More complex parsing

**Recommendation**: Use Option 2 for persistence, consider Option 3 as optional feature later.

#### Implementation Location

```
packages/viz/src/
├── layout/
│   ├── positionResolver.ts      # Diff graphs, resolve positions
│   ├── incrementalLayout.ts     # ELK with pinned nodes
│   └── index.ts
└── hooks/
    └── useDiagramState.ts       # Manages parse/render/layout separation

packages/viz-demo/src/
└── App.tsx                      # Refactor to use new architecture
```

#### New Types

```typescript
/** Position source tracking */
type PositionSource =
  | 'elk-computed'      // From ELK layout
  | 'user-dragged'      // User manually positioned
  | 'loaded'            // From saved document
  | 'incremental';      // From incremental layout

/** Node with position metadata */
interface PositionedNode {
  id: string;
  position: { x: number; y: number };
  positionSource: PositionSource;
  /** When position was last updated */
  positionTimestamp: number;
}

/** Graph diff result */
interface GraphDiff {
  added: string[];      // Node IDs
  removed: string[];    // Node IDs
  modified: string[];   // Nodes with label/type changes
  unchanged: string[];  // Nodes with no changes
}

/** Position resolution result */
interface PositionResolution {
  positions: Map<string, { x: number; y: number }>;
  needsLayout: string[];  // Nodes that need ELK positioning
}
```

#### Algorithm: Position Resolution

```typescript
function resolvePositions(
  oldGraph: Graph,
  newGraph: Graph,
  currentPositions: Map<string, Position>
): PositionResolution {
  const diff = diffGraphs(oldGraph, newGraph);
  const positions = new Map<string, Position>();
  const needsLayout: string[] = [];

  // Unchanged and modified nodes keep their positions
  for (const id of [...diff.unchanged, ...diff.modified]) {
    const pos = currentPositions.get(id);
    if (pos) {
      positions.set(id, pos);
    }
  }

  // New nodes need layout
  for (const id of diff.added) {
    needsLayout.push(id);
    // Temporary position until layout runs
    positions.set(id, { x: 0, y: 0 });
  }

  return { positions, needsLayout };
}
```

#### Acceptance Criteria

- [x] Undo correctly restores previous node positions (no auto-reflow)
- [x] User-dragged nodes keep their positions when DSL text changes
- [x] Label-only changes don't trigger any layout
- [x] New nodes from DSL are positioned via incremental layout
- [x] Removed nodes disappear without affecting other positions
- [x] "Reflow" button still performs full ELK layout
- [x] Position source is tracked per node
- [x] Graph diffing correctly identifies added/removed/modified nodes
- [x] Tests for position resolution algorithm
- [x] Tests for incremental layout
- [x] Tests for undo/redo with interleaved edits

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create `GraphDiff` and `PositionResolution` types | Complete |
| 2 | Implement `diffGraphs()` utility | Complete |
| 3 | Implement `resolvePositions()` algorithm | Complete |
| 4 | Implement `incrementalLayout()` with ELK pinning | Complete |
| 5 | Create `useDiagramState` hook | Complete |
| 6 | Refactor viz-demo App.tsx to separate parse/render/layout | Complete |
| 7 | Fix undo/redo to not trigger reflow | Complete |
| 8 | Add "needs layout" visual indicator for new nodes | Deferred |
| 9 | Tests for diffGraphs | Complete (20 tests) |
| 10 | Tests for resolvePositions | Complete (20 tests) |
| 11 | Tests for incrementalLayout | Complete (20 tests) |
| 12 | Integration tests for undo/redo scenarios | Complete (13 tests)

#### Design Decisions

**Q: Should we auto-layout new nodes or require explicit reflow?**
A: Auto-layout new nodes using incremental ELK (pin existing, layout new). This provides the best UX - existing positions are preserved while new nodes get sensible positions.

**Q: What if incremental layout produces poor results?**
A: User can always click "Reflow" to get a full layout. The incremental result is a reasonable starting point.

**Q: Should we track position source per node?**
A: Yes. This enables future features like "only reflow ELK-computed positions" or "highlight user-positioned nodes".

**Q: Does this affect CORAL-REQ-007 (Undo/Redo)?**
A: Yes, this is a prerequisite fix. The undo/redo hook is correct; the bug is that `updateDiagram()` auto-reflows. After this fix, undo/redo will work as expected.

---

### CORAL-REQ-011: Adaptive Node Sizing for Text Content

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Complete
**Priority**: High
**Created**: 2026-02-01
**Completed**: 2026-02-01
**Depends On**: CORAL-REQ-006 (Shape/Symbol definitions)

#### Problem Statement

Text frequently overflows shape boundaries in the visual diagram (see screenshot evidence). This occurs because:
1. Node dimensions are currently fixed or use generic defaults
2. ELK layout doesn't automatically measure text content
3. Different shape geometries require different text-to-bounds ratios (a diamond needs ~1.4x more space than a rectangle for the same text)

#### Description

Implement adaptive node sizing that computes appropriate dimensions based on:
1. **Text content** — Measured using canvas or DOM measurement
2. **Shape geometry** — Each shape type has a text-to-bounds ratio
3. **User preference** — Uniform sizing vs. adaptive sizing per diagram

#### ELK Integration

ELK supports node sizing via these properties:
```javascript
{
  'elk.nodeSize.constraints': 'NODE_LABELS',  // Let ELK use label dimensions
  'elk.nodeLabels.placement': 'INSIDE V_CENTER H_CENTER',
  'elk.nodeSize.minimum': '(80,40)',  // Minimum dimensions
}
```

However, ELK requires us to:
1. Pre-measure text dimensions before layout
2. Provide appropriate padding per shape type
3. Pass computed dimensions to ELK for layout consideration

#### Shape Geometry Ratios

Different shapes need different padding/scaling for the same text:

| Shape | Text-to-Bounds Ratio | Notes |
|-------|---------------------|-------|
| Rectangle | 1.0 | Baseline |
| Rounded Rectangle | 1.1 | Corner radius eats space |
| Diamond | 1.4-1.5 | Text fits in center only |
| Ellipse | 1.3 | Similar to diamond |
| Hexagon | 1.2 | Angled sides reduce usable area |
| Parallelogram | 1.25 | Slant reduces usable area |
| Cylinder | 1.1 (width), 1.3 (height) | Top/bottom caps |
| Document | 1.1 | Wave at bottom |
| Stadium | 1.2 | Rounded ends |

#### Sizing Modes (Document Setting)

Users should be able to choose:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Adaptive** | Each node sizes to fit its content | Diagrams with varied text lengths |
| **Uniform** | All nodes of same symbol type use consistent size | Clean, grid-aligned diagrams |
| **Hybrid** | Uniform within symbol type, but types can differ | Balanced approach |

For **Uniform** mode, the largest text content determines the size for all nodes of that symbol type.

#### Implementation Location

```
packages/viz/src/
├── layout/
│   ├── textMeasure.ts           # Canvas-based text measurement
│   ├── nodeSizing.ts            # Compute node dimensions from text + shape
│   └── index.ts                 # Export sizing utilities
├── shapes/
│   └── index.ts                 # Add textBoundsRatio to ShapeDefinition
└── types.ts                     # SizingMode type
```

#### Text Measurement Approach

Use canvas `measureText()` for accurate text width:
```typescript
interface TextMeasureOptions {
  text: string;
  fontSize: number;
  fontFamily: string;
  maxWidth?: number;      // For text wrapping
  lineHeight?: number;    // For multi-line text
}

interface TextDimensions {
  width: number;
  height: number;
  lines: string[];        // Text broken into lines
}

function measureText(options: TextMeasureOptions): TextDimensions;
```

#### Node Sizing Algorithm

```typescript
interface NodeSizingOptions {
  text: string;
  shape: ShapeDefinition;
  sizingMode: 'adaptive' | 'uniform' | 'hybrid';
  minWidth?: number;
  minHeight?: number;
  padding?: { x: number; y: number };
  uniformSizes?: Map<string, { width: number; height: number }>;
}

interface NodeDimensions {
  width: number;
  height: number;
  textBox: { x: number; y: number; width: number; height: number };
}

function computeNodeSize(options: NodeSizingOptions): NodeDimensions;
```

Algorithm:
1. Measure text dimensions using `measureText()`
2. Look up shape's `textBoundsRatio` from ShapeDefinition
3. Apply ratio: `nodeWidth = textWidth * ratio.x + padding.x`
4. Apply minimum constraints
5. For uniform mode, use pre-computed max size for symbol type
6. Return dimensions with inner text box coordinates

#### Shape Definition Extension

Extend `ShapeDefinition` to include sizing metadata:

```typescript
interface ShapeDefinition {
  // ... existing fields ...
  sizing: {
    textBoundsRatio: { x: number; y: number };
    minSize: { width: number; height: number };
    defaultSize: { width: number; height: number };
    padding: { x: number; y: number };
  };
}
```

#### Acceptance Criteria

- [x] `measureText()` utility accurately measures text with canvas
- [x] `computeNodeSize()` returns appropriate dimensions for each shape type
- [x] Shape definitions include `textBoundsRatio` for all 14 shapes
- [x] Sizing mode setting in document settings (adaptive/uniform/hybrid)
- [x] ELK layout respects computed node sizes
- [x] Text wrapping for long labels (optional, with maxWidth)
- [x] Visual editor renders nodes at computed sizes
- [x] No text overflow in any standard shape
- [x] Minimum size constraints prevent tiny nodes
- [x] Tests for text measurement accuracy (±2px)
- [x] Tests for node sizing with each shape type
- [x] Tests for uniform mode (all nodes of type X have same size)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add `sizing` metadata to ShapeDefinition type | Complete |
| 2 | Update 14 shape definitions with sizing ratios | Complete |
| 3 | Implement `measureText()` utility | Complete |
| 4 | Implement `computeNodeSize()` utility | Complete |
| 5 | Add `sizingMode` to document settings type | Complete |
| 6 | Integrate sizing into layout pipeline (before ELK) | Complete |
| 7 | Update ShapeRenderer to use computed dimensions | Complete |
| 8 | Add text wrapping support (optional) | Complete |
| 9 | Tests for measureText | Complete |
| 10 | Tests for computeNodeSize per shape | Complete |
| 11 | Tests for uniform sizing mode | Complete |
| 12 | Integration test with viz-demo | Complete (31 tests) |

#### Design Decisions

**Q: Why canvas measureText instead of DOM measurement?**
A: Canvas is faster and doesn't require DOM manipulation. For server-side rendering, we can use a canvas polyfill or pre-compute sizes.

**Q: Why not let ELK handle all sizing?**
A: ELK can consider label dimensions but doesn't know our shape geometries. A diamond with "Hello" needs different dimensions than a rectangle with "Hello". We compute shape-aware sizes, then let ELK use them for layout.

**Q: Should we support text wrapping?**
A: Yes, as an optional feature. For very long labels, wrapping at a maxWidth prevents extremely wide nodes. This is especially useful for flowchart process descriptions.

---

### CORAL-REQ-012: Font Customization for Diagram Text

**Traces To**: SYS-REQ-006 (Settings Architecture)
**Status**: Proposed
**Priority**: Medium
**Created**: 2026-02-01
**Related To**: CORAL-REQ-011 (Adaptive Node Sizing), CORAL-REQ-009 (Settings Panel)

#### Description

Allow users to customize the font family and font size for text displayed within diagram shapes and symbols. Font settings affect node sizing (CORAL-REQ-011) and should be persisted with the document (CORAL-REQ-008).

#### Font Settings Scope

| Scope | Description | Storage |
|-------|-------------|---------|
| **Document Default** | Applies to all nodes in diagram | CoralDocument.settings |
| **Symbol Type Override** | Per-symbol-type font (e.g., all decisions use 12px) | CoralDocument.settings |
| **Node Override** | Individual node font override | Node metadata (future) |

Initial implementation focuses on Document Default only. Symbol Type and Node overrides are stretch goals.

#### Font Settings Schema

```typescript
interface FontSettings {
  family: string;           // e.g., "Inter", "Arial", "monospace"
  size: number;             // in pixels, e.g., 14
  weight?: 'normal' | 'bold' | number;  // 400, 500, 600, 700
  lineHeight?: number;      // multiplier, e.g., 1.2
}

interface DiagramFontSettings {
  default: FontSettings;
  symbolOverrides?: Record<string, Partial<FontSettings>>;  // keyed by symbol type
}
```

#### Document Schema Extension

Add to `CoralDocument.settings`:

```typescript
interface CoralDocumentSettings {
  notation: string;
  layout: LayoutSettings;
  font: DiagramFontSettings;  // NEW
}
```

#### Default Font Stack

```typescript
const DEFAULT_FONT_SETTINGS: FontSettings = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  weight: 'normal',
  lineHeight: 1.3,
};
```

#### Predefined Font Options

| Option | Family | Use Case |
|--------|--------|----------|
| System | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Default, native feel |
| Sans Serif | `"Inter", "Helvetica Neue", Arial, sans-serif` | Clean, modern |
| Serif | `"Georgia", "Times New Roman", serif` | Traditional |
| Monospace | `"JetBrains Mono", "Fira Code", monospace` | Technical diagrams |
| Handwritten | `"Comic Neue", "Comic Sans MS", cursive` | Sketchy/informal |

#### Font Size Presets

| Preset | Size | Use Case |
|--------|------|----------|
| Small | 11px | Dense diagrams |
| Normal | 14px | Default |
| Large | 16px | Presentations |
| Extra Large | 18px | Accessibility |

Custom size input should also be available (range: 8px - 32px).

#### Integration with Node Sizing (CORAL-REQ-011)

Font settings MUST be passed to `measureText()`:

```typescript
// In nodeSizing.ts
const textDimensions = measureText({
  text: node.label,
  fontSize: fontSettings.size,
  fontFamily: fontSettings.family,
  fontWeight: fontSettings.weight,
  lineHeight: fontSettings.lineHeight,
});
```

When font settings change, all node sizes must be recalculated and layout re-run.

#### Implementation Location

```
packages/viz/src/
├── file/
│   └── schema.ts             # Add DiagramFontSettings to CoralDocument
├── layout/
│   └── textMeasure.ts        # Accept FontSettings in measurement
├── components/
│   └── SymbolNode.tsx        # Apply font styles to rendered text
└── editor/
    └── FontSettingsForm.tsx  # UI for font selection (part of Settings Panel)
```

#### Acceptance Criteria

- [ ] `FontSettings` and `DiagramFontSettings` types defined
- [ ] Font settings added to `CoralDocument.settings.font`
- [ ] Default font settings applied when not specified
- [ ] `measureText()` accepts and uses font settings
- [ ] Font family dropdown with predefined options + custom input
- [ ] Font size dropdown with presets + custom number input
- [ ] Font weight toggle (normal/bold)
- [ ] Font changes trigger node resize recalculation
- [ ] Font changes trigger layout reflow
- [ ] Fonts render correctly in ShapeRenderer/SymbolNode
- [ ] Font settings persist in saved documents
- [ ] Migration adds default font settings to older documents
- [ ] Tests for font settings serialization
- [ ] Tests for measureText with different fonts

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Define FontSettings types | Not started |
| 2 | Add font to CoralDocument schema | Not started |
| 3 | Add migration for font settings | Not started |
| 4 | Update measureText to use FontSettings | Not started |
| 5 | Update SymbolNode to apply font styles | Not started |
| 6 | Create FontSettingsForm component | Not started |
| 7 | Integrate with Settings Panel (CORAL-REQ-009) | Not started |
| 8 | Wire font changes to trigger reflow | Not started |
| 9 | Tests | Not started |

#### Design Decisions

**Q: Should font be a document or user preference setting?**
A: Document setting. Different diagrams may need different fonts (e.g., technical vs presentation). Users can set their preferred default in user preferences, but the document value wins.

**Q: Why not per-node font customization initially?**
A: Complexity. Per-node fonts require UI for selecting individual nodes and managing many overrides. Document-wide and symbol-type-level cover 90% of use cases. Per-node can be added later.

**Q: How to handle fonts not available on user's system?**
A: Use font stacks with fallbacks. The CSS `font-family` property handles this automatically. For canvas measurement, we detect if the font loaded and fall back if needed.

---

### CORAL-REQ-014: DSL Position Annotations

**Traces To**: SYS-REQ-001 (Bidirectional Text/Visual Editor)
**Status**: Future
**Priority**: Low
**Created**: 2026-02-01
**Depends On**: CORAL-REQ-013 (Position Stability architecture)
**Informs**: graph-ir-tools (requires IR schema extension for position metadata)

#### Description

Allow node positions to be stored directly in DSL text as human-readable annotations. This enables positions to survive copy/paste of DSL text between documents or systems.

#### Motivation

While CORAL-REQ-013 stores positions in the document file (`nodePositions`), those positions are lost when:
1. User copies DSL text to share with others
2. User pastes DSL into a different tool
3. DSL is stored in version control without the full document wrapper

Position annotations in DSL text make layouts portable and version-controllable.

#### Proposed Syntax

**Coral DSL:**
```coral
service "API Gateway" @pos(100, 50)
database "User DB" @pos(250, 150)
module "Auth Service" @pos(100, 250)

api_gateway -> user_db
api_gateway -> auth_service
```

**Mermaid Extension (non-standard):**
```mermaid
flowchart TD
    A[API Gateway] @pos(100,50)
    B[(User DB)] @pos(250,150)
    A --> B
```

#### Grammar Extension

For Coral DSL parser:
```
node_declaration = node_type STRING node_id? position_annotation?
position_annotation = "@pos" "(" NUMBER "," NUMBER ")"
```

#### Behavior

| Scenario | Behavior |
|----------|----------|
| DSL has `@pos` | Use specified position, skip ELK for this node |
| DSL lacks `@pos` | Use ELK layout (or incremental positioning per REQ-013) |
| User drags node | Optionally update `@pos` in DSL (bidirectional sync) |
| Reflow clicked | Remove all `@pos` annotations, run full ELK |

#### Bidirectional Sync Considerations

If enabled, dragging a node in the visual editor would update the DSL text:
```coral
# Before drag
service "API" @pos(100, 50)

# After drag to (200, 75)
service "API" @pos(200, 75)
```

This requires careful handling to avoid cursor jumps and edit conflicts.

#### Graph-IR Schema Impact

Position annotations may require IR schema extension:

```typescript
// In graph-ir node metadata
interface NodeMetadata {
  // ... existing fields ...
  position?: {
    x: number;
    y: number;
    source: 'dsl-annotation' | 'computed' | 'user-dragged';
  };
}
```

**Action Required**: Coordinate with graph-ir-tools to determine if position metadata belongs in IR or remains Coral-specific.

#### Implementation Location

```
packages/language/src/
├── parser/
│   └── coral.ts          # Parse @pos annotations
└── printer/
    └── coral.ts          # Emit @pos annotations

packages/viz/src/
└── text-editor/
    └── hooks/
        └── useBidirectionalSync.ts  # Sync position changes to DSL
```

#### Acceptance Criteria

- [ ] Coral DSL parser recognizes `@pos(x, y)` annotations
- [ ] Parsed positions are used instead of ELK layout
- [ ] Coral DSL printer emits `@pos` for positioned nodes (optional setting)
- [ ] Mermaid parser supports `@pos` extension (optional, may break standard parsers)
- [ ] Reflow removes `@pos` annotations when computing new layout
- [ ] Bidirectional sync updates `@pos` on node drag (optional setting)
- [ ] Document setting: "Embed positions in DSL" (on/off)
- [ ] Tests for parsing with/without annotations
- [ ] Tests for printer with position embedding

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Extend Coral grammar for @pos | Future |
| 2 | Update parser to extract positions | Future |
| 3 | Update printer to emit @pos | Future |
| 4 | Add document setting for position embedding | Future |
| 5 | Integrate with bidirectional sync | Future |
| 6 | Coordinate with graph-ir-tools on IR schema | Future |
| 7 | Tests | Future |

#### Design Decisions

**Q: Should positions be integers or floats?**
A: Integers. Floating point precision adds noise to diffs and isn't meaningful at pixel scale.

**Q: Should @pos be mandatory or optional per node?**
A: Optional. Nodes without @pos get ELK layout. This allows partial positioning.

**Q: Should Mermaid support @pos?**
A: As an optional extension only. Standard Mermaid parsers would reject it, so users must opt-in.

**Q: Should bidirectional sync update DSL on every drag?**
A: Only on drag end, and only if "Embed positions in DSL" setting is enabled. Real-time updates would cause too much text churn.

---

### CORAL-REQ-015: Manual Edge Waypoint Routing

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Proposed
**Priority**: Low
**Created**: 2026-02-01

#### Description

Enable manual control over edge routing by allowing users to add, move, and remove waypoints (control points) on edge paths. Currently, edge routing is automatic based on the edge type (bezier, smoothstep, straight). Users have requested the ability to manually adjust edge paths to:

1. Avoid overlapping with nodes or other edges
2. Create cleaner visual layouts for complex diagrams
3. Highlight specific connection paths

This is a significant feature that requires custom edge components and waypoint state management.

#### User Interaction

| Action | Behavior |
|--------|----------|
| Double-click on edge | Add waypoint at click position |
| Drag waypoint | Move waypoint, edge path updates in real-time |
| Right-click waypoint | Remove waypoint |
| Select edge | Show existing waypoints as draggable handles |
| Reflow button | Option to clear manual waypoints (reset to auto-routing) |

#### Technical Approach

**Option A: Custom Waypoint Edge Component**
- Create `WaypointEdge` component with draggable control points
- Store waypoints in edge data: `edge.data.waypoints: Array<{x, y}>`
- Use SVG path interpolation through waypoints
- Pro: Full control, works with any edge type
- Con: Complex implementation, must handle all edge interactions

**Option B: Extend ELK Edge Routing**
- Use ELK's edge routing algorithms with pinned waypoints
- Pass waypoints as constraints to ELK
- Pro: Leverages existing layout engine
- Con: Requires ELK integration, may not support all edge types

**Option C: React Flow Pro Edge Features**
- Investigate React Flow Pro features for edge editing
- May provide built-in waypoint support
- Pro: Less custom code
- Con: May require Pro license, less customizable

**Recommended**: Option A (Custom Waypoint Edge Component) for maximum flexibility.

#### Data Model

```typescript
interface EdgeWaypoint {
  id: string;
  x: number;
  y: number;
  // Optional: control point type for bezier curves
  type?: 'corner' | 'smooth';
}

interface WaypointEdgeData {
  waypoints?: EdgeWaypoint[];
  // Auto-routing type when no waypoints
  autoRouteType?: 'bezier' | 'smoothstep' | 'straight';
}
```

#### File Format Integration

Waypoints should be saved in the Coral file format:

```typescript
interface CoralEdge {
  // ... existing fields ...
  waypoints?: Array<{ x: number; y: number }>;
}
```

#### Acceptance Criteria

- [ ] Users can double-click an edge to add a waypoint
- [ ] Users can drag waypoints to adjust edge path
- [ ] Users can remove waypoints (right-click or delete key)
- [ ] Waypoints are visible when edge is selected
- [ ] Waypoints are saved in Coral file format
- [ ] Reflow has option to clear waypoints
- [ ] Edge type selector (bezier/smoothstep/straight) still works
- [ ] Compatibility with CompatibilityEdge styling
- [ ] Tests for waypoint operations
- [ ] Performance acceptable with many waypoints

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Design WaypointEdge component | Not started |
| 2 | Implement waypoint rendering and interaction | Not started |
| 3 | Add waypoint state management | Not started |
| 4 | Integrate with edge selection | Not started |
| 5 | Update file format schema for waypoints | Not started |
| 6 | Add reflow waypoint clearing option | Not started |
| 7 | Integrate with CompatibilityEdge | Not started |
| 8 | Tests | Not started |

#### Dependencies

- CORAL-REQ-008 (File Format) - for waypoint persistence
- CORAL-REQ-010 (Compatibility Edge) - for styling integration

#### Considerations

**Performance**: Diagrams with many edges and waypoints could have performance issues. Consider:
- Lazy rendering of waypoint handles
- Debouncing waypoint drag updates
- Limiting maximum waypoints per edge

**DSL Representation**: Should waypoints be representable in Coral DSL? Consider syntax like:
```
a -> b via(100,50)(200,100)
```
This would be a future enhancement (coordinate with CORAL-REQ-014).

---

### CORAL-REQ-016: Auto-Recovery and Session Persistence

**Traces To**: SYS-REQ-005 (Document Persistence and File Format)
**Status**: Complete
**Priority**: High
**Created**: 2026-02-01
**Completed**: 2026-02-01

#### Description

Implement auto-recovery to protect user work from browser crashes, accidental tab closes, or page refreshes. The system maintains the explicit save/load workflow (per CORAL-REQ-008) while automatically persisting session state to localStorage.

#### Key Features

| Feature | Implementation |
|---------|----------------|
| **Auto-save to localStorage** | Debounced (1 second) save on diagram changes |
| **Recovery on startup** | Prompt to restore or discard recovered diagram |
| **Unsaved changes warning** | `beforeunload` event warns before leaving with unsaved changes |
| **Unsaved indicator** | Visual indicator in header shows unsaved state |
| **Explicit save preserved** | File download still requires user action |

#### Recovery Data Schema

```typescript
interface RecoveryData {
  timestamp: number;           // When auto-saved
  documentName: string;        // Document name
  dslType: 'coral' | 'mermaid';
  dsl: string;                 // DSL text content
  notation: string;            // Current notation
  nodePositions: Record<string, { x: number; y: number }>;
  lastExplicitSave?: number;   // Timestamp of last file save
}
```

#### Implementation Location

```
packages/viz-demo/src/
├── useAutoRecovery.ts        # Hook for recovery logic
├── RecoveryBanner.tsx        # UI components
└── App.tsx                   # Integration
```

#### Acceptance Criteria

- [x] Diagram state auto-saves to localStorage on changes
- [x] Recovery banner appears on startup if recoverable data exists
- [x] User can restore or discard recovered diagram
- [x] `beforeunload` warns when leaving with unsaved changes
- [x] Unsaved indicator shows in header when dirty
- [x] Explicit save clears dirty state
- [x] Stale recovery data (>7 days) is automatically discarded
- [x] Corrupted recovery data is handled gracefully
- [x] Tests for all recovery scenarios (23 tests)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create useAutoRecovery hook | Complete |
| 2 | Create RecoveryBanner component | Complete |
| 3 | Write tests (TDD) | Complete (23 tests) |
| 4 | Integrate with viz-demo App | Complete |
| 5 | Add beforeunload warning | Complete |
| 6 | Add unsaved indicator | Complete |

#### Design Decisions

**Q: Why not auto-save to file?**
A: The Coral Design Standard specifies explicit save/load to give users control over when changes are committed. Auto-recovery to localStorage provides crash protection while preserving this workflow.

**Q: How long to keep recovery data?**
A: 7 days. After that, it's likely stale and should be discarded. Users who haven't returned in a week probably don't need the old diagram.

**Q: What about multiple tabs?**
A: Each tab session overwrites the same localStorage key. This is intentional - we're recovering the most recent work, not providing full version history.

---

### CORAL-REQ-017: Armada HTTP Datasource for viz-demo

**Traces To**: SYS-REQ-007 (Remote Datasource Integration)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-02-01
**Completed**: 2026-02-01
**Depends On**: ARMADA-REQ-002 (HTTP Visualization API)

#### Description

Add Armada's HTTP REST API as a third datasource in viz-demo, alongside text input and file load. This enables viz-demo to serve as:
1. A reference implementation showing how the ecosystem supports MCP servers as diagram datasources
2. An interface for evaluating Armada fitness (indexers, tokenizers, chunkers, database retrieval)

#### Architecture

```
viz-demo datasources:
┌─────────────┬─────────────┬──────────────────┐
│ Text Input  │ File Load   │ Armada HTTP API  │
│ (DSL paste) │ (.coral.json│ (localhost:8765) │
└──────┬──────┴──────┬──────┴────────┬─────────┘
       │             │               │
       └─────────────┼───────────────┘
                     ▼
             ┌───────────────┐
             │ CoralDocument │
             │   (unified)   │
             └───────┬───────┘
                     ▼
             ┌───────────────┐
             │  React Flow   │
             │   Renderer    │
             └───────────────┘
```

#### Armada HTTP API (Provided by ARMADA-REQ-002)

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /api/graph?mode=<mode>&format=<json\|dsl>` | Get CoralDocument or DSL |
| `GET /api/modes` | List available graph modes |
| `GET /api/stats` | Node/edge counts |

Graph modes: `call-graph`, `dependency-graph`, `inheritance-tree`, `impact-graph`, `full-graph`

#### Implementation Location

```
packages/viz-demo/src/
├── components/
│   ├── ArmadaConnectionDialog.tsx   # Server URL + mode selection
│   ├── ArmadaStatusBar.tsx          # Connection status, stats
│   └── ArmadaDatasource.tsx         # Fetch logic, error handling
├── hooks/
│   └── useArmadaConnection.ts       # Connection state, API calls
└── App.tsx                          # Integration with existing datasources
```

#### User Flow

1. User clicks "Connect to Armada" button
2. Connection dialog appears:
   - Server URL (default: `http://localhost:8765`)
   - Graph mode dropdown (call-graph, dependency-graph, etc.)
3. viz-demo calls `GET /api/graph?mode=<selected>&format=json`
4. Armada returns CoralDocument JSON
5. viz-demo renders diagram (same path as file load)
6. Status bar shows connection state and stats from `/api/stats`
7. "Refresh" button re-fetches current mode

#### Acceptance Criteria

- [ ] Connection dialog with URL input and mode selector
- [ ] Successful connection loads and renders CoralDocument
- [ ] Mode switcher changes graph visualization
- [ ] Stats display shows node/edge counts
- [ ] Error handling for connection failures, timeouts
- [ ] Refresh button re-fetches current mode
- [ ] Connection state persists in localStorage (reconnect on reload)
- [ ] Works alongside existing text input and file load datasources
- [ ] Tests for connection logic and error states

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create useArmadaConnection hook | Not started |
| 2 | Create ArmadaConnectionDialog component | Not started |
| 3 | Create ArmadaStatusBar component | Not started |
| 4 | Integrate with App.tsx datasource switching | Not started |
| 5 | Add error handling and retry logic | Not started |
| 6 | Add connection persistence to localStorage | Not started |
| 7 | Tests | Not started |

#### Design Decisions

**Q: Why HTTP API instead of MCP directly?**
A: MCP is designed for stdio (CLI tools), not browser environments. Armada's HTTP API (`/api/graph`) returns CoralDocument directly, which integrates cleanly with viz-demo's existing file load path. The MCP server remains the primary interface for Claude Code integration.

**Q: Should this replace the hardcoded "Armada" button?**
A: Yes. The current button shows static sample data. This requirement replaces it with live Armada connection.

**Q: How does this relate to CORAL-REQ-002 (Armada MCP Client)?**
A: CORAL-REQ-002 is for the MCP server package (`@coral/mcp-server`) to call Armada's MCP tools. This requirement (CORAL-REQ-017) is for viz-demo (browser) to call Armada's HTTP API. Different integration points, same ecosystem.

---

### CORAL-REQ-018: Filter UI and Legend for Armada Datasource

**Traces To**: SYS-REQ-007 (Remote Datasource Integration) - Phase 2
**Status**: Proposed
**Priority**: Medium
**Created**: 2026-02-02
**Depends On**: CORAL-REQ-017 (Armada HTTP Datasource), ARMADA-REQ-003 (Enhanced Filtering)

#### Description

Extend the Armada datasource integration with filtering capabilities and a legend for node/edge types. This enables users to narrow large codebase visualizations to specific files, node types, or traversal depths.

#### Features

1. **Filter Panel**
   - File filter (dropdown from `/api/files`)
   - Node type filter (checkboxes from `/api/schema`)
   - Depth limit slider
   - Apply/Reset buttons

2. **Legend**
   - Node type → color/shape mapping
   - Edge type → line style mapping
   - Click to toggle visibility

3. **Filter Persistence**
   - Remember last filter settings in localStorage
   - Apply filters on reconnect

#### Acceptance Criteria

- [ ] Filter panel shows file list from Armada `/api/files`
- [ ] Filter panel shows node types from Armada `/api/schema`
- [ ] Depth limit slider (1-10)
- [ ] Filters passed to `/api/graph` as query parameters
- [ ] Legend displays all node/edge types in current visualization
- [ ] Legend click toggles type visibility
- [ ] Filter settings persist to localStorage
- [ ] Tests for filter logic

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create FilterPanel component | Not started |
| 2 | Integrate with Armada schema endpoint | Not started |
| 3 | Create Legend component | Not started |
| 4 | Add visibility toggle logic | Not started |
| 5 | Add filter persistence | Not started |
| 6 | Tests | Not started |

---

## Requirement Index

| ID | Title | Traces To | Status |
|----|-------|-----------|--------|
| CORAL-REQ-001 | Text Editor Components | SYS-REQ-001 | Complete |
| CORAL-REQ-002 | Armada MCP Client | SYS-REQ-002 | Complete |
| CORAL-REQ-003 | KG→IR Transformer | SYS-REQ-002 | Complete |
| CORAL-REQ-004 | coral_from_codebase Tool | SYS-REQ-002 | Complete |
| CORAL-REQ-005 | Incremental Updates | SYS-REQ-002 | Complete |
| CORAL-REQ-006 | Coral Shapes and Notations | SYS-REQ-003 | Complete |
| CORAL-REQ-007 | Diagram Reflow with Undo | SYS-REQ-004 | Complete |
| CORAL-REQ-008 | Coral File Format and Save/Load | SYS-REQ-005 | Complete |
| CORAL-REQ-009 | Settings Panel with Layout Config | SYS-REQ-006 | Complete |
| CORAL-REQ-010 | Port Compatibility Feedback | SYS-REQ-004 | Complete |
| CORAL-REQ-011 | Adaptive Node Sizing for Text | SYS-REQ-004 | Complete |
| CORAL-REQ-012 | Font Customization for Diagram Text | SYS-REQ-006 | Proposed |
| CORAL-REQ-013 | Position Stability and Incremental Layout | SYS-REQ-004 | Complete |
| CORAL-REQ-014 | DSL Position Annotations | SYS-REQ-001 | Future |
| CORAL-REQ-015 | Manual Edge Waypoint Routing | SYS-REQ-004 | Proposed |
| CORAL-REQ-016 | Auto-Recovery and Session Persistence | SYS-REQ-005 | Complete |
| CORAL-REQ-017 | Armada HTTP Datasource for viz-demo | SYS-REQ-007 | Complete |
| CORAL-REQ-018 | Filter UI and Legend for Armada | SYS-REQ-007 | Proposed |

---

**Last Updated**: 2026-02-02 (Added CORAL-REQ-018 - Filter UI and Legend)
