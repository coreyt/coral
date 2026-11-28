# MCP server

Use `@coral-viz/mcp-server` (`0.2.17`) over stdio to expose seven bounded Coral
diagram, conversion, and conformance operations to an MCP client. For shell
pipelines and CI scripts without MCP, use the standalone `coral` CLI shipped on
`@coral-viz/render` (`npx -y --package=@coral-viz/render -- coral`).

| Tool | Required input | Optional input and behavior |
| --- | --- | --- |
| `coral_generate` | `description` | `format`: DSL/JSON; `style`: minimal/detailed; deterministic heuristics, not an LLM |
| `coral_validate` | `content` | `strict`; validates saved Coral (`0.2.8`, `0.2.9`, `0.2.14`, `0.2.17`) or GraphIR JSON |
| `coral_convert` | `content` | `from`, `to`, `strict`, `flowchartTarget`, `edgeStyleMode`, `stateTargetEdition`; deterministic Top-5 Mermaid-to-Coral transpilation and GraphIR export |
| `coral_layout` | `content` | `options.direction`, `nodeSpacing`, `layerSpacing`, `algorithm` (layered/mrtree/force/box) |
| `coral_render` | `content` | `options.format` (svg/html), `direction`, `theme`, `style` (lowfi/hifi/anemone/ane/parrotfish/pf), `nodeSpacing`, font settings, and `notation` |
| `coral_explain` | `content` | `level`, `focus`; `detailed` currently follows the standard form |
| `coral_check_conformance` | `content` | `level`, `notificationLevel`; versioned bounded-profile findings |

Layout and render settings above belong inside the `options` object. Render
font options are `fontSettings`, `fontFamily`, `fontSize`, `fontWeight`, and
`lineHeight`. `style` defaults to `lowfi`; `anemone` (shorthand `ane`) selects
the modeled presentation theme; `parrotfish` (shorthand `pf`) selects the
classic presentation preset; `thx` is reserved.

## Install and configure

Run the public npm package directly without pre-installing into a project
directory:

```sh
npx -y @coral-viz/mcp-server
```

Configure an MCP client using `npx`:

```json
{
  "mcpServers": {
    "coral": {
      "command": "npx",
      "args": [
        "-y",
        "@coral-viz/mcp-server"
      ]
    }
  }
}
```

For managed or offline-pinned environments, install the verified 0.2.17 archive
set together with its published Core dependency:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.17.tgz \
  ./coral-viz-render-0.2.17.tgz ./coral-viz-mcp-server-0.2.17.tgz
```

Then run `npx --no-install coral-mcp` from that installation directory. The
command uses stdio; do not wrap it in a process that writes unrelated output to
stdout.

## Source conversion and verification

Saved `@diagram` Coral defaults to source/header edition `0.2.8` and admits
explicit `@coralVersion` editions `0.2.9`, `0.2.14`, and `0.2.17`. Validation,
layout, rendering, explanation, and conversion use the shared ID-first source
reader. `coral_generate` emits reparse-verified architecture source for its
supported node vocabulary; unsupported kinds return a named error.

Coral-to-Coral conversion preserves valid authored bytes. Coral-to-JSON emits
GraphIR 4 after source verification and full schema and catalog verification
against the exact installed successor schema (`scope: full`, `complete: true`).
Unverified meaning is refused rather than flattened to GraphIR 3. This validates
the installed representation; it does not certify an entire external notation
standard.

Mermaid-to-Coral conversion runs the deterministic zero-LLM 5-stage transpiler
(`transpileAndVerifyMermaidToCoral`) covering Flowchart (`flowchartTarget`:
`flowchart`, `block`, or `architecture`), Sequence (`uml-sequence`), Class
(`uml-class`), ER (`erd`), and State (`stateTargetEdition`: `0.2.17` visual
default or `0.2.8` character-only). Every emitted document is self-verified via
parse-back, successor projection, catalog validation, and the display seam;
unsupported Mermaid diagram types refuse with `mermaid.diagram.unsupported`.

Absent source writers for DOT and PlantUML return
`mcp.coral028.writer.unavailable`. Setting `strict: false` does not enable an
absent writer or bypass verification. Those format importers can still produce
their bounded GraphIR JSON subsets, with conversion diagnostics. `coral_convert`
accepts text formats, not GraphIR JSON or Coral document JSON as input. No
legacy Coral writer is selected implicitly.

## Conformance checks

`coral_check_conformance` uses the saved `@conformanceLevel` (default `typical`)
for Coral source; `level` (`none`, `typical`, `strict`) overrides only that
check. GraphIR 3 JSON defaults to `typical`. `notificationLevel` (`error`,
`warning`, `info`, `debug`; default `error`) filters notices, not the evaluated
level. Reports include full findings, the filtered subset, ruleset identity, and
unverified obligations. Invalid source returns diagnostics without a conformance
claim. Source and saved settings remain unchanged. Approved visual profiles are
bounded Coral inventories with `ruleset.scope` equal to `coral-bounded-profile`.
Full external ISO/UML/BPMN conformance is not claimed. Edition `0.2.8` UML State
remains a partial character-only profile with unverified obligations; edition
`0.2.17` adds visual rendering and a bounded `uml-state` U2 ruleset. The
published 0.2.6 server had six tools; that is a historical contract.

## Responses and failures

The document payload is in `content[].text`. `structuredContent`, where a tool
supplies it, is metadata and is not a replacement payload channel.

Validation and conversion can return useful text with `isError: true`. Schema,
JSON, validation, and layout exceptions are caught by the server and become an
`Error:` text envelope with `isError: true`. Render returns an error envelope
when it cannot parse and validate any nodes. Explain returns a normal text
response when no node can be parsed. Clients must handle these shapes rather
than checking only for a thrown transport error.

## Library boundary and limits

The MCP layout schema exposes `layered`, `mrtree`, `force`, and `box`, while the
render library exposes seven algorithms and more option detail. MCP does not
expose library padding, title, description, or custom theme objects.
`coral_render` is the exception to root render ownership: it computes missing
geometry before serializing and preserves complete supplied positions.

The server does not impose a documented byte, node-count, or operation-time
limit. That is an absence of a guarantee, not a promise of unlimited capacity;
clients should enforce their own bounds and cancellation policy.

Reference owners: [Language Specification
1.3.0](language-specification-1.3.0.md), [Language evolution
policy](../../contribute/reference/language-evolution.md).

## Related

- [Embed Coral](../index.md)
- [Language API](language-api.md)
- [Render API](render-api.md)
- [Conversion support](../../use/reference/conversion-support.md)
