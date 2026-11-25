# Conversion support

File opening, source editing and conversion have different contracts. A
successful preview does not imply that Coral can write another source format.

| Operation | Supported behavior | Limit |
| --- | --- | --- |
| Open saved Coral | Retain exact authored text, including malformed drafts | Rendering and semantic export require accepted current meaning |
| Open Mermaid sequence | Verified messages, pre-message notes and successive flat alt/loop/opt fragments become Coral source | Unsupported sequence constructs refuse import |
| Open other Mermaid, DOT or PlantUML | Retain the imported source and its format; show supported parsed meaning | Unsupported constructs have diagnostics; no general source-to-Coral writer |
| Switch a saved Coral document's format | Source ownership refuses graph-only format replacement | Use an explicit supported export or keep the original source |
| MCP Coral to Coral | Preserve valid authored bytes | Invalid or unsupported meaning refuses |
| MCP saved Coral to GraphIR JSON | Verify exact successor schema/catalog and source meaning before export | GraphIR 4 remains a separate candidate contract |
| MCP foreign source to Coral | Bounded Mermaid sequence writer | Other Mermaid, DOT and PlantUML source writers refuse |
| Graph interchange printers | Declared graph-to-text conversions with loss diagnostics | Display/staging graphs are not saved-source masters |

The new general deterministic Mermaid-to-editable Coral conversion mechanism
is deferred to 0.2.10. The bounded sequence behavior above remains available.
This feature is separate from AI.

Imports cover bounded families and constructs. Diagnostics identify unsupported
or lossy meaning at the applicable operation; a parse or diagram preview alone
does not certify full Mermaid, UML, BPMN or other external-standard support.
See the [MCP reference](../../embed/reference/mcp-server.md) and
[language API](../../embed/reference/language-api.md) for operation contracts.

## Related

- [How to convert from Mermaid](../how-to/convert-from-mermaid.md)
- [Understanding conversion loss](../explain/conversion-loss.md)
- [Coral DSL](coral-dsl.md)
