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
| 5 | Incremental Updates | [x] Complete | `packages/mcp-server/src/armada/incremental.ts` (14 tests) |

### Acceptance Criteria

| Criterion | Status | Validation |
|-----------|--------|------------|
| Armada MCP Consumption Works | [x] | ArmadaClient can query all Armada tools |
| Code→IR Transformation Works | [x] | 18 tests for transformer (context, deps, impact, trace) |
| Code→Diagram Workflow Works | [~] | Requires Armada running for integration test |
| Incremental Updates Work | [x] | IncrementalWatcher + checkForUpdates (14 tests) |

### Phase Completion Checklist

- [x] All implementation steps complete
- [x] All acceptance criteria pass
- [x] Documentation updated
- [x] Tests pass (28 tests in mcp-server)

**Phase 4 Complete**: Yes

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
- [x] Tests pass (89 language tests, 49 viz tests)

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

**CORAL-REQ-001 Complete:** Text Editor Components
- `packages/viz/src/text-editor/` with TextEditor, SplitEditor, useBidirectionalSync
- 22 new tests for bidirectional sync and acceptance criteria
- See `dev/requirements.md` for details

**CORAL-REQ-008 Complete:** Coral File Format and Save/Load
- `packages/viz/src/file/` with schema, serialize, deserialize, validate, migrate
- `packages/viz/src/editor/FileControls.tsx` - Save/Load/Export UI component
- 28 new tests for file format operations
- Integrated with viz-demo (Save, Load, Export buttons in header)
- See `dev/requirements.md` for details

**CORAL-REQ-006 Complete:** Coral Shapes and Diagram Notations
- `packages/viz/src/shapes/` - 14 shape primitives with SVG paths and portAnchors
- `packages/viz/src/symbols/` - 5 libraries (flowchart, bpmn, erd, code, architecture) with 40+ symbols
- `packages/viz/src/notations/` - 5 notations with connection rules and validation
- `packages/viz/src/components/ShapeRenderer.tsx` and `SymbolNode.tsx`
- 63 new tests for shape/symbol/notation system
- See `dev/requirements.md` for details

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

**CORAL-REQ-013 Complete:** Position Stability and Incremental Layout
- `packages/viz/src/layout/positionStability.ts` - diffGraphs, resolvePositions, incrementalLayout
- `packages/viz/src/layout/useDiagramState.ts` - Hook for separated parse/render/layout
- `packages/viz/src/types.ts` - New types: PositionSource, GraphDiff, PositionResolution, DiffableGraph
- `packages/viz-demo/src/App.tsx` - Refactored to use position stability
- 33 new tests (20 for position stability, 13 for useDiagramState)
- Fixes undo/redo being overwritten by automatic layout
- Preserves user-dragged positions when DSL text changes
- Only runs full layout on: initial load, format switch, explicit reflow

**CORAL-REQ-009 Complete:** Settings Panel with Layout Configuration
- `packages/viz/src/file/schema.ts` - Added UserPreferences, LayoutPreset, LAYOUT_PRESETS constants
- `packages/viz/src/settings/` - useSettings hook, LayoutSettingsForm, SettingsPanel components
- 5 layout presets: Flowchart, Org Chart, Network, Radial, Custom
- Two-tab panel: Document settings (saved with file) and User preferences (localStorage)
- Advanced ELK options JSON editor
- 41 new tests for settings
- Integrated with viz-demo (Settings button in header, sidebar panel)

**CORAL-REQ-010 Complete:** Port Compatibility Feedback
- `packages/viz/src/compatibility/` - New module for edge compatibility validation
- `packages/viz/src/compatibility/validateConnection.ts` - Connection validation logic
- `packages/viz/src/compatibility/useEdgeCompatibility.ts` - React hook for edge compatibility state
- `packages/viz/src/compatibility/IncompatibilityTooltip.tsx` - Tooltip for incompatibility feedback
- `packages/viz/src/compatibility/CompatibilityEdge.tsx` - Custom React Flow edge with visual feedback
- `packages/viz/src/types.ts` - Added ConnectionValidation, EdgeCompatibility, NodeConnectionInfo types
- 49 new tests for port compatibility (validateConnection, hook, tooltip, edge styling)
- Integrated with viz-demo (edges show red for incompatible, amber for warnings)
- Supports all 5 notations: flowchart, BPMN, ERD, code, architecture

