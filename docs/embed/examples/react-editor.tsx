// @ts-expect-error -- application bundlers resolve this CSS side-effect import.
import '@xyflow/react/dist/style.css';

import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { GraphIR } from '@coral-viz/viz';
import {
  CoralEditor,
  convertFlowToGraphEdges,
  convertFlowToGraphNodes,
  convertGraphToFlow,
} from '@coral-viz/viz/editor';

export const blankGraph: GraphIR = {
  version: '3.0.0',
  id: 'blank',
  nodes: [],
  edges: [],
};

const converterGraph: GraphIR = {
  version: '3.0.0',
  id: 'converter-check',
  nodes: [{ id: 'api', type: 'service', label: 'API', properties: { tier: 'web' } }],
  edges: [],
};

export function assertConverterRoundTrip(): void {
  const flow = convertGraphToFlow(converterGraph);
  const nodes = convertFlowToGraphNodes(flow.nodes, converterGraph.nodes);
  const edges = convertFlowToGraphEdges(flow.edges, converterGraph.edges);
  if (nodes[0]?.id !== 'api' || nodes[0]?.properties?.tier !== 'web' || edges.length !== 0) {
    throw new Error('GraphIR to React Flow conversion lost canonical fields');
  }
}

export function EditorExample(): React.JSX.Element {
  assertConverterRoundTrip();
  return (
    <div style={{ height: 480, width: '100%' }}>
      <CoralEditor
        graph={blankGraph}
        config={{ showControls: true, showMinimap: false }}
      />
    </div>
  );
}

export function hydrateEditor(container: Element): ReturnType<typeof hydrateRoot> {
  return hydrateRoot(container, <EditorExample />);
}
