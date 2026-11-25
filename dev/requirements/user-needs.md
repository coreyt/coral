# Coral Tier 1: User Needs and Validation Acceptance Criteria

Tier 1 defines **why** Coral exists for real users and **how we validate** that
we built the right thing. Every User Need (`UN`) specifies a persona, operating
context, solution-neutral outcome, and Validation Acceptance Criteria (`VAC`).

**Core rules:**

1. Automated unit tests verify Tier 2 requirements (`VerAC`), never Tier 1
   validation (`VAC`). Each `VAC` requires recorded human or representative
   task evidence on the release candidate and never embeds runtime chunk or
   network interception checks (those belong in Tier 2 `VerAC`s).
2. Unless stated otherwise, the **Workaround Budget is 0**: switching notation,
   shortening realistic labels, flipping direction to avoid errors, or manually
   repairing generated routes disqualifies a `VAC` pass.
3. **Catch-Up Release policy for P4:** `UN-12` (Persona P4) is tracked
   continuously and validated during dedicated accessibility catch-up releases.
   P4 needs, derived `REQ-C3`, and `VAC-12.*` do **not** block regular feature
   releases.
4. **Field-Failure Regression Loop:** Whenever a real author hits a workaround
   in practice (such as the 2026-11-15 `coralsmol` pipeline failure), first
   identify which `VAC` failed to catch it and strengthen Tier 1 before writing
   new Tier 2 requirements.
5. **Target-Scoped `VAC` Policy:** `VAC`s (or sub-clauses) explicitly tagged
   **Target** on Primary personas (such as `VAC-06.2` and the `P5 Target`
   clause of `VAC-06.1`) track planned capabilities and do **not** block
   releases prior to their target slice; while unshipped, public capability
   docs MUST disclose their status honestly (`REQ-H1`).

## UN-01: Fast First Diagram and Honest Capability Discovery

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** A first-time author needs to understand what Coral can and cannot
  do, open a working example that looks like its domain, and produce a modified
  diagram in minutes without creating an account or hitting surprise dead ends.
- **Decomposed Spec:**
  [supported-diagram-types.md](specs/supported-diagram-types.md)
- **Validation Acceptance Criteria:**
  - **VAC-01.1 (Zero-Account First Session):** A first-time author opens the
    hosted web app in desktop Chrome, opens a bundled example from any
    supported visual notation, modifies at least two nodes and one connection,
    and exports SVG within 5 minutes without external docs or an account.
    *Pass bar: completed within 5 minutes with valid exported SVG. Workaround
    budget: 0.*
  - **VAC-01.2 (Capability Honesty):** After inspecting Help, the capability
    matrix, and notation pickers, the author accurately answers: (a) whether
    Coral works offline (no), (b) where documents are stored (locally), (c)
    which notations are unsupported or disabled, and (d) which browsers and
    platforms carry support claims. *Pass bar: 4/4 accurate. Workaround
    budget: 0.*

## UN-02: Frictionless Text-First Authoring and Lossless Round-Tripping

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** An author who writes and reviews diagrams as text needs predictable
  DSL authoring where Coral preserves exact source text, comments, and
  identifiers and never corrupts drafts on syntax errors or silent rewrites.
- **Validation Acceptance Criteria:**
  - **VAC-02.1 (Draft Survival Under Broken Edits):** While editing a 15+ node
    diagram containing comments, custom IDs, and explicit formatting, the
    author introduces a syntax error, saves the file, closes and reopens it,
    fixes the error from the in-app diagnostic alone, and confirms zero
    comments, unrelated lines, or IDs were lost. *Pass bar: 0 lost comments,
    unrelated lines, or IDs. Workaround budget: 0.*
  - **VAC-02.2 (Actionable Error Recovery):** Given 5 realistic authoring
    mistakes (invalid relation spelling, dangling edge target, malformed group,
    invalid coordinate, unknown symbol), a representative author locates and
    fixes each from Coral's error message and highlight alone without guessing
    which node or connector failed. *Pass bar: 5/5 fixed on first attempt.
    Workaround budget: 0.*