**CORAL-REQ-011 Complete:** Adaptive Node Sizing for Text Content
- `packages/viz/src/types.ts` - Added SizingMode, ShapeSizing, TextMeasureOptions, TextDimensions, NodeSizingOptions, NodeDimensions types
- `packages/viz/src/shapes/index.ts` - Updated all 14 shapes with sizing metadata (textBoundsRatio, minSize, padding)
- `packages/viz/src/layout/nodeSizing.ts` - measureText(), computeNodeSize(), computeUniformSizes(), applyAdaptiveSizing() utilities
- `packages/viz/src/layout/elk.ts` - Extended layoutFlowNodes with LayoutFlowOptions for sizing integration
- `packages/viz/src/file/schema.ts` - Added sizingMode to LayoutSettings and layout presets
- `packages/viz/src/settings/LayoutSettingsForm.tsx` - Added Node Sizing dropdown with adaptive/uniform/hybrid options
- 31 new tests for node sizing (text measurement, shape-specific sizing, sizing modes)
- Three sizing modes: adaptive (each node sized to content), uniform (same size per shape type), hybrid (adaptive width, uniform height)

**CORAL-REQ-005 Complete:** Incremental Update Support
- `packages/mcp-server/src/armada/incremental.ts` - IncrementalWatcher, checkForUpdates
- File watching with debounce for code changes
- Armada impactOf integration for smart change detection
- Graph diffing for added/removed/modified node detection
- Direct transformation to Graph-IR for incremental updates
- 14 new tests for incremental update system
- Completes Phase 4 (Integration)

**CORAL-REQ-015 Proposed:** Manual Edge Waypoint Routing
- User-requested feature for manual edge path control
- Allows adding/moving/removing waypoints on edges
- See `dev/requirements.md` for full specification
- Priority: Low (nice-to-have, not blocking other work)

**All approved work complete.** See CLAUDE.md for future requirements (CORAL-REQ-012, CORAL-REQ-014, CORAL-REQ-015).

**Phase 4 Enhancement (2026-02-01):** Armada Code Type Symbol Mapping
- Extended `mapToSymbolId` in viz-demo to recognize Armada's specific code node types
- New mappings: function, method, class, interface, module, external_module, type_alias, variable, constant, property, struct, namespace
- Maps to existing code symbols from CORAL-REQ-006 (code-function, code-class, code-module, code-type, code-variable, code-namespace, code-external)
- Generated example: `viz-demo-arch.coral.json` - architecture diagram of viz-demo itself
- This completes the visual integration for Phase 4's code-to-diagram workflow

**CORAL-REQ-017 Complete:** Armada HTTP Datasource for viz-demo
- `packages/viz-demo/src/useArmadaConnection.ts` - React hook for HTTP API connection management
- `packages/viz-demo/src/ArmadaConnection.tsx` - Connection dialog and status bar components
- `packages/viz-demo/src/App.tsx` - Integrated Armada button, dialog, and status bar
- `packages/viz-demo/test/armadaConnection.test.ts` - 11 tests for hook functionality
- Features:
  - Connect to Armada HTTP API at any URL (default: localhost:8765)
  - Mode selection: call-graph, dependency-graph, inheritance-tree, impact-graph, full-graph
  - Connection persistence via localStorage
  - Refresh graph data without reconnecting
  - Real-time stats display (node/edge counts)
  - Status bar with mode switcher when connected
  - Error handling with user-friendly messages
- Part of SYS-REQ-007 (Remote Datasource Integration) Phase 1

---

---

## coral-code-design: Phase 1 (Foundation)

**Status**: Complete

**Deliverable**: "Open workspace, view module graph, click to see code"

### GitHub Issues

| Issue | Description | Status |
|-------|-------------|--------|
| #8 | DiagramRenderer: notation/direction mapping, double-click | ✅ Complete |
| #9 | ArmadaProvider: mode switching, refresh, caching | ✅ Complete |
| #10 | useFileTree: workspace file tree with lazy loading | ✅ Complete |
| #11 | useSymbolOutline: hierarchical symbol tree from Armada | ✅ Complete |

