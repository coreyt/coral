# Coral DSL

Common source forms for application users; the complete normative language
specification is [Language 1.3.0](../../embed/reference/language-specification-1.3.0.md).

| Form | Meaning | Example |
| --- | --- | --- |
| Diagram type | Select the notation profile | `@diagram architecture` |
| Object | Declare a stable ID first, then its kind | `api service as "API"` |
| Connection | Connect written first and second endpoints | `api -> db` |
| Relation type | Add a profile-specific relation in brackets | `api -> db [data]` |
| Rendered label | Add paired-quoted display text | `api -> db as "writes"` |
| Label position | Place an explicit primary label | `api service as "API" label below offset 12` |
| Layout controls | Save finite layout settings | `layout [algorithm: layered, direction: RIGHT, nodeNode: 40]` |
| Spatial constraint | Relate typed geometry references | `constraint caption: label node api above edge request [preferred, gap: 8]` |
| Arrangement | Keep an authored member order | `order = arrange row: api, db [gap: 20]` |
| Conformance level | Save the requested notation-check level | `@conformanceLevel strict` |

```coral
@diagram architecture
api service as "API"
db database as "Orders"
api -> db [data] as "writes"
```

The editor keeps this text exactly through save and reopen. A diagram can have
findings and still be saved as text; export refuses meaning it cannot verify.
The displayed forms use the editor's saved-source reader. Its default edition
is 0.2.8; document-local symbols explicitly select 0.2.9.

## Document-local symbols

Edition 0.2.9 selects definitions embedded in saved source using
`[symbol: "local.gateway"]`. The [gateway example](https://coreyt.github.io/coral/examples/#user-symbol)
contains a complete definition and port. Artwork supplies appearance; the
node's kind and authored ports supply meaning. Supported flowchart character
output uses a labelled process-box fallback;
this does not add character rendering for other symbol-bearing notations.
Explicit typical/strict notation checks cannot certify
local artwork.

Use [My Icons](../how-to/import-icons.md) to import and place a symbol. Placement
copies its definition into the document; later library changes require an
explicit document update. Editing a document definition affects its instances,
and ordinary document edits participate in Undo/Redo. Removing browser library
entries does not remove definitions already saved in a document. The owning
import guide describes intake limits, reference expansion and local storage.

## Spatial references and controls

Use `node api`, `group platform`, `edge request`, `label node api`, or
`label edge request` for rectangle references. Edge references name an explicit
connection ID; label references require explicit, nonempty authored text.
An omitted label displays the ID but has no independent authored-label rectangle.
Boundary scopes are `diagram` or an ancestor group containing the subject.

Relative constraints use `above`, `below`, `left of`, or `right of` with optional
`gap` and `alignment: start / center / end`. Boundary constraints use a side and
optional inset, for example `constraint dock: node platform.api at the left of
group platform [inset: 12]`. Arrangements use row/column, declared member order,
and optional gap, alignment and `direction: forward / reverse`. Constraints are
required by default; explicit `[preferred]` may yield with a diagnostic.
Required conflicts refuse the new geometry while the exact source stays saveable.

A single document-level layout declaration accepts algorithms `layered`,
`mrtree`, `stress`, `force`, `radial`, `box`, `fixed`; directions `UP`, `DOWN`,
`LEFT`, `RIGHT`; routing `ORTHOGONAL`, `POLYLINE`, `SPLINES`; and positive finite
spacing keys `nodeNode`, `nodeEdge`, `edgeEdge`, `layerSpacing`. Gap and inset
are finite nonnegative diagram units. Raw engine options are outside saved source.

Routes retain written endpoint identity, including reverse connections:

```coral
@diagram architecture
api service
store database
request = api <- store
route edge request {
  bend = waypoint relative to first offset (20, 0)
  next = waypoint relative to waypoint bend offset (20, 0)
}
```

Waypoint references are local to their route. Required route equations retain
waypoint identity and order; missing references or contradictory cycles receive
located findings. Unsupported coupled geometry receives a capability finding.

## Conformance checks and notices

`@conformanceLevel` saves the diagram's notation-check level: `none`,
`typical` (the default), or `strict`. The Diagnostics panel can run a one-off
check at another level without changing the source. Its report names the level
used and retains the full findings, including any unverified obligations.

The panel's notice threshold (`error`, `warning`, `info`, or `debug`) filters
ordinary notices only. It is stored as a user preference, defaults to `error`,
and never enters the Coral document. Changing it cannot hide findings from a
requested full report. Ordinary save and close remain quiet even when a strict
check finds an error; source text stays saveable.

## Related

- [How to place and edit objects](../how-to/place-and-edit-objects.md)
- [How to lay out and reflow](../how-to/lay-out-and-reflow.md)
- [Conversion support](conversion-support.md)
