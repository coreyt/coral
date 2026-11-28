import type { SymbolLibrary } from '../types.js';

const ioPorts = [
  { id: 'in', anchor: 'WEST' as const, direction: 'in' as const },
  { id: 'out', anchor: 'EAST' as const, direction: 'out' as const },
];
const fourWay = [
  { id: 'north', anchor: 'NORTH' as const, direction: 'inout' as const },
  { id: 'south', anchor: 'SOUTH' as const, direction: 'inout' as const },
  { id: 'east', anchor: 'EAST' as const, direction: 'inout' as const },
  { id: 'west', anchor: 'WEST' as const, direction: 'inout' as const },
];
const E = '0.2.17';

/** Edition 0.2.17 UML 2.5 state machine symbols (all tagged addedInEdition so 0.2.8/0.2.14 digests stay frozen). */
export const umlStateSymbols: SymbolLibrary = {
  id: 'uml-state', name: 'UML State Symbols', version: '1.1.0',
  description: 'UML 2.5 state machine states, composite containers, pseudostates, and notes',
  symbols: [
    { id: 'uml-state-initial', name: 'Initial State', shape: 'ellipse', tags: ['uml', 'state', 'initial', 'start'],
      defaults: { fill: '#1e293b', stroke: '#1e293b', strokeWidth: 1.5, width: 24, height: 24 },
      ports: [{ id: 'out', anchor: 'EAST', direction: 'out' }], addedInEdition: E },
    { id: 'uml-state', name: 'State', shape: 'rectangle', tags: ['uml', 'state'],
      defaults: { fill: '#f8fafc', stroke: '#334155', strokeWidth: 1.5, cornerRadius: 12, width: 140, height: 52 },
      ports: fourWay, addedInEdition: E },
    { id: 'uml-state-final', name: 'Final State', shape: 'ellipse', tags: ['uml', 'state', 'final', 'end'],
      defaults: { fill: '#ffffff', stroke: '#1e293b', strokeWidth: 1.8, width: 28, height: 28 },
      ports: [{ id: 'in', anchor: 'WEST', direction: 'in' }], addedInEdition: E },
    { id: 'uml-state-choice', name: 'Choice Pseudostate', shape: 'diamond', tags: ['uml', 'state', 'choice', 'decision'],
      defaults: { fill: '#ffffff', stroke: '#334155', strokeWidth: 1.5, width: 38, height: 38 },
      ports: fourWay, addedInEdition: E },
    { id: 'uml-state-fork', name: 'Fork Pseudostate', shape: 'rectangle', tags: ['uml', 'state', 'fork', 'sync'],
      defaults: { fill: '#1e293b', stroke: '#1e293b', strokeWidth: 1.5, cornerRadius: 4, width: 72, height: 10 },
      ports: ioPorts, addedInEdition: E },
    { id: 'uml-state-join', name: 'Join Pseudostate', shape: 'rectangle', tags: ['uml', 'state', 'join', 'sync'],
      defaults: { fill: '#1e293b', stroke: '#1e293b', strokeWidth: 1.5, cornerRadius: 4, width: 72, height: 10 },
      ports: ioPorts, addedInEdition: E },
    { id: 'uml-state-composite', name: 'Composite State', shape: 'rectangle', tags: ['uml', 'state', 'composite', 'group', 'container'],
      isContainer: true,
      defaults: { fill: 'none', stroke: '#475569', strokeWidth: 1.5, cornerRadius: 14, width: 180, height: 120 },
      ports: [], addedInEdition: E },
    { id: 'uml-state-note', name: 'State Note', shape: 'note', tags: ['uml', 'state', 'note', 'annotation'],
      defaults: { fill: '#fffbeb', stroke: '#b45309', strokeWidth: 1.5, width: 140, height: 64 },
      ports: [{ id: 'link', anchor: 'WEST', direction: 'inout' }], addedInEdition: E },
  ],
};
