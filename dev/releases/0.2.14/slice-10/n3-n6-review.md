# Slice 10: Detailed HITL Review for Proposals N3 and N6

Status: **approved by owner** (`2026-11-25`).

All `0.2.14` HITL source notation decisions are now locked:

- **N1, N2, N4, N5:** Approved (`2026-11-25`).
- **N3 (Architecture type words + `technology`/`description`):** Approved
  (`2026-11-25`), with explicit presentation direction: do **not** clone C4's
  visual render format. Keep default `lowfi` and `hifi` crisp monochrome
  black-and-white, introduce a peer render output style **`anemone`**
  (shorthand **`ane`**) for Coral's evolving expressive visual style, and
  introduce a new **`parrotfish`** rendering function for modeled visual outputs
  (style, colors, symbols, visual treatments — strictly separate from layout,
  flow, and routing).
- **N6a-B (CamelCase catalog relations per RR-5):** Approved (`2026-11-25`).
  Zero grammar change; map `[dataFlow]`, `[toolUse]`, `[streamFlow]` to catalog
  relations with diagnostic `coral.syntax.bracket.relation-hyphen` and warning
  `coral.relation.unknown`.
- **N6b-1 (Preserve `0.2.8` O2 dashed shafts):** Retained by default (no new
  `<-.->` operator).
- **N6c-1 (Unnamed UML attribute visibility `-`, `#`, `~`):** Approved
  (`2026-11-25`).

This focused packet re-evaluates **N3** and **N6** against Coral's settled
`0.2.8` / `0.2.10` language decisions and the six normative principles in
[language-design-and-evolution.md](../../../designs/language-design-and-evolution.md)
(Orthogonality, Composability, Unambiguous parsing, Expressiveness, Readability,
and Backward compatibility) so no prior design decision is lost.

---

## Proposal N3: `@diagram architecture` (C4-Grade System Design)

### Prior Settled Decisions Preserved

- The `0.2.8` edge-bracket contract freezes seven outer keys (`type`, `label`,
  `firstPort`, `secondPort`, `firstEnd`, `secondEnd`, `style`) and requires
  every accepted bracket key to own a clear portable GraphIR successor field.
- `as "..."` and `label: "..."` own the single primary display label and cannot
  coexist.
- `GraphNode` already defines a first-class `description?: string` field;
  `proposed-graphir-changes-for-coral.md` §1 defines first-class
  `GraphEdge.description?: string`.

### Split Decisions for N3

#### N3a — C4 Architecture Type Words (No Grammar Change)

Map `person`, `system`, `externalSystem`, `container`, `component`,
`database`, `queue`, `boundary`, `systemBoundary`, and `containerBoundary` via
`approvedTypeWords` (same mechanism approved in **N1**), while keeping `actor`
and `service` valid. Zero grammar change; 100% backward compatible.

#### N3b — Structured Metadata (`technology` and `description`)

Earlier draft N3 proposed both `technology:` and `protocol:` on edges, which
creates two overlapping keys for one concept (violating **Orthogonality**). Two
clean options:

| Option | Node brackets | Edge brackets | Portable GraphIR mapping | Tradeoff |
| --- | --- | --- | --- | --- |
| **N3b-1 (Recommended)** | `technology: "..."`, `description: "..."` | `technology: "..."`, `description: "..."` (no separate `protocol:` synonym) | `description` -> `GraphNode.description` / `GraphEdge.description`; `technology` -> portable `metadata.technology` (or additive `technology` field) | One orthogonal key (`technology:`) across nodes and edges; renders clean C4 3-tier cards (**Title**, *`[Technology]`*, description) and edge subtitles (*`[HTTPS / JSON]`*). |
| **N3b-2 (Nodes only)** | `technology: "..."`, `description: "..."` | Unchanged (7 settled `0.2.8` keys only; authors put protocol in `as "Calls API\n[HTTPS]"`) | Preserves the exact 7-key edge bracket freeze unchanged | Zero edge-bracket expansion, but edge protocol styling must either parse `\n[...]` or stay visually flat. |

### Representative Before / After (N3b-1)

```coral
// After (edition 0.2.14, N3a + N3b-1):
@diagram architecture
@coralVersion "0.2.14"
shopper person [description: "Buys products online"] as "Shopper"
stripe externalSystem [description: "Processes card payments"] as "Stripe"
platform systemBoundary as "E-Commerce System" {
  web container [technology: "React SPA", description: "Catalog UI"] as "Web Storefront"
  api container [technology: "Go / gRPC", description: "Order API"] as "Order Service"
  db database [technology: "PostgreSQL", description: "Orders ledger"] as "Orders DB"
}
shopper -> platform.web [technology: "HTTPS"] as "Browses catalog"
platform.web -> platform.api [technology: "JSON / HTTPS"] as "Submits order"
platform.api -> platform.db [data, technology: "SQL"] as "Reads/writes"
platform.api -> stripe [technology: "HTTPS"] as "Charges card"
```

