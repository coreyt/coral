# @coral-viz/viz

## Coral 0.2.17

Install verified 0.2.17 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
Existing examples retain their documented compatibility API contracts.

React Flow editor components, GraphIR projection, file/settings helpers, text
synchronization, layout, connections, waypoints, and properties APIs.

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-language-0.2.17.tgz \
  ./coral-viz-render-0.2.17.tgz ./coral-viz-viz-0.2.17.tgz \
  @xyflow/react@^12 react@^19 react-dom@^19
```

React and React DOM 18.3 or 19 are supported peers. Import the React Flow
stylesheet once:

```ts
import '@xyflow/react/dist/style.css';
```

Public entries are the root plus `/editor`, `/layout`, and `/text-editor`.
`CoralEditor` renders and edits a supplied graph. The host owns file loading,
GraphIR validation, notation-profile resolution, layout orchestration,
persistence, and container sizing. Connections are disabled by default.

`convertGraphToFlow` and `convertEdge` emit `compatibility` edges with shared
marker URLs. A standalone `<ReactFlow>` host must pass
`edgeTypes={{ compatibility: CompatibilityEdge }}` and render
`<EndpointMarkerDefinitions edges={edges} />`; the Viz API owns the full
example.

`UserPreferences.llmSavedApiKey` remains only for 0.2.x source compatibility
and is deprecated as secret storage.

See the
[Viz API](https://coreyt.github.io/coral/docs/embed/reference/viz-api)
and
[React editor guide](https://coreyt.github.io/coral/docs/embed/how-to/embed-the-react-editor).

Apache-2.0. See `LICENSE`.
