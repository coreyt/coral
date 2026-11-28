---
name: visual-communication-design
description: >-
  Expert visual design and visual communication craft for technical diagrams,
  design systems, SVG graphics, and information architecture. Use when designing
  or critiquing diagram styles, symbol libraries, color palettes, typography
  hierarchy, visual layouts, or presentation layers that must meet Figma,
  Linear, IcePanel, or Excalidraw craft standards.
---

# Visual Communication Design

This skill turns generic, auto-generated technical visuals into deliberate,
publication-grade visual communication equal to hand-crafted Figma, IcePanel,
Linear, and Excalidraw work.

## Core Philosophy

Every pixel in a technical visual must either **clarify structure**, **encode
meaning**, or **create breathing room**. Decoration without communicative
function is noise.

### The Five Non-Negotiables

1. **60-30-10 Chromatic Restraint.**
   - **60%** quiet canvas and neutral structural surfaces (tinted slate/warm paper, never harsh pure black on blinding white).
   - **30%** calm structural framing (neutral node bodies, subtle borders, soft zone containers, clear edge paths).
   - **10%** intentional semantic signal (role icon badges, primary flow emphasis, status/protocol pills, focal callouts).
   - *Never* splash 6+ saturated pastel fills across one diagram ("rainbow soup"). When everything is loud, nothing has hierarchy.
2. **Three-Tier Reading Order (5-Second Squint Test).**
   - **0–2 seconds (Structure):** Containers, flow direction, and focal nodes read clearly even when blurred/squinted.
   - **2–5 seconds (Relationships):** Primary path vs. async/data/error paths and key entities scan cleanly left-to-right or top-to-bottom.
   - **5+ seconds (Detail):** Technology badges, secondary descriptions, cardinalities, and protocol subtitles reward closer inspection without crowding the canvas.
3. **Typography Carries Hierarchy Before Color.**
   - Establish clear contrast through **size, weight, tracking, and opacity/tone** — never uniform monolithic text.
   - Use 3 distinct roles: **Title** (semibold, primary ink), **Meta / Tag** (small uppercase/pill or monospace, medium weight), and **Description / Subtitle** (smaller regular weight, muted ink).
   - Prefer crisp geometric/neo-grotesque sans (Inter / Plus Jakarta Sans) for precision diagrams, monospace (JetBrains Mono / IBM Plex Mono) for schemas, types, protocols, and code, and a refined hand-lettered face (Virgil / Excalifont / Caveat tuned with proper tracking) strictly for informal sketch mode.
4. **Icon-Badged Clarity Over Clipart Contours.**
   - Never force multi-line text inside irregular, busy, or noisy clipart silhouettes (gears, brains, crisscrossed neural-net grids, bar-chart rectangles, stick figures).
   - Use **clean, proportioned geometric cards** paired with a **dedicated 24–28px icon badge** (or a crisp iconic symbol with an external caption positioned cleanly underneath) so text always sits on calm, legible surface area.
5. **Surface Craft & Tactile Depth.**
   - Separate figure from ground with subtle layered surfaces, whisper-soft diffused shadows (not harsh drop shadows), hairline borders tuned for contrast (`1px–1.5px`), and consistent corner-radius geometry (nested container radius = inner radius + padding rule).

## Anti-Patterns to Eliminate Immediately

Reject and redesign any visual exhibiting these "auto-generated diagram" tells:

| Anti-Pattern | Why It Fails | Replacement |
| --- | --- | --- |
| **Tailwind-50 Pastel + 700-Border Soup** | Saturated borders + 7 competing pastel node fills look childish and obscure flow | Neutral elevated card surface (`#FFFFFF` / `#161B26`) + restrained semantic accent via icon badge & subtle border tint |
| **3.5px Left Accent Stripe on Every Card** | Overused "Bootstrap alert / AI-slop" cliché; wastes horizontal space and fractures borders | Top-left icon squircle badge, subtle top-edge highlight, or clean header band for structured cards (ERD/UML) |
| **Text Over Busy Clipart Shapes** | Text collides with gear teeth, brain creases, dashboard bars, or neural-net lines | Structured card with crisp corner/header icon glyph, or external caption below simple geometric silhouette |
| **Flat Wireframe Dashed Containers** | Looks unfinished; nested zones flatten into unreadable overlapping rectangles | Tinted layered surface zones (L0 canvas → L1 zone → L2 sub-zone) with anchored top-left header pill/tab |
| **Raw Boxed Edge Labels** | Sharp opaque rectangles chop connectors visually and collide with nearby bends | Soft-rounded pill badges with subtle border/halo, concise verb + muted `[protocol]` tag |
| **Uniform Connector Weight** | Primary happy path, async events, error branches, and notes look identical | Weighted hierarchy: crisp primary flow (`1.75–2px`), dashed async (`1.5px` + hue), muted annotation (`1px` dotted) |
| **Monolithic Text Sizing** | Title, technology, and description all rendered at 14px 600 create a wall of text | 3-tier scale: Title `13–14px/600`, Tech pill `10.5–11px/500`, Description `11.5–12px/400` muted |

## Workflow: Designing or Critiquing Any Visual

1. **Identify Communication Intent & Audience.**
   - State the single question the diagram answers in one sentence.
   - Choose the visual register: **Precision** (Figma/Linear/IcePanel — architecture, infra, ERD, UML, BPMN, data) vs. **Sketch / Tactile** (Excalidraw — ideation, workshops, informal flows).
2. **Apply Tokenized Surface & Color System.**
   - Consult [references/visual-hierarchy-and-color.md](./references/visual-hierarchy-and-color.md) for perceptual OKLCH ramps, contrast targets (WCAG AA >= 4.5:1 text, >= 3:1 strokes/UI), and light/dark parity.
3. **Compose Symbol & Container Anatomy.**
   - Check internal padding (minimum `12–16px` horizontal, `10–14px` vertical on cards), icon-to-text gap (`10–12px`), and container header clearance.
4. **Run the Visual Critique Rubric.**
   - Score the output against [references/diagram-communication-rubric.md](./references/diagram-communication-rubric.md) across all 8 dimensions before signing off.
5. **Inspect True-Font Renders.**
   - Always inspect rendered SVG/HTML in a real browser engine (Chromium) with embedded fonts loaded — never rely on raw coordinates or headless text-less assertions alone.

## References

- [Visual Hierarchy, Typography & Perceptual Color](./references/visual-hierarchy-and-color.md)
- [Diagram Communication Critique Rubric](./references/diagram-communication-rubric.md)
