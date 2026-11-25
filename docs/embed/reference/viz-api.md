# Viz API

Use the viz package for the React editor kit, GraphIR projection, file and
settings helpers, text synchronization, and editing utilities.

| Area | Public entry | Key exports and ownership |
| --- | --- | --- |
| Editor | root or `@coral-viz/viz/editor` | `CoralEditor`, `useGraphIR`, controls, GraphIR/React Flow converters |
| Text editor | root or `@coral-viz/viz/text-editor` | `TextEditor`, `SplitEditor`, `useBidirectionalSync`, diagnostics and decorations |
| Layout | root or `@coral-viz/viz/layout` | flow layout, edge sections, history, stability, adaptive sizing, axis constraints |
| Files | root only | document create/serialize/deserialize/validate/migrate and schema constants |
| Settings | root only | `useSettings`, panels/forms, layout presets, notation-profile resolution |
| Connections | root only | validation, compatibility hook/components, routed paths |
| Waypoints | root only | create/add/remove/move/insert/route operations and manager hook |
| Properties | root only | panel, type detection, editable fields, value parsing |
| Registries | root only | shape, symbol, and notation accessors re-exported from render |

## File API

`CoralDocument` uses file schema `1.0.0` and accepts the supported compatibility
forms reported by `SUPPORTED_SCHEMA_VERSIONS`. That file schema isn't the same
version as GraphIR 3.0 or the Coral package. `deserialize` returns a result with
validation/migration information; don't assume untrusted JSON is a document.
The document records Coral, Mermaid, or DOT as its source DSL type.

## Standalone React Flow projection

`convertGraphToFlow` and `convertEdge` emit edges of type `compatibility`
whose `markerStart` and `markerEnd` reference shared marker definitions by
URL. `CoralEditor` registers both for you. A host that renders the projection
in its own `<ReactFlow>` must register the edge type and render the marker
definitions once, or edges fall back to the default type and draw without
endpoint markers:

```tsx
import { ReactFlow } from '@xyflow/react';
import { CompatibilityEdge, EndpointMarkerDefinitions, convertGraphToFlow } from '@coral-viz/viz';

const edgeTypes = { compatibility: CompatibilityEdge };
const { nodes, edges } = convertGraphToFlow(graph);

<ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes}>
  <EndpointMarkerDefinitions edges={edges} />
</ReactFlow>;
```

## Layout, settings, and position stability

`layoutGraph` and the flow helpers run ELK for React Flow data. Use
`resolveNotationLayout` only when the host has deliberately enabled a notation
profile; `CoralEditor` doesn't resolve one for you. It does render edges with
the shared notation model: set GraphIR `metadata.notation` for catalog edge
styles, markers, roles, and multiplicities. `diffGraphs`,
`resolvePositions`, `incrementalLayout`, `useDiagramState`, and
`useLayoutHistory` separate current geometry, incremental change, and undo.

Settings hooks and panels operate on state supplied by the host. Layout presets
and user preferences are helpers, not persistence. The deprecated
`llmSavedApiKey` field remains only for 0.2.x source compatibility and isn't
secret storage.

## Diagnostics, highlighting, and synchronization

`TextEditor` accepts diagnostics with `error`, `warning`, or `info` severity,
exact ranges, entity decorations, and an `EditorAnalysisOwner`. Its closed
syntax languages are `coral`, `mermaid`, `dot`, and `plain`; themes are `light`
and `dark`. `useBidirectionalSync` reports `text`, `visual`, or `external` as
the change source and lets the host inject its parser and printer.

The old `ParseResult`, `ParseError`, and `ChangeSource` aliases remain for the
0.2.x line. New code should use `SyncParseResult` and `SyncParseError`.

## Connections, waypoints, and properties

Connection validation distinguishes symbol rules, port direction, maximum
connections, self-connections, and other constraint violations. Waypoint
helpers edit explicit routes; they don't run automatic layout. Properties
helpers support scalar editing and introspection while leaving arbitrary
objects/arrays to the host.

`ServiceNode`, `DatabaseNode`, `ExternalApiNode`, `ActorNode`, `ModuleNode`, and
`GroupNode` are retained legacy-compatible components. Prefer `SymbolNode` and
the notation/symbol registries for new integrations.

## Related

- [Embed the React editor](../how-to/embed-the-react-editor.md)
- [Render API](render-api.md)
- [Language API](language-api.md)
- [File and export formats](../../use/reference/file-and-export-formats.md)
