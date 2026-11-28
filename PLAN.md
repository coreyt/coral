# Active Plan

The active release is **Coral 0.2.17**, adding saved-source edition `0.2.17`
visual and hierarchical UML State support and the deterministic zero-LLM
Mermaid.js-to-Coral transpiler across `@coral-viz/language`,
`@coral-viz/render`, `@coral-viz/mcp-server`, and `@coral-viz/diagram-editor`.
The [release plan](dev/releases/0.2.17/plan.md) records the approved scope,
identities, and verification gates.

Saved-source edition `0.2.17` adds visual `uml-state@1.1.0` (`state`,
`composite`, `initial`, `final`, `choice`, `fork`, `join`, `note`) with
`lowfi`, `hifi`, and `anemone` rendering and U2 conformance rules while leaving
frozen `0.2.8`, `0.2.9`, and `0.2.14` catalogs immutable. The Mermaid
transpiler covers Flowchart, Sequence, Class, ER, and State with mandatory
parse-back and display-seam self-verification.

The package version is independent of Language Specification `1.3.0` and
saved-source editions `0.2.8`, `0.2.9`, `0.2.14`, and `0.2.17`. The build uses
Node.js `26.8.2`, npm `12.0.2`, and `@graph-ir/core@0.2.4`; published consumers
retain Node.js `24.19.0` as the minimum runtime.

Current [requirements](dev/requirements.md),
[architecture](dev/ARCHITECTURE.md), [roadmap](dev/ROADMAP.md), and
[contributor guidance](CLAUDE.md) remain authoritative. Coral markup is the
saved source authority.