## UN-03: Direct Visual Editing That Preserves Authored Intent

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** An author refining a diagram visually needs drag, connect,
  waypoint, and inspector edits to feel responsive, stay faithful to the
  underlying Coral text, and undo/redo cleanly without visual surprises.
- **Validation Acceptance Criteria:**
  - **VAC-03.1 (Mixed Text and Canvas Session):** An author alternates between
    text edits and canvas actions (moving/pinning nodes, Shift-constrained
    drag, creating valid connections, testing rejection of invalid ones,
    editing waypoints, modifying properties in the inspector, running Reflow,
    and stepping Undo/Redo across mixed edits). Authored geometry survives
    save/reopen and Undo restores exact text and canvas state. *Pass bar: 100%
    of mixed actions match source text, survive reopen, and reverse cleanly.
    Workaround budget: 0.*
  - **VAC-03.2 (Perceived Responsiveness):** On a realistic 50–100 node grouped
    diagram in desktop Chrome, the author performs 5 node drags, 3 waypoint
    adjustments, and 3 zoom/pan cycles. *Pass bar: all 11 gestures complete
    smoothly with 0 unintended selection drops, 0 stale layout jumps, and no
    author-reported stutter. Workaround budget: 0.*

## UN-04: Scannable, Publication-Ready Visual Legibility and Layout Reliability

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** An author needs to label diagram elements with realistic,
  descriptive text across any supported notation, grouping structure, and flow
  direction and get a compact, scannable, collision-free diagram whose symbols
  stay recognizable and whose connectors stay clear on canvas and export.
- **Decomposed Specs:**
  [independent-symbol-caption.md](specs/independent-symbol-caption.md),
  [diagram-rendering-quality.md](specs/diagram-rendering-quality.md)
- **Validation Acceptance Criteria:**
  - **VAC-04.1 (Realistic Multi-Domain Completion Trial):** A representative
    author completes three realistic diagrams—(1) the 8-node AI/ML training
    pipeline with 40–100 character model captions, (2) a grouped 12-node
    architecture diagram with parallel and back edges, and (3) a diagram mixing
    `0.2.10` outside-captioned glyphs (`actor`, `brain`, `funnel`,
    `neural-net`)—in both left-to-right (`RIGHT`) and top-to-bottom (`DOWN`)
    layouts, saves/reopens each, and exports SVG. *Pass bar: 6/6 renders
    succeed without shortening captions, switching notation, removing groups,
    changing direction to dodge errors, or manually repairing generated routes.
    Workaround budget: 0.*
  - **VAC-04.2 (Cold-Reader Comprehension and Visual Polish Check):** A
    reviewer who did not author the diagrams inspects true-font Chromium
    renders of the exported SVGs from `VAC-04.1`. Within 30 seconds per
    diagram, the reviewer identifies every symbol's role, reads every full
    caption and connector label clearly (zero text obscured by symbol artwork),
    traces flow order without lines crossing node bodies or captions, and
    confirms clean alignment, crisp orthogonal bends free of accidental
    diagonals or jagged/sawtooth micro-jogs, distinct connector spacing, and
    compact page fit without bloated icons. *Pass bar: 100% identification, 0
    unreadable/ambiguous labels, 0 line-through-body or line-through-caption
    complaints, 0 visual-polish blockers. Workaround budget: 0.*
  - **VAC-04.3 (Graceful Fallback Transparency):** If an adversarial dense
    graph forces a degraded generated route, the author still receives a
    rendered diagram accompanied by a `layout.route.degraded` diagnostic naming
    the exact failing connector ID and endpoints located to its source line,
    allowing the author to locate and address it without hitting an opaque
    blank error. *Pass bar: diagram renders and author locates the exact
    failing connector from the diagnostic on the first attempt. Workaround
    budget: 0.*

