# Conversion support

File opening, source editing, and conversion have different contracts. A
successful preview does not imply that Coral can write another source format.

| Operation | Supported behavior | Limit |
| --- | --- | --- |
| Open saved Coral | Retain exact authored text, including malformed drafts | Rendering and semantic export require accepted current meaning |
| Open Mermaid sequence | Verified messages, pre-message notes, and successive flat `alt`/`loop`/`opt` fragments become Coral source | Unsupported sequence constructs refuse automatic file-open conversion |
| Open other Mermaid, DOT, or PlantUML | Retain the imported source and its format; show supported parsed meaning | Unsupported constructs have diagnostics; use explicit conversion for Mermaid |
| Deterministic Mermaid to Coral (Editor, MCP `coral_convert`, CLI `coral convert`) | Direct zero-LLM 5-stage transpiler for Flowchart (`flowchart`, opt-in `block`/`architecture`), Sequence (`uml-sequence`), Class (`uml-class`), ER (`erd`), and State (`uml-state` Edition `0.2.17` visual default or `0.2.8` opt-in) with mandatory parse-back verification | Non-Top-5 Mermaid types refuse cleanly (`mermaid.diagram.unsupported`); lossy constructs emit located diagnostics and pre-commit review in the editor |
| Switch a saved Coral document's format | Source ownership refuses graph-only format replacement | Use an explicit supported export or keep the original source |
| MCP and CLI Coral to Coral | Preserve valid authored bytes | Invalid or unsupported meaning refuses |
| MCP and CLI saved Coral to GraphIR JSON | Verify exact successor schema/catalog and source meaning before export | GraphIR 4 remains a separate candidate contract |
| MCP and CLI DOT or PlantUML to Coral | Refuses cleanly (`mcp.coral028.writer.unavailable` / `coral.cli.writer.unavailable`) | No verified Coral source writer for DOT or PlantUML; GraphIR JSON import stays bounded |
| Graph interchange printers | Declared graph-to-text conversions with loss diagnostics | Display/staging graphs are not saved-source masters |

Coral `0.2.17` ships the deterministic, zero-LLM Mermaid-to-Coral transpiler
across `@coral-viz/language` (`transpileMermaidToCoral`), `@coral-viz/render`
(`transpileAndVerifyMermaidToCoral` and `coral convert`), `@coral-viz/mcp-server`
(`coral_convert`), and the diagram editor's **Convert to Editable Coral**
workflow with pre-commit loss review and single atomic Undo. This feature is
separate from AI.

Imports cover bounded families and constructs. Diagnostics identify unsupported
or lossy meaning at the applicable operation; a parse or diagram preview alone
does not certify full Mermaid, UML, BPMN, or other external-standard support.
See the [MCP reference](../../embed/reference/mcp-server.md) and
[language API](../../embed/reference/language-api.md) for operation contracts.

## Related

- [How to convert from Mermaid](../how-to/convert-from-mermaid.md)
- [Understanding conversion loss](../explain/conversion-loss.md)
- [Coral DSL](coral-dsl.md)
