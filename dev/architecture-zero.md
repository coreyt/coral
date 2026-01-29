Here are the foundational files for the Coral project, starting with the root documentation and moving into the core definition package.

### 1. Root `README.md`

Place this in `coral-project/README.md`. It serves as the architectural manifesto for the team.

```markdown
# Coral

**Coral** is a symbiotic diagramming toolchain designed to bridge the gap between "Diagram-as-Code" and "Diagram-as-Art."

Unlike traditional tools that force you to choose between a text editor (Mermaid, Graphviz) and a GUI (Lucidchart), Coral treats both as equal interfaces for the same underlying data structure.

## 🏛️ Architecture: The 4 Pillars

Coral is built on a "Symbiotic Loop" architecture split across four distinct components:

1.  **Graph-IR (`@coral/ir`)**: The Source of Truth. A strict, JSON-based Directed Acyclic Graph (DAG) specification that holds the semantic reality of the system (Nodes, Edges, Metadata).
2.  **Coral DSL (`@coral/language`)**: The Human Interface. A concise, C-like text language optimized for typing speed and readability.
3.  **The Bridge (`@coral/language`)**: The Translator. Using **Tree-sitter**, it projects Coral DSL into Graph-IR (parsing) and Graph-IR back into Coral DSL (printing).
4.  **Coral Viz (`@coral/viz`)**: The Graphical Interface. An interactive React-based editor powered by **ELK** (layout) and **React Flow** (rendering) that manipulates the Graph-IR directly.

## 📂 Project Structure

This is a Monorepo managed via **pnpm workspaces**.

```text
coral-project/
├── apps/
│   └── playground/       # The Web App (The glue that binds DSL + Viz)
│
└── packages/
    ├── ir/               # Pure TS Interfaces & JSON Schemas (No dependencies)
    ├── language/         # Tree-sitter Grammar, Parser, and Bridge Logic
    └── viz/              # React UI Component Library (renders IR)

```

## 🚀 Getting Started

### Prerequisites

* Node.js v20+
* pnpm (`npm install -g pnpm`)

### Installation

```bash
pnpm install

```

### Building the core

```bash
pnpm build --filter "./packages/**"

```

## 🤝 Contribution Guidelines

* **Logic belongs in `packages/**`: If it's a core feature, it goes in a package. The `apps/` folder is strictly for wiring components together.
* **The IR is King**: The Visual Editor and the Text DSL are just plugins. Neither is allowed to store state that cannot be represented in the `Graph-IR`.

```

---

### 2. `packages/ir/package.json`
Place this in `coral-project/packages/ir/package.json`.

This package is designed to be lightweight and "dependency-free" so it can be imported by both the heavyweight UI and the lightweight parser without causing bloat.

```json
{
  "name": "@coral/ir",
  "version": "0.1.0",
  "description": "The Graph Intermediate Representation (IR) specification for Coral.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "lint": "eslint src --ext .ts",
    "test": "jest",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "keywords": [
    "coral",
    "graph",
    "ir",
    "dag",
    "schema"
  ],
  "author": "Coral Maintainers",
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.0",
    "eslint": "^8.55.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1"
  },
  "dependencies": {
    "zod": "^3.22.4" 
  }
}

```

*Note on Dependencies:* I added **zod** as a runtime dependency. While `types` are enough for TypeScript, you will need a runtime validator (like Zod) to verify that the JSON coming from the `language` package or the `viz` editor is actually valid Graph-IR before trying to process it.

### Recommended Next Step

Would you like me to write the **`src/types.ts`** for `@coral/ir`? This would be the first actual code, defining the `CoralNode`, `CoralEdge`, and `CoralGraph` interfaces.