### Implementation

| Component | File | Features |
|-----------|------|----------|
| DiagramRenderer | `core/src/components/DiagramRenderer/` | GraphIR rendering, notation mapping, layout direction per diagram type |
| ArmadaProvider | `core/src/providers/ArmadaProvider.tsx` | Connection management, mode switching, TanStack Query caching |
| useFileTree | `core/src/hooks/useFileTree.ts` | Lazy loading, expand/collapse, filtering, highlighting |
| useSymbolOutline | `core/src/hooks/useSymbolOutline.ts` | Armada symbol queries, hierarchical tree building |
| CodePreview | `core/src/components/CodePreview/` | Line numbers, highlighting, scroll-to-line |
| ArmadaConnectionDialog | `core/src/components/ArmadaDialog/` | Server URL, mode selection, connection status |
| useFileSystem | `standalone/src/providers/useFileSystem.ts` | File System Access API integration |

### Integration (Standalone App)

- ✅ File tree populates Navigator from workspace directory
- ✅ Symbol outline shows symbols for selected file
- ✅ Code preview loads and highlights file content
- ✅ Diagram renders with correct notation per diagram type
- ✅ Armada connection dialog accessible from Shell menu
- ✅ Status bar shows connection state and stats

### Tests

- 75 tests passing in core package
- Test files: useDiagramData, DiagramRenderer, CodePreview, ArmadaProvider, ArmadaConnectionDialog, useFileTree, useSymbolOutline

### Commits

```
abd838e Integrate useFileTree and useSymbolOutline into standalone App
7b2fe9f Implement useSymbolOutline hook for Armada symbols (#11)
360d8c5 Implement useFileTree hook for workspace file tree (#10)
fa989c5 Complete Armada HTTP features for #9
ce85a92 Complete DiagramRenderer features for #8
bf65b62 Implement coral-code-design Phase 1: workspace, diagram, code preview
61cae34 Scaffold coral-code-design package structure
```

---

## coral-code-design: Phase 2 (Enhancements)

**Status**: Complete

**Deliverable**: Enhanced navigation, search, persistence, annotations, export, and theming

### GitHub Issues

| Issue | Description | Status |
|-------|-------------|--------|
| #13 | Branch projection support | ✅ Complete |
| #14 | Navigator lazy loading callback | ✅ Complete |
| #15 | Symbol click selects diagram node | ✅ Complete |
| #16 | Search palette with Armada queries | ✅ Complete |
| #17 | Workspace configuration persistence | ✅ Complete |
| #18 | Branch selection UI | ✅ Complete |
| #19 | CCD-REQ-006: Annotation Layer | ✅ Complete |
| #20 | CCD-REQ-009: Export and Sharing | ✅ Complete |
| #21 | CCD-REQ-010: Theming and Accessibility | ✅ Complete |

### Implementation

| Feature | Commit | Details |
|---------|--------|---------|
| Branch projection support | ba0f955 | BranchProjectionConfig, setBranchProjection, include_branches param |
| Navigator lazy loading | 3db3358 | onDirectoryExpand/onDirectoryCollapse callbacks |
| Programmatic node selection | 9c15151 | selectedSymbolId prop on DiagramRenderer |
| Search functionality | 0c62a13 | ArmadaProvider.search() method |
| Workspace persistence | 72a9905 | Save/load workspace config, layouts, annotations to .coral-code-design/ |
| Branch selection UI | 6ed5d92 | BranchSelector component, fetchBranches, ArmadaDialog integration |
| Theming and accessibility | a467a50 | ThemeProvider, light/dark/high-contrast themes, CSS custom properties |
| Annotation layer | 62b470a | useAnnotations hook with node/edge/group annotations, tags, orphan management |
| Export and sharing | db670c4 | useExport hook for Coral DSL, JSON, Markdown export with clipboard/download |

### Branch Projection

Armada #26 (MCP tools with `include_branches`) is now **complete**. coral-code-design has implemented the backend support (#13). The UI for branch selection can be added as a follow-up.

See: `dev/specs/armada-branch-projection.md`

### Tests

