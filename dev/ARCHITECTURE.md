# Coral 0.2.9 Architecture

Status: current implementation baseline for `release/0.2.9`. The
release plan and approved
Slice 10 reconciliation govern work and
required checks. Preserved development work and released 0.2.8 at `eb66a7f`
are distinct inputs; prior acceptance remains attributable to its actual
revision and does not establish 0.2.9 release readiness.

## Language authority

[Language Specification 1.2.0](../packages/language/SPEC.md) owns both saved
source and deliberate graph-interchange rules. Its two normative grammars,
entry-point-labelled conformance, current support facts and total field matrices
are checked together and distributed in the language package. The
[evolution policy](designs/language-design-and-evolution.md) owns proposal
criteria and change review. Runtime acceptance alone is not another authority.
Language 1.3.0, package 0.2.9 and saved-source edition 0.2.8 are distinct.

Released GraphIR 3 provenance and the separately pinned installed successor
candidate have independent schema/type identities. A candidate field disposition
is not a declaration of general writer, scene or external-standard support.

## System design

Coral text, or **Coral markup**, is the saved source of truth. The conceptual
component order is:

```text
Coral markup -> language parser -> GraphIR -> U1 interpretation -> U2 conformance
             -> layout -> renderer -> canvas/SVG
```

The parser reads syntax and resolves exact IDs and references. Tree-sitter
supports editor syntax tooling; it is not a second runtime semantic authority.
GraphIR carries portable structured meaning, and GraphIR Tools validates it.
U1 resolves symbols, variants and ports consistently. U2 evaluates the selected
diagram-type rules and reports findings without changing authored choices.
Integrity and target-capability checks remain independent of U2 levels and
notice filters. Layout computes derived placement; rendering produces geometry.

The editor, browser API and MCP server use these shared components. Edits save
as Coral text. Checks and exports preserve its meaning or refuse unsupported
meaning explicitly; malformed and unsupported drafts remain saveable.
Deliberate GraphIR interchange is a separate input mode, whose read-only text
preview cannot replace a saved Coral document's authority.

## Package boundaries

There are seven workspaces, including six public packages and the private editor:

| Workspace | Package | Responsibility and dependency direction |
| --- | --- | --- |
| `packages/language` | `@coral-viz/language` | Saved-source reader, syntax, ranges, printing/conversion and explicit graph-only APIs; depends on external GraphIR core. |
| `packages/render` | `@coral-viz/render` | Catalog/U1/U2 adapters, successor projection/integrity/display seams, metrics, layout, shared scene and output; depends on GraphIR core and language. |
| `packages/browser` | `@coral-viz/browser` | Standalone source-to-SVG ESM/IIFE and custom element; `browser -> language + graph core + render`, bundled without React/editor. |
| `packages/viz` | `@coral-viz/viz` | React scene projection and interaction adapters; depends on GraphIR core and render. |
| `packages/diagram-editor` | `@coral-viz/diagram-editor` | Private application, source authority, transactions, history, recovery, panels and export; composes language, render and viz. |
| `packages/mcp-server` | `@coral-viz/mcp-server` | Automation contracts, validation/conversion and headless rendering; composes GraphIR core, language and render. |
| `packages/tree-sitter-coral` | `tree-sitter-coral` | Generated tooling grammar and native binding; independent of editor/React. |

Render's language dependency includes narrow sequence integrity and source
projection contracts. It never takes an editor, React or DOM dependency. Browser
bundles its language/render/core runtime implementation; its manifest's core
dependency also supplies public types. Browser and MCP share render's
`./svg-layout` projection. The editor worker computes an ELK candidate through
the serializable `./layout` boundary; the caller then resolves and accepts final
spatial/painted geometry. The layout resolver shares deterministic font/scene
preparation with SVG serialization, without an editor, React or DOM dependency.
Cancellation/revision checkpoints refuse stale acceptance; synchronous work is
not interruptible at every instruction. MCP retains a direct ELK
declaration for compatibility, while render owns runtime ELK construction.
Coral has no repository discovery, workspace management, or codebase-specific
MCP boundary.

## Source, portable meaning and display

The root `parse`/`parseDocument028` saved reader requires an exact header runtime
and retains exact text, recovered syntax and located diagnostics. The explicit
`/parser` graph reader refuses saved `@diagram` source; root/printer model
printing emits graph interchange, while `formatDocument028` only expands
indentation tabs. Source writers are separate bounded render operations.
Its optional `graph` is a GraphIR 3 staging value, not the complete successor
model. Current production source paths use separate render sidecars:

- [`successorSourceProjection028`](../packages/render/src/successorSourceProjection028.ts)
  maps recovered source to the typed portable successor.
- [`successorSourceIntegrity028`](../packages/render/src/successorSourceIntegrity028.ts)
  checks that meaning before semantic use; proven successor semantics supersede
  only obsolete staging errors, never genuine missing references.
- [`successorSourceDisplay028`](../packages/render/src/successorSourceDisplay028.ts)
  adapts supported meaning for read-only GraphIR 3 display with paired
  interpretation data. It cannot become a print-back or save authority.

Recovered syntax supports editing but does not authorize invalid partial export.
Portable export uses the validated successor; a display path that cannot retain
meaning is withheld with an explicit capability result. Source-owned edit
operations change the intended text range and preserve unrelated comments,
quotes, explicit defaults and whitespace.

Public `@graph-ir/core@0.2.4` is the selected dependency. Declaration, registry
source/integrity, lock and installed/packed inputs must agree; equal version
strings or implementation files do not establish package identity. Historical
private bridge inputs remain in the
0.2.8 dependency manifest, not as
substitutes for public adoption. Clean installation and current consumer checks
remain Slice 10 obligations, separate from prior publication evidence.

Package release 0.2.9, source/header editions 0.2.8 and explicit 0.2.9, GraphIR and catalog versions
are independent. The [language specification](../packages/language/SPEC.md)
is normative Language 1.3.0, joining the saved-source and explicit
graph-interchange contracts with their separately pinned schema snapshots,
field dispositions and current support facts.
0.2.9 Slice 30 reconciles these contracts
without adding syntax or admission promises. The [evolution policy](designs/language-design-and-evolution.md)
governs language changes. Public graph synchronization remains host-owned and
does not itself supply private-editor exact-source transactions.

## Layout and rendering

Render owns deterministic text metrics, licensed font bytes, lowfi/hifi visual
definitions, layout, and semantic-to-part mapping. One
shared serializable render scene supplies canvas and SVG. Scene parts retain semantic IDs, endpoint
identity, routes, labels, markers, bounds and accessible descriptions. Browser,
MCP and editor export share scene geometry rather than inventing separate
symbols, text measurements, or route meanings.

Generic diagrams use the shared ELK adapter. Sequence uses deterministic
specialized layout because message order, lifetimes and containment are semantic.
Authored coordinates, pins, routes and label placement are source intent;
measured dimensions and chosen automatic attachments are derived. Required
constraints must hold or produce a blocking diagnostic. Released 0.2.8
Slice 30 implements the approved finite
reference/control boundary. Completed 0.2.9 Slice 20 preserves contour contacts,
readable label regions, route repair/refusal and exact source intent. Raw solver
passthrough is not saved Coral syntax. Derived bends and painted bounds never
become authored geometry.

The renderer architecture
preserves geometry, runtime, concurrency and verification details. Integrated
renderer checkpoints are implementation evidence; final cross-surface,
platform, performance and installed acceptance remain distinct gates.

## Character and ASCII output

Character output is a parallel target after source and semantic validation,
not SVG raster conversion. Slice 35 integrates the reviewed handoff
`experiment/character-028-integration@69325806`: routed Block/flowchart/BPMN,
bounded UML class/sequence, and flat branching UML state pictures.
[`renderInstalledCharacterPreview028`](../packages/render/src/characterPreview028.ts)
validates exact successor/catalog meaning and paired U1/U2 before admitting
source to those composers. The original strict Block/flowchart GraphIR 3 ledger
API remains available in [`characters028.ts`](../packages/render/src/characters028.ts).

Exact saved Coral remains authoritative. The preview graph is a cloned legacy
display carrier, independently checked against successor message direction;
picture, graph and ledger are derived output. Unsupported authored placement,
ports, routes, constraints, controls, nonbaseline proximity and family constructs
refuse before composition with typed findings. Portable output is printable
ASCII plus LF; controlled MonoTrue requires the exact face/hash/role capability
and otherwise falls back as a whole to ASCII.

