# Capability matrix

Supported subsets in the Coral 0.2.17 implementation. The language contract is
[Specification 1.3.0](../../embed/reference/language-specification-1.3.0.md).
Saved source defaults to edition `0.2.8`; explicit `@coralVersion` headers
select `0.2.9` (document-local symbols), `0.2.14` (Crow's Foot ERD, C4-grade
architecture, cloud infrastructure, freeform blocks, and inline styles), or
`0.2.17` (visual and hierarchical UML State). Parsing, source validation,
notation checks, and target support have separate guarantees.

| ID | Status | Claim and boundary |
| --- | --- | --- |
| `boundary-text-renderer` | Supported | Paginated documents and code comments across five surfaces for all 13 notations. |
| `boundary-online` | Supported | The application is online-hosted; the root `sw.js` only retires the 0.2.5 worker. |
| `my-icons` | Supported | [Import icons](../how-to/import-icons.md), store them in this browser, and place self-contained definitions in saved Coral source; bounded SVG profile and browser storage limits apply. |
| `boundary-local-ownership` | Supported | Documents, recovery state, and ordinary exports stay in the browser or files you save. |
| `boundary-network` | Partial | Application loading uses the network; ordinary editing does not upload diagrams. The opt-in on-device editing model downloads its model once, and its requests stay in the browser. |
| `boundary-retired-offline` | Unsupported | There is no installable/offline application mode or downloadable application ZIP/checksum. |

## Source and rendering boundaries

Visual profiles use exact saved Coral source and bounded versioned U2
inventories (`0.2.8` for the ten baseline visual profiles, `0.2.14` for Crow's
Foot ERD, C4-grade architecture, and cloud infrastructure, and `0.2.17` for
visual hierarchical UML State). Explicit strict checks certify only those
versioned Coral inventories, never full external-standard conformance. Edition
`0.2.8` UML State remains character-only with a partial card; edition `0.2.17`
adds visual rendering and a bounded U2 ruleset. Applicable direction, port, and
scene evidence limits can still prevent a conformance claim.

Monochrome `lowfi` and `hifi` stay basic black-and-white outputs; the
`parrotfish` renderer in `@coral-viz/render` adds the `anemone` (`ane`) modeled
presentation style without altering layout or edge routing.

The plain-text renderer supports architecture, infrastructure, flowchart,
ERD, UML sequence, UML state, UML class, block, BPMN, AI/ML, data engineering,
code, and sketch. Export a paginated ASCII document
or copy a compact code comment from the editor. The CLI, browser, MCP, and
render package use the same text profiles. Controlled displays can select
MonoTrue v0.2.0 Regular with a verified font capability. See the
[character API](../../embed/reference/render-api.md#character-output).

## Tested notation subsets

| ID | Edition and tested subset | Important limit |
| --- | --- | --- |
| `notation-block` | `0.2.8` blocks/signals; `0.2.14` adds 10 freeform shapes (`box`, `rounded`, `circle`, `oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`) and inline `[style]` | Bounded installed vocabulary, no circuit simulation |
| `notation-flowchart` | `0.2.8` terminal, process, decision, start/end variants, flow edges | Smaller than the full ISO 5807 catalog |
| `notation-bpmn` | `0.2.8` start/end events, task, exclusive gateway, user glyph, sequence edges | Not complete BPMN conformance |
| `notation-erd` | `0.2.14` Crow's Foot ERD (`entity`, `columns` with PK/FK/UK/nullability, Crow's Foot connectors); Chen ERD remains disabled in `0.2.8` and retired in `0.2.14` | Not a complete logical or physical data-modeling system |
| `notation-code` | `0.2.8` module, class, function, variable, abstract/static, containment | No source-code analysis |
| `notation-architecture` | `0.2.8` actor, service, database, API glyph; `0.2.14` adds C4-grade nodes (`person`, `system`, `externalSystem`, `container`, `component`, boundaries) and `technology`/`description` metadata; `infrastructure` (`0.2.14`) adds cloud nodes with built-in geometric glyphs and imported vendor artwork via My Icons | Individual diagram scope; proprietary vendor-specific cloud icon packs are not bundled |
| `notation-aiml` | `0.2.8` dataset, training, model, inference, training/inference edges | No model execution or inspection |
| `notation-data-engineering` | `0.2.8` source, transform, quality, warehouse, sink, batch/quality edges | No platform connection or pipeline execution |
| `notation-sketch` | `0.2.8` cloud, decision, step, flow edges | No UI wireframes or freehand drawing |
| `notation-uml-class` | `0.2.8`/`0.2.14` structured class/interface/enum, members, finite relationships, Coral/Mermaid conversion, canvas/SVG/browser render | No complete UML 2.5, packages/templates, association classes, arbitrary stereotypes, UML export, or AI UML generation |
| `notation-uml-sequence` | `0.2.8`/`0.2.14` ordered participants/messages, recursive fragments, scoped activations, notes, Mermaid conversion, and admitted SVG/browser rendering | Target-capability findings refuse unsupported meaning; full structured visual editing remains separate |

