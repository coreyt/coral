import type { SymbolLibrary } from '../types.js';

const ioPorts = [
  { id: 'input', anchor: 'WEST' as const, direction: 'in' as const },
  { id: 'output', anchor: 'EAST' as const, direction: 'out' as const },
];
const baseDefaults = { fill: '#eef3f8', stroke: '#425466', strokeWidth: 2 };

/** Plain functional blocks (0.2.8) + freeform geometric primitives (edition 0.2.14). */
export const blockSymbols: SymbolLibrary = {
  id: 'block', name: 'Block Symbols', version: '1.0.0',
  description: 'Generic functional blocks with semantic input and output ports',
  symbols: [
    {
      id: 'block-unit', name: 'Block',
      description: 'A functional block with an input and output',
      shape: 'rectangle', tags: ['block', 'functional-unit'],
      defaults: baseDefaults,
      // GraphIR 3 still requires geometric catalog metadata; U1 ignores these
      // sides when resolving semantic ports so reflow can choose attachments.
      ports: ioPorts,
    },
    { id: 'block-rounded', name: 'Rounded Box', shape: 'rectangle', tags: ['block', 'rounded', 'box'],
      defaults: { ...baseDefaults, cornerRadius: 10 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-circle', name: 'Circle', shape: 'ellipse', tags: ['block', 'circle', 'node'],
      defaults: { ...baseDefaults, width: 84, height: 84 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-oval', name: 'Oval', shape: 'ellipse', tags: ['block', 'oval', 'ellipse'],
      defaults: { ...baseDefaults, width: 120, height: 62 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-triangle', name: 'Triangle', shape: 'triangle', tags: ['block', 'triangle'],
      defaults: { ...baseDefaults, width: 100, height: 86 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-diamond', name: 'Diamond', shape: 'diamond', tags: ['block', 'diamond', 'decision'],
      defaults: { ...baseDefaults, width: 100, height: 78 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-cylinder', name: 'Cylinder', shape: 'cylinder', tags: ['block', 'cylinder', 'store'],
      defaults: { ...baseDefaults, width: 96, height: 78 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-pill', name: 'Pill', shape: 'stadium', tags: ['block', 'pill', 'stadium'],
      defaults: { ...baseDefaults, width: 118, height: 46 }, ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-note', name: 'Note', shape: 'note', tags: ['block', 'note', 'callout'],
      defaults: { fill: '#fffbeb', stroke: '#b45309', strokeWidth: 1.5, width: 128, height: 68 },
      ports: ioPorts, addedInEdition: '0.2.14' },
    { id: 'block-group', name: 'Group', shape: 'rectangle', tags: ['block', 'group', 'container'],
      isContainer: true, defaults: { fill: 'none', stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '6 4', cornerRadius: 6 },
      ports: [], addedInEdition: '0.2.14' },
  ],
};
