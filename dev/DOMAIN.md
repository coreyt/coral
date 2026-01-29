# Coral Domain Knowledge

This document provides foundational domain knowledge for contributors to the Coral project, covering graph theory, diagramming concepts, layout algorithms, and parsing fundamentals.

## Table of Contents

1. [Graph Theory Fundamentals](#1-graph-theory-fundamentals)
2. [Diagramming Tool Landscape](#2-diagramming-tool-landscape)
3. [Layout Algorithms](#3-layout-algorithms)
4. [Parsing and Language Design](#4-parsing-and-language-design)
5. [Architecture Visualization Concepts](#5-architecture-visualization-concepts)
6. [Performance Patterns](#6-performance-patterns)

---

## 1. Graph Theory Fundamentals

### 1.1 Directed Acyclic Graphs (DAGs)

A **Directed Acyclic Graph (DAG)** is a directed graph with no cycles. This is the fundamental data structure for Coral's Graph-IR.

**Properties:**
- **Directed**: Edges have a source and target (arrows point one way)
- **Acyclic**: No path leads back to its starting node
- **Topologically Sortable**: Nodes can be ordered such that all edges point forward

**Why DAGs for diagrams:**
1. **Deterministic Layout**: Algorithms can assign layers without infinite loops
2. **Clear Dependencies**: Shows which components depend on which
3. **Prevents Confusion**: Cycles in architecture diagrams are usually errors

**Handling Real-World Cycles:**
Real systems sometimes have bidirectional dependencies (Service A calls B, B calls A). Coral handles this by:
1. Detecting cycles during validation
2. Marking one edge as a "back edge"
3. Rendering back edges differently (dashed, different color)

### 1.2 Graph Components

**Nodes (Vertices)**
```typescript
interface Node {
  id: string;      // Unique identifier
  type: string;    // Semantic type (service, database, etc.)
  label: string;   // Human-readable name
  metadata?: {};   // Arbitrary data
}
```

**Edges**
```typescript
interface Edge {
  source: string;  // Source node ID
  target: string;  // Target node ID
  relation: string; // Type of relationship
  label?: string;  // Edge label
}
```

**Ports**
Ports are specific attachment points on nodes where edges connect. Without ports, edges attach to the node center. With ports:
- Edges can be constrained to specific sides (North, South, East, West)
- Multiple edges can attach at distinct points
- Diagrams become more readable

```typescript
interface Port {
  id: string;
  side: 'north' | 'south' | 'east' | 'west';
}
```

### 1.3 Hierarchical Graphs

Coral supports **nested nodes** (nodes containing children):

```
┌─────────────────────────────────┐
│  Service A                      │
│  ┌───────────┐  ┌───────────┐  │
│  │ Module 1  │  │ Module 2  │  │
│  └───────────┘  └───────────┘  │
└─────────────────────────────────┘
```

This enables:
- **Drill-down**: Click a service to see its internal modules
- **Abstraction levels**: Hide complexity until needed
- **C4 Model support**: Context → Container → Component → Code

### 1.4 Graph Operations

**Topological Sort**
Orders nodes so all edges point forward. Algorithm (Kahn's):
```
1. Find all nodes with no incoming edges
2. Remove them and their outgoing edges
3. Repeat until graph is empty
4. If nodes remain, graph has a cycle
```
Complexity: O(V + E)

**Cycle Detection**
Uses DFS with three node states (White/Gray/Black):
```
WHITE: Unvisited
GRAY: Currently visiting (in recursion stack)
BLACK: Fully visited

If we encounter a GRAY node, we found a cycle.
```
Complexity: O(V + E)

**Adjacency List**
Efficient data structure for sparse graphs:
```typescript
// Map from node ID to list of connected node IDs
adjacency: Map<string, string[]>

// O(1) to find neighbors
// O(degree) to iterate neighbors
```

---

## 2. Diagramming Tool Landscape

### 2.1 Text-Based Tools

**Mermaid**
- Syntax: `A --> B`
- Pros: Renders in GitHub, GitLab, Notion
- Cons: Dagre layout engine (unmaintained), no port support
- Example:
  ```mermaid
  graph TD
    A[API] --> B[Database]
  ```

**Graphviz (DOT)**
- Syntax: `digraph { A -> B }`
- Pros: Powerful, many output formats
- Cons: Requires installation, dated aesthetics
- Example:
  ```dot
  digraph {
    API -> Database
  }
  ```

**PlantUML**
- Syntax: `@startuml ... @enduml`
- Pros: Comprehensive UML support
- Cons: Requires Java, verbose syntax

**D2**
- Syntax: Similar to Mermaid but cleaner
- Pros: Beautiful output, SQL diagram support
- Cons: Not as widely supported as Mermaid

### 2.2 GUI-Based Tools

**Lucidchart**
- Pros: Polished UI, real-time collaboration
- Cons: Proprietary, subscription-based

**draw.io (diagrams.net)**
- Pros: Free, open-source, many integrations
- Cons: Manual layout, XML storage format

**Excalidraw**
- Pros: Hand-drawn aesthetic, simple
- Cons: Not optimized for architecture diagrams

### 2.3 Comparison Matrix

| Feature | Mermaid | Graphviz | D2 | Lucidchart | Coral |
|---------|---------|----------|-----|------------|-------|
| Version Control | Yes | Yes | Yes | No | Yes |
| Pixel Control | No | No | No | Yes | Yes |
| Auto Layout | Yes | Yes | Yes | Manual | Yes |
| Port Constraints | No | Limited | Yes | Yes | Yes |
| Drill-down | No | No | No | Manual | Yes |
| AI-Friendly | Poor | Poor | Better | N/A | Yes |

### 2.4 The Layout Engine Evolution

**Dagre (2014-2018)**
- Default in Mermaid
- Unmaintained since 2018
- No port constraints
- Global direction only

**ELK (Active)**
- Eclipse Layout Kernel
- Full port constraint support
- Per-subgraph direction
- Crossing minimization strategies
- Used by: VS Code, JetBrains tools

**Why Coral uses ELK:**
1. Port constraints (edges attach to specific sides)
2. Hierarchical layout (nested nodes)
3. Configurable algorithms
4. Active maintenance

---

## 3. Layout Algorithms

### 3.1 Sugiyama Method (Layered Layout)

The standard algorithm for hierarchical graphs. ELK's "layered" algorithm implements this.

**Phase 1: Cycle Removal**
```
Goal: Make graph acyclic
Method: Detect back edges, temporarily reverse them
Result: DAG for subsequent phases
```

**Phase 2: Layer Assignment**
```
Goal: Assign each node to a horizontal layer
Method: Longest path from sources
Constraint: Edge targets must be in lower layers than sources
Complexity: O(V + E)
```

Example:
```
Layer 0: [A]           A
Layer 1: [B, C]       / \
Layer 2: [D]         B   C
                      \ /
                       D
```

**Phase 3: Crossing Minimization**
```
Goal: Reorder nodes within layers to minimize edge crossings
Method: Barycenter heuristic
  - For each node, compute average position of neighbors
  - Sort nodes by this average
  - Iterate until stable
Complexity: O(V² log V) per iteration
```

**Phase 4: Node Placement**
```
Goal: Assign X coordinates within layers
Method: Network simplex or simple median
Constraint: Respect minimum spacing
```

**Phase 5: Edge Routing**
```
Goal: Draw edges without crossing nodes
Method: Orthogonal routing (right angles)
Feature: Add bends to avoid obstacles
```

### 3.2 Force-Directed Layout

Alternative for non-hierarchical graphs (networks, social graphs).

**Concept:**
- Nodes repel each other (like charged particles)
- Edges attract connected nodes (like springs)
- Simulate until system reaches equilibrium

**Algorithm:**
```
Repeat until stable:
  For each node:
    repulsion = sum(k² / distance) for all other nodes
    attraction = sum(distance / k) for connected nodes
    velocity = (attraction - repulsion) * damping
    position += velocity
```

**Complexity:** O(V²) per iteration (can be optimized with quad-trees)

**When to use:**
- Social networks
- Arbitrary graphs without clear hierarchy
- When "organic" layout is acceptable

### 3.3 ELK Configuration Options

```javascript
{
  // Algorithm selection
  'elk.algorithm': 'layered' | 'mrtree' | 'force' | 'stress',

  // Flow direction
  'elk.direction': 'RIGHT' | 'DOWN' | 'LEFT' | 'UP',

  // Spacing
  'elk.spacing.nodeNode': '80',           // Between nodes
  'elk.spacing.edgeNode': '40',           // Edge to node

  // Port constraints
  'elk.portConstraints': 'FIXED_SIDE',    // Ports stay on their side

  // Crossing minimization
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',

  // Node placement within layer
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
}
```

---

## 4. Parsing and Language Design

### 4.1 Parsing Concepts

**Concrete Syntax Tree (CST)**
Includes every token from source:
- Keywords, operators, delimiters
- Whitespace, comments
- Exact source positions

```
service "API" { }
         │
         ▼
CST:
├── keyword: "service"
├── string: "\"API\""
├── delimiter: "{"
└── delimiter: "}"
```

**Abstract Syntax Tree (AST)**
Semantic structure only:
```
AST:
└── NodeDeclaration
    ├── type: "service"
    └── name: "API"
```

**Coral's Approach:**
1. Tree-sitter produces CST (preserves formatting)
2. Bridge transforms CST → Graph-IR (semantic)
3. Printer transforms Graph-IR → DSL (formatted text)

### 4.2 Tree-sitter

Tree-sitter is a parser generator that creates:
- Incremental parsers (fast updates on edit)
- Fault-tolerant parsers (handles syntax errors)
- WASM output (runs in browser)

**Incremental Parsing:**
```
Full parse:  O(N) where N = file size
Edit parse:  O(M) where M = edit size + context

Typical: 1ms for small edits vs 100ms full parse
```

**Error Recovery:**
When syntax is invalid, Tree-sitter:
1. Inserts ERROR nodes
2. Continues parsing rest of file
3. Allows partial results

```coral
service "A" {
  // Missing closing brace
service "B" { }

CST:
├── NodeDeclaration (service A)
│   └── ERROR (missing })
└── NodeDeclaration (service B) ✓
```

### 4.3 Grammar Design Principles

**Unambiguous Grammar:**
Every input has exactly one parse tree.

Bad (ambiguous):
```
expr: expr '+' expr
```

Good (unambiguous):
```
expr: term (('+' | '-') term)*
term: factor (('*' | '/') factor)*
```

**LL(1) Compatible:**
Parser can decide next action with one lookahead token.

Bad:
```
statement: 'if' '(' expr ')' statement
         | 'if' '(' expr ')' statement 'else' statement
```

Good:
```
statement: 'if' '(' expr ')' statement ('else' statement)?
```

**Coral Grammar Design:**
- C-like syntax (braces, arrows)
- Clear statement delimiters
- No ambiguous constructs
- Keywords prevent identifier collisions

### 4.4 Bidirectional Transformation

The challenge: keep Text ↔ IR synchronized.

**Forward (Parse):**
```
Text → CST → IR
```
Straightforward: extract semantic info from syntax.

**Reverse (Print):**
```
IR → Text
```
Challenge: reproduce user's formatting.

**Strategies:**

1. **Canonical Formatting** (simple)
   - Always produce same format
   - Loses user customization
   - Used by: Prettier, rustfmt

2. **Format Preservation** (complex)
   - Store original CST
   - Reuse unchanged subtrees
   - Only regenerate modified parts

3. **Coral's Approach:**
   - Default: Canonical formatting
   - Future: Preserve comments via CST metadata

---

## 5. Architecture Visualization Concepts

### 5.1 The C4 Model

A hierarchical approach to architecture diagrams:

**Level 1: System Context**
- Highest level view
- Shows system + external actors/systems
- "What does our system interact with?"

**Level 2: Container**
- Decompose system into deployable units
- Web app, API server, database, message queue
- "What are the major building blocks?"

**Level 3: Component**
- Internal structure of a container
- Modules, services, controllers
- "How is this container organized?"

**Level 4: Code**
- Class diagrams, function calls
- Rarely drawn (code is the source)

**Coral Mapping:**
```coral
// Level 1: System Context
actor "User"
external_api "Payment Provider"
group "Our System" { ... }

// Level 2: Container
service "Web App" { ... }
service "API Server" { ... }
database "PostgreSQL"

// Level 3: Component
module "Auth Controller"
module "Order Service"
```

### 5.2 Progressive Disclosure

Don't show everything at once. Let users drill down.

**Problem with flat diagrams:**
- 50+ nodes = unreadable
- Too much detail = noise
- Too little detail = useless

**Solution: Zoomable diagrams**
```
Click "Payment Service"
  → Expands to show internal modules
    → Click "Stripe Integration"
      → Shows functions/classes
```

**Coral Implementation:**
- Nested `children` in Graph-IR
- Visual editor shows collapsed/expanded state
- ELK handles nested layout

### 5.3 Diagram Types

**Flowchart**
- Sequential process flow
- Decision points (if/else)
- Start/end nodes

**Sequence Diagram**
- Temporal interactions
- "Who calls whom, in what order"
- Lifelines and messages

**Entity-Relationship (ER)**
- Database schema
- Tables and foreign keys
- Cardinality (1:1, 1:N, N:M)

**System Context**
- External view of system
- Actors and integrations
- High-level relationships

**Deployment Diagram**
- Infrastructure mapping
- VMs, containers, cloud services
- Network topology

**Coral's Focus:**
Initially targeting system context and container diagrams. Extensible for other types via custom node types.

---

## 6. Performance Patterns

### 6.1 Debouncing

Don't react to every keystroke. Wait for pause.

```typescript
const debouncedParse = debounce((text) => {
  parse(text).then(updateDiagram);
}, 500); // Wait 500ms after last keystroke

textEditor.onChange((text) => {
  debouncedParse(text);
});
```

**When to use:**
- Text input → parse
- Resize → re-layout
- Search → API call

### 6.2 Throttling

Limit frequency of expensive operations.

```typescript
const throttledLayout = throttle((graph) => {
  elkLayout(graph).then(updatePositions);
}, 100); // At most once per 100ms
```

**When to use:**
- Drag → update position
- Scroll → load more
- Animation frames

### 6.3 Memoization

Cache expensive computations.

```typescript
const layoutCache = new Map<string, LayoutResult>();

function memoizedLayout(graph: CoralGraph): LayoutResult {
  const key = hashGraph(graph);

  if (layoutCache.has(key)) {
    return layoutCache.get(key)!;
  }

  const result = elkLayout(graph);
  layoutCache.set(key, result);
  return result;
}
```

**When to use:**
- ELK layout (most expensive)
- CST → IR transformation
- Schema validation

### 6.4 Web Workers

Move heavy computation off main thread.

```typescript
// Main thread
const worker = new Worker('layout-worker.js');

worker.postMessage({ graph });
worker.onmessage = (e) => {
  const { layoutedNodes } = e.data;
  updateUI(layoutedNodes);
};

// Worker thread (layout-worker.js)
import ELK from 'elkjs';
const elk = new ELK();

self.onmessage = async (e) => {
  const result = await elk.layout(e.data.graph);
  self.postMessage({ layoutedNodes: result });
};
```

**When to use:**
- ELK layout (100-500ms)
- Large file parsing
- Image processing

### 6.5 Viewport Culling

Only render what's visible.

```
┌─────────────────────────────────────────┐
│                                         │
│   ┌─────────┐                           │
│   │ Visible │   ┌───────────────────────┤
│   │ Viewport│   │ Hidden nodes          │
│   └─────────┘   │ (not rendered)        │
│                 └───────────────────────┤
│                                         │
└─────────────────────────────────────────┘
```

React Flow handles this automatically:
- Tracks viewport bounds
- Only renders nodes in view
- Virtualizes large lists

### 6.6 Complexity Reference

| Operation | Algorithm | Complexity | Target Time |
|-----------|-----------|------------|-------------|
| Parse (incremental) | Tree-sitter | O(edit) | < 10ms |
| Parse (full) | Tree-sitter | O(N) | < 100ms |
| CST → IR | Visitor | O(nodes) | < 5ms |
| Validate DAG | DFS | O(V + E) | < 5ms |
| Layout (Sugiyama) | ELK | O(V²) | < 500ms |
| Render | React Flow | O(visible) | 16ms (60fps) |

---

## Glossary

| Term | Definition |
|------|------------|
| **AST** | Abstract Syntax Tree - semantic structure without formatting |
| **Back Edge** | Edge that creates a cycle; rendered specially |
| **Barycenter** | Method to minimize crossings by averaging neighbor positions |
| **C4 Model** | Context/Container/Component/Code hierarchy for architecture |
| **CST** | Concrete Syntax Tree - includes all tokens and whitespace |
| **DAG** | Directed Acyclic Graph - no cycles allowed |
| **Debounce** | Delay action until input stops |
| **ELK** | Eclipse Layout Kernel - graph layout library |
| **GLR** | Generalized LR parsing - handles ambiguous grammars |
| **IR** | Intermediate Representation - canonical data format |
| **Memoization** | Caching function results |
| **Port** | Specific edge attachment point on a node |
| **Sugiyama** | Standard layered graph layout algorithm |
| **Throttle** | Limit frequency of actions |
| **Topological Sort** | Order nodes so all edges point forward |
| **Viewport Culling** | Only render visible elements |
| **WASM** | WebAssembly - binary format for web |

---

## Further Reading

### Graph Theory
- "Introduction to Algorithms" (CLRS) - Chapter 22: Elementary Graph Algorithms
- [Graph Theory Tutorial](https://www.tutorialspoint.com/graph_theory/)

### Layout Algorithms
- Sugiyama et al., "Methods for Visual Understanding of Hierarchical System Structures" (1981)
- [ELK Algorithm Documentation](https://www.eclipse.org/elk/reference/algorithms.html)

### Parsing
- "Crafting Interpreters" by Robert Nystrom - Free online book
- [Tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)

### Architecture Visualization
- [C4 Model](https://c4model.com/) by Simon Brown
- "Documenting Software Architectures" by Clements et al.

### React Flow
- [React Flow Documentation](https://reactflow.dev/)
- [React Flow Examples](https://reactflow.dev/examples)
