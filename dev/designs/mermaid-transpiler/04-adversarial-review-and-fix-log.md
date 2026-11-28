# Adversarial Review & FIX-n Resolution Log

This ledger tracks every independent adversarial review pass against the Coral
`release/0.2.16` codebase and the corresponding FIX-n revisions to:
- [01-mermaid-coral-taxonomy-and-nomenclature.md](./01-mermaid-coral-taxonomy-and-nomenclature.md)
- [02-transpiler-architecture-design.md](./02-transpiler-architecture-design.md)
- [03-personas-needs-requirements-and-specs.md](./03-personas-needs-requirements-and-specs.md)

---

## Pass 1 — Independent Adversarial Review Summary

- **Reviewer:** Independent Research/Compiler Subagent
  (`cf262b59-22e8-42e2-a9f4-6942baa8de73`)
- **Codebase Verified Against:**
  `/home/coreyt/projects/coral/.worktrees/release-0.2.16` (`origin/main`, Coral
  `0.2.15`/`0.2.16`, Edition `0.2.14`)
- **Pass 1 Verdict:** **BLOCKED** — 7 CRITICAL, 10 MAJOR, 6 MINOR findings (23
  total).

### FIX-1 Resolution Matrix (23/23 Addressed)

| ID | Severity | Pass 1 Finding (Codebase-Proven) | FIX-1 Resolution |
| --- | :---: | --- | --- |
| **C-01** | CRITICAL | `document028.ts:30-47` returns `graph: undefined` on successor-only constructs (`layout`, edge `style`, sequence `note`/`activation`/`region`/`participants`), causing Stage 4A/4B to fail closed on SPEC-03/05/06. | Rewrote Stage 4A (`02` §4, `03` TR-09) to check `header.header !== undefined`, `header.diagnostics === []`, `syntax.diagnostics === []` (never asserting GraphIR 3 `doc.graph`), and Stage 4B to verify via `projectInstalledSourceToSuccessor028` → `verifyPortableSuccessorSource028` → `validateGraphIRSuccessorWithCatalog` → display seam (`successorSourceDisplay028` for `uml-sequence`, `successorSourceDisplayWithSemanticPorts028` for non-sequence) + `assertRenderableInterpretation028(..., installedCatalogSnapshotForEdition(targetNotation, targetEdition))` *(refined in FIX-2 per `P2-C-01`)*. |
| **C-02** | CRITICAL | `successorSourceDisplay028.ts:94-102` throws `SuccessorDisplayCapabilityError028` on edge `strokeColor`/`strokeWeight`/`motion`, blanking Editor canvas and failing `coral_render`. | Added `edgeStyleMode: 'visual-safe' \| 'portable'` (default `'visual-safe'`) across `01` §5.1.3, `02` §3/§4/§6, `03` TR-02/SPEC-05: degrades thick/colored/animated edges with explicit warnings by default so `visualRenderable === true`, while `'portable'` emits portable Coral styles with honest `visualRenderable: false`. |
| **C-03** | CRITICAL | `candidate028.ts:1558` `KNOWN_RELATIONS_0214['uml-class']` omits `'inheritance'`, causing `SPEC-08` `[inheritance]` to emit `coral.relation.unknown` and fail `projectInstalledSourceToSuccessor028`. | Documented the 1-line prerequisite bugfix adding `'inheritance'` to `KNOWN_RELATIONS_0214['uml-class']` (aligning with `uml.ts:15` and `umlClass028.ts:14`) in `01` §5.3, `02` §2/§8/§9, and `03` TR-04/SPEC-08. |
| **C-04** | CRITICAL | `A -- B [firstEnd: circle, secondEnd: circle]` fails with `coral.syntax.connector.end-conflict` (`connector028.ts:91-93`, `candidate028.ts:1037`). | Fixed to `A -o B [firstEnd: circle]` (`01` §5.1.3, `03` SPEC-05) and added Stage 3 Connector End Shorthand Invariant (`02` §4 Stage 3 #4). |
| **C-05** | CRITICAL | Mermaid v11.3+ edge ID syntax was written `e1@A --> B` instead of actual `A e1@--> B`. | Fixed across `01` §5.1.3, `02` §4 Stage 1, `03` TR-02/SPEC-05, including `e1@{ animation: fast\|slow }` implying `animate: true`. |
| **C-06** | CRITICAL | `@coralVersion "0.2.14"` and `[description: ...]` break `characterState028.ts:45-57`, and `targetEdition: '0.2.14'` contradicted omitting `@coralVersion` on `uml-state`. | Typed `targetEdition: '0.2.8' \| '0.2.14' \| null` (`'0.2.8'` for Tier 1 `uml-state`, omitting `@coralVersion` and `[description]`), added `characterRenderable?: boolean` + `coral.uml-state.character-bounds.exceeded` (`info`) across `01` §5.5, `02` §3/§4/§6, `03` TR-06/SPEC-12. |
| **C-07** | CRITICAL | Coral `candidate028.ts:764-783` rejects `#RGB` 3-digit hex, CSS named colors outside 14 names, and `rgb(...)`. | Added deterministic CSS Color Normalizer (`lower/colors.ts`) across `01` §5.0/§5.1.5, `02` §4 Stage 2B, `03` TR-07/SPEC-05 (`#f9f` → `#ff99ff`, `red`/CSS names/`rgb()` → `#RRGGBB`, `stroke-dasharray: 0\|none` ignored). |
| **M-01** | MAJOR | Stray editorial self-talk and abandoned fixture left in `SPEC-06` + `api--)user` info diagnostic mismatch. | Cleaned `SPEC-06` (`03`) to one crisp fixture using `api-->>user` with `diagnostics.length === 0`. |
| **M-02** | MAJOR | `packages/language/src/detect.ts` misses newer Mermaid headers (`radar-beta`, `treemap`, `venn-beta`, `ishikawa`, `wardley-beta`, bare `graph`, multiline `%%{...}%%`). | Added `detect.ts` upgrade explicitly to `02` §2/§4/§8/§9 and `03` TR-01/SPEC-01. |
| **M-03** | MAJOR | `convert.test.ts` expects `msg_1`, `msg_2`, `candidateVersion: '4.0.0'`, `nodeCount`, `edgeCount`. | Standardized sequence message IDs on `msg_N`, preserved backward-compatible `structuredContent` fields in `02` §6.1 & `03` TR-10/SPEC-06/SPEC-17. |
| **M-04** | MAJOR | Sequence shared identity collisions (`msg_N`/`box_N` vs participant), `create` pre-declaration loss of alias/`actor`, `[create]` root-only, `destroy` receiver-only, and `activation` cannot wrap `[destroy]`. | Fixed all 5 sequence invariants in `01` §5.2.1, `02` §4 Stage 2D, `03` TR-03/SPEC-07. |
| **M-05** | MAJOR | Sequence activation lowering missed pre-message `activate P`, non-message sibling items, tied spans, and empty fragment operands. | Redesigned Stage 2D around container-scoped sibling-item spans with pre-message anchoring, open-order tie-breaking, and empty-operand lowering (`02` §4 Stage 2D). |
| **M-06** | MAJOR | `02:206` omitted dot-qualification for intra-subgraph edges even though Stage 3 emits edges at root scope (`coral.reference.source.unresolved`). | Standardized Stage 2C (`02`) to ALWAYS dot-qualify grouped endpoints at root scope. |
| **M-07** | MAJOR | `idMap` key scope/inclusion ambiguity, missing collision loop, and reserved-word list drift (24 vs 27). | Standardized `idMap` keyed by canonical qualified Coral ID for all declared nodes/groups/participants, explicit `k = 2, 3, ...` loop, and single 27-word canonical list (`01` §5.0, `02` §3/§4 Stage 2A, `03` TR-07/SPEC-14). |
| **M-08** | MAJOR | Unresolved TODO & contradiction on `classDiagram` `namespace` (`uml-class` DOES support `group` natively!). | Adopted native `group` for `namespace` cleanly across `01` §5.3.1, `02` §4 Stage 2E, `03` TR-04/SPEC-08. |
| **M-09** | MAJOR | Missing `@diagram architecture` shape mapping table + wrong omitted direction for `flowchartTarget: 'block'` (defaults to `RIGHT`). | Added full `architecture` column in `01` §5.1.2, explicit `layout [direction: DOWN]` rule for `block` in `01` §5.1.1 & `02` §4 Stage 2C, and updated `SPEC-04`. |
| **M-10** | MAJOR | Missed Mermaid v11/v12 edge cases across all 5 diagram types (`<-.->`, bare subgraph, multiline markdown, multi-word sequence participants, stick arrows, `wrap:`, class `<..>`/symmetric/backticks, real ER English aliases `one or zero`/`one or many`/`zero or many`/`many`, duplicate ER columns, state multiple `[*]`/self-transitions). | Added all missing constructs and rules across `01` §5.1–§5.5, `02` §4 Stage 1–2, and `03` TR-02..TR-06 & SPEC-11/12. |
| **m-01** | MINOR | `formatDocument028` requires `(source, runtime)`. | Updated signatures in `02` §4 Stage 3 & `03` SPEC-16. |
| **m-02** | MINOR | Dual/redundant UML `composition`/`aggregation` spellings. | Standardized on `Whole -- Part [composition, firstEnd: filledDiamond]` and `Whole -- Part [aggregation, firstEnd: diamond]` (`01` §5.3.3, `02` §4 Stage 2E, `03` SPEC-08). |
| **m-03** | MINOR | Literal `\t` & control char contradiction (`candidate028.ts` rejects literal `\t` AND `\t` escape). | Standardized across `01` §5.0, `02` §4 Stage 3/§7, `03` TR-07/SPEC-14: normalize `\t` → `' '` (`info`) and U+2028/U+2029 → `\n`, reject other prohibited controls/non-XML-1.0 scalars. |
| **m-04** | MINOR | `SPEC-02` frontmatter line arithmetic off by 1. | Fixed `SPEC-02` to explicit 4-line frontmatter matching exact lines 2, 5, and 8. |
| **m-05** | MINOR | `SPEC-10` omitted asserting `infoCount === 1` (`mermaid.id.normalized`). | Added explicit `infoCount === 1` assertion in `SPEC-10`. |
| **m-06** | MINOR | Multi-entry flowchart `[variant: "start"]` violates `flowchart.ts:159` `max: 1`. | Restricted `[variant: "start"]` inference to a **unique** 0-in-degree stadium node (`01` §5.1.2, `02` §4 Stage 2C). |

---

## Pass 2 — Verification & Fresh-Attack Adversarial Review Summary

- **Reviewer:** Independent Research/Compiler Subagent
  (`cf262b59-22e8-42e2-a9f4-6942baa8de73`)
- **Pass 1 Closure Verified:** 22/23 fully closed; all newly introduced FIX-1
  Coral `0.2.14` syntax constructs (`A <-> B [style: "dashed"]`, `A -.-o B
  [firstEnd: circle]`, `A process [style: "fill: #ff99ff; stroke: #333333;
  thick; dashed"]`, `architecture` `0.2.14` shapes, `Banking group { ... }`,
  `Portfolio -- Banking.Account [composition, firstEnd: filledDiamond]`,
  `edgeStyleMode: 'portable'`) verified CLEAN line-by-line against
  `release/0.2.16`.
- **Pass 2 Verdict:** **BLOCKED — FIX-2 REQUIRED** — 1 CRITICAL, 0 MAJOR, 2
  MINOR findings (3 total).

### FIX-2 Resolution Matrix (3/3 Addressed)

| ID | Severity | Pass 2 Finding (Codebase-Proven) | FIX-2 Resolution |
| --- | :---: | --- | --- |
| **P2-C-01** | CRITICAL | `successorSourceDisplayWithSemanticPorts028` throws `Error` on `source.interaction` (`successorSourceDisplay028.ts:104-109`), which would fail closed on every `uml-sequence` diagram (including SPEC-06); additionally, `assertRenderableInterpretation028` must receive `installedCatalogSnapshotForEdition(targetNotation, targetEdition)` so `0.2.14` symbols do not fall back to `0.2.8`. | Updated Stage 4B (`02` §4, `03` TR-09, `03` SPEC-06, `04` C-01) to branch cleanly (`successorSourceDisplay028` when `projected.graph.interaction` is present, `successorSourceDisplayWithSemanticPorts028` otherwise) and pass `installedCatalogSnapshotForEdition(targetNotation, targetEdition)` explicitly as the 4th argument to `assertRenderableInterpretation028`. |
| **P2-m-01** | MINOR | `characterState028.ts:48-100` enforces exactly 1 `initial`, exactly 1 `final` (not `>=1`), 1–8 simple states (`nodes.length` 3..10), 2–20 transitions; Stage 4B should call `stateCharacterUsesChain028(display)` directly. | Fixed stated bounds in `01` §5.5 and `02` §4 Stage 4B and delegated directly to `stateCharacterUsesChain028(display)` (`packages/render/src/characterState028.ts:139`). |
| **P2-m-02** | MINOR | `SPEC-02` said "9-line" for an 8-line input and left `config:` empty. | Fixed `SPEC-02` (`03`) to an unambiguous 8-line fixture (`config: { theme: dark }` on line 3) asserting lines 2, 3, 5, and 8. |

---

## Pass 3 — Final Verification Sign-Off

- **Reviewer:** Independent Research/Compiler Subagent
  (`cf262b59-22e8-42e2-a9f4-6942baa8de73`)
- **Verdict:** **APPROVED** (**0 CRITICAL, 0 MAJOR, 0 MINOR**)
- **Verified Closures:**
  - `P2-C-01` [CRITICAL]: Stage 4B branches on `projected.graph.interaction`
    (`successorSourceDisplay028` for `uml-sequence` vs
    `successorSourceDisplayWithSemanticPorts028` for all other notations) and
    explicitly passes `installedCatalogSnapshotForEdition(targetNotation,
    targetEdition)` to `assertRenderableInterpretation028`.
  - `P2-m-01` [MINOR]: `characterState028.ts` exact bounds verified verbatim and
    delegated to `stateCharacterUsesChain028(display)`.
  - `P2-m-02` [MINOR]: `SPEC-02` updated to an exact, unambiguous 8-line fixture
    asserting lines 2, 3, 5, and 8.
- **Total Findings Closed:** **26 / 26** across Pass 1 (7 Critical, 10 Major, 6
  Minor) and Pass 2 (1 Critical, 0 Major, 2 Minor) through **FIX-1** and
  **FIX-2**. Ready for implementation.
