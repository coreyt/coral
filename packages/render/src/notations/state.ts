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
  symbols0217: [
    'uml-state-initial', 'uml-state', 'uml-state-final', 'uml-state-choice',
    'uml-state-fork', 'uml-state-join', 'uml-state-composite', 'uml-state-note',
  ],
  edgeStyles: {
    transition: { name: 'Transition', targetArrow: 'arrow', targetFill: 'open',
      lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
  },
  edgeStyles0217: {
    annotation: { name: 'Annotation', targetArrow: 'none',
      lineStyle: 'dashed', stroke: '#94a3b8', strokeWidth: 1.2 },
  },
  defaultEdgeStyle: 'transition',
  connectionRules: [],
};
