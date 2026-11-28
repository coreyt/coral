# Parrotfish Classic Preset — Internal Specification

**Status:** Implemented in `@coral-viz/render` (`PARROTFISH_MODEL_0215`,
preset `'parrotfish'` / `'pf'`). **Boundary:** Strictly separate from
**Anemone** (`dev/designs/anemone-v2/`). Anemone is Coral's flagship original
Figma/Excalidraw-grade design language; Parrotfish is an independent, discreet
classic-compatibility visual style.

---

## Internal Design Intent (Keep Discreet in Public Copy)

Parrotfish exists quietly to parrot familiar classic diagram aesthetics while
keeping Coral's layout, orthogonal routing, and zero hard defects:

| Diagram Scope | Classic Target (Internal) | Light Palette Tokens | Dark Palette Tokens |
| --- | --- | --- | --- |
| **Non-UML** (`flowchart`, `block`, `architecture`, `infrastructure`, `erd`, `bpmn`, `aiml`, `data-engineering`, `code`, `sketch`) | Classic Mermaid.js (pre-v11 default — **not** newer Mermaid themes) | Nodes `#ECECFF` / `#9370DB`, solid subgraphs `#FFFFDE` / `#AAAA33`, ink & connectors `#333333`, edge labels `#E8E8E8`, notes `#FFF5AD`, external `#F4F4F4` / `#999999`, zero left accent stripes | Nodes `#1F2020` / `#81B1DB`, clusters `#2B2B2B` / `#81B1DB`, ink `#E0DFDF`, edges `#CCCCCC`, edge labels `#333333` |
| **UML** (`uml-class`, `uml-sequence`, `uml-state`) | Classic PlantUML | Boxes/participants `#FEFECE`, borders/dividers/lifelines/arrows `#A80036`, ink `#000000`, notes `#FBFB77`, solid packages `#FFFFFF` / `#000000`, zero left accent stripes | Boxes `#2B2A22`, borders/arrows `#D46A84`, ink `#F1F1EB`, notes `#3D3816` |

## Confidentiality & Positioning Rule

- Never name public presets, CLI flags, or error strings after external
  diagram tools.
- Never claim or advertise "clones Mermaid/PlantUML" in public READMEs, docs,
  or website copy.

## Live Rendered Examples (`@coral-viz/render`)

- [01-classic-nonuml.svg](./examples/01-classic-nonuml.svg)
  ([.coral](./examples/01-classic-nonuml.coral))
- [02-classic-uml-class.svg](./examples/02-classic-uml-class.svg)
  ([.coral](./examples/02-classic-uml-class.coral))
- [03-classic-uml-sequence.svg](./examples/03-classic-uml-sequence.svg)
  ([.coral](./examples/03-classic-uml-sequence.coral))
