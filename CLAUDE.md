# Coral - Agent Development Guidelines

## Quick Start

> Say **"continue"** or **"what's next?"** to proceed with implementation.
>
> Claude will read PROGRESS.md to determine the current step and continue from there.

---

## Phase Assignment

| Attribute | Value |
|-----------|-------|
| **Phase** | 2 (Diagramming) complete, Phase 4 (Integration) complete, coral-code-design Phase 1 complete |
| **Role** | Symbiotic diagramming toolchain |
| **Authority** | See `ECOSYSTEM-DEVELOPMENT-PLAN.md` in graph-ir-tools |

Coral bridges text DSLs and visual editors:
- Parse Coral DSL, Mermaid, DOT formats
- Render visual diagrams with ELK + React Flow
- Bidirectional sync between text and visual
- **coral-code-design**: Standalone IDE for architecture visualization

---

## Prerequisites

Before starting Phase 2 work, verify Phase 1 is complete:

```
Phase 1 Checklist (ask user if unsure):
- [ ] @graph-ir-tools/core is published/available
- [ ] MCP server (validate_ir, generate_ir, layout_ir) is functional
- [ ] tree-sitter-assistant agent is available
```

If Phase 1 is not complete, say: "Phase 2 depends on Phase 1 completion. Is Phase 1 complete?"

---

## Running npm/node Commands

This project uses nvm for Node.js version management. An `.nvmrc` file pins the version to `lts/iron` (Node 20.x).

```bash
# Load nvm (required in non-interactive shells or scripts)
source ~/.nvm/nvm.sh

# Then load the project's Node version
nvm use

# Run commands normally
npm install
npm test
npx vitest run
```

**Note**: In interactive terminals with nvm configured in `.bashrc`/`.zshrc`, you can skip the `source` command and just run `nvm use` directly.

---

## Implementation Steps (Phase 2)

Complete these steps in order. Check [PROGRESS.md](./PROGRESS.md) for current status.

| Step | Component | Depends On | Produces |
|------|-----------|------------|----------|
| 1 | Coral Grammar | Phase 1: `tree-sitter-assistant` | Tree-sitter grammar |
| 2 | Coral Parser | Grammar | DSL → IR parsing |
| 3 | Format Importers | Phase 1: IR Schema | Mermaid/DOT → IR |
| 4 | Coral Printer | Parser, Importers | IR → DSL printing |
| 5 | Visual Editor | Printer | React Flow components |
| 6 | ELK Integration | Phase 1: `layout_ir` | Visual layout |
| 7 | MCP Server | Steps 2-6 | `@coral/mcp` |
| 8 | `elk-tuning` agent | ELK Integration | Visual tuning help |
| 9 | Skills | MCP Server | `/coral`, `/coral-*` |
| 10 | Agents | Skills, MCP | `diagram-generation`, `format-migration` |

**Parallel opportunities**: Steps 3, 5, 6 can progress in parallel after Step 2. Steps 8, 9, 10 can run in parallel after Step 7.

---

## Phase 1 Dependencies to Consume

| From graph-ir-tools | Used For |
|---------------------|----------|
| `@graph-ir-tools/core` | IR validation, types |
| `layout_ir` MCP tool | Compute node positions |
| `tree-sitter-assistant` | Grammar development |
| `layout-debugger` | Debug algorithm issues |

---

## Progress Tracking

After completing each step:
1. Update [PROGRESS.md](./PROGRESS.md) to mark the step complete
2. Add any notes about decisions or blockers
3. Update the "Last Updated" date

If PROGRESS.md doesn't exist, create it from the template.

---

## Requirements Management

Requirements are tracked at two levels:

### System Requirements (Ecosystem-Level)

Located in `graph-ir-tools/ecosystem/requirements/`:
- `SYS-REQ-XXX` — Define what the ecosystem needs
- Traceability matrix links to component requirements

### Component Requirements (This Repo)

Located in `dev/requirements.md`:
- `CORAL-REQ-XXX` — Define Coral-specific implementations
- Must trace to a `SYS-REQ-XXX`
- Implementation steps go in PROGRESS.md with requirement ID

### When Implementing a Requirement

1. Check `dev/requirements.md` for the requirement details
2. Note the `SYS-REQ-XXX` it traces to
3. Add implementation steps to PROGRESS.md with the `CORAL-REQ-XXX` ID
4. Update requirement status when complete

### Process

See `graph-ir-tools/ecosystem/requirements/README.md` for full process.

---

## Acceptance Criteria (Phase 2)

