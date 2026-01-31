# Coral Implementation Progress

> **Authority**: See `ECOSYSTEM-DEVELOPMENT-PLAN.md` in graph-ir-tools for full context.

## Phase 2: Diagramming

**Status**: In Progress

### Prerequisites

- [x] Phase 1 complete (verified 2025-01-31 in ../graph-ir-tools/PROGRESS.md)
- [x] `@graph-ir-tools/core` is available (packages/core/ with v0.1.0)
- [x] `tree-sitter-assistant` agent is available (agents/tree-sitter-assistant.md)

### Implementation Steps

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Coral Grammar | [x] Complete | `packages/tree-sitter-coral/` - grammar, tests, highlights |
| 2 | Coral Parser | [x] Complete | `packages/language/src/parser/` - DSL → Graph-IR |
| 3 | Format Importers | [x] Complete | Mermaid/DOT → IR in `packages/language/src/formats/` |
| 4 | Coral Printer | [x] Complete | IR → DSL in `packages/language/src/printer/` |
| 5 | Visual Editor | [x] Complete | React Flow in `packages/viz/src/editor/` (17 tests passing) |
| 6 | ELK Integration | [x] Complete | ELK layout in `packages/viz/src/layout/` (10 tests passing) |
| 7 | MCP Server | [x] Complete | `packages/mcp-server/` with 6 tools |
| 8 | `elk-tuning` agent | [x] Complete | `agents/elk-tuning.md` |
| 9 | Skills | [x] Complete | 5 skills in `.claude/skills/` |
| 10 | Agents | [x] Complete | 3 agents in `agents/` |

**Status Legend**:
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete

### Acceptance Criteria

| Criterion | Status | Validation |
|-----------|--------|------------|
| Coral DSL Parser Works | [x] | Coral DSL text → valid Graph-IR |
| Coral DSL Printer Works | [x] | Graph-IR → valid Coral DSL text |
| Mermaid Import Works | [x] | 10 diagram types → Graph-IR |
| DOT Import Works | [x] | Graphviz DOT → Graph-IR (basic) |
| Visual Rendering Works | [x] | Graph-IR → interactive React Flow diagram |
| Bidirectional Sync Works | [x] | Via converter.ts roundtrip functions |
| Format Conversion Works | [x] | Mermaid/DOT → IR → Coral DSL |
| MCP Server Functional | [x] | All tools callable via MCP |

### Phase Completion Checklist

- [x] All implementation steps complete
- [x] All acceptance criteria pass
- [x] Documentation updated
- [x] Tests pass (89 language tests, 27 viz tests)

**Phase 2 Complete**: Yes

---

## Notes

### Decisions Made

- Tree-sitter grammar in dedicated `packages/tree-sitter-coral/` package (standard pattern)
- Node types: service, database, external_api, actor, module, group
- Edge syntax: `source -> target [relation_type, attr = "value"]`
- Properties in node bodies: `key: "value"`
- Parser has both sync (pure JS) and async (tree-sitter) modes for flexibility
- Parser generates unique IDs from labels using snake_case conversion
- Mermaid importer (v11.12.2) supports 10 diagram types: flowchart, sequence, class, state, ER, timeline, block, packet, kanban, architecture
- DOT importer (v14.1.2) supports: digraph/graph, clusters, node shapes, edge styles, rankdir
- Format version tracking in `packages/language/src/formats/SPECS.md`

### Blockers

- (none yet)

### Context for Next Session

Phase 2 is complete. All 10 implementation steps are done:
- Steps 1-4: Grammar, Parser, Format Importers, Printer (language package)
- Steps 5-6: Visual Editor, ELK Integration (viz package)
- Step 7: MCP Server with 6 tools
- Steps 8-10: Agents (3) and Skills (5)

**Ready for Phase 4** (Integration) when Phase 3 (Armada) completes.

To run tests:
```bash
export PATH="/home/coreyt/.nvm/versions/node/v20.20.0/bin:/usr/bin:$PATH"

# Language package tests
cd packages/language && npx vitest run

# Viz package tests
cd packages/viz && npx vitest run

# Build MCP server
cd packages/mcp-server && ./node_modules/.bin/tsc
```

---

**Last Updated**: 2026-01-31
