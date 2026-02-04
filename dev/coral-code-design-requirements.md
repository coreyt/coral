# Coral Code Design — Application Requirements

> **Application**: coral-code-design
> **Purpose**: Software architecture visualization and exploration tool
> **Authority**: Coral ecosystem (see `CLAUDE.md`)
> **Created**: 2026-02-04

---

## Executive Summary

**coral-code-design** is a dedicated application for software engineers to visualize, explore, and document codebases. Unlike viz-demo (a general-purpose diagramming reference app), coral-code-design is purpose-built for code understanding workflows with deep Armada integration.

### Vision

> "See your codebase as living architecture diagrams that stay in sync with your code."

### Key Differentiators from viz-demo

| Aspect | viz-demo | coral-code-design |
|--------|----------|-------------------|
| Purpose | General diagramming reference | Code architecture exploration |
| Data source | User-created or imported | Armada-generated, user-annotated |
| Workflow | Document authoring | Codebase exploration |
| Armada | Optional (fetch button) | Required (always connected) |
| Documents | Single diagram | Workspace with multiple views |
| Navigation | None | Diagram ↔ Source code |

---

## Architecture Principles

### 1. VS Code Integration Compatibility

All components must be designed for future VS Code webview integration:

```
┌─────────────────────────────────────────────────────────────┐
│  coral-code-design (Standalone)                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  @coral-code-design/core                             │   │
│  │  (React components, state management, Armada client) │   │
│  └─────────────────────────────────────────────────────┘   │
│           ▲                              ▲                  │
│           │                              │                  │
│  ┌────────┴────────┐          ┌─────────┴─────────┐       │
│  │ Standalone Shell │          │ VS Code Extension │       │
│  │ (Vite + React)   │          │ (Webview host)    │       │
│  └──────────────────┘          └───────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

**Requirements for VS Code compatibility:**

- **CCD-ARCH-001**: Core UI must be a standalone React package (`@coral-code-design/core`)
- **CCD-ARCH-002**: No direct filesystem access in core; use abstracted `WorkspaceProvider`
- **CCD-ARCH-003**: Communication via message-passing interface (postMessage-compatible)
- **CCD-ARCH-004**: Theming must support VS Code color tokens
- **CCD-ARCH-005**: Keyboard shortcuts must be configurable (VS Code has its own bindings)

### 2. Armada-First Architecture

Armada is not optional—it's the foundation:

- **CCD-ARCH-010**: Application requires active Armada connection to function
- **CCD-ARCH-011**: Diagrams are views into the knowledge graph, not standalone files
- **CCD-ARCH-012**: Changes in code trigger diagram updates (via Armada subscriptions)
- **CCD-ARCH-013**: User annotations stored separately, merged with Armada data at render

### 3. Layered State Model

```
┌─────────────────────────────────────────┐
│  Presentation Layer                     │
│  (React components, layout, theming)    │
├─────────────────────────────────────────┤
│  View Layer                             │
│  (Diagram configurations, selections)   │
├─────────────────────────────────────────┤
│  Annotation Layer                       │
│  (User notes, position overrides, tags) │
├─────────────────────────────────────────┤
│  Data Layer (Armada)                    │
│  (Nodes, edges, code relationships)     │
└─────────────────────────────────────────┘
```

---

## Functional Requirements

### CCD-REQ-001: Workspace Management

**Priority**: Critical
**Traces To**: Application foundation

#### Description

A workspace represents a codebase being explored. Users open a workspace (directory or git repo), and the app connects to Armada's index for that codebase.

#### Acceptance Criteria

- [ ] Open workspace by selecting a directory
- [ ] Workspace persists open diagrams, layout, and view state
- [ ] Recent workspaces list for quick access
- [ ] Workspace settings stored in `.coral-code-design/` directory
- [ ] Multiple workspaces can be open (in separate windows)

#### Data Model

```typescript
interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  armadaConnection: ArmadaConnectionConfig;
  openDiagrams: DiagramReference[];
  activeLayout: LayoutConfig;
  annotations: AnnotationStore;
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  defaultNotation: NotationType;
  defaultDiagramType: DiagramType;
  autoRefresh: boolean;
  refreshInterval: number; // ms
}
```

---

### CCD-REQ-002: Multi-Diagram View

**Priority**: Critical
**Traces To**: Core UX requirement

#### Description

Users need to view multiple related diagrams simultaneously—architecture overview alongside component details, or call graph next to dependency graph. This is essential for software engineering workflows where understanding requires multiple perspectives on the same codebase.

#### Acceptance Criteria

**Basic Multi-View**:
- [ ] Tabbed interface for switching between diagrams
- [ ] Split view: 2-4 diagrams side-by-side or stacked
- [ ] Linked selection: clicking a node highlights it across all views
- [ ] Synchronized zoom/pan (optional, toggleable)
- [ ] Diagram tabs can be dragged to reorder or create splits

**Diagram Presets**:
- [ ] Preset combinations for common workflows (see Diagram Presets below)
- [ ] Quick-launch presets from menu or command palette
- [ ] Presets auto-configure layout and diagram types

**Scope Linking**:
- [ ] Diagrams can be linked by scope (drill-down in one updates others)
- [ ] "Follow selection" mode: detail views track selected node in overview
- [ ] Manual or automatic scope linking (user choice)

**Named Layouts**:
- [ ] Save current layout as named configuration
- [ ] Restore saved layouts from menu
- [ ] Workspace remembers last-used layout
- [ ] Share layouts via export/import

#### Layout Options

```typescript
type LayoutMode =
  | 'tabs'           // Single diagram with tab bar
  | 'split-h'        // Horizontal split (left/right)
  | 'split-v'        // Vertical split (top/bottom)
  | 'grid-2x2'       // Four diagrams in grid
  | 'focus+context'; // One large + thumbnail strip

