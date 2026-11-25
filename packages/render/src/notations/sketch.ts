/**
 * Sketch Notation (Hand-drawn / whiteboard style)
 */

import type { NotationDefinition } from '../types.js';

export const sketchNotation: NotationDefinition = {
  id: 'sketch',
  name: 'Sketch',
  description: 'Hand-drawn whiteboard-style diagrams with freeform connections',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'DOWN',
    spacing: { nodeNode: 60, edgeNode: 20, layerSpacing: 80 }, edgeRouting: 'SPLINES',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },

  symbols: [
    'sketch-step',
    'sketch-label',
    'sketch-box',
    'sketch-decision',
    'sketch-circle',
    'sketch-cloud',
    'sketch-group',
  ],

  edgeStyles: {
    flow: {
      name: 'Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#333333',
      strokeWidth: 2.5,
    },
    annotation: {
      name: 'Annotation',
      targetArrow: 'none',
      lineStyle: 'dashed',
      stroke: '#9e9e9e',
      strokeWidth: 1,
    },
  },

  defaultEdgeStyle: 'flow',

  connectionRules: [
    // Sketch is freeform — any symbol can connect to any other
    {
      from: 'sketch-step',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud', 'sketch-label'],
    },
    {
      from: 'sketch-box',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud', 'sketch-label'],
    },
    {
      from: 'sketch-decision',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud', 'sketch-label'],
      constraints: { maxOutgoing: 3, requiresLabel: true },
    },
    {
      from: 'sketch-circle',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud', 'sketch-label'],
    },
    {
      from: 'sketch-cloud',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud', 'sketch-label'],
    },
    // Annotation (label) connections
    {
      from: 'sketch-label',
      to: ['sketch-step', 'sketch-box', 'sketch-decision', 'sketch-circle', 'sketch-cloud'],
      edgeStyle: 'annotation',
    },
  ],
};
