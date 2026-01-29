# Coral

**Coral** is a symbiotic diagramming toolchain designed to bridge the gap between "Diagram-as-Code" and "Diagram-as-Art." Otherwise known as "mermaid for me."

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
