# MCP server

Use the Coral 0.2.9 stdio server to expose seven bounded Coral
operations to an MCP client. This guide does not claim registry publication.

| Tool | Required input | Optional input and behavior |
| --- | --- | --- |
| `coral_generate` | `description` | `format`: DSL/JSON; `style`: minimal/detailed; deterministic heuristics, not an LLM |
| `coral_validate` | `content` | `strict`; validates Coral or GraphIR JSON |
| `coral_convert` | `content` | `from`, `to`, `strict`; reports conversion loss |
| `coral_layout` | `content` | `options.direction`, `nodeSpacing`, `layerSpacing`, `algorithm` (layered/mrtree/force/box) |
| `coral_render` | `content` | `options.format` (svg/html), `direction`, `theme`, `style` (lowfi/hifi), `nodeSpacing`, font settings and `notation` |
| `coral_explain` | `content` | `level`, `focus`; `detailed` currently follows the standard form |
| `coral_check_conformance` | `content` | `level`, `notificationLevel`; versioned bounded-profile findings |

Layout and render settings above belong inside the `options` object. Render
font options are `fontSettings`, `fontFamily`, `fontSize`, `fontWeight`, and
`lineHeight`. `style` defaults to `lowfi`; `thx` is reserved.

## Install and configure

Install matching verified archives together:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.14.tgz \
  ./coral-viz-render-0.2.14.tgz ./coral-viz-mcp-server-0.2.14.tgz
```

Run the installed executable from that project directory. For a client that
launches commands with `npx`, use this configuration and set its working
directory to the installation directory:

```json
{
  "mcpServers": {
    "coral": {
      "command": "npx",
      "args": [
        "--no-install",
        "coral-mcp"
      ]
    }
  }
}
```

Use the verified 0.2.14 archive set in managed environments. The command uses stdio;
don't wrap it in a process that writes unrelated output to stdout.

## Source conversion and verification

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

## Conformance checks

`coral_check_conformance` uses the saved `@conformanceLevel` (default `typical`)
for Coral source; `level` (`none`, `typical`, `strict`) overrides only that
check.
GraphIR 3 JSON defaults to `typical`. `notificationLevel` (`error`, `warning`,
`info`, `debug`; default `error`) filters notices, not the evaluated level.
Reports include full findings, the filtered subset, ruleset identity and
unverified obligations. Invalid source returns diagnostics without a conformance
claim. Source and saved settings remain unchanged. The ten approved visual
profiles are bounded Coral inventories with `ruleset.scope` equal to
`coral-bounded-profile`. Full external ISO/UML/BPMN conformance is not claimed.
State remains a partial character-only profile with unverified obligations.
The published 0.2.6 server had six tools; that is a historical contract.

## Responses and failures

The document payload is in `content[].text`. `structuredContent`, where a tool
supplies it, is metadata and isn't a replacement payload channel.

Validation and conversion can return useful text with `isError: true`.
Schema, JSON, validation, and layout exceptions are caught by the server and
become an `Error:` text envelope with `isError: true`. Render returns an error
envelope when it can't parse and validate any nodes. Explain returns a normal
text response when no node can be parsed. Clients must handle these shapes
rather than checking only for a thrown transport error.

## Library boundary and limits

The MCP layout schema exposes `layered`, `mrtree`, `force`, and `box`, while the
render library exposes seven algorithms and more option detail. MCP doesn't
expose library padding, title, description, or custom theme objects.
`coral_render` is the exception to root render ownership: it computes missing
geometry before serializing and preserves complete supplied positions.

The server doesn't impose a documented byte, node-count, or operation-time
limit. That is an absence of a guarantee, not a promise of unlimited capacity;
clients should enforce their own bounds and cancellation policy.

Reference owners: [Language Specification
1.3.0](language-specification-1.3.0.md), [Language evolution
policy](../../contribute/reference/language-evolution.md).

## Related

- [Render API](render-api.md)
- [Language API](language-api.md)
- [Render a diagram](../how-to/render-a-diagram.md)
- [Embed Coral](../index.md)