interface LayoutConfig {
  mode: LayoutMode;
  panes: PaneConfig[];
  linkedSelection: boolean;
  linkedNavigation: boolean;
  scopeLinking: ScopeLinkingConfig;
}

interface PaneConfig {
  id: string;
  diagramId: string;
  position: 'left' | 'right' | 'top' | 'bottom' | number; // number for grid
  size?: number; // percentage
}

interface ScopeLinkingConfig {
  enabled: boolean;
  mode: 'manual' | 'follow-selection';
  primaryPane: string;        // Which pane drives scope changes
  linkedPanes: string[];      // Which panes follow the primary
}
```

#### Diagram Presets

Pre-configured diagram combinations for common software engineering workflows:

```typescript
type DiagramPreset =
  | 'overview-and-detail'     // Architecture + selected component detail
  | 'code-and-flow'           // Component + its data flow
  | 'dependencies-both-ways'  // Upstream + downstream dependencies
  | 'before-and-after'        // Impact analysis (current vs affected)
  | 'call-trace'              // Entry point + call graph + target
  | 'custom';

interface DiagramPresetConfig {
  id: DiagramPreset;
  name: string;
  description: string;
  layout: LayoutMode;
  diagrams: PresetDiagramConfig[];
  scopeLinking: ScopeLinkingConfig;
}

interface PresetDiagramConfig {
  panePosition: PaneConfig['position'];
  diagramType: DiagramType;
  scopeRelation: 'independent' | 'selected-node' | 'parent' | 'children';
}
```

| Preset | Layout | Diagrams | Use Case |
|--------|--------|----------|----------|
| **Overview + Detail** | split-h | Module graph (left) + Component detail (right) | Explore architecture, drill into modules |
| **Code + Flow** | split-h | Component detail (left) + Data flow (right) | Understand how data moves through a component |
| **Dependencies Both Ways** | split-h | Upstream deps (left) + Downstream deps (right) | Understand a symbol's position in the codebase |
| **Before + After** | split-h | Current state (left) + Impact analysis (right) | Assess change blast radius |
| **Call Trace** | split-v | Entry points (top) + Call graph (bottom) | Trace execution paths |

#### Example: Architecture + Two Data Flows

```
┌─────────────────────────────────────────────────────────────────┐
│  [Architecture ▾] [Auth Flow] [API Flow] [+]    Layout: grid   │
├─────────────────────────────┬───────────────────────────────────┤
│                             │                                   │
│   🔗 Architecture           │   Auth Data Flow                  │
│   (module-graph)            │   (data-flow, scope: auth)        │
│                             │   ─────────────────────────       │
│   ┌──────┐    ┌─────┐       │   User → AuthSvc → TokenMgr       │
│   │ Auth │───▶│ API │       │              │                    │
│   └──────┘    └─────┘       │              ▼                    │
│       │                     │          Database                 │
│       ▼                     │                                   │
│   ┌──────┐                  ├───────────────────────────────────┤
│   │  DB  │                  │                                   │
│   └──────┘                  │   API Data Flow                   │
│                             │   (data-flow, scope: api)         │
│   [Click Auth to update ──▶]│   ─────────────────────────       │
│                             │   Request → Router → Handler      │
│                             │                        │          │
│                             │                        ▼          │
│                             │                    Response       │
└─────────────────────────────┴───────────────────────────────────┘
│ 🔗 Scope linked: Detail views follow Architecture selection     │
└─────────────────────────────────────────────────────────────────┘
```

#### Named Layouts

Users can save and restore diagram arrangements:

```typescript
interface NamedLayout {
  id: string;
  name: string;                    // e.g., "Auth Investigation"
  description?: string;
  createdAt: string;
  modifiedAt: string;
  config: LayoutConfig;
  diagrams: SavedDiagramState[];   // Which diagrams, their types, scopes
}

