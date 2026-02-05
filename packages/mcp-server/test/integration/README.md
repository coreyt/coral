# Armada Integration Tests

## Overview

This directory contains integration tests that call the real Armada MCP server to verify:

1. **Indexer correctness** - Are code symbols indexed correctly?
2. **Query handling** - Do searches return expected results?
3. **Semantic search** - Does vector search find conceptually related code?
4. **Graph traversal** - Do dependency/impact queries work?
5. **Response format** - Are API responses structured correctly?

## Prerequisites

- Armada installed in a Python environment
- The coral repository indexed by Armada
- Armada accessible via MCP (stdio transport)

## Running Tests

The integration tests use the ArmadaClient which spawns Armada as a subprocess:

```bash
# Ensure Armada is installed
pip install armada  # or pip install -e /path/to/armada

# Run integration tests
cd packages/mcp-server
npx vitest run test/integration/armada-integration.test.ts
```

If Armada is not available, tests will skip gracefully.

### Manual Validation via Claude Code

The MCP tools can be called directly via Claude Code for manual testing:

```
# Search for code
mcp__armada__search(query="computeNodeSize", types=["function"], limit=5)

# Get dependencies
mcp__armada__find_dependencies(node_id="App", direction="both", depth=2)

# Analyze impact
mcp__armada__impact_of(node_id="schema.ts")

# Get architecture
mcp__armada__get_architecture()
```

This is how the validation below was performed.

## Current State (2026-02-05)

### Graph Statistics
- **Nodes**: 5,552
- **Edges**: 10,914
- **Vector store**: 2,071 points

### Node Types Distribution
| Type | Count |
|------|-------|
| variable | 2,658 |
| property | 1,213 |
| function | 757 |
| section | 333 |
| class | 187 |
| module | 175 |
| interface | 70 |
| commit | 61 |
| requirement | 41 |
| documentation | 35 |
| external_module | 14 |
| type_alias | 3 |
| author | 2 |
| branch | 1 |

### Working Tools
| Tool | Status | Notes |
|------|--------|-------|
| `search` | ✓ Working | Semantic search with confidence bands |
| `get_context` | ✓ Working | Returns nodes with relevance scores |
| `find_dependencies` | ✓ Working | Finds upstream/downstream deps |
| `impact_of` | ✓ Working | Returns impact summary |
| `trace_calls` | ✓ Working | Traces call paths |
| `get_architecture` | ✓ Working | Returns package structure |
| `get_dossier` | ✓ Working | Returns file groups by concept |
| `what_uses` | ✓ Working | But often returns 0 entry points |
| `what_breaks` | ✓ Working | But often returns 0 affected |
| `where_should_i_put` | ✓ Working | File placement suggestions |

### Tools with Issues
| Tool | Status | Error |
|------|--------|-------|
| `find_tests_for` | ✗ Error | Missing module: `armada.resolvers.test_linker` |
| `who_owns` | ✗ Error | Fails when `find_tests_for` fails |
| `get_conventions` | ✗ Error | Fails when sibling tool fails |

### Known Gaps

1. **Edge coverage**: `what_uses` and `what_breaks` often return empty results for symbols that are widely used (e.g., `computeNodeSize`, `CoralDocument`). This suggests the call graph edges may be incomplete.

2. **Semantic search ranking**: When searching for "function that computes node sizes", `computeNodeSize` ranks 4th (score 0.53) instead of 1st. More exact matches could be prioritized.

3. **Community detection**: `get_dossier("ELK layout algorithm")` returns files from `viz-demo/src` instead of `viz/src/layout/elk.ts` where the actual ELK implementation lives.

4. **Missing test_linker module**: Some Armada features (test linking, ownership) are not available, possibly due to incomplete installation.

## Test Coverage

| Category | Tests | Purpose |
|----------|-------|---------|
| Indexer Correctness | 4 | Verify known symbols are indexed |
| Semantic Search | 4 | Test natural language queries |
| Query Filtering | 3 | Test type filters and limits |
| Context Retrieval | 3 | Test scoped context queries |
| Dependency Graph | 3 | Test dependency traversal |
| Impact Analysis | 2 | Test impact analysis |
| Call Tracing | 2 | Test call path tracing |
| Response Format | 3 | Validate API response structure |
| Edge Cases | 4 | Test robustness |
| Performance | 3 | Benchmark query times |

## Recommendations

1. **Re-index with full edges**: Ensure call graph edges are being captured during indexing.

2. **Install missing modules**: Install `armada.resolvers.test_linker` to enable test linking.

3. **Tune semantic search**: Consider boosting exact name matches in search results.

4. **Improve community detection**: Ensure layout-related code clusters together.
