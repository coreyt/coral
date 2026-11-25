# How to embed the React editor

Mount `CoralEditor` in a React 18.3 or React 19 application and keep application
state ownership outside the component.

## Install the peers

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.14.tgz \
  ./coral-viz-render-0.2.14.tgz ./coral-viz-viz-0.2.14.tgz \
  @xyflow/react@^12 react@^19 react-dom@^19
```

Use matching React and React DOM majors. React 18 consumers use 18.3 or newer.
Install verified 0.2.14 archives together. Coral pins published
`@graph-ir/core@0.2.4` for GraphIR 3.0 interchange.

## Mount the editor

1. Import `@xyflow/react/dist/style.css` once in the host application.
2. Give the editor container an explicit height and width.
3. Pass a GraphIR 3.0 graph to `CoralEditor`.
4. Use callbacks and the conversion helpers to move changes into host-owned
   state.

The React 18 and 19 consumer checks compile and hydrate this exact source:

<<< ../examples/react-editor.tsx

`CoralEditor` owns interactive React Flow state for the graph it receives. A new
`graph` object is authoritative and resets the canvas to that graph's nodes,
edges, and notation-derived appearance. It doesn't load files, validate GraphIR,
resolve notation profiles, run layout, persist changes, or choose the container
size. The host owns those operations.
Connections are disabled by default; enable them deliberately in `config` and
apply the connection rules appropriate to the active notation.

The converters are the primary integration seam when a host already manages
React Flow state. The round-trip check above preserves canonical node fields;
current visual positions and handles own their corresponding GraphIR fields.

## Related

- [Viz API](../reference/viz-api.md)
- [Render a diagram](render-a-diagram.md)
- [Render API](../reference/render-api.md)
- [Embed Coral](../index.md)