| Criterion | How to Validate |
|-----------|-----------------|
| Coral DSL Parser Works | Coral DSL text → valid Graph-IR |
| Coral DSL Printer Works | Graph-IR → valid Coral DSL text |
| Mermaid Import Works | Mermaid syntax → Graph-IR |
| DOT Import Works | Graphviz DOT → Graph-IR |
| Visual Rendering Works | Graph-IR → interactive React Flow diagram |
| Bidirectional Sync Works | Changes in text ↔ changes in visual |
| Format Conversion Works | Mermaid/DOT → Coral DSL |
| MCP Server Functional | All tools callable via MCP |

---

## Skills (Coral-Specific)

| Skill | Purpose |
|-------|---------|
| `/coral` | Generate diagrams from natural language |
| `/coral-convert` | Convert between diagram formats |
| `/coral-explain` | Explain diagrams in natural language |
| `/coral-validate` | Validate Coral DSL (DSL-specific) |
| `/coral-scaffold` | Generate Coral component boilerplate |
| `modern-ui-architect` | Enforce Coral Design Standard for UI/UX |

**Note**: `/coral-validate` and `/coral-scaffold` are Coral-specific because they require Coral's grammar, semantic rules, and templates.

### UI/UX Guidance: modern-ui-architect

The `modern-ui-architect` skill (`.claude/skills/modern-ui-architect/`) enforces the **Coral Design Standard** for viz-demo UI work. Use it when:
- Designing new UI layouts or components
- Refactoring existing UI
- Auditing UI for consistency

**Key principles enforced:**
- Three-pane layout: Rail (left) | Stage (center) | Inspector (right)
- Contextual Inspector: Document settings by default, node settings when selected
- Compact density (Material Design 3)
- Command Palette (`Cmd+K`) over menu bars
- Segmented controls for 2-4 options

**Preserved decisions** (DO NOT change):
- Explicit Save/Load buttons (user controls persistence)
- Explicit Reflow button (user controls when layout runs)
- Undo/Redo for layout changes
- Position stability (user-dragged positions persist)

**Reference files:**
- `references/coral_design_standard.md` — Full design system spec
- `assets/ui_auditor_persona.md` — Persona for UI critique

---

## Agents (Coral-Specific)

| Agent | Purpose |
|-------|---------|
| `diagram-generation` | Complex iterative diagram creation |
| `format-migration` | Batch Mermaid/DOT → Coral conversion |
| `elk-tuning` | Visual output aesthetics (distinct from `layout-debugger`) |

**NOT in Phase 2**:
- `code-to-diagram` - Requires Armada (Phase 3), deferred to Phase 4

---

## Development Principles

### 1. Documentation-First

Read specifications before implementing:
- `ECOSYSTEM-DEVELOPMENT-PLAN.md` in graph-ir-tools
- `dev/claude-specs/` for Coral-specific specs

### 2. Test-Driven Development (TDD) — MANDATORY

**All new feature work MUST use TDD.** No exceptions.

```
1. Read the specification/requirement
2. Write failing test(s) FIRST
3. Implement minimum code to pass
4. Refactor while tests remain green
5. Update PROGRESS.md
```

**Do not merge or mark complete any implementation without tests written before the code.**

### 3. Roundtrip Testing

Critical for Coral: DSL → IR → DSL must produce equivalent output.

---

## Development Workflow

### Model Routing
- Use Opus for: architecture, complex debugging, planning, code review of critical paths
- Use Sonnet for: implementation, tests, refactoring, documentation
- Use Haiku for: codebase exploration, file search, simple lookups

### Workflow (follow for every task)
1. Review or write the requirement document (check `dev/` or create one if missing)
2. Review or write acceptance criteria within the requirement document
3. Check `.claude/skills/` and project docs for relevant patterns or utilities
4. Find or create a GitHub issue (`gh issue list` / `gh issue create`); tag with the relevant label
5. Follow TDD:
   a. Write tests that map to the acceptance criteria
   b. Implement until all tests pass
   c. Re-read the requirement and acceptance criteria — ask: "Was something important overlooked?"
   d. If yes, add tests for overlooked items and implement until they pass
6. Commit referencing the issue: `git commit -m "feat: description (#ISSUE_ID)"`
7. Only push when fully implemented; close the issue on push

### Commands
```bash
# Run tests (from package directory)
npm test                    # or: npx vitest run
npm run lint               # ESLint
npm run typecheck          # TypeScript

# Run all tests in monorepo
npm test --workspaces
```

### GitHub Issue Labels
- `bug` - Something isn't working
- `feature` - New feature or enhancement
- `chore` - Maintenance, refactoring, tests
- `docs` - Documentation only
- `integration` - Integration testing