- 163+ tests passing in core package (some memory issues during teardown, documented in `dev/vitest-memory-issue.md`)
- Test files: Navigator, DiagramRenderer, ArmadaProvider, CodePreview, useFileTree, useSymbolOutline, useDiagramData, ArmadaConnectionDialog, workspacePersistence, BranchSelector, ThemeProvider, useAnnotations, useExport

---

## coral-code-design: Phase 3 (UI Components)

**Status**: Complete

**Deliverable**: UI components for hooks implemented in Phase 2, plus Multi-Diagram View

### GitHub Issues

| Issue | Description | Status |
|-------|-------------|--------|
| #22 | CCD-REQ-002: Multi-Diagram View | ✅ Complete |
| #23 | CCD-REQ-006 (UI): Annotation Panel | ✅ Complete |
| #24 | CCD-REQ-009 (UI): Export Dialog | ✅ Complete |
| #25 | CCD-REQ-010 (UI): Theme Switcher | ✅ Complete |
| #26 | CCD-REQ-007: Filter and Focus | ✅ Complete |
| #27 | CCD-REQ-005: Live Diagram Updates | ✅ Complete |
| #28 | CCD-REQ-003: Diagram Types (C4-Inspired) | ✅ Complete |
| #29 | CCD-REQ-008: Search and Discovery | ✅ Complete |
| #30 | CCD-REQ-009: PNG/SVG Image Export | ✅ Complete |
| #32 | CCD-REQ-003: Codebase Overview & Armada Breadcrumbs | ✅ Complete |

### Implementation

| Component | File | Features |
|-----------|------|----------|
| ThemeSwitcher | `core/src/components/ThemeSwitcher/` | 4 theme options, 3 variants (default, compact, dropdown), keyboard nav |
| ExportDialog | `core/src/components/ExportDialog/` | Format selector, preview, copy to clipboard, download |
| AnnotationPanel | `core/src/components/AnnotationPanel/` | Note editing, color picker, tags, orphan manager |
| useMultiDiagram | `core/src/hooks/useMultiDiagram.ts` | Diagram state, layouts, linked selection, presets |
| DiagramTabs | `core/src/components/DiagramTabs/` | Tab bar with close buttons, add button, keyboard nav |
| SplitPane | `core/src/components/SplitPane/` | Resizable split container, ARIA slider |
| useFilteredDiagram | `core/src/hooks/useFilteredDiagram.ts` | Node filtering by type/path/tags, focus mode, filter presets |
| FilterPanel | `core/src/components/FilterPanel/` | Filter UI, path pattern input, preset management |
| useLiveDiagram | `core/src/hooks/useLiveDiagram.ts` | Auto-refresh, stale detection, diff tracking, position preservation |
| RefreshControl | `core/src/components/RefreshControl/` | Manual/auto refresh toggle, loading indicator |
| StaleIndicator | `core/src/components/StaleIndicator/` | Visual stale badge with timestamp |
| DiffOverlay | `core/src/components/DiffOverlay/` | Added/removed/modified node summary badges |
| useDiagramNavigation | `core/src/hooks/useDiagramNavigation.ts` | C4-inspired drill-down, history, breadcrumb navigation |
| Breadcrumbs | `core/src/components/Breadcrumbs/` | Navigation trail with clickable history |
| DiagramTypeSelector | `core/src/components/DiagramTypeSelector/` | Dropdown/compact type picker |
| useSearch | `core/src/hooks/useSearch.ts` | Debounced search, history, keyboard navigation |
| SearchDialog | `core/src/components/SearchDialog/` | Modal search with focus management |
| SearchResults | `core/src/components/SearchResults/` | Results list with type grouping |
| useImageExport | `core/src/hooks/useImageExport.ts` | PNG/SVG export, configurable scale, background options |
| ImageExportDialog | `core/src/components/ImageExportDialog/` | Format/scale/background options, download/clipboard actions |
| useCodebaseOverview | `core/src/hooks/useCodebaseOverview.ts` | C4 abstraction levels, navigation path, diagram type suggestions |
| useArmadaBreadcrumbs | `core/src/hooks/useArmadaBreadcrumbs.ts` | Breadcrumb state with Armada integration, scope/query storage |

### Tests

- 419 tests passing in core package
- New test files: ThemeSwitcher, ExportDialog, AnnotationPanel, MultiDiagramView, FilterPanel, LiveDiagram, DiagramNavigation, Search, ImageExport, CodebaseOverview