## UN-05: Domain-Accurate Notations and Self-Contained Custom Symbols

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** An author working in a technical domain needs symbols, connectors,
  and ordering that match domain conventions, plus the ability to import custom
  SVG icons that travel self-contained inside saved Coral files.
- **Decomposed Spec:**
  [supported-diagram-types.md](specs/supported-diagram-types.md)
- **Validation Acceptance Criteria:**
  - **VAC-05.1 (Domain Idiom Fidelity):** Across the active visual domain
    checklist (`flowchart`, `bpmn`, `architecture`, `aiml`, `data-engineering`,
    `uml-class`, `uml-sequence`), an author builds one non-trivial diagram per
    domain using documented notation idioms (with hyphenated `aiml`/
    `data-engineering` relation spellings gated on `ENG-06` HITL notation
    review completion) and confirms symbols, arrowheads, and ordering match
    [supported-diagram-types.md](specs/supported-diagram-types.md). *Pass bar:
    7/7 domain diagrams match their declared idioms with 0 silent symbol
    substitutions. Workaround budget: 0.*
  - **VAC-05.2 (Portable Custom Icon Round-Trip):** An author imports a custom
    SVG icon, assigns it to two nodes, saves the `.coral` file, opens that file
    in a clean browser profile with empty local storage, and exports SVG. Both
    nodes render identically with zero re-import steps. *Pass bar: both nodes
    match in canvas and SVG export in a clean profile. Workaround budget: 0.*

## UN-06: Non-Destructive Diagram Migration With Fidelity and Similarity Reporting

- **Persona:** P5 (Diagram Author Migrating to Coral), P3 (Automation Consumer)
  | **Gate Class:** Primary (Target clauses governed by Core Rule 5)
- **Need:** An author migrating existing diagrams from Mermaid, Graphviz/DOT,
  or PlantUML into Coral—either one diagram at a time in Desktop Chrome or in
  batches from the command line—needs non-destructive conversion to Coral with
  transparent accounting of any lost fidelity, a visual similarity score, and a
  side-by-side review report for batch runs.
- **Decomposed Spec:**
  [migration-conversion.md](specs/migration-conversion.md)
- **Validation Acceptance Criteria:**
  - **VAC-06.1 (Interactive Single-Diagram Migration — Desktop Chrome):**
    - *Shipped Baseline:* An author opens 3 real-world diagrams (`.mmd`,
      `.dot`/`.gv`, `.puml`) one at a time in Chrome without modifying original
      files, inspects the rendered preview and exact plain-language fidelity
      loss list, converts a pasted headerless Mermaid snippet via tab switch,
      and confirms unsupported diagram kinds are refused clearly by name.
      *Pass bar: 3/3 files preview cleanly with complete loss reporting and
      zero original-file mutation. Workaround budget: 0.*
    - *P5 Target:* An author adopts each opened Mermaid, DOT, or PlantUML file
      into an editable saved `.coral` draft in Chrome without altering the
      original file and reviews its similarity score and loss breakdown before
      saving. *Pass bar: 3/3 files adopt non-destructively with visible score
      and loss list. Workaround budget: 0.*
  - **VAC-06.2 (Batch CLI Migration and Side-by-Side Triage — P5 Target):**
    Given a directory of 10+ existing diagrams across Mermaid, DOT, and
    PlantUML (including same-stem files with different extensions), a migrating
    author runs a single non-destructive CLI batch command. Original source
    files remain untouched; Coral emits `.coral` outputs plus a side-by-side
    report showing every diagram's original vs. Coral preview, structural and
    visual similarity scores with triage bands, and exact fidelity-loss list so
    the author can triage which diagrams are ready as-is and which need manual
    follow-up. *Pass bar: 100% of discovered files accounted for, 0 original
    files modified, author triages all diagrams from the report alone.
    Workaround budget: 0.*

## UN-07: Local Document Ownership, Crash Recovery and Faithful Multi-Format Export

- **Persona:** P1 (Diagram Author) | **Gate Class:** Primary
- **Need:** An author needs full local ownership of their files (save, open,
  and crash recovery without cloud lock-in) and exports (SVG, PNG, JPEG,
  standalone HTML) that match the canvas faithfully on other machines.