interface SavedDiagramState {
  paneId: string;
  diagramType: DiagramType;
  scope: ScopeConfig;
  filters: FilterConfig;
  viewState?: {                    // Optional: restore zoom/pan
    zoom: number;
    pan: { x: number; y: number };
  };
}
```

**Workflow**:
1. User arranges diagrams for investigating auth system
2. User clicks "Save Layout" → names it "Auth Investigation"
3. Later, user opens "Auth Investigation" from Layouts menu
4. All diagrams restore with same types, scopes, and arrangement

---

### CCD-REQ-003: Diagram Types (C4-Inspired)

**Priority**: High
**Traces To**: Software architecture visualization needs

#### Description

Support multiple abstraction levels following C4 model principles, adapted for code exploration:

| Level | C4 Equivalent | coral-code-design |
|-------|---------------|-------------------|
| 1 | System Context | **Codebase Overview**: packages, external dependencies |
| 2 | Container | **Module Graph**: top-level modules/packages and their relationships |
| 3 | Component | **Component Detail**: classes, interfaces, functions within a module |
| 4 | Code | **Code Graph**: detailed call graphs, data flows within a component |

#### Acceptance Criteria

- [ ] Codebase Overview: show packages + external deps (npm, PyPI, etc.)
- [ ] Module Graph: show modules with import relationships
- [ ] Component Detail: show classes/functions within selected module
- [ ] Code Graph: show call graph / data flow for selected function
- [ ] Drill-down: double-click node to zoom into next level
- [ ] Breadcrumb navigation to track abstraction level

#### Diagram Type Model

```typescript
type DiagramType =
  | 'codebase-overview'
  | 'module-graph'
  | 'component-detail'
  | 'call-graph'
  | 'dependency-graph'
  | 'inheritance-tree'
  | 'data-flow'
  | 'impact-analysis'
  | 'custom';

interface DiagramConfig {
  type: DiagramType;
  scope: ScopeConfig;
  filters: FilterConfig;
  notation: NotationType;
  layout: LayoutOptions;
}

interface ScopeConfig {
  // What part of codebase to show
  rootPath?: string;      // e.g., "src/auth"
  rootSymbol?: string;    // e.g., "AuthService"
  depth?: number;         // How many levels deep
  direction?: 'upstream' | 'downstream' | 'both';
}
```

---

### CCD-REQ-004: Code Navigation

**Priority**: High
**Traces To**: Developer workflow integration

#### Description

Seamless navigation between diagrams and source code. Click a node to see its code; click a function in code to see its place in the architecture.

#### Acceptance Criteria

- [ ] Click node → show source code in preview pane
- [ ] Double-click node → open in VS Code (standalone) or editor (VS Code extension)
- [ ] Right-click node → context menu with navigation options
- [ ] "Reveal in diagram" command from code selection
- [ ] Hover node → tooltip with signature, docstring, file path
- [ ] Edge click → show call sites or import statements

#### Navigation Protocol (VS Code Compatible)

```typescript
interface NavigationRequest {
  type: 'open-file' | 'reveal-symbol' | 'show-references';
  target: {
    file: string;
    line?: number;
    column?: number;
    symbol?: string;
  };
}

