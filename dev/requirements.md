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

## Requirement Index

| ID | Title | Traces To | Status |
|----|-------|-----------|--------|
| CORAL-REQ-001 | Text Editor Components | SYS-REQ-001 | Complete |
| CORAL-REQ-002 | Armada MCP Client | SYS-REQ-002 | Complete |
| CORAL-REQ-003 | KG→IR Transformer | SYS-REQ-002 | Complete |
| CORAL-REQ-004 | coral_from_codebase Tool | SYS-REQ-002 | Complete |
| CORAL-REQ-005 | Incremental Updates | SYS-REQ-002 | Proposed |

---

**Last Updated**: 2026-01-31