Edition `0.2.17` (`@coralVersion "0.2.17"`) also enables visual and hierarchical
`@diagram uml-state` (`uml-state@1.1.0`) with `state`, nested `composite`,
`initial`, `final`, `choice`, `fork`, `join`, and `note`. Edition `0.2.8`
`@diagram uml-state` remains character-only.

Catalog membership alone is not a support claim. The
[shared examples](../how-to/start-from-an-example.md) exercise admitted source,
editor opening, rendering, and downloads; they do not certify every catalog
construct. Source that a target cannot represent remains saveable, while the
unsupported target operation refuses.

## Public packages

| ID | Package | Owned job |
| --- | --- | --- |
| `package-language` | `@coral-viz/language` | Runtime parse, print, import, Mermaid transpilation, diagnostics, and repair |
| `package-render` | `@coral-viz/render` | DOM-free layout, SVG/HTML/ASCII rendering, `parrotfish`/`anemone`, verified Mermaid transpilation, and standalone `coral` CLI (`validate`, `render`, `convert`) |
| `package-browser` | `@coral-viz/browser` | Coral-source ESM/IIFE/DOM/custom-element rendering |
| `package-viz` | `@coral-viz/viz` | React 18/19 editing components and view helpers |
| `package-mcp` | `@coral-viz/mcp-server` | Seven diagram, conversion, and conformance tools over MCP stdio (`coral-mcp`) |
| `package-tree-sitter` | `tree-sitter-coral` | Native syntax tooling for saved-source editions `0.2.8`, `0.2.9`, `0.2.14`, and `0.2.17`; no semantic validation |

## Platform claims

| ID | Status | Evidence boundary |
| --- | --- | --- |
| `platform-chrome-desktop` | Supported | Chrome desktop web application; hosted Chromium end-to-end tests and the Slice 92 user journeys pass before publication. |
| `platform-edge` | Experimental | Edge desktop may work; no support claim is made. |
| `platform-safari` | Experimental | Safari desktop may work; Playwright WebKit is not Safari evidence. |
| `platform-firefox` | Experimental | Firefox desktop as a web application; Coral cannot be installed from Firefox. |
| `platform-accessibility` | Experimental | Keyboard operation is tested in Chromium; NVDA and VoiceOver are untested. |
| `platform-voice-input` | Unsupported | Composer voice input is not available. |
| `platform-native-packages` | Supported | Supported package platforms are Linux x64, Windows x64, and macOS arm64; minimum Node.js 24.19.0. Each release requires its own installed-package evidence. |
| `platform-mobile` | Unsupported | Mobile browsers are not supported. |

The unsupported product families remain explicit: proprietary vendor-specific
cloud icon packs (use built-in geometric infrastructure glyphs or import your
own SVG artwork via My Icons), UI wireframes, and complete UML 2.5 are not
supported capabilities.

## Related

- [Notation libraries](notations.md)
- [Browser support](browser-support.md)
- [Start from an example](../how-to/start-from-an-example.md)
- [Conversion support](conversion-support.md)
