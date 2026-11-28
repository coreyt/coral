# Anemone v2 — Coral Visual Design Language Specification

**Status:** Design proposal & visual reference pack (`2026-11-27`), replacing
Anemone v1 (`0.2.14`). **Backup of v1 baseline:**
[parrotfishCore.v1-0214.ts.bak](./backups/parrotfishCore.v1-0214.ts.bak) and
[visualStyle028.v1-0214.ts.bak](./backups/visualStyle028.v1-0214.ts.bak).
**Design bar:** Equal to hand-crafted **Figma / IcePanel / Linear** technical
diagrams (Precision Register) and **Excalidraw** tactile boards (Sketch
Register) — deterministic, plain-text authored, zero drift.

---

## 1. Design Philosophy: "Quiet Precision, Intentional Signal"

A great engineering diagram never looks "styled by a script." It feels like a
staff engineer and a product designer sat down in Figma for two hours:

1. **Neutral Elevated Surfaces, Concentrated Color Signal.** Instead of
   flooding every node with saturated pastel fills and dark colored outlines,
   Anemone v2 places nodes on **calm, crisp elevated cards** (`#FFFFFF` light
   / `#151C2C` dark) over a slightly tinted canvas (`#F8FAFC` light /
   `#0B101B` dark). Color is focused where the eye expects semantic signal:
   **icon squircle badges**, **structured table/class header bands**,
   **technology/status pills**, and **selective non-default edge types**
   (async, data, error).
2. **Two Authentic Registers Under One Identity.**
   - **Anemone Precision** (`architecture`, `infrastructure`, `aiml`,
     `data-engineering`, `erd`, `uml-class`, `uml-sequence`, `bpmn`,
     `flowchart`, `block`, `code`, `uml-state`): crisp geometry, soft
     dual-layer elevation, concentric corner radii, 3-tier typography, pill
     badges, and clean orthogonal routes with `8px` rounded elbows.
   - **Anemone Sketch** (`sketch` default; optional `anemone-sketch` mode for
     any diagram): warm ivory paper (`#FAF8F4`), organic charcoal ink
     (`#1E293B`), subtle hand-drawn contour variation, soft pastel highlighter
     fills & diagonal hachure accents, sticky-note callouts, and expressive
     hand-drawn arrows — true Excalidraw warmth with Coral's structural
     stability.
3. **Zero Layout Drift (Parrotfish Invariant).** Every Phase-1 Anemone v2
   upgrade operates purely inside Coral's presentation layer (`Parrotfish` +
   SVG `<defs>` filters/markers/pills) without shifting a single node
   coordinate, port contact, or routed edge waypoint.

---

## 2. Color & Surface System (Light & Dark Parity)

### 2.1 Four-Tier Surface Architecture

| Token | Role | Light (Studio Paper) | Dark (Abyssal Slate) |
| --- | --- | --- | --- |
| `surface.canvas` | L0 diagram background | `#F8FAFC` | `#0B101B` |
| `surface.canvasDot` | Optional subtle dot grid (`20px` pitch, `r=1`) | `#CBD5E1` (`opacity: 0.45`) | `#334155` (`opacity: 0.35`) |
| `surface.zoneL1` | L1 outer container / boundary | `#F1F5F9` (`opacity: 0.85`) | `#111827` |
| `surface.zoneL2` | L2 nested container / subnet / lane | `#E8EFF7` (`opacity: 0.72`) | `#172033` |
| `surface.card` | L3 primary elevated node | `#FFFFFF` | `#192235` |
| `surface.cardExternal` | External / third-party node | `#F8FAFC` | `#121927` |
| `surface.cardNote` | Annotation / sticky callout | `#FFFBEB` | `#272013` |
| `surface.pill` | Technology / metadata / edge-label pill | `#F1F5F9` | `#222E44` |
| `border.subtle` | Card resting border | `#DDE4EE` | `#2A3750` |
| `border.strong` | Active / focused / decision border | `#94A3B8` | `#475569` |
| `border.zone` | Container frame border | `#CBD5E1` | `#334155` |
| `border.external` | External system dashed border (`5 4`) | `#94A3B8` | `#475569` |
| `ink.primary` | Node title, primary labels (AAA >= 12:1) | `#0F172A` | `#F1F5F9` |
| `ink.secondary` | Descriptions, column types (AA >= 5.5:1) | `#475569` | `#94A3B8` |
| `ink.muted` | Eyebrows, zone labels, metadata (AA >= 4.5:1) | `#64748B` | `#7E8FA6` |
| `edge.default` | Primary sync/control connector | `#64748B` | `#7C8DA6` |
| `edge.strong` | Highlighted spine / primary happy path | `#334155` | `#CBD5E1` |