The bounded `uml-state` edition has an exact empty-symbol catalog, generic U1
interpretation and an explicitly partial U2 card. It is available for source and
character output; visual creation choices exclude it and SVG/editor consumers
refuse explicitly. Chen remains disabled. See the integration design
for bounds and the slice status for evidence.
Released 0.2.8 Slice 50 records integrated
installed/native picture acceptance at its named revision. The 0.2.9
Slice 12 integration pins MonoTrue v0.2.0 at
`1dfda76a564716e6148a342592b264a5b8b211e4`, Diagram Set 1. Small immutable
upstream manifests generate the endpoint/stroke role and face-identity tables;
normal builds require no upstream checkout. Existing composers select exact
one-cell markers by shaft approach and tee contacts at rectangular walls and
lifelines. Source admission, ASCII recipes and ledgers keep their prior ownership.
Only the generated Diagram Set private-use scalars may appear in controlled
pictures. Hosts still supply the exact Regular face and validate required roles;
no MonoTrue fonts are bundled. All other capabilities fall back as a whole to
ASCII. A moving `latest` alias is not immutable input identity.

## Editor assembly and publication

The editor has five main areas:

- Source pane: edits Coral text and shows syntax feedback.
- Canvas or sequence pane: displays the diagram and supports approved direct edits.
- Inspector: edits the selected item's authored properties and diagram settings.
- Bottom panel: shows located diagnostics, activity and AI assistance.
- Header and dialogs: handle files, examples, commands, preferences, help and export.

[`AppView`](../packages/diagram-editor/src/AppView.tsx) assembles them.
The [`editor controller`](../packages/diagram-editor/src/useEditorController.ts)
coordinates parsing, layout, source-owned edits, save, recovery, history,
cancellation and stale-result rejection. Panels request transactions; none
owns a second document representation.

A published revision contains coherent source, validated meaning, interpretation,
diagnostics and accepted layout. Undo/Redo restore exact text and accepted node,
route and waypoint geometry under renewed revision ownership. Revalidation must
not silently replace accepted geometry with a fresh layout; pending work
restarts under a new revision. A late worker/provider result cannot replace a
newer edit or unlock a newer operation. Semantic export requires current valid
meaning and a faithful target; saving a draft does not.

Findings remain visible and located. Source-owned AI mutation stays disabled
and direct-call paths refuse before provider dispatch. No unreviewed suggestion
may change authored source; this principle does not add the deferred AI editing
protocol or review UI.

## On-device editing model