interface NavigationProvider {
  // Standalone: opens in system editor or embedded preview
  // VS Code: sends command to extension host
  navigate(request: NavigationRequest): Promise<void>;
  canNavigate(request: NavigationRequest): boolean;
}
```

---

### CCD-REQ-005: Live Diagram Updates

**Priority**: High
**Traces To**: CCD-ARCH-012

#### Description

Diagrams reflect the current state of the codebase. When code changes and Armada reindexes, diagrams update automatically (or on demand).

#### Acceptance Criteria

- [ ] Manual refresh button per diagram
- [ ] Auto-refresh toggle (workspace setting)
- [ ] Visual indicator when diagram may be stale
- [ ] Incremental update: only changed nodes animate
- [ ] Preserve user positions during refresh (position stability)
- [ ] Diff view: highlight what changed since last refresh

#### Update Model

```typescript
interface DiagramUpdateEvent {
  diagramId: string;
  changeType: 'full' | 'incremental';
  changes: {
    addedNodes: string[];
    removedNodes: string[];
    modifiedNodes: string[];
    addedEdges: string[];
    removedEdges: string[];
  };
  timestamp: number;
}

interface RefreshConfig {
  mode: 'manual' | 'auto';
  interval?: number;
  preservePositions: boolean;
  preserveSelection: boolean;
  animateChanges: boolean;
}
```

---

### CCD-REQ-006: Annotation Layer

**Priority**: Medium
**Traces To**: Documentation workflow

#### Description

Users can annotate diagrams with notes, labels, colors, and groupings that persist independently of the code. Annotations are stored in the workspace (`.coral-code-design/` folder), not in Armada.

**Key Design Decision**: Annotations reference nodes by **stable Armada symbol IDs** (not file path + name). This ensures annotations survive code refactoring. Symbol IDs are visible in the Inspector pane for transparency.

#### Acceptance Criteria

- [ ] Add text annotations to nodes (appears as tooltip or label suffix)
- [ ] Add text annotations to edges (explains relationships)
- [ ] Group nodes visually (draw boundary, add group label)
- [ ] Color-code nodes (status, ownership, priority)
- [ ] Tag nodes for filtering ("needs-review", "deprecated", "core")
- [ ] Annotations persist across refreshes
- [ ] Export annotations as markdown documentation
- [ ] **Symbol ID visible in Inspector** (copyable, non-intrusive)
- [ ] **Orphaned annotation handling**: annotations for deleted symbols shown in "Unlinked" view

#### Annotation Model

```typescript
interface AnnotationStore {
  version: string;                              // Schema version for migration
  nodes: Record<SymbolId, NodeAnnotation>;      // Keyed by Armada symbol ID
  edges: Record<EdgeKey, EdgeAnnotation>;       // Keyed by "sourceId->targetId"
  groups: GroupAnnotation[];
  tags: TagDefinition[];
  orphaned: OrphanedAnnotation[];               // Annotations with missing symbols
}

// Armada symbol ID (SCIP format)
type SymbolId = string;  // e.g., "scip:src/auth/svc.ts:AuthService#"

interface NodeAnnotation {
  symbolId: SymbolId;           // Stable reference to Armada node
  note?: string;
  color?: string;
  tags?: string[];
  positionOverride?: Position;
  hidden?: boolean;
  lastVerified?: string;        // ISO timestamp when symbol was last found
}