### 2.2 Semantic Accent Families (Concentrated Signal)

Instead of 11 clashing node fill colors, Anemone v2 defines **8 calibrated
semantic families** applied to **icon squircle badges**, **subtle top-edge or
header-band tints**, and **semantic edges**:

| Family | Primary Use | Light Badge Fill | Light Accent Ink | Light Border Tint | Dark Badge Fill | Dark Accent Ink |
| --- | --- | --- | --- | --- | --- | --- |
| `coral` | Human Actors, Brand Accent, Error/End Events | `#FFE4E6` | `#BE123C` | `#FDA4AF` | `#3B1522` | `#FB7185` |
| `indigo` | Core Systems, Orchestrators, Classes, LLMs | `#EEF2FF` | `#4338CA` | `#C7D2FE` | `#1E254B` | `#818CF8` |
| `teal` | Services, Deployable Containers, Functions, Views | `#ECFEFF` | `#0E7490` | `#A5F3FC` | `#102E38` | `#22D3EE` |
| `sky` | Network, Gateways, Load Balancers, CDN, FK | `#E0F2FE` | `#0369A1` | `#BAE6FD` | `#102B42` | `#38BDF8` |
| `amber` | Databases, Storage, Warehouses, Decisions, PK | `#FEF3C7` | `#B45309` | `#FDE68A` | `#34240E` | `#FBBF24` |
| `violet` | Queues, Streams, Event Buses, Async, AI Agents | `#F3E8FF` | `#7E22CE` | `#E9D5FF` | `#2A1944` | `#C084FC` |
| `emerald` | Start Events, Pass/Guardrails, Public Subnets | `#D1FAE5` | `#047857` | `#A7F3D0` | `#0E2E23` | `#34D399` |
| `slate` | External Systems, Neutral Blocks, Infrastructure | `#F1F5F9` | `#475569` | `#CBD5E1` | `#1F293B` | `#94A3B8` |

### 2.3 Provider Micro-Badges (`@diagram infrastructure`)

Cloud providers never hijack the entire node background. Instead, they render
a **compact top-right micro-pill** (`height: 16px`, `rx: 4`, `9.5px/600`
uppercase mono):

- `AWS`: fill `#FFF7ED`, stroke `#FDBA74`, ink `#C2410C` (dark: `#361E10` /
  `#FB923C`)
- `GCP`: fill `#EFF6FF`, stroke `#93C5FD`, ink `#1D4ED8` (dark: `#142442` /
  `#60A5FA`)
- `Azure`: fill `#F0F9FF`, stroke `#7DD3FC`, ink `#0369A1` (dark: `#0F283D` /
  `#38BDF8`)
- `K8s`: fill `#EEF2FF`, stroke `#A5B4FC`, ink `#3730A3` (dark: `#1E2447` /
  `#818CF8`)

---

## 3. Typography Hierarchy

