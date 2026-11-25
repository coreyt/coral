# Architecture

Workspace ownership and dependency direction for contributors; public package
usage belongs in the Embed Coral pages.

| Workspace | Package | Responsibility | Direct Coral dependencies |
| --- | --- | --- | --- |
| `packages/language` | `@coral-viz/language` | Coral parsing, printing, conversion, diagnostics, and repair | None |
| `packages/render` | `@coral-viz/render` | Catalog interpretation, conformance, successor adapters, deterministic metrics, layout, shared scene and outputs | `@coral-viz/language` |
| `packages/browser` | `@coral-viz/browser` | Coral source to accessible SVG in ordinary web pages: one bundled ES module and one self-contained IIFE | `@coral-viz/language`, `@coral-viz/render` (bundled) |
| `packages/viz` | `@coral-viz/viz` | React editing components and GraphIR-to-view adaptation | `@coral-viz/render` |
| `packages/diagram-editor` | `@coral-viz/diagram-editor` | Private hosted web application, document state, AI, and voice surfaces | `@coral-viz/language`, `@coral-viz/viz`, `@coral-viz/render` |
| `packages/mcp-server` | `@coral-viz/mcp-server` | MCP parsing, conversion, generation, layout, and rendering tools | `@coral-viz/language`, `@coral-viz/render` |
| `packages/tree-sitter-coral` | `tree-sitter-coral` | Independently generated syntax grammar and native parser binding | None |

## Core boundary

Coral markup is the saved source authority. The runtime reader retains exact
text, recovered syntax and located diagnostics; its optional graph is a
GraphIR 3 staging value. Separate `successorSourceProjection028`,
`successorSourceIntegrity028` and `successorSourceDisplay028` adapters produce
validated portable meaning and a supported read-only display. The display
cannot replace authored text or portable export.

`@graph-ir/core` is an external schema and validation dependency, not a Coral
workspace. The selected 0.2.9 baseline pins published `@graph-ir/core@0.2.4`
exactly, with source/integrity verified across declarations, lock and installed
packages. Historical private bridge artifacts do not substitute for that
identity. GraphIR specification publication retains its separate scope.
U1 resolves symbols, variants and ports; U2 reports notation findings.
Integrity and target-capability failures remain independent of notation levels.
Resolved layout is revision-bound geometry and does not rewrite source intent.

## Dependency direction

Dependencies flow from application and adapters toward language, render, and
the external graph core. Language and render do not depend on the editor or on
React. Render depends on language for source and sequence-integrity contracts.
Viz depends on render. The private diagram editor composes language,
viz, and render. The MCP server composes graph core, language, and render.
The browser package bundles graph core, language, and render, and shares
`@coral-viz/render/svg-layout` with MCP `coral_render`.

The MCP package retains a direct ELK dependency for 0.2.x compatibility, but
runtime ELK construction belongs to the additive
`@coral-viz/render/layout` entry point.

## Runtime and tooling parsers

The TypeScript saved-source reader in `@coral-viz/language` retains the 0.2.8
source/header edition in 0.2.9 packages; explicit graph-only interchange uses a
separate entry. [Language Specification 1.3.0](../../embed/reference/language-specification-1.3.0.md)
defines both contracts; language, source/header and package versions remain
independent.
`tree-sitter-coral` is independent syntax tooling and does not replace that
runtime boundary.

## Rendering and editor state

A shared serializable render scene supplies canvas and SVG geometry, including
semantic IDs, endpoint marks, routes, labels and accessible descriptions.
Generic diagrams use the shared ELK boundary; sequence order uses specialized
deterministic layout. Character/ASCII output is a parallel target after semantic
checks, not a conversion from SVG pixels. The editor worker computes an ELK
candidate; the caller performs final spatial/painted-geometry acceptance using
shared deterministic metrics. Cancellation and revision checks reject stale
results without promising instruction-level interruption of synchronous work.

The six-family character pipeline is integrated for Block, flowchart, BPMN,
UML class, sequence and bounded flat UML state; the strict Block/flowchart
GraphIR ledger remains available. Saved state source and character output have
a declared partial U2 card, while SVG/editor state support refuse and Chen
remains disabled. Released 0.2.8 acceptance stays attributable to its actual
revision. MonoTrue v0.2.0 Diagram Set 1 integration and actual-font acceptance
are complete in 0.2.9 Slice 12.
Missing or wrong MonoTrue capability retains whole-picture ASCII fallback.

The source pane, canvas or sequence pane, Inspector, bottom panel, and header
with dialogs compose the editor. The controller owns source edits, history,
recovery and publication. Undo/Redo restore coherent source, meaning and accepted
geometry; stale work cannot replace a newer revision. Source-owned AI mutation
remains disabled pending its separate source-authority contract.

## Product assembly

The private editor builds the online-only application at `/coral/`. VitePress
builds the three documentation audience trees under `/coral/docs/`. Online delivery
adds the shared gallery at `/coral/examples/` and freezes these outputs into
one integrity-checked hosted directory and rejects retired
install manifests, active service-worker delivery, ZIP and archive-checksum
outputs. The byte-exact unregistered sunset worker remains a documented
old-client exception; removal is deferred pending upgrade/rollback evidence.
Published libraries remain separate npm artifacts. Final candidate CI, installed
packages, platform observations and hosted readback each require their own
revision-bound evidence.

## Example and documentation ownership

The editor's `src/example-sources/catalog.json` and adjacent Coral sources own
example identity, editions, support limits and preview inputs. Website lists,
source/document/SVG downloads and editor handoffs derive from that catalog.
A linked example requires explicit opening; replacement, recovery and history
remain editor responsibilities. The catalog refuses incompatible editions.

Language Specification 1.3.0 owns language contracts; package declarations own
generated API signatures. Use, Embed and Contribute explain tasks and link to
those owners. Runtime admission, notation checks and target support remain
separate: a parse, rendered preview or generated API signature alone does not
prove a supported operation or full external-standard conformance.

## Related

- [Get started with Coral](../get-started.md)
- [Testing](testing.md)
- [Generated assets and dependencies](generated-assets-and-dependencies.md)
