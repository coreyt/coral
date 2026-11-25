# Format Specifications Tracking

This document tracks the versions and specifications of external diagram formats supported by Coral importers.

> **Last Updated**: 2026-01-31

---

## Mermaid

| Field | Value |
|-------|-------|
| **Spec Version** | 11.12.2 |
| **Spec Date** | November 2025 |
| **Reference** | https://mermaid.js.org/intro/syntax-reference.html |
| **Changelog** | https://github.com/mermaid-js/mermaid/blob/develop/CHANGELOG.md |
| **Releases** | https://github.com/mermaid-js/mermaid/releases |

### Supported Diagram Types

| Type | Status | Notes |
|------|--------|-------|
| Flowchart | ✅ Supported | `flowchart`, `graph` |
| Sequence | ✅ Supported | `sequenceDiagram` |
| Class | ✅ Supported | `classDiagram` |
| State | ✅ Supported | `stateDiagram`, `stateDiagram-v2` |
| ER | ✅ Supported | `erDiagram` |
| Timeline | ✅ Supported | `timeline` |
| Block | ✅ Supported | `block-beta` |
| Packet | ✅ Supported | `packet-beta` |
| Kanban | ✅ Supported | `kanban` |
| Architecture | ✅ Supported | `architecture-beta` |
| Gantt | ❌ Not supported | Project scheduling |
| Pie | ❌ Not supported | Proportional data |
| Quadrant | ❌ Not supported | 2x2 matrix |
| Requirement | ❌ Not supported | Requirements tracking |
| GitGraph | ❌ Not supported | Git history |
| C4 | ❌ Not supported | C4 architecture model |
| Mindmap | ❌ Not supported | Hierarchical concepts |
| ZenUML | ❌ Not supported | Sequence alternative |
| Sankey | ❌ Not supported | Flow diagrams |
| XY Chart | ❌ Not supported | Scatter/line plots |
| Radar | ❌ Not supported | Multi-dimensional |
| Treemap | ❌ Not supported | Hierarchical proportion |

### Flowchart Features

| Feature | Status | Syntax |
|---------|--------|--------|
| Basic nodes | ✅ | `A`, `A[text]` |
| Round edges | ✅ | `A(text)` |
| Stadium | ✅ | `A([text])` |
| Subroutine | ✅ | `A[[text]]` |
| Cylindrical (DB) | ✅ | `A[(text)]` |
| Circle | ✅ | `A((text))` |
| Diamond | ✅ | `A{text}` |
| Hexagon | ✅ | `A{{text}}` |
| Double circle | ✅ | `A(((text)))` |
| New shapes (v11.3+) | ⚠️ Partial | `A@{ shape: cloud }` |
| Arrow edge | ✅ | `-->` |
| Open link | ✅ | `---` |
| Dotted | ✅ | `-.->` |
| Thick | ✅ | `==>` |
| Circle edge | ✅ | `--o` |
| Cross edge | ✅ | `--x` |
| Invisible | ✅ | `~~~` |
| Edge labels | ✅ | `--\|text\|` |
| Edge IDs | ⚠️ Partial | `e1@A --> B` |
| Subgraphs | ✅ | `subgraph ... end` |
| Direction | ✅ | `TB`, `TD`, `BT`, `LR`, `RL` |
| Styling | ❌ | `style`, `classDef` |

---

## Graphviz DOT

| Field | Value |
|-------|-------|
| **Spec Version** | 14.1.2 |
| **Spec Date** | January 24, 2026 |
| **Reference** | https://graphviz.org/doc/info/lang.html |
| **Shapes Reference** | https://graphviz.org/doc/info/shapes.html |
| **Releases** | https://gitlab.com/graphviz/graphviz/-/releases |

### Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| digraph | ✅ Supported | Directed graphs |
| graph | ✅ Supported | Undirected graphs |
| subgraph | ✅ Supported | Including clusters |
| Node labels | ✅ Supported | `label` attribute |
| Edge labels | ✅ Supported | `label` attribute |
| Basic shapes | ✅ Supported | box, ellipse, circle, diamond |
| Database shapes | ✅ Supported | cylinder |
| Edge styles | ✅ Supported | dashed, dotted |
| rankdir | ✅ Supported | TB, BT, LR, RL |
| HTML labels | ❌ Not supported | `<table>` syntax |
| Record shapes | ❌ Not supported | Structured cells |
| Compass ports | ❌ Not supported | `node:ne` syntax |
| Advanced shapes | ❌ Not supported | box3d, component, etc. |
| Strict mode | ❌ Not supported | `strict digraph` |

---

## Update Checklist

When updating format support:

1. Check latest version at source repository
2. Review changelog for new syntax/features
3. Update "Spec Version" and "Spec Date" above
4. Add new features to the status tables
5. Implement and test new features
6. Update this document with implementation status

---

## Version History

| Date | Mermaid | Graphviz | Changes |
|------|---------|----------|---------|
| 2026-01-31 | 11.12.2 | 14.1.2 | Initial tracking, 10 Mermaid diagram types |