### Branch Strategy
- Feature branches off `main`: `feat/ISSUE_ID-short-description`
- Bug fix branches: `fix/ISSUE_ID-short-description`
- Direct commits to `main` acceptable for small changes

---

## Directory Structure

```
coral/
├── packages/
│   ├── ir/                       # @coral/ir
│   ├── language/                 # @coral/language
│   │   └── src/
│   │       ├── parser/           # DSL parsing
│   │       ├── printer/          # IR → DSL
│   │       └── formats/          # Mermaid/DOT importers
│   ├── viz/                      # @coral/viz
│   │   └── src/
│   │       ├── editor/           # React Flow components
│   │       ├── layout/           # ELK integration
│   │       ├── shapes/           # Shape primitives
│   │       ├── symbols/          # Symbol libraries
│   │       └── notations/        # Notation rules
│   ├── viz-demo/                 # Demo app for @coral/viz
│   ├── mcp-server/               # MCP tools
│   │   └── src/
│   │       ├── tools/            # coral_* tools
│   │       └── armada/           # Armada integration
│   └── coral-code-design/        # Standalone IDE
│       ├── core/                 # Shared React components
│       ├── standalone/           # Browser app
│       └── vscode/               # VS Code extension (future)
├── agents/
│   ├── diagram-generation/
│   ├── format-migration/
│   └── elk-tuning/
├── dev/
│   └── claude-specs/             # Specifications
├── PROGRESS.md                   # Progress tracking
└── CLAUDE.md                     # This file
```

---

## Phase 4: Integration (Complete)

Phase 3 (Armada) is complete. Coral now has:
- Armada MCP client (`packages/mcp-server/src/armada/client.ts`)
- KG→IR transformer (`packages/mcp-server/src/armada/transformer.ts`)
- `coral_from_codebase` MCP tool (`packages/mcp-server/src/tools/fromCodebase.ts`)
- `/coral --from=codebase` skill (updated `.claude/skills/coral/SKILL.md`)
- Incremental updates (`packages/mcp-server/src/armada/incremental.ts`)

This enables the code-to-diagram workflow. See PROGRESS.md for details.

---

## coral-code-design: Standalone IDE

**Phase 1 (Foundation)**: Complete

A standalone web application for software architecture visualization, built on `@coral/viz`.

### Package Structure

