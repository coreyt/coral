/**
 * Sketch Symbols (Hand-drawn / whiteboard style)
 */

import type { SymbolLibrary } from '../types.js';

export const sketchSymbols: SymbolLibrary = {
  id: 'sketch',
  name: 'Sketch Symbols',
  version: '1.0.0',
  description: 'Hand-drawn whiteboard-style symbols for informal diagrams',
  symbols: [
    {
      id: 'sketch-step',
      name: 'Step',
      description: 'A process step or action (main sketch shape)',
      shape: 'sketch-rounded-rect',
      tags: ['process', 'step', 'action'],
      defaults: { fill: '#ffffff', stroke: '#333333', strokeWidth: 2.5 },
      ports: [
        { id: 'in', anchor: 'NORTH', direction: 'in' },
        { id: 'out', anchor: 'SOUTH', direction: 'out' },
      ],
    },
    {
      id: 'sketch-label',
      name: 'Label',
      description: 'Floating text label or annotation',
      shape: 'text-box',
      tags: ['annotation', 'text', 'label'],
      defaults: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
      ports: [{ id: 'link', anchor: 'WEST', direction: 'inout' }],
    },
    {
      id: 'sketch-box',
      name: 'Box',
      description: 'A rectangular element',
      shape: 'sketch-rect',
      tags: ['box', 'container', 'element'],
      defaults: { fill: '#ffffff', stroke: '#333333', strokeWidth: 2.5 },
      ports: [
        { id: 'in', anchor: 'NORTH', direction: 'in' },
        { id: 'out', anchor: 'SOUTH', direction: 'out' },
      ],
    },
    {
      id: 'sketch-decision',
      name: 'Decision',
      description: 'A decision or branching point',
      shape: 'sketch-diamond',
      tags: ['decision', 'branching', 'condition'],
      defaults: { fill: '#ffffff', stroke: '#333333', strokeWidth: 2.5 },
      ports: [
        { id: 'in', anchor: 'NORTH', direction: 'in' },
        { id: 'yes', anchor: 'SOUTH', direction: 'out', label: 'Yes' },
        { id: 'no', anchor: 'EAST', direction: 'out', label: 'No' },
        { id: 'alt', anchor: 'WEST', direction: 'out', label: 'Maybe' },
      ],
    },
    {
      id: 'sketch-circle',
      name: 'Circle',
      description: 'A circular or oval marker',
      shape: 'sketch-oval',
      tags: ['circle', 'marker', 'endpoint'],
      defaults: { fill: '#ffffff', stroke: '#333333', strokeWidth: 2.5 },
      ports: [
        { id: 'in', anchor: 'NORTH', direction: 'in' },
        { id: 'out', anchor: 'SOUTH', direction: 'out' },
      ],
    },
    {
      id: 'sketch-cloud',
      name: 'Cloud',
      description: 'An abstract concept or external system',
      shape: 'cloud',
      tags: ['cloud', 'abstract', 'external'],
      defaults: { fill: '#ffffff', stroke: '#333333', strokeWidth: 2.5 },
      ports: [
        { id: 'in', anchor: 'NORTH', direction: 'in' },
        { id: 'out', anchor: 'SOUTH', direction: 'out' },
      ],
    },
    {
      id: 'sketch-group',
      name: 'Group',
      description: 'A grouping container',
      shape: 'sketch-rect',
      tags: ['group', 'container', 'area'],
      isContainer: true,
      defaults: { fill: '#f5f5f5', stroke: '#333333', strokeWidth: 2.5, strokeDasharray: '8,4', width: 200, height: 150 },
      ports: [],
    },
  ],
};
