# Coral - Agent Development Guidelines

## Quick Start

> Say **"continue"** or **"what's next?"** to proceed with implementation.
>
> Claude will read PROGRESS.md to determine the current step and continue from there.

---

## Phase Assignment

| Attribute | Value |
|-----------|-------|
| **Phase** | 2 (Diagramming) complete, Phase 4 (Integration) in progress |
| **Role** | Symbiotic diagramming toolchain |
| **Authority** | See `ECOSYSTEM-DEVELOPMENT-PLAN.md` in graph-ir-tools |

Coral bridges text DSLs and visual editors:
- Parse Coral DSL, Mermaid, DOT formats
- Render visual diagrams with ELK + React Flow
- Bidirectional sync between text and visual

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

**Note**: `/coral-validate` and `/coral-scaffold` are Coral-specific because they require Coral's grammar, semantic rules, and templates.

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

## Directory Structure

```
coral/
├── packages/
│   ├── ir/                       # @coral/ir
│   ├── language/                 # @coral/language
│   │   └── src/
│   │       ├── parser/           # Step 2
│   │       ├── printer/          # Step 4
│   │       ├── formats/          # Step 3
│   │       └── skills/           # Step 9
│   ├── viz/                      # @coral/viz
│   │   └── src/
│   │       ├── editor/           # Step 5
│   │       └── layout/           # Step 6
│   └── mcp-server/               # Step 7
├── agents/
│   ├── diagram-generation/       # Step 10
│   ├── format-migration/         # Step 10
│   └── elk-tuning/               # Step 8
├── dev/
│   └── claude-specs/             # Specifications
├── PROGRESS.md                   # Progress tracking
└── CLAUDE.md                     # This file
```

---

## Phase 4: Integration (In Progress)

Phase 3 (Armada) is complete. Coral now has:
- Armada MCP client (`packages/mcp-server/src/armada/client.ts`)
- KG→IR transformer (`packages/mcp-server/src/armada/transformer.ts`)
- `coral_from_codebase` MCP tool (`packages/mcp-server/src/tools/fromCodebase.ts`)
- `/coral --from=codebase` skill (updated `.claude/skills/coral/SKILL.md`)

This enables the code-to-diagram workflow. See PROGRESS.md for current status.

---

## Related Repositories

| Repo | Purpose | Phase |
|------|---------|-------|
| graph-ir-tools | Shared tooling, authority docs | 1 |
| graph-ir | IR specification | 1 |
| armada | Code understanding (needed for Phase 4) | 3 |

---

## Pending Work

### CORAL-REQ-006: Shape Geometries and Diagram Symbol Libraries

**GitHub Issue**: https://github.com/coreyt/coral/issues/2
**Traces To**: SYS-REQ-003 (Symbol/Notation Architecture)
**Status**: Proposed

#### What to Do

Coral owns all visual/diagram-related content for the symbol/notation architecture:

1. Define shape geometries (SVG definitions for rectangle, diamond, cylinder, etc.)
2. Define diagram symbol libraries (flowchart, BPMN, ERD, UML symbols)
3. Define notation rules (valid symbols and connections per diagram type)
4. Provide visual mappings for Armada's code symbols

#### Files to Create

| File | Content |
|------|---------|
| `shapes/*.yaml` | SVG geometry definitions |
| `symbols/flowchart.yaml` | Flowchart symbols |
| `symbols/bpmn.yaml` | BPMN symbols |
| `symbols/erd.yaml` | ERD symbols |
| `symbols/code.yaml` | Visual mappings for Armada symbols |
| `notations/flowchart.yaml` | Flowchart connection rules |
| `notations/bpmn.yaml` | BPMN connection rules |
| `notations/erd.yaml` | ERD connection rules |

#### Reference Information

| Document | Location |
|----------|----------|
| Infrastructure spec | `graph-ir-tools/specs/symbol-notation-infrastructure.md` |
| Coral symbols draft | `graph-ir-tools/drafts/coral-symbols-spec.md` |
| Component requirement | `graph-ir-tools/drafts/coral-req-006.md` |
| System requirement | `graph-ir-tools/ecosystem/requirements/system-requirements.md` (SYS-REQ-003) |

#### Dependency

Requires `TOOLS-REQ-001` (graph-ir-tools infrastructure) to be complete first for:
- `SymbolRegistry` class to load symbol definitions
- `NotationRegistry` class to load notation rules

#### After Completion

1. Add requirement to `dev/requirements.md`:
   - Copy from `graph-ir-tools/drafts/coral-req-006.md`
2. Update requirement status to Complete
3. Close GitHub issue

---

*This document configures how AI agents work in this repository. For the master plan, see ECOSYSTEM-DEVELOPMENT-PLAN.md in graph-ir-tools.*