| Role | Family | Size | Weight | Color Token | Usage |
| --- | --- | ---: | ---: | --- | --- |
| **Zone Header Pill** | Inter / Sans | `11px` | `600` | `ink.secondary` | Top-left container badge (`SYSTEM`, `VPC`, `PRIVATE SUBNET`) |
| **Card Title** | Inter / Sans | `13.5px` | `600` | `ink.primary` | Primary node identifier / entity / class name |
| **Technology / Meta Pill** | JetBrains Mono / Mono | `10px` | `500` | family accent or `ink.secondary` | `[Go / gRPC]`, `[PostgreSQL]`, `«interface»`, `PK`, `FK` |
| **Card Description** | Inter / Sans | `11.5px` | `400` | `ink.secondary` | Concise 1–2 line summary below title/tech |
| **Schema / Class Row** | Inter + Mono | `11.5px` | `400` / `600` | `ink.primary` / `ink.secondary` | ERD columns & UML attributes/methods |
| **Edge Primary Label** | Inter / Sans | `11px` | `500` | `ink.primary` | Action verb (`Submits order`, `Validates JWT`) |
| **Edge Protocol Tag** | JetBrains Mono / Mono | `9.5px` | `500` | `ink.muted` | `HTTPS`, `gRPC`, `Kafka`, `SQL` inside edge pill |
| **Sketch Hand Title** | Caveat / Hand | `18px` | `600` | `#1E293B` | Tactile sketch register nodes |
| **Sketch Hand Note** | Caveat / Hand | `15px` | `500` | `#475569` | Tactile annotations and arrows |

---

## 4. Component Anatomy Specifications

### 4.1 Elevated Icon-Badged Node Card (Architecture, Infra, AI/ML, Data, Code)

```text
╭─────────────────────────────────────────────────────────╮  rx=10, fill=surface.card
│  ╭────╮                                         ┌─────┐ │  border=1.25px border.subtle
│  │ ◇  │  Order Service                          │ AWS │ │  shadow=anemone-card-shadow
│  ╰────╯  [Go · gRPC]                            └─────┘ │  icon squircle: 28×28, rx=7
│          Validates cart & writes immutable ledger       │  padding: 12px 14px
╰─────────────────────────────────────────────────────────╯
```

- **No 3.5px left stripe.** Visual weight is balanced cleanly by the 28×28
  icon squircle.
- **Optional subtle top cap:** Reserved exclusively for high-level focal
  anchors (e.g., primary Software System or LLM Orchestrator) at `2.5px`
  clipped cleanly to the card's top radius.
- **External System variant:** `surface.cardExternal`, `stroke-dasharray="5
  4"`, `slate` icon squircle, muted `EXTERNAL` micro-tag.

### 4.2 Layered Container / Boundary Framing

- **Outer frame:** `rx=14`, fill `surface.zoneL1` (or `zoneL2` when
  `nestingDepth >= 1`), border `1.25px` (`solid` for owned systems/VPCs, `6 4`
  dashed for trust boundaries/subnets).
- **Anchored Header Pill:** Sits flush top-left (`x + 12`, `y - 11` straddling
  top edge, OR inset top-left `x + 12, y + 10` when top edge is clipped by
  tight bounds), containing:
  - Small `14×14` zone icon (cloud, shield, lock, layers),
  - Bold title (`12px/600`), and
  - Subtle kind tag (`SYSTEM`, `VPC`, `PUBLIC SUBNET`, `AGENT LOOP`).

### 4.3 Structured Compartment Cards (ERD & UML Class)

- **Header Band:** Rounded top-only fill tinted with soft family hue
  (`#EEF2FF` for Entity/Class, `#ECFEFF` for View/Interface, `#FEF3C7` for
  Enum), `1px` bottom separator, icon + bold name + optional stereotype pill.
- **Rows:** `24px` vertical rhythm, crisp left `PK` / `FK` / `UK` micro-badges
  (`rx=3`, `9px/700` mono), column/member name in `ink.primary`, right-aligned
  type in muted monospace `ink.secondary`, and subtle alternating zebra band
  (`rgba(15,23,42,0.018)`).

### 4.4 Connectors & Pill Edge Labels

