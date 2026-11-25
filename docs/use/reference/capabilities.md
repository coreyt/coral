# Capability matrix

Supported subsets in the Coral 0.2.12 implementation. The language contract is
[Specification 1.3.0](../../embed/reference/language-specification-1.3.0.md);
saved source defaults to edition 0.2.8, with explicitly pinned edition 0.2.9
for document-local symbols. Parsing, source validation, notation checks
and target support have separate guarantees. This page does not establish
publication or new platform measurements for 0.2.9.

| ID | Status | Claim and boundary |
| --- | --- | --- |
| `boundary-online` | Supported | The application is online-hosted; the root `sw.js` only retires the 0.2.5 worker. |
| `my-icons` | Supported | [Import icons](../how-to/import-icons.md), store them in this browser, and place self-contained definitions in saved Coral source; bounded SVG profile and browser storage limits apply. |
| `boundary-local-ownership` | Supported | Documents, recovery state, and ordinary exports stay in the browser or files you save. |
| `boundary-network` | Partial | Application loading uses the network; ordinary editing does not upload diagrams. The opt-in on-device editing model downloads its model once, and its requests stay in the browser. |
| `boundary-retired-offline` | Unsupported | There is no installable/offline application mode or downloadable application ZIP/checksum. |

## Source and rendering boundaries

Ten visual profiles use exact saved Coral source and the approved bounded U2
inventory. Explicit strict checks certify only that versioned Coral inventory,
never full external-standard conformance. Character-only UML State retains a
partial card and an unverified notation-rule inventory. Applicable direction,
port and scene evidence limits can still prevent a conformance claim.

The six-family character/ASCII renderer covers Block, flowchart, BPMN, UML
class, sequence and bounded flat UML state. MonoTrue v0.2.0 Diagram Set 1 is
integrated and has actual-font and packed-consumer checks. Controlled MonoTrue
pictures require the supported host font capability; missing or wrong capability
and ordinary copy/export use whole-picture ASCII. This does not certify a new
native terminal host. See the [character API](../../embed/reference/render-api.md#character-output)
for exact family sizes, refused constructs and font requirements.

## Tested notation subsets

| ID | Example-tested subset | Important limit |
| --- | --- | --- |
| `notation-block` | Functional blocks and signal connections | Bounded installed vocabulary, no circuit simulation |
| `notation-flowchart` | Terminal, process, decision, start/end variants, flow edges | Smaller than the full catalog |
| `notation-bpmn` | Start/end events, task, exclusive gateway, user glyph, sequence edges | Not complete BPMN conformance |
| `notation-erd` | Disabled | Authored text remains saveable; no visual editor or rendering support |
| `notation-code` | Module, class, function, variable, abstract/static, containment | No source-code analysis |
| `notation-architecture` | Actor, service, database, API glyph, sync/data edges | No C4 or vendor-specific cloud icon sets |
| `notation-aiml` | Dataset, training, model, inference, training/inference edges | No model execution or inspection |
| `notation-data-engineering` | Source, transform, quality, warehouse, sink, batch/quality edges | No platform connection or pipeline execution |
| `notation-sketch` | Cloud, decision, step, flow edges | No UI wireframes or freehand drawing |
| `notation-uml-class` | Structured class/interface/enum, members, finite relationships, Coral/Mermaid import, canvas/SVG/browser render | No complete UML, packages/templates, association classes, arbitrary stereotypes, UML export, or AI UML generation |
| `notation-uml-sequence` | Ordered participants/messages, recursive fragments, scoped activations, notes and admitted SVG/browser rendering | Target-capability findings refuse unsupported meaning; foreign import is bounded and full structured visual editing remains separate |

Catalog membership alone is not a support claim. The
[shared examples](../how-to/start-from-an-example.md) exercise admitted source,
editor opening, rendering and downloads; they do not certify every catalog
construct. Source that a target cannot represent remains saveable, while the
unsupported target operation refuses.

## Public packages

| ID | Package | Owned job |
| --- | --- | --- |
| `package-language` | `@coral-viz/language` | Runtime parse/print/import/diagnostics/repair |
| `package-render` | `@coral-viz/render` | DOM-free layout and SVG/HTML rendering |
| `package-browser` | `@coral-viz/browser` | Coral-source ESM/IIFE/DOM/custom-element rendering |
| `package-viz` | `@coral-viz/viz` | React 18/19 editing components and view helpers |
| `package-mcp` | `@coral-viz/mcp-server` | Seven diagram and conformance tools over MCP stdio |
| `package-tree-sitter` | `tree-sitter-coral` | Native syntax tooling for saved-source editions 0.2.8 and 0.2.9; no semantic validation |

## Platform claims

| ID | Status | Evidence boundary |
| --- | --- | --- |
| `platform-chrome-desktop` | Supported | Chrome desktop web application; hosted Chromium end-to-end tests and the Slice 92 user journeys pass before publication. |
| `platform-edge` | Experimental | Edge desktop may work; no support claim is made. |
| `platform-safari` | Experimental | Safari desktop may work; Playwright WebKit is not Safari evidence. |
| `platform-firefox` | Experimental | Firefox desktop as a web application; Coral cannot be installed from Firefox. |
| `platform-accessibility` | Experimental | Keyboard operation is tested in Chromium; NVDA and VoiceOver are untested. |
| `platform-voice-input` | Unsupported | Composer voice input is not available. |
| `platform-native-packages` | Supported | Supported package platforms are Linux x64, Windows x64 and macOS arm64; minimum Node.js 24.19.0. Each release requires its own installed-package evidence. |
| `platform-mobile` | Unsupported | Mobile browsers are not supported. |

The unsupported product families are explicit: C4, vendor-specific cloud
iconography, UI wireframes, and complete UML are not supported capabilities.

## Related

- [Notation libraries](notations.md)
- [Browser support](browser-support.md)
- [Start from an example](../how-to/start-from-an-example.md)
- [Conversion support](conversion-support.md)