interface EdgeAnnotation {
  sourceSymbolId: SymbolId;
  targetSymbolId: SymbolId;
  note?: string;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

interface GroupAnnotation {
  id: string;
  label: string;
  symbolIds: SymbolId[];        // Members referenced by symbol ID
  color?: string;
  note?: string;
}

interface OrphanedAnnotation {
  originalSymbolId: SymbolId;
  annotation: NodeAnnotation;
  orphanedAt: string;           // ISO timestamp when symbol was not found
  lastKnownName?: string;       // For user reference
  lastKnownPath?: string;
}
```

#### Orphaned Annotation Workflow

When a symbol is deleted or renamed beyond recognition:

1. Annotation moved to `orphaned` array
2. Shown in "Unlinked Annotations" panel in UI
3. User can:
   - **Re-link**: Associate with a different symbol
   - **Delete**: Remove the orphaned annotation
   - **Keep**: Leave in orphaned state (maybe symbol returns)

```
┌─────────────────────────────────────┐
│ ⚠️ Unlinked Annotations (2)         │
├─────────────────────────────────────┤
│ 📝 "Core auth logic"                │
│    Was: AuthService (deleted)       │
│    [Re-link] [Delete]               │
├─────────────────────────────────────┤
│ 📝 "Handles token refresh"          │
│    Was: TokenManager.refresh()      │
│    [Re-link] [Delete]               │
└─────────────────────────────────────┘
```

---

### CCD-REQ-007: Filter and Focus

**Priority**: Medium
**Traces To**: Large codebase usability

#### Description

Large codebases produce overwhelming diagrams. Users need powerful filtering to focus on relevant parts.

#### Acceptance Criteria

- [ ] Filter by file path pattern (glob)
- [ ] Filter by node type (class, function, module)
- [ ] Filter by tag (user-defined)
- [ ] Filter by relationship (show only nodes connected to X)
- [ ] "Focus mode": hide everything except selected node + N levels
- [ ] Save filter presets per workspace
- [ ] Filter UI: search bar + filter chips

#### Filter Model

```typescript
interface FilterConfig {
  pathPatterns?: string[];      // Include paths matching these globs
  excludePatterns?: string[];   // Exclude paths matching these
  nodeTypes?: string[];         // Only these node types
  tags?: string[];              // Only nodes with these tags
  connectedTo?: string;         // Only nodes connected to this
  maxDepth?: number;            // Limit relationship depth
  minConfidence?: number;       // Armada confidence threshold
}
```

---

### CCD-REQ-008: Search and Discovery

**Priority**: Medium
**Traces To**: Developer workflow

#### Description

Find symbols, navigate to them, and understand their architectural context.

#### Acceptance Criteria

- [ ] Global search (Cmd+P / Ctrl+P): find any symbol
- [ ] Search results show symbol type, file, and preview
- [ ] Select result → reveal in current diagram (if in scope) or open new diagram
- [ ] "Find usages" for a symbol
- [ ] "Find implementations" for interfaces/abstract classes
- [ ] Search history and recent symbols

---

### CCD-REQ-009: Export and Sharing

**Priority**: Medium
**Traces To**: Documentation needs

#### Description

Export diagrams for documentation, presentations, or sharing with team members who don't have the app.

#### Acceptance Criteria

- [ ] Export as PNG/SVG (static image)
- [ ] Export as PDF (multi-page for multiple diagrams)
- [ ] Export as interactive HTML (standalone viewer)
- [ ] Export as Coral DSL (editable in viz-demo)
- [ ] Export annotations as Markdown
- [ ] Share link (if hosted version exists)
- [ ] Copy diagram to clipboard (for pasting into docs)

---

### CCD-REQ-010: Theming and Accessibility

**Priority**: Medium
**Traces To**: CCD-ARCH-004, usability

#### Description

Support light/dark themes, VS Code theme integration, and accessibility requirements.

#### Acceptance Criteria

- [ ] Light and dark themes built-in
- [ ] Respect system preference (prefers-color-scheme)
- [ ] VS Code theme token support (when running as extension)
- [ ] High contrast mode
- [ ] Keyboard navigation for all actions
- [ ] Screen reader support for diagram structure
- [ ] Configurable font sizes

---

## Non-Functional Requirements

### CCD-NFR-001: Performance

- Render diagrams with 500+ nodes at 60fps
- Initial diagram load < 2 seconds
- Incremental refresh < 500ms
- Search results appear < 100ms

### CCD-NFR-002: Offline Support

- Cached diagrams viewable without Armada connection
- Annotations editable offline
- Sync when connection restored

### CCD-NFR-003: Memory

- Handle workspaces with 10,000+ symbols
- Virtualized rendering for large diagrams
- Lazy loading of diagram data

---

## Package Structure

```
packages/
├── coral-code-design/
│   ├── core/                    # @coral-code-design/core
│   │   ├── src/
│   │   │   ├── components/      # React components
│   │   │   │   ├── Workspace/
│   │   │   │   ├── DiagramView/
│   │   │   │   ├── Navigator/
│   │   │   │   ├── Inspector/
│   │   │   │   └── SearchPalette/
│   │   │   ├── hooks/           # React hooks
│   │   │   ├── state/           # State management (Zustand?)
│   │   │   ├── providers/       # Context providers
│   │   │   │   ├── WorkspaceProvider.ts
│   │   │   │   ├── NavigationProvider.ts
│   │   │   │   └── ArmadaProvider.ts
│   │   │   ├── armada/          # Armada client (deeper than viz-demo)
│   │   │   └── types/
│   │   └── package.json
│   │
│   ├── standalone/              # @coral-code-design/standalone
│   │   ├── src/
│   │   │   ├── main.tsx         # Vite entry point
│   │   │   ├── Shell.tsx        # Window chrome, menus
│   │   │   └── providers/       # Standalone-specific providers
│   │   ├── index.html
│   │   └── package.json
│   │
│   └── vscode/                  # @coral-code-design/vscode (future)
│       ├── src/
│       │   ├── extension.ts     # VS Code extension entry
│       │   ├── webview/         # Webview host
│       │   └── providers/       # VS Code-specific providers
│       └── package.json
```

---

## UI Layout (Standalone)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  coral-code-design                                            [_][□][×]       │
├───────────────────────────────────────────────────────────────────────────────┤
│  [File] [View] [Diagram] [Help]                      🔍 Search (Cmd+P)        │
├──────────┬────────────────────────────────────────────────┬───────────────────┤
│          │  [Overview] [Modules] [AuthService] [+]        │                   │
│  NAV     ├────────────────────────────────────────────────┤    INSPECTOR      │
│          │                                                │                   │
│ 📁 src   │                                                │ ┌───────────────┐ │
│  📁 auth │           ┌─────────┐                          │ │ AuthService   │ │
│   🔷 Svc │           │ AuthSvc │──────┐                   │ ├───────────────┤ │
│   🔷 Tok │           └────┬────┘      │                   │ │ Type: class   │ │
│  📁 api  │                │           ▼                   │ │ File: src/    │ │
│   ...    │           ┌────┴────┐ ┌─────────┐              │ │  auth/svc.ts  │ │
│          │           │ TokenMgr│ │ UserRepo│              │ │ Lines: 45-128 │ │
│ ──────── │           └─────────┘ └─────────┘              │ ├───────────────┤ │
│ OUTLINE  │                                                │ │ Symbol ID   ▾ │ │
│          │                                                │ │ ┌───────────┐ │ │
│ Classes  │                                                │ │ │scip:src/  │ │ │
│  AuthSvc │                                                │ │ │auth/svc.ts│ │ │
│  TokenMgr│                                                │ │ │:AuthSvc#  │ │ │
│  UserRepo│                                                │ │ └───────────┘ │ │
│          │                                                │ │       [Copy]  │ │
│ ──────── │                                                │ ├───────────────┤ │
│ ⚠️ Orphan│                                                │ │ [Code] [Refs] │ │
│  (2)     │                                                │ │ [Deps] [Uses] │ │
│          │                                                │ ├───────────────┤ │
│          │                                                │ │ Annotations   │ │
│          │                                                │ │ Note: Core    │ │
│          │                                                │ │ auth logic    │ │
│          │                                                │ │ Tags: [core]  │ │
│          │                                                │ │ [+ Add Note]  │ │
│          │                                                │ └───────────────┘ │
├──────────┴────────────────────────────────────────────────┴───────────────────┤
│  ● Connected to Armada │ 1,234 nodes │ Last refresh: 2m ago │ [↻] Refresh     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Inspector Pane Details

The Inspector shows contextual information for the selected node:

| Section | Contents |
|---------|----------|
| **Header** | Node name, icon based on type |
| **Identity** | Type, file path, line numbers |
| **Symbol ID** | Collapsible section showing Armada symbol ID with copy button |
| **Actions** | Quick action buttons: Code, Refs, Deps, Uses |
| **Annotations** | User notes, tags, color (editable) |

**Symbol ID Display**:
- Collapsed by default (shows "Symbol ID ▸")
- Expandable to reveal full ID in monospace font
- Copy button for scripting/automation
- Selectable text for manual copying

**Why expose Symbol ID?**
- **Transparency**: Users understand how annotations link to code
- **Debugging**: Helps troubleshoot orphaned annotations
- **Automation**: Enables scripted annotation management
- **Power users**: Can reference IDs in external tools/scripts

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Platform**: Web-only (Vite + React)
**Armada**: HTTP API

| Requirement | Description |
|-------------|-------------|
| CCD-REQ-001 | Workspace Management (basic) |
| CCD-REQ-003 | Diagram Types (module + component) |
| CCD-REQ-004 | Code Navigation (click to preview) |
| CCD-ARCH-001-005 | VS Code compatible architecture |

**Deliverable**: Open workspace, view module graph, click to see code

**Platform limitations accepted in Phase 1**:
- File System Access API (Chrome/Edge only for full functionality)
- No native menus (use in-app menu bar)
- No file watching (manual refresh only)
- No system tray / background running

---

### Phase 2: Multi-View

**Platform**: Web-only (continues from Phase 1)
**Armada**: HTTP API

| Requirement | Description |
|-------------|-------------|
| CCD-REQ-002 | Multi-Diagram View |
| CCD-REQ-007 | Filter and Focus |
| CCD-REQ-008 | Search and Discovery |

**Deliverable**: Tabbed/split diagrams, filtering, search palette

---

### Phase 3: Persistence & Polish

**Platform**: Web-only (continues)
**Armada**: HTTP API primary, MCP for advanced queries

| Requirement | Description |
|-------------|-------------|
| CCD-REQ-005 | Live Diagram Updates |
| CCD-REQ-006 | Annotation Layer |
| CCD-REQ-009 | Export and Sharing |
| CCD-REQ-010 | Theming and Accessibility |

**Deliverable**: Full-featured standalone web application

**Armada MCP additions**:
- Real-time search via `mcp__armada__search`
- Impact analysis via `mcp__armada__impact_of`
- Symbol tracing via `mcp__armada__trace_calls`

---

### Phase 4: VS Code Extension

**Platform**: VS Code webview
**Armada**: HTTP API + MCP

| Item | Description |
|------|-------------|
| Extension scaffold | `@coral-code-design/vscode` package |
| Webview integration | Host `@coral-code-design/core` in webview |
| Editor ↔ Diagram navigation | Click node → open file in editor |
| VS Code theme support | Map VS Code tokens to Coral theme |
| Commands | `Coral: Open Diagram`, `Coral: Reveal in Diagram` |
| Activity bar | Coral icon in sidebar |

**Deliverable**: coral-code-design as VS Code extension

**VS Code-specific features**:
- Diagram ↔ editor synchronized selection
- "Reveal in Diagram" from editor context menu
- Diagram preview in editor tabs
- Integration with VS Code's SCM for annotation tracking

---

### Phase 5: Native Desktop (Optional)

**Platform**: Electron or Tauri wrapper
**Armada**: HTTP API + MCP

| Item | Description |
|------|-------------|
| Native shell | Electron or Tauri application wrapper |
| File system | Direct filesystem access (no browser API limits) |
| File watching | Watch for code changes, auto-refresh |
| Native menus | OS-native menu bar and context menus |
| System tray | Background process, quick access |
| Auto-update | Built-in update mechanism |

**Deliverable**: Native desktop application (Windows, macOS, Linux)

**Decision point**: Electron vs Tauri
- Electron: Familiar, large ecosystem, heavier (~150MB)
- Tauri: Lightweight (~10MB), Rust backend, newer

**When to pursue Phase 5**:
- User demand for native experience outside VS Code
- Need for features not possible in browser (file watching, system tray)
- Performance requirements exceed browser capabilities

---

### Phase 6: Collaboration (Future)

**Platform**: All platforms
**Armada**: HTTP API + MCP + potential real-time sync

| Item | Description |
|------|-------------|
| Cloud sync | Optional cloud storage for annotations |
| Real-time collaboration | Multiple users viewing/editing same workspace |
| Comments | Comment threads on nodes/diagrams |
| Sharing | Share diagrams via link (read-only or editable) |
| Teams | Organization-level annotation sharing |

**Deliverable**: Collaborative architecture documentation

**Prerequisites**:
- Backend service for sync (outside Coral scope, likely separate project)
- Authentication/authorization
- Conflict resolution for annotations

**When to pursue Phase 6**:
- Clear user demand for team collaboration
- Resources for backend development
- Business model that supports hosted service

---

## Dependencies

### Required

| Package | Purpose |
|---------|---------|
| `@coral/viz` | Diagram rendering, shapes, symbols, notations |
| `@coral/language` | DSL parsing/printing (for export) |
| `Armada` | Code knowledge graph |
| `React` | UI framework |
| `React Flow` | Diagram canvas (via @coral/viz) |

### Recommended

| Package | Purpose |
|---------|---------|
| `Zustand` | State management |
| `TanStack Query` | Armada data fetching/caching |
| `Tailwind CSS` | Styling |
| `cmdk` | Command palette |

---

## Architectural Decisions

### Decision 1: Platform Strategy

**Decision**: Web-only for Phases 1-3, VS Code extension in Phase 4, native desktop optional in Phase 5

**Rationale**:
- Web-only keeps focus on core functionality (which VS Code webview will reuse)
- File System Access API provides sufficient file access in Chrome/Edge
- VS Code extension is the primary "native" experience for developers
- Native desktop (Electron/Tauri) deferred until clear user demand

**Implications**:
- Phase 1-3 limited to browsers supporting File System Access API
- Firefox/Safari users have degraded file experience (download/upload only)
- Architecture must remain webview-compatible throughout

---

### Decision 2: Armada Connection Model

**Decision**: HTTP API primary, MCP for advanced features (Phase 3+)

**Rationale**:
- HTTP API already implemented in Armada (`/api/graph`, `/api/stats`, etc.)
- Simpler connection model, works across network
- MCP adds value for interactive queries (search, impact, trace)
- Hybrid approach: HTTP for bulk data, MCP for real-time interactions

**Implications**:
- Phase 1-2 use HTTP only (simpler implementation)
- Phase 3 adds MCP client for `search`, `impact_of`, `trace_calls`
- Future: MCP subscriptions for live updates (if Armada adds support)

---

### Decision 3: Annotation Storage

**Decision**: `.coral-code-design/` folder with JSON files, git-committed by default

**Rationale**:
- Architecture documentation should live with code
- JSON is human-readable and git-mergeable
- Per-workspace storage avoids external dependencies
- Teams can choose to `.gitignore` for personal-only annotations

**Storage Structure**:
```
my-project/
├── .coral-code-design/
│   ├── workspace.json           # Settings, recent diagrams, preferences
│   ├── annotations/
│   │   ├── <diagram-id>.json    # Per-diagram annotations
│   │   └── ...
│   └── layouts/
│       └── <layout-id>.json     # Saved layout configurations
├── src/
└── ...
```

**Gitignore Guidance** (provided to users):
```gitignore
# Option 1: Ignore all (personal use only)
.coral-code-design/

# Option 2: Share annotations, ignore view state
.coral-code-design/workspace.json
.coral-code-design/layouts/
```

---

### Decision 4: Annotation Node References

**Decision**: Annotations reference nodes by stable Armada symbol IDs

**Rationale**:
- Armada symbol IDs are stable across renames (tied to semantic identity)
- Path+name references break when code is refactored
- Symbol IDs enable annotation survival across code changes

**Symbol ID Visibility**:
- Symbol ID displayed in Inspector/Properties pane (non-intrusive)
- Copyable for scripting/automation use cases
- Not shown in diagram labels (clutters UI)

**Example Inspector Display**:
```
┌─────────────────────────────┐
│ Node Properties             │
├─────────────────────────────┤
│ Name:     AuthService       │
│ Type:     class             │
│ File:     src/auth/svc.ts   │
│ Lines:    45-128            │
├─────────────────────────────┤
│ Symbol ID                   │
│ ┌─────────────────────────┐ │
│ │ scip:src/auth/svc.ts:   │ │
│ │ AuthService#            │ │ [Copy]
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Annotations                 │
│ Note: Core auth logic       │
│ Tags: [core] [needs-review] │
└─────────────────────────────┘
```

**Implications**:
- Annotations may become orphaned if symbol is deleted (handled gracefully)
- Orphaned annotations shown in "Unlinked Annotations" view for cleanup
- Symbol ID format follows Armada conventions (SCIP-based)

---

## References

- [C4 Model](https://c4model.com/) - Abstraction levels for software architecture
- [Coral Design Standard](../references/coral_design_standard.md) - UI/UX guidelines
- [Armada HTTP API](../../armada/cartographer/armada/viz/server.py) - Visualization server
- [viz-demo](../packages/viz-demo/) - Reference implementation

---

*This document defines requirements for coral-code-design. For implementation tracking, see PROGRESS.md.*