---

## Recent Work (2026-02-05)

### CORAL-REQ-012: Font Customization (#33) ✓

Implemented font customization for diagrams:
- FontSettings and DiagramFontSettings types in schema.ts
- Font family presets (System, Sans, Serif, Mono, Handwritten)
- Font size presets (11px, 14px, 16px, 18px) + custom
- FontSettingsForm component with family, size, weight, line height
- 34 tests for font settings and component
- ELK-compatible via existing measureText/computeNodeSize

### CCD-REQ-004: Code Navigation Design ✓

Completed design proposal (2 passes):
- **Finding**: Architecture is 80% complete - components exist, need wiring
- NavigationProvider has VS Code compatibility built-in
- Inspector has action buttons with callback props
- DiagramRenderer has node selection callbacks
- **Remaining**: Hover tooltips, edge click, context menu, keyboard shortcuts
- Design document: `dev/specs/ccd-req-004-code-navigation-design.md`
- Estimated implementation: 14-21 hours

### CCD-REQ-003: Diagram Types Analysis ✓

Analyzed C4-style diagram hierarchy for auto-documentation:

- **Key finding**: C4 Levels 3-4 (Component/Code) can be auto-generated from Armada
- **Gap identified**: C4 Levels 1-2 (Context/Container) need human curation + infrastructure knowledge
- **Recommendation**: "Auto-generate structural truth, let users annotate architectural intent"
- **Blocker**: Annotation layer (CCD-REQ-006 for coral-code-design) needed first
- Analysis document: `dev/analysis/CCD-REQ-003-diagram-types-analysis.md`

### Phase-Change Indexers Analysis ✓

Proposed strategy for bridging code → infrastructure knowledge gap:

- **Concept**: Code transforms through phases (source → artifact → container → deploy → infra)
- **Each phase has indexable artifacts** that inform C4 Levels 1-2
- **Proposed indexers**:
  - IaC: Terraform, Pulumi, K8s manifests
  - Manifests: package.json, pyproject.toml, go.mod
  - Containers: Dockerfile, docker-compose
  - CI/CD: GitHub Actions, GitLab CI
  - API specs: OpenAPI, GraphQL schemas
  - Docs: Mermaid in markdown, ADRs
- **Hardest problem**: Cross-phase linking (connecting Terraform resources to code)
- **MVP proposal**: Mermaid parsing (already done) + package.json deps + Terraform resources
- Analysis document: `dev/analysis/phase-change-indexers-analysis.md`

### coral-code-design Issues Complete

| Issue | Description |
|-------|-------------|
| #30 | PNG/SVG Image Export |
| #32 | Codebase Overview & Armada Breadcrumbs |
| #33 | Font Customization (viz package) |

### Armada Integration Test Suite ✓

Created comprehensive integration test infrastructure for Armada MCP tools:

**Files Created:**
- `packages/mcp-server/test/integration/armada-integration.test.ts` - 30+ tests
- `packages/mcp-server/test/integration/validate-armada.ts` - CLI validation script
- `packages/mcp-server/test/integration/README.md` - Documentation with current state

**Test Categories:**
- Indexer Correctness (4 tests) - Verify known symbols indexed correctly
- Semantic Search (4 tests) - Natural language code discovery
- Query Filtering (3 tests) - Type filters, limits, empty handling
- Context Retrieval (3 tests) - Scoped context queries
- Dependency Graph (3 tests) - Upstream/downstream traversal
- Impact Analysis (2 tests) - Blast radius calculation
- Call Tracing (2 tests) - Call path discovery
- Response Format (3 tests) - API structure validation
- Edge Cases (4 tests) - Robustness testing
- Performance (3 tests) - Query timing benchmarks

**Current Armada State (verified via MCP):**
- 5,552 nodes indexed (757 functions, 187 classes, 175 modules)
- 10,914 edges in knowledge graph
- 2,071 vector store points for semantic search

**Identified Gaps:**
- `what_uses` and `what_breaks` often return 0 results for widely-used symbols
- Some tools have missing modules (e.g., `find_tests_for`)
- Semantic search could rank exact name matches higher

---

**Last Updated**: 2026-02-05