- **Stroke weights:**
  - Primary / Sync flow: `1.75px` solid `edge.default` (`#64748B`), `8px`
    quadratic rounded corners.
  - Async / Event / Stream: `1.6px` dashed (`5 4`) `violet` (`#7E22CE` light /
    `#C084FC` dark).
  - Data / Storage read-write: `1.6px` solid `amber` (`#B45309` light /
    `#FBBF24` dark) or `slate` with subtle dot/arrow.
  - Error / Reject / Guardrail Fail: `1.6px` dashed (`4 3`) `coral` (`#BE123C`
    light / `#FB7185` dark).
  - Annotation link: `1.1px` dotted (`2 3`) muted slate.
- **Arrowheads:** Sleek `8×6` closed tapered chevron (`M0,0.5 L7.5,3.5 L0,6.5
  L1.8,3.5 Z`) for sync/primary; crisp open V-head (`1.5px` stroke) for
  async/return/dependency.
- **Edge Label Pill:** Rounded `<rect rx="6" ry="6">` with `6px 9px` padding,
  `surface.card` fill (95% opacity), `1px` `border.subtle` stroke, and subtle
  shadow halo — cleanly displaying `Action` + optional muted `· HTTPS` mono
  suffix.

### 4.5 Elevation Shadows (`<defs>` SVG Filters)

```text
<!-- Light mode resting card elevation -->
<filter id="anemone-shadow-sm" x="-12%" y="-12%" width="124%" height="132%">
  <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.06"/>
  <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.05"/>
</filter>

<!-- Elevated focal card / sequence participant / sticky note -->
<filter id="anemone-shadow-md" x="-16%" y="-16%" width="132%" height="140%">
  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.07"/>
  <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.08"/>
</filter>
```

### 4.6 Tactile Sketch Register (`@diagram sketch` / Excalidraw Parity)

- **Canvas:** Warm studio paper (`#FAF8F4` light / `#161513` dark), optional
  subtle warm dot grid (`#DDD6C8`).
- **Ink:** Deep graphite (`#1E293B` light / `#F3F0E8` dark), `2.0px` stroke
  with subtle organic deterministic cubic-bezier bow (strictly passing through
  exact compass port anchors so routing never drifts!).
- **Fills:** Soft translucent marker/pastel washes (butter `#FEF3C7`, mint
  `#DCFCE7`, sky `#E0F2FE`, peach/coral `#FFE4E6`, lavender `#F3E8FF`, warm
  white `#FFFDF9`) with optional subtle diagonal hachure SVG `<pattern>` for
  focal shapes.
- **Sticky Callouts:** Warm butter `#FEF9C3` card with subtle `-1.5deg` tilt
  accent or folded corner + soft drop shadow.
- **Connectors:** Slightly organic bowed paths with hand-drawn open arrowheads
  and hand-lettered inline labels on warm paper halos.

---

## 5. Phased Implementation Path in Coral (`@coral-viz/render`)

| Phase | Files Touched | Layout / Digest Impact | What Ships |
| --- | --- | --- | --- |
| **Phase 1 (Immediate — Zero Layout Change)** | `parrotfishCore.ts`, `projectScene028.ts`, `serialize.ts` | **Zero** (all 0.2.8/0.2.9/0.2.14 digests & coordinates preserved byte-identically) | Neutral elevated card palette, removal of 3.5px left stripe, notation-aware resolver, `<defs>` soft shadows, rounded pill edge-label backgrounds, subtle dot-grid canvas option, upgraded sequence theme, dedicated `sketch` warm palette |
| **Phase 2 (Presentation Icon Kit & Header Pills)** | `parrotfishCore.ts`, `glyphs/index.ts`, `projectScene028.ts` | **Zero** for Parrotfish-injected decorative badges; additive for catalog | 48-icon `24×24` duotone glyph library, squircle icon badges on nodes, anchored container header pills, ERD/UML header band shading + PK/FK pills |
| **Phase 3 (Edition 0.2.15+ / 0.3.0 Card Anatomy & State)** | `renderScene028.ts`, `text/sizing.ts`, `notations/state.ts` | Coordinated new edition | True 3-tier C4/Infra typography measurement (`Title` / `Tech pill` / `Description`), replacing clipart-over-text shapes (`neural-net`, `brain`, `dashboard`) with icon-badged cards, promoting `uml-state` to visual |
