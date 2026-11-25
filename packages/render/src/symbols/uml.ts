import type { SymbolLibrary } from '../types.js';

const ports = [
  { id: 'north', anchor: 'NORTH' as const, direction: 'inout' as const },
  { id: 'south', anchor: 'SOUTH' as const, direction: 'inout' as const },
  { id: 'east', anchor: 'EAST' as const, direction: 'inout' as const },
  { id: 'west', anchor: 'WEST' as const, direction: 'inout' as const },
];

export const umlSymbols: SymbolLibrary = {
  id: 'uml-class', name: 'UML Class', version: '1.0.0',
  description: 'Scoped UML class classifiers',
  symbols: [
    { id: 'uml-class', name: 'Class', shape: 'rectangle', tags: ['uml', 'class'], defaults: { width: 180, height: 120 }, ports },
    { id: 'uml-interface', name: 'Interface', shape: 'rectangle', tags: ['uml', 'interface'], defaults: { width: 180, height: 120 }, ports },
    { id: 'uml-enum', name: 'Enumeration', shape: 'rectangle', tags: ['uml', 'enum'], defaults: { width: 180, height: 120 }, ports },
  ],
};

/** Sequence participants draw their own header and lifeline and declare no ports. */
export const umlSequenceSymbols: SymbolLibrary = {
  id: 'uml-sequence', name: 'UML Sequence', version: '1.0.0',
  description: 'Core UML sequence participants',
  symbols: [
    { id: 'uml-participant', name: 'Participant', shape: 'rectangle', tags: ['uml', 'sequence', 'participant'], defaults: { width: 120, height: 40 }, ports: [] },
    { id: 'uml-actor', name: 'Actor', shape: 'rectangle', tags: ['uml', 'sequence', 'actor'], defaults: { width: 120, height: 70 }, ports: [] },
  ],
};
