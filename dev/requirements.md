# Coral Component Requirements

> **Location**: This file should be placed at `coral/dev/requirements.md`
> **Authority**: System requirements are in `graph-ir-tools/ecosystem/requirements/`

---

## Requirements

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
**Status**: Proposed
**Priority**: Medium
**Created**: 2026-01-31

#### Description

Detect code changes and automatically update diagrams.

#### Acceptance Criteria

- [ ] Watch mode detects file changes
- [ ] Changed files trigger re-indexing
- [ ] Diagram updates without full regeneration

#### PROGRESS.md Steps

Phase 4 Step 5 (Not started)

---

### CORAL-REQ-006: Coral Shapes and Diagram Notations

**Traces To**: SYS-REQ-003 (Symbol/Notation Architecture)
**Status**: Proposed
**Priority**: High
**Created**: 2026-01-31

#### Description

Define shape geometries, diagram symbols (flowchart, BPMN, ERD), and notations for Coral visual rendering using the three-layer architecture.

#### Three-Layer Architecture

| Layer | Storage | Defines | Key Properties |
|-------|---------|---------|----------------|
| **Shape** | YAML + SVG paths | Pure geometry | `path`, `viewBox`, `portAnchors`, `defaultSize` |
| **Symbol** | YAML | Shape + meaning | `ports`, `variants`, `defaults`, `tags`, `notations` |
| **Notation** | YAML | Grammar rules | `symbols`, `connectionRules`, `validation` |

#### Port Model

- **Shapes** define `portAnchors` — geometric positions where connections CAN attach
- **Symbols** define `ports` — which anchors ARE used and their semantic meaning

```yaml
# Shape: geometry only
portAnchors:
  - { side: NORTH, position: 0.5 }
  - { side: SOUTH, position: 0.5 }

# Symbol: semantics
ports:
  - { id: in, anchor: NORTH, direction: in, maxConnections: 1 }
  - { id: out, anchor: SOUTH, direction: out }
```

This enables same shape with different port semantics (rectangle as process vs state).

#### Implementation Location

```
packages/viz/
├── shapes/
│   ├── primitives/           # YAML with SVG geometry
│   │   ├── rectangle.yaml
│   │   ├── diamond.yaml
│   │   ├── cylinder.yaml
│   │   └── ...
│   ├── assets/               # External SVG/PNG (logos, icons)
│   └── index.ts              # Loads YAML → ShapeRegistry
├── symbols/
│   ├── flowchart.yaml
│   ├── bpmn.yaml
│   ├── erd.yaml
│   ├── code.yaml             # Visuals for Armada code symbols
│   └── index.ts              # Loads YAML → SymbolRegistry
├── notations/
│   ├── flowchart.yaml
│   ├── bpmn.yaml
│   ├── erd.yaml
│   └── index.ts              # Loads YAML → NotationRegistry
└── rendering/
    ├── ShapeRenderer.tsx     # YAML geometry → React/SVG
    └── SymbolRenderer.tsx    # Symbol + shape → React Flow node
```

#### Acceptance Criteria

- [ ] Shape geometries defined: rectangle, diamond, ellipse, cylinder, parallelogram, hexagon, document, stadium, actor (14 shapes)
- [ ] Shapes include `portAnchors` for connection points
- [ ] Flowchart symbols defined: terminal, process, decision, io, document, connector (7 symbols)
- [ ] Flowchart notation defined with connection rules
- [ ] BPMN symbols defined: start-event, end-event, task, gateway variants
- [ ] ERD symbols defined: entity, relationship, attribute
- [ ] Code symbols defined for Armada integration (function, class, module)
- [ ] Symbol variants work (e.g., terminal start vs end)
- [ ] Notation validation enforces connection rules
- [ ] Rendering uses symbol registry (not hardcoded shapes)
- [ ] Tests for shape loading, symbol resolution, notation validation

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create `shapes/primitives/` with 14 base shapes (YAML + SVG paths) | Not started |
| 2 | Create `shapes/index.ts` to load shapes into registry | Not started |
| 3 | Create `symbols/flowchart.yaml` with 7 flowchart symbols | Not started |
| 4 | Create `notations/flowchart.yaml` with connection rules | Not started |
| 5 | Create `symbols/bpmn.yaml` and `notations/bpmn.yaml` | Not started |
| 6 | Create `symbols/erd.yaml` and `notations/erd.yaml` | Not started |
| 7 | Create `symbols/code.yaml` for Armada visual mappings | Not started |
| 8 | Create `ShapeRenderer.tsx` (YAML → SVG) | Not started |
| 9 | Create `SymbolRenderer.tsx` (symbol → React Flow node) | Not started |
| 10 | Update editor to use symbol registry | Not started |
| 11 | Add notation validation to editor | Not started |
| 12 | Tests (shape loading, symbol resolution, notation validation) | Not started |

#### Design References

- See `graph-ir-tools/drafts/coral-symbols-spec.md` for detailed YAML examples
- See `graph-ir-tools/drafts/coral-req-006.md` for original requirement draft
- Infrastructure types in `@graph-ir-tools/core` (ShapeDefinition, SymbolDefinition, NotationDefinition)

---

### CORAL-REQ-007: Diagram Reflow with Undo

**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Proposed
**Priority**: Medium
**Created**: 2026-01-31

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

- [ ] "Reflow" button triggers ELK layout on current nodes
- [ ] Previous node positions are saved before reflow
- [ ] "Undo" button restores previous positions
- [ ] "Redo" button re-applies the reflow
- [ ] Visual feedback during reflow (loading indicator)
- [ ] Keyboard shortcuts: Ctrl+Shift+L (reflow), Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- [ ] History stack limited to reasonable depth (e.g., 10 states)

#### PROGRESS.md Steps

| Step | Description | Status |
|------|-------------|--------|
| 1 | useLayoutHistory hook | Not started |
| 2 | LayoutControls component | Not started |
| 3 | Integration with SplitEditor | Not started |
| 4 | Keyboard shortcuts | Not started |
| 5 | Tests | Not started |

---

## Requirement Index

| ID | Title | Traces To | Status |
|----|-------|-----------|--------|
| CORAL-REQ-001 | Text Editor Components | SYS-REQ-001 | Complete |
| CORAL-REQ-002 | Armada MCP Client | SYS-REQ-002 | Complete |
| CORAL-REQ-003 | KG→IR Transformer | SYS-REQ-002 | Complete |
| CORAL-REQ-004 | coral_from_codebase Tool | SYS-REQ-002 | Complete |
| CORAL-REQ-005 | Incremental Updates | SYS-REQ-002 | Proposed |
| CORAL-REQ-006 | Coral Shapes and Notations | SYS-REQ-003 | Proposed |
| CORAL-REQ-007 | Diagram Reflow with Undo | SYS-REQ-004 | Proposed |

---

**Last Updated**: 2026-01-31