**Canonical print & diagnostics:** Bracket order `symbol`, `variant`,
`technology`, `description`, `style`, `conformanceException` on nodes;
duplicate `technology`/`description` emits located duplicate errors; using them
under `@coralVersion "0.2.8"` or `"0.2.9"` emits a located edition diagnostic.

---

## Proposal N6: Grammar Symmetry & Friction Items

Breaking N6 into four independent sub-decisions honors prior `0.2.8` and
`RR-5` (`2026-11-15`) work:

### N6a — Hyphenated Catalog Relations (`data-flow`, `tool-use`, `stream-flow`)

The prior `RR-5` notation review (`2026-11-15`) explicitly evaluated allowing
`-` in bare relation words vs. generalizing Coral's existing `batchFlow`
camelCase mapping:

| Option | Author writes | Grammar & Tree-sitter impact | Prior review status |
| --- | --- | --- | --- |
| **N6a-B (Recommended — matches RR-5)** | `[dataFlow]`, `[toolUse]`, `[streamFlow]` (matching existing `[batchFlow]`) | **Zero grammar change.** Resolves camelCase words to hyphenated catalog relations; `[data-flow]` emits a helpful diagnostic (`coral.syntax.bracket.relation-hyphen`: "write `data-flow` as `dataFlow`"). | Recommended in `RR-5` (`2026-11-15`); keeps `-` unambiguously reserved for connector shafts and diagram-type keys. |
| **N6a-A (Allow hyphens)** | `[data-flow]`, `[tool-use]`, `[stream-flow]` | Changes `bare_type` / `identifier` grammar, printer, and `tree-sitter-coral`. | Rejected as higher-risk in `RR-5`; could still be chosen if you prefer literal hyphenated spellings. |

*(Optional sub-question from RR-5: also emit non-blocking warning
`coral.relation.unknown` when a bracket relation word is not in the active
notation's catalog, e.g. `[trainng]`?)*

### N6b — Dashed Reverse & Bidirectional Connectors

Settled `0.2.8` decision **O2** (`2026-10-12`) fixed exact rules for dashed
connectors: max 6 shaft positions, single `.` in the **second shaft position
only** (`-.-` .. `-.----`), and fixed written-endpoint ownership (L4).

| Option | Author writes for dashed bidirectional | Tradeoff |
| --- | --- | --- |
| **N6b-1 (Recommended — keep O2 unchanged)** | `a <--> b [style: dashed]` | Preserves the settled `0.2.8` connector table untouched; zero new operator punctuation to memorize. |
| **N6b-2 (Extend reverse connector)** | `a <-.-> b` and `a <-.- b` (strictly honoring 2nd-shaft-position `.` and 6-position max) | Symmetric with `a -.-> b`, but adds another operator family and requires conflict checks with `[style: dashed]`. |

### N6c — Unnamed UML Class Attribute Visibility (`-`, `#`, `~`)

In `grammar-028.ebnf`, unnamed operations allow `+`, `-`, `#`, `~` (line 292),
while unnamed attributes only allow `+` (line 287).

| Option | Author writes | Tradeoff |
| --- | --- | --- |
| **N6c-1 (Recommended — match operations)** | `- id: UUID`, `# state: State`, `~ internal: Int`, `+ name: String` inside `attributes { ... }` | Eliminates a surprising one-line asymmetry; unambiguous because `-` only appears at statement start inside an `attributes { ... }` block (never a connector). |
| **N6c-2 (Keep `+` only)** | Named form `orderId = private attribute id: UUID` for non-public attributes | Keeps `grammar-028.ebnf` line 287 unchanged. |

### N6d — Concise Default Edges (`a -> b`)

**No syntax change needed.** Settled `0.2.8` decision **L3** already makes
`a -> b` (no edge ID, no `[type]`) valid in every profile. We simply use the
concise form in new `0.2.14` examples and docs when no route/constraint needs a
durable edge ID, while keeping `e1 = a -> b [type]` fully supported.

---

## Quick Decision Summary for Owner

Please reply with your choices for the 4 open sub-items:

1. **N3a (C4 type words):** Approve / Decline? *(Recommended: Approve)*
2. **N3b (Metadata):** **N3b-1** (`technology` + `description` on nodes & edges,
   no duplicate `protocol` key) or **N3b-2** (nodes only)?
3. **N6a (Hyphenated relations):** **N6a-B** (`[dataFlow]` / `[toolUse]` /
   `[streamFlow]` per RR-5) or **N6a-A** (allow `-`)? Include
   `coral.relation.unknown` warning?
4. **N6b & N6c:** **N6b-1** (keep O2, use `[style: dashed]`) or **N6b-2** (add
   `<-.->`)? **N6c-1** (allow `-`/`#`/`~` unnamed attributes) or **N6c-2** (keep
   `+` only)?