```
packages/coral-code-design/
├── core/                    # @coral-code-design/core - shared components
│   ├── src/
│   │   ├── components/      # DiagramRenderer, Navigator, Inspector, CodePreview
│   │   ├── hooks/           # useDiagramData, useFileTree, useSymbolOutline
│   │   ├── providers/       # WorkspaceProvider, ArmadaProvider, NavigationProvider
│   │   ├── state/           # Zustand stores
│   │   └── types/           # TypeScript types
│   └── test/                # 75+ tests
├── standalone/              # Browser-based app (File System Access API)
│   └── src/
│       ├── App.tsx          # Main application
│       ├── Shell.tsx        # Menu bar and layout
│       └── providers/       # useFileSystem
└── vscode/                  # VS Code extension (future)
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `DiagramRenderer` | Renders GraphIR with notation-aware symbols |
| `useFileTree` | Lazy-loading file tree from FileSystemAdapter |
| `useSymbolOutline` | Hierarchical symbol tree from Armada |
| `ArmadaProvider` | Connection management with TanStack Query |
| `CodePreview` | Source code display with line highlighting |

### Armada Integration

coral-code-design connects to Armada HTTP API for:
- Module graphs, call graphs, inheritance trees
- Symbol queries for outline view
- Future: Branch projections (when Armada supports it)

### Running the Standalone App

```bash
cd packages/coral-code-design/standalone
npm run dev
# Open http://localhost:5173
```

### Testing

```bash
cd packages/coral-code-design/core
npm test
```

### Phase 2 (Future)

- Directory lazy loading via Navigator callbacks
- Symbol click → diagram selection
- Search palette with Armada queries
- Branch projection UI (depends on Armada feature)

---

## Related Repositories

| Repo | Purpose | Phase |
|------|---------|-------|
| graph-ir-tools | Shared tooling, authority docs | 1 |
| graph-ir | IR specification | 1 |
| armada | Code understanding (needed for Phase 4) | 3 |

---

## Recently Completed

### CORAL-REQ-007: Diagram Reflow with Undo/Redo ✓

**Status**: Complete

Implemented layout history and controls for viz-demo:
- `useLayoutHistory` hook (`packages/viz/src/layout/useLayoutHistory.ts`)
- `LayoutControls` component (`packages/viz/src/editor/LayoutControls.tsx`)
- Keyboard shortcuts: Ctrl+Shift+L (reflow), Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- Integrated with viz-demo App.tsx

---

## Approved Work Queue

The following requirements are approved and ready for implementation. Graph-ir-tools has reviewed and approved. GitHub issues are created.

### Implementation Order

```
1. CORAL-REQ-006 (Shapes/Notations)  ← Ready, unblocks CORAL-REQ-010
2. CORAL-REQ-008 (File Format)       ← Ready, independent
3. CORAL-REQ-009 (Settings Panel)    ← Depends on CORAL-REQ-008
4. CORAL-REQ-010 (Port Compatibility) ← Depends on CORAL-REQ-006
5. CORAL-REQ-005 (Incremental Updates) ← Phase 4, lower priority
```

### CORAL-REQ-006: Shape Geometries and Diagram Symbol Libraries

**GitHub Issue**: https://github.com/coreyt/coral/issues/2
**Traces To**: SYS-REQ-003 (Symbol/Notation Architecture)
**Status**: Proposed (Ready to implement)
**Priority**: High (unblocks CORAL-REQ-010)

Coral owns all visual/diagram-related content for the symbol/notation architecture:

1. Define shape geometries (SVG definitions for rectangle, diamond, cylinder, etc.)
2. Define diagram symbol libraries (flowchart, BPMN, ERD, UML symbols)
3. Define notation rules with **port compatibility** (valid symbols and connections per diagram type)
4. Provide visual mappings for Armada's code symbols

**Key addition**: Notation rules must include port semantics for CORAL-REQ-010.

| Reference | Location |
|-----------|----------|
| Infrastructure spec | `graph-ir-tools/specs/symbol-notation-infrastructure.md` |
| Coral symbols draft | `graph-ir-tools/drafts/coral-symbols-spec.md` |
| Component requirement | `dev/requirements.md` (CORAL-REQ-006) |

---

### CORAL-REQ-008: Coral File Format and Save/Load

**GitHub Issue**: https://github.com/coreyt/coral/issues/4
**Traces To**: SYS-REQ-005 (Document Persistence and File Format)
**Status**: Proposed (Ready to implement)
**Priority**: High

Implement a versioned file format for Coral diagrams:

```typescript
interface CoralDocument {
  schemaVersion: "1.0.0";
  metadata: { name, description, tags, version, created, modified };
  content: { format: "dsl" | "graph-ir", dslType?, text?, graphIR? };
  settings: { notation, layout: { algorithm, direction, spacing, elkOptions } };
  viewState?: { zoom, pan, selectedNodes };
  nodePositions?: Record<string, { x, y }>;
}
```

**Implementation steps**: 7 steps in `dev/requirements.md`

---

### CORAL-REQ-009: Settings Panel with Layout Configuration

**GitHub Issue**: https://github.com/coreyt/coral/issues/5
**Traces To**: SYS-REQ-006 (Settings Architecture)
**Status**: Proposed
**Priority**: Medium
**Depends On**: CORAL-REQ-008 (for file integration)

Two-tier settings architecture:
- **Document Settings**: Saved with file (notation, ELK options)
- **User Preferences**: Saved to localStorage (theme, defaults)

Key ELK options to expose: algorithm, direction, spacing, edge routing.

**Implementation steps**: 9 steps in `dev/requirements.md`

---

### CORAL-REQ-010: Port Compatibility Feedback

**GitHub Issue**: https://github.com/coreyt/coral/issues/6
**Traces To**: SYS-REQ-004 (Visual Editor UX)
**Status**: Proposed
**Priority**: Medium
**Depends On**: CORAL-REQ-006 (needs notation port rules)

Visual feedback for notation-aware port compatibility:
- Incompatible edges → Warning color (orange/amber)
- Hover tooltip → Explains incompatibility
- Drag feedback → Green (compatible) / Yellow (incompatible) anchors

**Implementation steps**: 9 steps in `dev/requirements.md`

---

### CORAL-REQ-005: Incremental Updates

**GitHub Issue**: https://github.com/coreyt/coral/issues/3
**Traces To**: SYS-REQ-002 (Code-to-Diagram Workflow)
**Status**: Proposed
**Priority**: Medium (Phase 4 Step 5)

Detect code changes and update diagrams without full regeneration.

---

## Starting Implementation

After `/compact`, say **"continue"** to begin implementation.

The agent will:
1. Read `dev/requirements.md` for requirement details
2. Start with CORAL-REQ-006 or CORAL-REQ-008 (both are ready, independent)
3. Follow TDD: write tests first
4. Update PROGRESS.md as steps complete
5. Close GitHub issues when requirements are done

---

*This document configures how AI agents work in this repository. For the master plan, see ECOSYSTEM-DEVELOPMENT-PLAN.md in graph-ir-tools.*