- **Validation Acceptance Criteria:**
  - **VAC-07.1 (Reload and Crash Recovery):** Mid-edit with unsaved changes,
    the author reloads or closes/reopens the browser tab, receives a clear
    recovery prompt, and restores exact unsaved text and accepted geometry with
    zero silent overwrites. *Pass bar: 100% text and geometry recovery via
    explicit prompt. Workaround budget: 0.*
  - **VAC-07.2 (Cross-Machine Export Fidelity):** Exported SVG, PNG, JPEG, and
    standalone HTML files of a styled diagram with captioned glyphs open on a
    separate viewer/machine with matching wrapping, fonts, glyphs, opaque
    backgrounds (for JPEG/themed exports), and routes with no external network
    fetches required. *Pass bar: 4/4 export formats match canvas visually with
    zero missing fonts or black-alpha artifacts. Workaround budget: 0.*

## UN-08: Zero-Framework Web Embedding and Reusable React Integration

- **Persona:** P2 (Web & React Embedder) | **Gate Class:** Primary
- **Need:** A developer embedding Coral needs to render Coral source in plain
  HTML pages without React, or integrate editable Coral components into a React
  18/19 app using clean, documented, backward-compatible npm packages.
- **Validation Acceptance Criteria:**
  - **VAC-08.1 (Plain Web Embed Trial):** Following only `Embed Coral` docs, a
    developer embeds `@coral-viz/browser` (ESM, IIFE, or custom element) in a
    plain HTML page with 3 diagrams including 1 syntax error. *Pass bar: valid
    diagrams render cleanly and the invalid one surfaces an isolated diagnostic
    within 15 minutes. Workaround budget: 0 undocumented hacks.*
  - **VAC-08.2 (React Host Integration Trial):** Following only `Embed Coral`
    docs, a developer installs packed packages into a clean React 18.3 or 19
    app, wires bidirectional editing, and upgrades across a `0.2.x` patch
    without breaking types or runtime behavior. *Pass bar: clean build,
    working bidirectional edit round-trip, and zero breaking changes across
    patch upgrade. Workaround budget: 0.*

## UN-09: Scriptable Automation, MCP Tooling and Portable Semantic Interchange

- **Persona:** P3 (Automation & Terminal Consumer) | **Gate Class:** Primary
- **Need:** A developer or AI-agent builder needs deterministic headless tools
  (MCP server, library APIs, GraphIR JSON) to validate, convert, lay out, and
  render diagrams reliably without a browser or repository-indexing coupling.
- **Decomposed Spec:**
  [migration-conversion.md](specs/migration-conversion.md)
- **Validation Acceptance Criteria:**
  - **VAC-09.1 (Headless MCP & GraphIR Workflow):** Using only `coral-mcp` over
    stdio (no browser), an operator or agent validates Coral source, fixes a
    reported diagnostic, lays out a grouped graph, exports SVG, and round-trips
    portable semantics through GraphIR JSON with structured diagnostics at
    every step. *Pass bar: full validate -> fix -> layout -> SVG -> GraphIR
    round-trip completes headlessly with 0 browser steps. Workaround budget:
    0.*

## UN-10: Readable Plain-Text and Terminal Diagramming

- **Persona:** P3 (Automation & Terminal Consumer), P1 (Diagram Author) |
  **Gate Class:** Primary
- **Need:** An engineer writing RFCs, terminal logs, commit messages, or LLM
  prompts needs accurate plain-text ASCII (and optionally MonoTrue) renderings
  of supported diagrams, with explicit refusal when a diagram relies on visual
  features plain text cannot represent.
- **Decomposed Spec:**
  [supported-diagram-types.md](specs/supported-diagram-types.md)
