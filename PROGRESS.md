# Coral Implementation Progress

> **Authority**: See `ECOSYSTEM-DEVELOPMENT-PLAN.md` in graph-ir-tools for full context.

## Phase 4: Integration

**Status**: In Progress

### Prerequisites

- [x] Phase 2 complete (verified 2026-01-31)
- [x] Phase 3 complete (Armada - verified 2026-01-31 in ../armada/PROGRESS.md)
- [x] Armada MCP Server available with tools: `get_context`, `find_dependencies`, `impact_of`, `search`, `trace_calls`

### Implementation Steps

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Armada MCP Client | [x] Complete | `packages/mcp-server/src/armada/client.ts` |
| 2 | KG→IR Transformer | [x] Complete | `packages/mcp-server/src/armada/transformer.ts` |
| 3 | `coral_from_codebase` tool | [x] Complete | `packages/mcp-server/src/tools/fromCodebase.ts` |
| 4 | `/coral --from=codebase` skill | [x] Complete | Updated `.claude/skills/coral/SKILL.md` |
| 5 | Incremental Updates | [ ] Not started | Change detection → re-render |

### Acceptance Criteria

| Criterion | Status | Validation |
|-----------|--------|------------|
| Armada MCP Consumption Works | [x] | ArmadaClient can query all Armada tools |
| Code→IR Transformation Works | [x] | 18 tests for transformer (context, deps, impact, trace) |
| Code→Diagram Workflow Works | [~] | Requires Armada running for integration test |
| Incremental Updates Work | [ ] | Not yet implemented |

### Phase Completion Checklist

- [ ] All implementation steps complete
- [ ] All acceptance criteria pass
- [ ] Documentation updated
- [ ] Tests pass

**Phase 4 Complete**: No (4 of 5 steps done)

---

## Phase 2: Diagramming

**Status**: Complete

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
| 7 | MCP Server | [x] Complete | `packages/mcp-server/` with 7 tools (incl. Phase 4 addition) |
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

**Phase 4 in progress.** Steps 1-4 complete, Step 5 (Incremental Updates) remaining.

Phase 4 additions:
- `packages/mcp-server/src/armada/` - Armada client and transformer
- `packages/mcp-server/src/tools/fromCodebase.ts` - New MCP tool
- `packages/mcp-server/test/armada.test.ts` - 18 transformer tests
- Updated `/coral` skill with `--from=codebase` flag

To test Phase 4:
```bash
nvm use
cd packages/mcp-server && npx vitest run
```

To test full code→diagram workflow:
1. Start Armada: `cd ../armada && docker-compose up -d`
2. Index a codebase with Armada
3. Use `/coral --from=codebase <query>` or `coral_from_codebase` MCP tool

**Next**: Step 5 - Incremental update support (detect code changes → auto-update diagram)

---

**Last Updated**: 2026-01-31
