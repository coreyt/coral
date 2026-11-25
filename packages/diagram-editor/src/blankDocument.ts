import { CURRENT_SCHEMA_VERSION, type CoralDocument } from '@coral-viz/viz';

let blankSequence = 0;

/** Internal document shell for transactions before authored Coral is parsed. */
export function createBlankDocument(now: () => Date = () => new Date()): CoralDocument {
  const timestamp = now().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { name: 'Untitled Diagram', created: timestamp, modified: timestamp },
    content: {
      format: 'graph-ir',
      graphIR: { version: '3.0.0', id: `blank-${now().valueOf()}-${++blankSequence}`, nodes: [], edges: [] },
    },
    settings: {
      notation: 'flowchart',
      layout: { algorithm: 'layered', direction: 'DOWN' },
    },
  };
}