- **Validation Acceptance Criteria:**
  - **VAC-10.1 (Terminal and Markdown Paste Check):** Render one diagram from
    each supported character family (Block, Flowchart, BPMN, UML class, UML
    sequence, bounded flat UML state) to ASCII and paste into a monospace code
    block. A human reader traces all nodes, labels, and edge directions
    accurately; requesting MonoTrue without the exact host font falls back as
    a whole picture to clean ASCII with zero garbled glyphs. *Pass bar: 6/6
    families traced accurately by a human reader with 0 garbled fallback
    characters. Workaround budget: 0.*

## UN-11: Private, Opt-In, Human-Reviewed On-Device AI Editing

- **Persona:** P1 (Diagram Author — opt-in power user) | **Gate Class:**
  Primary (0.2.10 opt-in experimental feature)
- **Need:** An author opting into experimental local AI editing on a flowchart
  needs clear consent before any large download, certainty that diagrams never
  leave the browser, and an explicit human review step before any suggestion
  changes the document.
- **Validation Acceptance Criteria:**
  - **VAC-11.1 (Informed Consent and Clean Removal):** Before opt-in, the
    author confirms the AI tab is absent from the editor workspace. When opting
    in via Preferences, the author reads the pre-download disclosures and
    accurately answers 6 comprehension questions from the UI alone—download
    size, model host, on-device privacy, 1–4 edit scope, ~1.2 GB memory
    footprint, and the LFM Open License v1.0 commercial-use limitation (opening
    the bundled offline license text in one activation)—then completes download
    and verifies clean disable/removal. *Pass bar: 6/6 comprehension questions
    accurate, clean enable and remove completed. Workaround budget: 0.*
  - **VAC-11.2 (Trustworthy Review-Apply-Undo Loop):** On an open flowchart,
    the author runs 3 short English requests (a structural edit, a spatial
    edit, and an ambiguous or out-of-scope request). The author inspects the
    computed change list and preview (with removals text-marked), applies one
    change and reverses it in a single Undo step, discards another, and
    confirms the out-of-scope request is refused clearly with zero unreviewed
    edits to the document. *Pass bar: 3/3 requests behave predictably with 0
    unreviewed live document mutations and exact 1-step Undo. Workaround
    budget: 0.*

## UN-12: Complete Keyboard Operability and Honest Accessibility Semantics

- **Persona:** P4 (Keyboard / Accessibility-First Author) | **Gate Class:**
  **Secondary — Catch-Up Releases (Non-Blocking)**
- **Release Gating Note:** `UN-12`, its derived `REQ-C3`, and `VAC-12.1` are
  maintained continuously so accessibility debt stays visible and structured,
  and are formally validated during dedicated accessibility catch-up releases.
  They do **not** block regular feature releases.
- **Need:** An author working without a mouse needs to create, select, connect,
  edit, review, undo, and export diagrams entirely via keyboard with
  predictable focus management and clear status announcements.
- **Validation Acceptance Criteria:**
  - **VAC-12.1 (Mouse-Unplugged Authoring Session — Catch-Up Gate):** Without
    using a pointer, an author opens Coral, creates two nodes, connects them,
    edits labels/properties, triggers Reflow, inspects diagnostics, saves,
    exports SVG, and (when enabled) completes an on-device AI review/apply/undo
    cycle without focus traps or lost focus. Screen-reader compatibility stays
    explicitly labeled experimental until tested with target assistive
    technologies. *Pass bar: full end-to-end session completed with 0 pointer
    events and 0 focus traps. Workaround budget: 0.*

## Validation Evidence Record Template

Release status files record executed Tier 1 validation separately from Tier 2
automated test runs using this structure:

```markdown
- **VAC ID:** VAC-04.1
- **Candidate Commit:** <exact git SHA>
- **Validator / Author:** <name or role, distinct from implementer where possible>
- **Artifacts:** <links to inputs, screenshots, exported SVGs, or batch reports>
- **Workarounds Required:** <0, or explicit list>
- **Outcome:** Pass | Fail | Deferred (with owner decision)
- **Follow-Up:** <new VAC or REQ if a gap was uncovered>
```
