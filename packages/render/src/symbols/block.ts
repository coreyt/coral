import type { SymbolLibrary } from '../types.js';

/** Plain functional blocks; neither flowchart processes nor software services. */
export const blockSymbols: SymbolLibrary = {
  id: 'block', name: 'Block Symbols', version: '1.0.0',
  description: 'Generic functional blocks with semantic input and output ports',
  symbols: [{
    id: 'block-unit', name: 'Block',
    description: 'A functional block with an input and output',
    shape: 'rectangle', tags: ['block', 'functional-unit'],
    defaults: { fill: '#eef3f8', stroke: '#425466', strokeWidth: 2 },
    // GraphIR 3 still requires geometric catalog metadata; U1 ignores these
    // sides when resolving semantic ports so reflow can choose attachments.
    ports: [
      { id: 'input', anchor: 'WEST', direction: 'in' },
      { id: 'output', anchor: 'EAST', direction: 'out' },
    ],
  }],
};
