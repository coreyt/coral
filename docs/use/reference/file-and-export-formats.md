# File and export formats

Files created or accepted by the application; package-only conversion APIs are
covered by the conversion reference.

| Format | Use it for | Limits |
| --- | --- | --- |
| `.coral.json` | Save and open | Source-owned Coral documents keep exact authored text and document settings |
| GraphIR JSON | Deliberate interchange | Portable graph; not the authored Coral text or full document settings |
| SVG | Scalable export | Uses verified geometry |
| HTML | Standalone export | Uses verified geometry |
| PNG | Raster export | Fixed resolution |
| JPEG | Lossy raster export | Fixed resolution |
| Coral source (`.coral`) | Text authoring and opening | Stored verbatim; malformed source remains saveable as text |
| Mermaid source (`.mmd`) | Open supported imported source | Bounded sequence import writes verified Coral; other admitted Mermaid stays Mermaid source |
| DOT and PlantUML source | Open supported imported source | Original format is retained; no general Coral source writer |

The current Coral document schema is `1.0.0`. Readers accept `0.9.0`, `1.0.0`,
and legacy `1.0`, migrating supported documents before use. Unsupported or
malformed document envelopes are refused without replacing current work;
malformed Coral text inside a valid source document remains available to edit.

A Coral source document retains its exact text even when syntax, conformance,
or render-capability findings prevent projection or export. Saving and closing
do not require a successful diagram render.

The legacy `0.2.8` bounded six-family character preview in the
[Render API](../../embed/reference/render-api.md#character-output) is
**deprecated and no longer supported** as of Coral `0.2.17`. The application's
export menu does not expose it. Edition `0.2.8` UML State source can still be
saved and rendered through that deprecated API (canvas and SVG paths report no
visual display capability for edition `0.2.8`); use `@coralVersion "0.2.17"` for
visual UML State.

## Related

- [How to save, open, and recover](../how-to/save-open-and-recover.md)
- [How to export a diagram](../how-to/export-a-diagram.md)
- [Conversion support](conversion-support.md)