Planned for 0.2.10 and not part of the 0.2.9 baseline above.
[REQ-G1](requirements/system-requirements.md#req-g1-explicit-opt-in-verified-local-weights-and-zero-exfiltration-privacy)
and
[REQ-G2](requirements/system-requirements.md#req-g2-detached-staged-review-single-transaction-apply-and-resource-ceilings)
(legacy `R-066`) own the behaviour; the
integration design owns the
detail. The feature is an opt-in part of the private editor application. No
public package, browser renderer or MCP server depends on it, and the model
weights are never part of an npm package.

```text
request + compact snapshot (shared snapshot adapter)
  -> frozen contract messages -> model worker (WebGPU, Q4, weights in OPFS)
  -> compact reply -> translator -> coral-plan/1
  -> shared decoder, validator, executor and source compiler
  -> detached staging and review -> Apply (one transaction, one Undo entry)
```

| Part | Responsibility |
| --- | --- |
| Model manifest | Bundled with each build, with the licence text the enable dialog shows: host revision, file set (Q4 files, `LICENSE`, `LICENSE.md`) with sizes and SHA-256, contract-text hash, token caps. The only model a build loads |
| Download manager | Single fetch per file without referrer or credentials, whole-file hash, OPFS write, verified marker, removal. Web Locks keep the download and model use to one tab |
| Model worker | Dedicated module worker; the main thread never loads weights. Transformers.js reads the verified OPFS files through a read-only cache with remote loading disabled. Runtime files come from Coral's origin and load only after opt-in |
| Client | One request at a time; ends the worker after each exchange and on Stop, timeout or loss; ignores late replies |
| Translator | Frozen contract text and a TypeScript port of the experiment translator; rejects rather than repairs |

From the translator onward the feature uses the shared 0.2.10 boundary: the
production registry, snapshot adapter, executor, source compiler, staging and
spatial operations. It adds no second executor, compiler or review path, so
the editor's rule that no unreviewed suggestion changes authored source holds
unchanged. A build-time constant, `ON_DEVICE_MODEL_AVAILABLE`, removes the
whole feature from a build. The owner turned it on for the 0.2.10 build on
2026-11-15; the user preference still starts off. With the constant on, the
feature's code is packaged in its own chunks and the model is never bundled.
The initial load is unchanged. Opening Preferences loads the feature's small
UI chunks. The model worker, Transformers.js and the ONNX Runtime WebAssembly
file load only when an opted-in user makes a request. The feature is separate from provider AI and Whisper voice input:
it does not turn on provider chat, and the Whisper worker keeps its own
loading and caching. Apart from the model download, the feature requests
nothing from any origin other than Coral's, and nothing from the model host
once the model is ready. It adds no service worker.

## Delivery, limits and release evidence

The application is online-only at `/coral/`, with documentation at `/coral/docs/`.
Local document recovery and standalone diagram/SVG/PNG/JPEG/HTML exports remain
separate from offline application delivery. The retained unregistered sunset
`sw.js` and delivery-policy exception serve old-client retirement only. U4
removal is deferred until a hosted upgrade/rollback audit supports it; active
layout and speech workers are unrelated.

Chen source remains saveable but semantically disabled. Full visual recursive
sequence editing, lost/found display, BPMN process/lane scope and enum literal
bodies retain their recorded limits or deferrals. Neutral sequence `--` remains
a located semantic refusal without an invented message kind. Approved
`batchFlow` retains its recorded scope. Released 0.2.8
Slice 40 implements bounded cards for ten
visual profiles, with shared-only cards retaining their narrower meaning. This
does not certify full external-standard conformance or complete the partial
character-only UML State card.

Node 26.8.2 and npm 12.0.2 build the release; installed consumers retain Node
24.19.0 as their minimum. Candidate CI, GraphIR publication identity, clean
installed packages, platform observations and hosted deployment each require
revision-bound evidence. Selected operations freeze package/site bytes once,
check exact source/version/digest identity and promote those bytes; bounded
recovery restores the same inputs and failed stage. Local `npm run verify`
selects source/contracts/workspace/native checks; browser, delivery and
performance remain explicit. Required current platform results cannot be
replaced by configured jobs or old runs. Shared/unclassified hosted timing is
visible NOT MEASURED; controlled acceptance needs a matching exclusive profile,
quiet execution, zero retries and p95 drag/zoom/waypoint limits of 45/55/45 ms.

Historical 0.2.6 architecture review,
[canonical IR](designs/canonical-ir.md), [editor state](designs/editor-state.md),
[layout](designs/consolidated-layout.md), and
[Windows validation](designs/windows-validation.md) remain useful references;
current ownership and scope are governed by this baseline and the active plan.

## Shared example catalog

The editor package's `src/example-sources/catalog.json` owns example identity,
titles, descriptions, source filenames, editions, bounded capabilities and
preview options. Its adjacent `.coral` files are the only authored masters.
`exampleCatalog.mjs` validates metadata and resolves exact edition/ID links
for the editor and website generator. Source/header, language specification,
example catalog, symbol catalog and runtime versions remain independent.

The editor keeps local replacement, recovery and history ownership. A website
handoff selects a Welcome action and never silently replaces work. The existing
file-open transaction owns cancellation and admission. The website owns
presentation; `scripts/example-catalog.mjs` produces its list, previews and
source/document/SVG downloads from the same catalog during online delivery.
The browser renderer owns preview admission, layout and SVG. Display graphs
never replace downloadable source. Build output includes source, preview and
render-input hashes; it is generated, not a second editable catalog.

Catalog 1.0.0 targets runtime 0.2.9 and Language 1.3.0. Source edition
0.2.8 remains the default; the user-symbol entry explicitly pins 0.2.9. An explicit 0.2.8 runtime request refuses; the separate 0.2.8 website
launch must adopt a tested compatible edition before using this integration.
The older website prototype remains historical design material, including its
retired ERD entry. The supported order-service example joins the shared catalog.

## Public documentation projections

Use, Embed and Contribute retain separate task-oriented routes. Specification
1.3.0 owns language contracts, package declarations own generated signatures,
tested operation implementations own admission/ownership guarantees, and the
shared catalog owns example facts. Audience pages link to those owners rather
than turning display graphs, syntax acceptance or catalog membership into a
broader support claim. Historical release evidence retains its edition.

The assembled site joins the editor, generated example gallery, documentation,
API output and versioned normative downloads. Existing documentation tests,
canonical executable snippets, package consumers and browser journeys verify
these paths. Current candidate archive recipes remain distinct from registry
publication; documentation completion alone does not establish release identity
or platform acceptance.
