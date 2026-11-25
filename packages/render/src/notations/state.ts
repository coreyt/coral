import type { NotationDefinition } from '../types.js';

/** Installed source edition for bounded flat UML state character output. */
export const umlStateNotation: NotationDefinition = {
  id: 'uml-state', name: 'UML State', version: '1.0.0',
  description: 'Flat initial, simple state, final and directed transition source edition',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 60, edgeNode: 24, layerSpacing: 90 }, edgeRouting: 'ORTHOGONAL',
  },
  symbols: [],
  edgeStyles: {
    transition: { name: 'Transition', targetArrow: 'arrow', targetFill: 'open',
      lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
  },
  defaultEdgeStyle: 'transition',
  connectionRules: [],
};
