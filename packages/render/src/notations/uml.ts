import type { NotationDefinition } from '../types.js';

const all = ['uml-class', 'uml-interface', 'uml-enum'];
export const umlClassNotation: NotationDefinition = {
  id: 'uml-class', name: 'UML Class', version: '1.0.0',
  description: 'Core UML class, interface, enumeration, and relationship notation',
  layoutProfile: {
    algorithm: 'layered', direction: 'DOWN',
    spacing: { nodeNode: 60, edgeNode: 24, layerSpacing: 90 }, edgeRouting: 'ORTHOGONAL',
  },
  symbols: all,
  edgeStyles: {
    association: { name: 'Association', targetArrow: 'none', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    dependency: { name: 'Dependency', targetArrow: 'arrow', targetFill: 'open', lineStyle: 'dashed', stroke: '#475569', strokeWidth: 1.5 },
    inheritance: { name: 'Inheritance', targetArrow: 'triangle', targetFill: 'open', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    realization: { name: 'Realization', targetArrow: 'triangle', targetFill: 'open', lineStyle: 'dashed', stroke: '#475569', strokeWidth: 1.5 },
    aggregation: { name: 'Aggregation', sourceArrow: 'diamond', sourceFill: 'open', targetArrow: 'none', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    composition: { name: 'Composition', sourceArrow: 'diamond', sourceFill: 'filled', targetArrow: 'none', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
  },
  defaultEdgeStyle: 'association',
  connectionRules: all.map((from) => ({ from, to: all, edgeStyle: 'association' })),
};

const sequenceSymbols = ['uml-participant', 'uml-actor'];
/** Core UML sequence notation; geometry comes from the specialized sequence layout, never ELK. */
export const umlSequenceNotation: NotationDefinition = {
  id: 'uml-sequence', name: 'UML Sequence', version: '1.0.0',
  description: 'Core UML sequence participants, ordered messages, activations, notes, and flat loop/alt/opt fragments',
  symbols: sequenceSymbols,
  edgeStyles: {
    sync: { name: 'Synchronous message', targetArrow: 'triangle', targetFill: 'filled', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    async: { name: 'Asynchronous message', targetArrow: 'arrow', targetFill: 'open', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    return: { name: 'Return message', targetArrow: 'arrow', targetFill: 'open', lineStyle: 'dashed', stroke: '#475569', strokeWidth: 1.5 },
  },
  defaultEdgeStyle: 'sync',
  connectionRules: sequenceSymbols.map((from) => ({ from, to: sequenceSymbols, edgeStyle: 'sync' })),
};
