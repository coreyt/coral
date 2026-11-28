---
name: anemone-diagram-design
description: >-
  Coral's Anemone v2 visual design language and Parrotfish presentation system.
  Use when designing, upgrading, mocking up, or reviewing Coral diagram styles,
  symbol glyphs, notation visual treatments, SVG serializer presentation
  primitives, or Parrotfish theme models across Coral's 13 diagram types.
---

# Anemone Diagram Design (Coral Visual Language)

This skill governs **Anemone** (`ane`) — Coral's flagship expressive render
style — and its underlying **Parrotfish** presentation engine.

## Purpose & Positioning

Coral provides distinct visual presentation surfaces:
- `lowfi` — crisp monochrome hand-drawn ink (Caveat).
- `hifi` — crisp monochrome technical ink (Inter).
- **`anemone` (`ane`)** — Coral's flagship original visual language, engineered
  to stand shoulder-to-shoulder with hand-crafted **Figma / IcePanel / Linear**
  architecture diagrams and **Excalidraw** tactile sketches, while remaining
  100% deterministic, plain-text-authored, and zero-drift.

> **Separation from Parrotfish:** `anemone` and `parrotfish` are distinct
> styles. Anemone owns Coral's original Figma/Excalidraw-grade visual language;
> Parrotfish's separate discreet classic-parroting preset (`'parrotfish'` /
> `'pf'`) is documented independently in `dev/designs/parrotfish/`.

## Architectural Boundary (Parrotfish Invariant)

Every Anemone visual rule MUST respect Coral's rendering architecture:

1. **Zero Layout or Route Mutation.** Presentation rules (colors, gradients,
   shadows, icon badges, header pills, edge label pills, stroke styles, subtle
   dot-grid background) NEVER alter node coordinates, dimensions, port contacts,
   or edge route geometry (`d` and `points`) unless explicitly coordinated as a
   versioned sizing/catalog change.
2. **Edition & Digest Safety.** Editions `0.2.8`, `0.2.9`, and `0.2.14` catalog
   digests are frozen. Visual presentation upgrades belong in:
   - Parrotfish presentation layer (`parrotfishCore.ts` / Anemone v2 model)
   - Additive SVG presentation primitives (`projectScene028.ts` / `serialize.ts` `<defs>`)
   - Next-edition (`0.2.15+` / `0.3.0`) icon/glyph catalog expansion where new
     layout-affecting anatomy is needed.
3. **Dual-Theme Parity.** Every Anemone token ships in both **Light** (Studio
   Paper) and **Dark** (Abyssal Slate) modes with verified contrast.
4. **Dual-Register Craft.**
   - **Precision Register** (default for `architecture`, `infrastructure`,
     `erd`, `uml-class`, `uml-sequence`, `bpmn`, `aiml`, `data-engineering`,
     `flowchart`, `block`, `code`, `uml-state`): crisp vector cards, subtle
     elevation, concentric radii, icon squircles, structured typography, and
     clean orthogonal routing with rounded elbows.
   - **Tactile Sketch Register** (default for `sketch`, opt-in variant
     `anemone-sketch` for ideation): warm paper ground (`#FAF8F4`), subtle
     organic multi-pass ink strokes, highlighter-wash fills, sticky-note
     callouts, and expressive hand-drawn arrows — matching Excalidraw's warmth
     without sacrificing legibility.

## Core Rules of Anemone v2

1. **Neutral Cards, Semantic Signals.** Nodes sit on clean elevated white
   (`#FFFFFF` light / `#161E2E` dark) surfaces with quiet slate borders — NOT
   garish pastel fills. Semantic role is communicated through:
   - a **26×26px rounded icon squircle** (`rx=7`) tinted in the role's soft hue
     with a `1.6px` crisp stroke icon,
   - a **subtle semantic top accent hairline or header band** (only for
     structured tables/classes/providers, NEVER a heavy 3.5px left stripe), and
   - **technology/role pills** rendered in compact monospace.
2. **Notation-Idiomatic Presentation.** Never run one flat regex classifier
   blindly over all 13 diagram types. Dispatch visual rules by `ctx.notationId`
   first, then semantic role (`symbolId`, `type`, `provider`).
3. **Layered Zone Containers.** Containers render as softly tinted rounded
   surfaces (`rx=14`) with a **top-left anchored header badge/pill** (carrying
   zone icon + label + optional provider/tier tag) and subtle luminance stepping
   across nesting depth (`depth 0` → `depth 1` → `depth 2`).
4. **Readable Pill Edge Labels.** Edge labels render inside a rounded pill
   (`rx=6`, `1px` subtle border, canvas-tinted fill) separating the action verb
   from any `[protocol / technology]` tag in muted monospace.
5. **Cohesive 48-Glyph Icon Kit.** Replace raw clipart-with-text-inside shapes
   (`brain`, `neural-net`, `dashboard`, `gear`, `chip`, `cube`) in Anemone
   presentation with clean icon-badged cards using a unified `24×24` `1.75px`
   stroke-cap-round duotone icon family.

## Workflow: Upgrading or Authoring Anemone Visuals

1. Read the full specification in
   [dev/designs/anemone-v2/anemone-v2-design-language.md](../../../dev/designs/anemone-v2/anemone-v2-design-language.md).
2. Check the target notation's idiomatic rules in
   [dev/designs/anemone-v2/coral-diagram-types-review.md](../../../dev/designs/anemone-v2/coral-diagram-types-review.md).
3. Cross-check visual quality using the `visual-communication-design` skill's
   8-dimension critique rubric (target >= 4.5 / 5.0).
4. Produce standalone SVG/HTML mockups in both Light and Dark modes before
   modifying renderer code.
5. Verify rendered SVGs in Chromium with embedded fonts (`Coral Inter`,
   `JetBrains Mono` / monospace, `Coral Lowfi Caveat` for sketch) and confirm
   zero overlaps, clean routing, and >= 4.5:1 text contrast.
