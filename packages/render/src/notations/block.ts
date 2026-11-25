import type { NotationDefinition } from '../types.js';

/** Source-first functional block diagram; canonical rules are still unreviewed. */
export const blockNotation: NotationDefinition = {
  id: 'block', name: 'Block Diagram',
  description: 'Functional blocks and directed connections',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 70, edgeNode: 25, layerSpacing: 90 },
    edgeRouting: 'POLYLINE',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },
  symbols: ['block-unit'],
  symbols0214: [
    'block-rounded', 'block-circle', 'block-oval', 'block-triangle',
    'block-diamond', 'block-cylinder', 'block-pill', 'block-note', 'block-group',
  ],
  edgeStyles: {
    flow: { name: 'Directed connection', targetArrow: 'arrow',
      lineStyle: 'solid', stroke: '#425466', strokeWidth: 1.5 },
  },
  defaultEdgeStyle: 'flow',
  connectionRules: [{ from: 'block-unit', to: ['block-unit'] }],
};
