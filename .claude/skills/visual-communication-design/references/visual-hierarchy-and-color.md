# Visual Hierarchy, Typography & Perceptual Color

Reference guide for the `visual-communication-design` skill.

## 1. Perceptual Color Architecture (OKLCH-Informed)

Colors in technical diagrams must maintain **equal perceived brightness** across
hues so an amber database does not visually scream louder than an indigo
service or disappear against a light canvas.

### The Four Surface Tiers (Light & Dark)

| Tier | Role | Light Value | Dark Value | Notes |
| --- | --- | --- | --- | --- |
| **L0 — Canvas** | Outer diagram ground (optionally with subtle dot grid at 3–5% ink) | `#F8FAFC` (cool) or `#FAF9F6` (warm sketch) | `#0B0F17` | Slight off-white lets pure white cards lift naturally without heavy borders |
| **L1 — Zone / Container** | Outer boundary (System, VPC, Pool) | `#F1F5F9` (65% alpha / tinted) | `#111827` | Subtle step down/up from canvas; never high-saturation |
| **L2 — Nested Zone** | Sub-boundary (Subnet, Container Boundary, Lane) | `#E9EFF6` / `#FFFFFF80` | `#162032` | Clear nesting differentiation without thicker borders |
| **L3 — Elevated Card** | Primary diagram nodes | `#FFFFFF` | `#1A2234` | Crisp `1px` border + subtle dual-layer shadow |

### Restrained Semantic Accent Palette (Max 3–4 Hues per Diagram)

Use **tinted neutral cards** with **semantic accents concentrated in icon badges,
thin top/header markers, and selective connector coding**:

| Semantic Role | Light Badge Fill | Light Accent Ink | Light Soft Tint | Dark Badge Fill | Dark Accent Ink |
| --- | --- | --- | --- | --- | --- |
| **Primary / Core Service** (Blue/Indigo) | `#EEF2FF` | `#4338CA` | `#F5F7FF` | `#1E2547` | `#818CF8` |
| **Compute / Runtime** (Teal/Cyan) | `#ECFEFF` | `#0E7490` | `#F2FCFD` | `#122D36` | `#22D3EE` |
| **Data / Persistence** (Amber/Gold) | `#FEF3C7` | `#B45309` | `#FFFDF5` | `#33240F` | `#FBBF24` |
| **Async / Events / AI** (Violet) | `#F3E8FF` | `#7E22CE` | `#FAF5FF` | `#291A3F` | `#C084FC` |
| **Edge / Gateway / Network** (Sky) | `#E0F2FE` | `#0369A1` | `#F4FAFF` | `#10293D` | `#38BDF8` |
| **Actor / Human / Coral Brand** (Rose/Coral) | `#FFE4E6` | `#BE123C` | `#FFF5F6` | `#361620` | `#FB7185` |
| **Success / Start / Pass** (Emerald) | `#D1FAE5` | `#047857` | `#F3FDF8` | `#0F2D22` | `#34D399` |
| **External / Neutral / Infra** (Slate) | `#F1F5F9` | `#475569` | `#F8FAFC` | `#1F2937` | `#94A3B8` |

### Contrast Requirements

- **Primary node title vs. card fill:** >= `10:1` (AAA) — e.g. `#0F172A` on `#FFFFFF`, `#F1F5F9` on `#1A2234`.
- **Secondary description / subtitle vs. card fill:** >= `4.8:1` (AA+) — e.g. `#475569` on `#FFFFFF`, `#94A3B8` on `#1A2234`.
- **Badge/pill label vs. pill fill:** >= `4.5:1` (AA).
- **Node border vs. canvas/zone:** >= `1.6:1` subtle structure, reinforced by elevation shadow; semantic connectors >= `3.0:1`.
- **Color-blind resilience:** Never encode meaning by color alone — pair hue with **shape/icon**, **dash pattern** (solid sync vs. dashed async vs. dotted annotation), and **explicit text labels**.

## 2. Typographic Scale for Diagrams

| Slot | Font Family | Size | Weight | Tracking | Line Height |
| --- | --- | --- | --- | --- | --- |
| **Diagram Title** (optional frame) | Sans | `18px` | `700` | `-0.02em` | `1.25` |
| **Container Header Pill** | Sans | `11px` | `600` | `+0.04em` (or Title Case `12px`) | `1.2` |
| **Node Primary Title** | Sans | `13.5px` | `600` | `-0.01em` | `1.3` |
| **Technology / Stereotype Badge** | Mono or Sans | `10.5px` | `500` | `+0.01em` | `1.2` |
| **Node Description** | Sans | `11.5px` | `400` | `0` | `1.4` |
| **Compartment Row (ERD/UML)** | Mono / Sans | `11.5px` | `400` (`600` for PK/method) | `0` | `1.45` |
| **Edge Primary Label** | Sans | `11.5px` | `500` | `0` | `1.25` |
| **Edge Protocol / Endpoint Meta** | Mono | `10px` | `500` | `+0.01em` | `1.2` |
| **Sketch Hand-Lettered Title** | Hand (`Caveat` / `Virgil`) | `18–20px` | `600` | `0` | `1.2` |

## 3. Spatial Geometry & Elevation Rules

- **Base grid:** `4px` spatial unit (`8, 12, 16, 20, 24, 32px` steps).
- **Corner radii:**
  - Compact pills/badges: `4–6px` (or full pill `999px` for status/technology chips).
  - Standard nodes/cards: `10–12px` (precision) or subtle organic `10px` (sketch).
  - Inner icon squircle: `7–8px` (concentric with card corner when inset by `10–12px`).
  - Containers/zones: `14–16px` (always larger than child node radius).
- **Elevation (SVG `<filter>`):**
  - **Rested card shadow (light):** `dy=1 blur=2 opacity=0.05` + `dy=4 blur=10 opacity=0.06` (`#0F172A`).
  - **Elevated focal card / participant:** `dy=2 blur=4 opacity=0.06` + `dy=8 blur=18 opacity=0.08`.
  - **Dark mode elevation:** Do not rely on dark shadows alone; use a subtle `1px` top-edge inner highlight (`rgba(255,255,255,0.06)`) + crisp border luminance step.
- **Connectors:**
  - Orthogonal elbows with consistent `8–10px` corner radius (`Q` arc) when clear of obstacles.
  - Crisp, compact arrowheads (`8×6px` closed sleek chevron or open `1.5px` V-head) — never oversized bulky triangles.
  - Subtle background halo/pill on every edge label so lines never slice through characters.
