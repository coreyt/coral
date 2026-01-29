# Coral

**Coral** is a symbiotic diagramming toolchain that bridges the gap between "Diagram-as-Code" and "Diagram-as-Art."

Unlike traditional tools that force you to choose between a text editor (Mermaid, Graphviz) or a GUI (Lucidchart, draw.io), Coral treats both as **equal interfaces** to the same underlying data structure. Edit the text, see the diagram update. Drag a node, see the code change.

## Why Coral?

| Tool Type | Strengths | Weaknesses |
|-----------|-----------|------------|
| **Text-based** (Mermaid, Graphviz) | Version control, speed, reproducible | Layout instability, no pixel control |
| **GUI-based** (Lucidchart, draw.io) | Precise positioning, aesthetics | Binary files, manual effort, documentation drift |
| **Coral** | Both simultaneously | — |

### The Problem Coral Solves

1. **Layout Roulette**: Text-based tools use algorithms that rearrange your entire diagram when you add one node
2. **Documentation Drift**: GUI diagrams become stale the moment code changes
3. **False Choice**: You shouldn't have to choose between version control and visual control
4. **AI Brittleness**: LLMs generate broken Mermaid syntax because they can't "see" the spatial layout

### Coral's Approach

- **Single Source of Truth**: A Graph Intermediate Representation (IR) that both text and visual editors read/write
- **Constraint-Based Layout**: ELK layout engine with port constraints, not "best guess" algorithms
- **Bidirectional Sync**: Changes in either interface propagate to the other instantly
- **AI-Native**: JSON-based IR that LLMs can generate reliably

## Architecture Overview

Coral follows a **Symbiotic Loop** architecture with four pillars:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Coral DSL (Text)              Coral Viz (Visual)              │
│        │                              │                         │
│        ▼                              ▼                         │
│   ┌─────────┐                   ┌──────────┐                    │
│   │ Parser  │                   │  Editor  │                    │
│   │(Tree-   │                   │ (React   │                    │
│   │ sitter) │                   │  Flow)   │                    │
│   └────┬────┘                   └────┬─────┘                    │
│        │                              │                         │
│        ▼                              ▼                         │
│   ┌─────────────────────────────────────────┐                   │
│   │           Graph-IR (JSON DAG)           │◄── Source of Truth│
│   │         Nodes, Edges, Metadata          │                   │
│   └─────────────────────────────────────────┘                   │
│        │                              │                         │
│        ▼                              ▼                         │
│   ┌─────────┐                   ┌──────────┐                    │
│   │ Printer │                   │  Layout  │                    │
│   │         │                   │  (ELK)   │                    │
│   └────┬────┘                   └────┬─────┘                    │
│        │                              │                         │
│        ▼                              ▼                         │
│   Coral DSL (Text)              Coral Viz (Visual)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Package | Purpose |
|-----------|---------|---------|
| **Graph-IR** | `@coral/ir` | JSON-based DAG specification (nodes, edges, hierarchy, metadata) |
| **Coral DSL** | `@coral/language` | Human-readable text language for typing diagrams |
| **The Bridge** | `@coral/language` | Tree-sitter parser + printer for DSL ↔ IR translation |
| **Coral Viz** | `@coral/viz` | Interactive visual editor (ELK layout + React Flow rendering) |

## Project Structure

This is a monorepo managed with **pnpm workspaces**.

```
coral/
├── apps/
│   └── playground/          # Web application (Next.js/Vite)
│
├── packages/
│   ├── ir/                  # Graph-IR types & validation (Zod)
│   ├── language/            # Tree-sitter grammar + Bridge
│   └── viz/                 # React Flow + ELK components
│
├── dev/                     # Development documentation
│   ├── ARCHITECTURE.md      # Detailed architecture specification
│   └── DOMAIN.md            # Domain knowledge reference
│
├── pnpm-workspace.yaml
└── package.json
```

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Parsing** | Tree-sitter | Incremental, fault-tolerant, IDE-grade parsing |
| **Layout** | ELK (elkjs) | Constraint-based layout with port support |
| **Rendering** | React Flow | Interactive node editor with zoom/pan/drag |
| **State** | Zustand | Lightweight, subscribable state management |
| **Validation** | Zod | Runtime schema validation for Graph-IR |
| **Build** | pnpm workspaces | Efficient monorepo dependency management |

## Getting Started

### Prerequisites

- Node.js v20+
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/coral.git
cd coral

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Start the playground app
pnpm dev --filter playground

# Run tests
pnpm test

# Lint all packages
pnpm lint
```

## Documentation

- **[Architecture](dev/ARCHITECTURE.md)** — Detailed system design, components, and integration patterns
- **[Domain Knowledge](dev/DOMAIN.md)** — Graph theory, diagramming concepts, and algorithmic foundations

## Design Principles

1. **IR is King** — The Graph-IR is the single source of truth. Text and visual editors are just views.
2. **Isomorphic Mapping** — Every DSL construct maps to exactly one IR node type (and vice versa).
3. **No Hidden State** — The visual editor cannot create state that the DSL cannot express.
4. **Preserve Intent** — Round-tripping (Text → IR → Text) should preserve formatting where possible.
5. **Fail Gracefully** — Syntax errors show inline; the rest of the diagram still renders.

## Contributing

- **Logic belongs in `packages/`** — Core features go in packages. The `apps/` folder only wires things together.
- **The IR is King** — Neither the visual editor nor the DSL may store state outside the Graph-IR.
- **Test the loop** — Any change should be tested through the full Text → IR → Visual → IR → Text cycle.

## License

MIT
