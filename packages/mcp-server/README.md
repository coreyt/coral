# @coral-viz/mcp-server

## Coral 0.2.15

Install verified 0.2.15 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
Existing examples retain their documented compatibility API contracts.

Seven bounded Coral diagram tools over MCP stdio.

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-language-0.2.15.tgz ./coral-viz-render-0.2.15.tgz ./coral-viz-mcp-server-0.2.15.tgz
```

Run the installed executable:

```sh
npx --no-install coral-mcp
```

The server exposes `coral_generate`, `coral_validate`, `coral_convert`,
`coral_layout`, `coral_render`, `coral_explain`, and `coral_check_conformance`. Documents are returned in
`content[].text`; structured content is metadata. Tools use distinct validation
and error envelopes, so clients must check `isError` as well as transport
failures.

`coral_check_conformance` uses the saved `@conformanceLevel` (default `typical`)
for Coral source; `level` (`none`, `typical`, `strict`) overrides only that check.
GraphIR 3 JSON defaults to `typical`. `notificationLevel` (`error`, `warning`,
`info`, `debug`; default `error`) filters notices, not the evaluated level.
Reports include full findings, the filtered subset, ruleset identity and
unverified obligations. Invalid source returns diagnostics without a conformance
claim. Source and saved settings remain unchanged. The ten approved visual
profiles are bounded Coral inventories with `ruleset.scope` equal to
`coral-bounded-profile`. Full external ISO/UML/BPMN conformance is not claimed.
State remains a partial character-only profile with unverified obligations.
The published 0.2.6 server had six tools; that is a historical contract.

Saved `@diagram` Coral uses source/header edition 0.2.8. Validation, layout,
rendering, explanation, and conversion use its ID-first source reader.
`coral_generate` emits reparse-verified architecture source for its supported
node vocabulary; unsupported kinds return a named error.

Coral-to-Coral conversion preserves valid authored bytes. Coral-to-JSON emits
GraphIR 4 after source verification and full schema and catalog verification
against the exact installed successor schema (`scope: full`, `complete: true`).
Unverified meaning is refused rather than flattened to GraphIR 3. This validates
the installed representation; it does not certify an entire external notation
standard.

The bounded Mermaid sequence writer supports messages, pre-message participant
notes, and successive flat `alt`, `loop`, or `opt` fragments. It reparses the
written Coral and checks meaning. Unsupported Mermaid sequences return
`mcp.coral028.import.unsupported`; failed or incomplete successor model
verification returns `mcp.coral028.import.unverified`. Neither returns Coral
source as a successful conversion.

Absent source writers for other Mermaid diagrams, DOT, and PlantUML return
`mcp.coral028.writer.unavailable`. Setting `strict: false` does not enable an
absent writer or bypass sequence verification. Those format importers can
still produce their bounded GraphIR JSON
subsets, with conversion diagnostics. `coral_convert` accepts text formats,
not GraphIR JSON or Coral document JSON as input. No legacy Coral writer is
selected implicitly.

`coral_render` computes missing geometry and preserves complete supplied
positions. Its `options.style` selects `lowfi` or `hifi` (default `lowfi`);
`thx` is reserved. The MCP option set is narrower than the language/render libraries,
and the server defines no byte, node-count, or operation-time guarantee.

See the published
[MCP server reference](https://coreyt.github.io/coral/docs/embed/reference/mcp-server)
for client configuration and exact tool contracts.

Apache-2.0. See `LICENSE`.
