import manifest from './example-sources/catalog.json';
import { validateExampleCatalog } from './exampleCatalog.mjs';
import orderService from './example-sources/order-service.coral?raw';
import block from './example-sources/block.coral?raw';
import flowchart from './example-sources/flowchart.coral?raw';
import bpmn from './example-sources/bpmn.coral?raw';
import code from './example-sources/code.coral?raw';
import architecture from './example-sources/architecture.coral?raw';
import aiml from './example-sources/aiml.coral?raw';
import dataEngineering from './example-sources/data-engineering.coral?raw';
import sketch from './example-sources/sketch.coral?raw';
import umlClass from './example-sources/uml-class.coral?raw';
import umlSequence from './example-sources/uml-sequence.coral?raw';
import userSymbol from './example-sources/user-symbol.coral?raw';

export interface BundledSourceExample028 {
  readonly id: string;
  readonly notation: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
}

/** Freeze nested metadata so consumers cannot change the shared contract. */
function freezeCatalog<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeCatalog);
    Object.freeze(value);
  }
  return value;
}
export const exampleCatalog = freezeCatalog(validateExampleCatalog(manifest));
const sources: Record<string, string> = {
  'user-symbol.coral': userSymbol,
  'block.coral': block, 'flowchart.coral': flowchart, 'bpmn.coral': bpmn,
  'code.coral': code, 'architecture.coral': architecture, 'aiml.coral': aiml,
  'data-engineering.coral': dataEngineering, 'sketch.coral': sketch,
  'uml-class.coral': umlClass, 'uml-sequence.coral': umlSequence, 'order-service.coral': orderService,
};
/** Authored Coral text is the only semantic master copy for these examples. */
export const bundledSourceExamples028: readonly BundledSourceExample028[] = Object.freeze(
  exampleCatalog.entries.map(({ id, notation, name, description, sourceFile }) => {
    const source = sources[sourceFile];
    if (!source) throw new Error(`Missing bundled source: ${sourceFile}`);
    return Object.freeze({ id, notation, name, description, source });
  }),
);
