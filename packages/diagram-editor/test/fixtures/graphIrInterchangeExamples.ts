/** Historical GraphIR fixtures for interchange and conversion tests only. */
import {
  CURRENT_SCHEMA_VERSION,
  deserialize,
  getEdgeCompatibility,
  notationRegistry,
  symbolRegistry,
  type CoralDocument,
} from '@coral-viz/viz';
import {
  UML_SEQUENCE_NOTATION,
  UML_SEQUENCE_PROFILE,
  deriveSequenceCore,
  validateSequenceInteraction,
  type GraphIR,
} from '@coral-viz/language';
import { checkGraphConformance028, getAvailableNotations028 } from '@coral-viz/render';
import { KNOWN_NODE_TYPES } from '../../src/parsers';
import { semanticTypeForSymbol } from '../../src/notationSemantics';

export interface BundledExample {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly notation: string;
  readonly document: CoralDocument;
}

type ExampleShape = {
  notation: string;
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    symbol: string;
    label: string;
    variant?: string;
    properties?: Record<string, unknown>;
    classifier?: NonNullable<CoralDocument['content']['graphIR']>['nodes'][number]['classifier'];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
    sourceEnd?: { multiplicity: { lower: number; upper: number | '*' } };
    targetEnd?: { multiplicity: { lower: number; upper: number | '*' } };
  }>;
  /** Ordered interaction records beyond the derived participants and messages. */
  interaction?: Pick<NonNullable<GraphIR['interaction']>, 'activations' | 'fragments' | 'notes'>;
};

const SOURCE_DATE = '2026-09-13T00:00:00.000Z';
const hasOwn = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

/** A sequence graph carries only closed-list fields; order is the interaction's. */
function sequenceGraphFor(shape: ExampleShape): GraphIR {
  const nodes = shape.nodes.map(({ id, type, label }) => ({ id, type, label }));
  return {
    version: '3.0.0',
    id: `example-${shape.notation}`,
    name: shape.name,
    metadata: { notation: shape.notation },
    profile: UML_SEQUENCE_PROFILE,
    nodes,
    edges: shape.edges,
    interaction: { ...deriveSequenceCore(nodes, shape.edges), ...shape.interaction },
  };
}

function documentFor(shape: ExampleShape): CoralDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      name: shape.name,
      description: shape.description,
      created: SOURCE_DATE,
      modified: SOURCE_DATE,
    },
    content: {
      format: 'graph-ir',
      graphIR: shape.notation === UML_SEQUENCE_NOTATION ? sequenceGraphFor(shape) : {
        version: '3.0.0',
        id: `example-${shape.notation}`,
        name: shape.name,
        metadata: { notation: shape.notation },
        ...(shape.notation === 'uml-class'
          ? { profile: { id: 'uml' as const, kind: 'class' as const, version: '1.0.0' as const } }
          : {}),
        nodes: shape.nodes.map((node, index) => ({
          ...node,
          position: { x: index * 240, y: index % 2 === 0 ? 0 : 120 },
        })),
        edges: shape.edges,
      },
    },
    settings: {
      notation: shape.notation,
      layout: { algorithm: 'layered', direction: 'RIGHT' },
    },
    nodePositions: Object.fromEntries(shape.nodes.map((node, index) => [
      node.id,
      { x: index * 240, y: index % 2 === 0 ? 0 : 120 },
    ])),
  };
}

const shapes: ExampleShape[] = [
  {
    notation: 'block', name: 'Signal path', description: 'Two functional blocks connected by a signal.',
    nodes: [
      { id: 'producer', type: 'block', symbol: 'block-unit', label: 'Producer' },
      { id: 'consumer', type: 'block', symbol: 'block-unit', label: 'Consumer' },
    ],
    edges: [{ id: 'signal', source: 'producer', target: 'consumer', type: 'flow' }],
  },
  {
    notation: 'flowchart', name: 'Request review', description: 'A small decision flow.',
    nodes: [
      { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', variant: 'start', label: 'Start' },
      { id: 'review', type: 'process', symbol: 'flowchart-process', label: 'Review request' },
      { id: 'decision', type: 'decision', symbol: 'flowchart-decision', label: 'Approved?' },
      { id: 'revise', type: 'process', symbol: 'flowchart-process', label: 'Revise request' },
      { id: 'end', type: 'terminal', symbol: 'flowchart-terminal', variant: 'end', label: 'Done' },
    ],
    edges: [
      { id: 'to-review', source: 'start', target: 'review', type: 'flow' },
      { id: 'to-decision', source: 'review', target: 'decision', type: 'flow' },
      { id: 'approved', source: 'decision', target: 'end', type: 'flow', label: 'Yes' },
      { id: 'changes', source: 'decision', target: 'revise', type: 'flow', label: 'No' },
      { id: 'resubmit', source: 'revise', target: 'decision', type: 'flow' },
    ],
  },
  {
    notation: 'bpmn', name: 'Approve invoice', description: 'A compact BPMN process.',
    nodes: [
      { id: 'start', type: 'startEvent', symbol: 'bpmn-start-event', label: 'Invoice received' },
      { id: 'task', type: 'task', symbol: 'bpmn-task', variant: 'user', label: 'Approve invoice' },
      { id: 'gateway', type: 'exclusiveGateway', symbol: 'bpmn-gateway-exclusive', label: 'Approved?' },
      { id: 'revise', type: 'task', symbol: 'bpmn-task', label: 'Request changes' },
      { id: 'end', type: 'endEvent', symbol: 'bpmn-end-event', label: 'Approved' },
    ],
    edges: [
      { id: 'to-task', source: 'start', target: 'task', type: 'sequence' },
      { id: 'to-gateway', source: 'task', target: 'gateway', type: 'sequence' },
      { id: 'to-end', source: 'gateway', target: 'end', type: 'sequence', label: 'Yes' },
      { id: 'to-revise', source: 'gateway', target: 'revise', type: 'sequence', label: 'No' },
      { id: 'retry', source: 'revise', target: 'gateway', type: 'sequence' },
    ],
  },
  {
    notation: 'erd', name: 'Customer orders', description: 'Entities and a relationship.',
    nodes: [
      { id: 'customer', type: 'database', symbol: 'erd-entity', label: 'Customer' },
      { id: 'customer-id', type: 'property', symbol: 'erd-attribute', variant: 'primary-key', label: 'customer_id' },
      { id: 'places', type: 'relationship', symbol: 'erd-relationship', label: 'places' },
      { id: 'order', type: 'database', symbol: 'erd-entity', label: 'Order' },
    ],
    edges: [
      { id: 'customer-key', source: 'customer', target: 'customer-id', type: 'attribute' },
      {
        id: 'customer-places', source: 'places', target: 'customer', type: 'relationship',
        sourceEnd: { multiplicity: { lower: 0, upper: '*' } },
        targetEnd: { multiplicity: { lower: 1, upper: 1 } },
      },
      {
        id: 'places-order', source: 'places', target: 'order', type: 'relationship',
        sourceEnd: { multiplicity: { lower: 1, upper: 1 } },
        targetEnd: { multiplicity: { lower: 0, upper: '*' } },
      },
    ],
  },
  {
    notation: 'code', name: 'Render call graph', description: 'A simple code call graph.',
    nodes: [
      { id: 'module', type: 'module', symbol: 'code-module', label: 'renderer.ts' },
      { id: 'renderer', type: 'class', symbol: 'code-class', variant: 'abstract', label: 'Renderer' },
      { id: 'render', type: 'function', symbol: 'code-function', label: 'render' },
      { id: 'version', type: 'variable', symbol: 'code-variable', variant: 'static', label: 'version' },
    ],
    edges: [
      { id: 'module-class', source: 'module', target: 'renderer', type: 'contains' },
      { id: 'class-render', source: 'renderer', target: 'render', type: 'contains' },
      { id: 'class-version', source: 'renderer', target: 'version', type: 'contains' },
    ],
  },
  {
    notation: 'architecture', name: 'Service and database', description: 'A small application architecture.',
    nodes: [
      { id: 'user', type: 'actor', symbol: 'arch-actor', label: 'User' },
      { id: 'service', type: 'service', symbol: 'arch-service', variant: 'api', label: 'API service' },
      { id: 'database', type: 'database', symbol: 'arch-database', label: 'Database' },
    ],
    edges: [
      { id: 'service-database', source: 'service', target: 'database', type: 'data' },
      { id: 'user-service', source: 'user', target: 'service', type: 'sync' },
    ],
  },
  {
    notation: 'aiml', name: 'Model training', description: 'A compact AI/ML training pipeline.',
    nodes: [
      { id: 'dataset', type: 'dataset', symbol: 'aiml-dataset', label: 'Dataset' },
      { id: 'training', type: 'training', symbol: 'aiml-training', label: 'Training' },
      { id: 'model', type: 'model', symbol: 'aiml-model', label: 'Model' },
      { id: 'inference', type: 'inference', symbol: 'aiml-inference', label: 'Inference' },
    ],
    edges: [
      { id: 'dataset-training', source: 'dataset', target: 'training', type: 'training' },
      { id: 'training-model', source: 'training', target: 'model', type: 'training' },
      { id: 'model-inference', source: 'model', target: 'inference', type: 'inference' },
    ],
  },
  {
    notation: 'data-engineering', name: 'Batch pipeline', description: 'A source-to-warehouse data pipeline.',
    nodes: [
      { id: 'source', type: 'source', symbol: 'data-source', label: 'Source' },
      { id: 'transform', type: 'transform', symbol: 'data-transform', label: 'Transform' },
      { id: 'quality', type: 'quality', symbol: 'data-quality', label: 'Quality gate' },
      { id: 'warehouse', type: 'warehouse', symbol: 'data-warehouse', label: 'Warehouse' },
      { id: 'sink', type: 'sink', symbol: 'data-sink', label: 'Quarantine' },
    ],
    edges: [
      { id: 'source-transform', source: 'source', target: 'transform', type: 'batch-flow' },
      { id: 'transform-quality', source: 'transform', target: 'quality', type: 'batch-flow' },
      { id: 'quality-warehouse', source: 'quality', target: 'warehouse', type: 'quality', label: 'Pass' },
      { id: 'quality-sink', source: 'quality', target: 'sink', type: 'quality', label: 'Fail' },
    ],
  },
  {
    notation: 'sketch', name: 'Idea sketch', description: 'A loose whiteboard flow.',
    nodes: [
      { id: 'idea', type: 'cloud', symbol: 'sketch-cloud', label: 'Idea' },
      { id: 'decision', type: 'decision', symbol: 'sketch-decision', label: 'Ready?' },
      { id: 'next', type: 'step', symbol: 'sketch-step', label: 'Next step' },
    ],
    edges: [
      { id: 'idea-decision', source: 'idea', target: 'decision', type: 'flow' },
      { id: 'decision-next', source: 'decision', target: 'next', type: 'flow', label: 'Yes' },
      { id: 'decision-idea', source: 'decision', target: 'idea', type: 'flow', label: 'No' },
    ],
  },
  {
    notation: 'uml-class', name: 'Order model', description: 'Structured UML classifiers.',
    nodes: [
      {
        id: 'order', type: 'class', symbol: 'uml-class', label: 'Order',
        classifier: { kind: 'class', name: 'Order', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'attributes', kind: 'attributes', items: [
            { id: 'attribute-1', kind: 'attribute', visibility: 'private', name: 'id', type: 'UUID' },
          ] },
        ] },
      },
      {
        id: 'repository', type: 'interface', symbol: 'uml-interface', label: 'Repository',
        classifier: { kind: 'interface', name: 'Repository', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'operations', kind: 'operations', items: [
            { id: 'operation-1', kind: 'operation', visibility: 'public', name: 'save', parameters: [{ name: 'order', type: 'Order' }], returnType: 'Void' },
          ] },
        ] },
      },
      {
        id: 'state', type: 'enum', symbol: 'uml-enum', label: 'State',
        classifier: { kind: 'enum', name: 'State', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'literals', kind: 'literals', items: [
            { id: 'literal-1', kind: 'literal', name: 'OPEN' },
            { id: 'literal-2', kind: 'literal', name: 'CLOSED' },
          ] },
        ] },
      },
    ],
    edges: [
      { id: 'order-repository', source: 'order', target: 'repository', type: 'realization' },
      { id: 'order-state', source: 'order', target: 'state', type: 'association' },
    ],
  },
  {
    notation: 'uml-sequence', name: 'Sign-in sequence', description: 'Ordered messages, an activation, a note, and an alt fragment.',
    nodes: [
      { id: 'user', type: 'actor', symbol: 'uml-actor', label: 'User' },
      { id: 'app', type: 'participant', symbol: 'uml-participant', label: 'App' },
      { id: 'auth', type: 'participant', symbol: 'uml-participant', label: 'Auth' },
    ],
    edges: [
      { id: 'sign_in', source: 'user', target: 'app', type: 'sync', label: 'sign in' },
      { id: 'verify', source: 'app', target: 'auth', type: 'sync', label: 'verify' },
      { id: 'granted', source: 'auth', target: 'app', type: 'return', label: 'token' },
      { id: 'denied', source: 'auth', target: 'app', type: 'return', label: 'denied' },
      { id: 'notify', source: 'app', target: 'user', type: 'async', label: 'result' },
    ],
    interaction: {
      activations: [{ id: 'activation-1', participantId: 'auth', startMessageId: 'verify', endMessageId: 'denied' }],
      fragments: [{ id: 'fragment-1', kind: 'alt', operands: [
        { id: 'fragment-1-operand-1', guard: { id: 'fragment-1-guard-1', text: 'valid' }, messageIds: ['granted'] },
        { id: 'fragment-1-operand-2', guard: { id: 'fragment-1-guard-2', text: 'invalid' }, messageIds: ['denied'] },
      ] }],
      notes: [{ id: 'note-1', text: 'Passwords are never logged', participantIds: ['auth'] }],
    },
  },
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const availableExampleNotations028 = new Set(getAvailableNotations028().map((notation) => notation.id));
export const bundledExamples: readonly BundledExample[] = deepFreeze(shapes
  .filter((shape) => availableExampleNotations028.has(shape.notation)).map((shape) => ({
    id: shape.notation,
    name: shape.name,
    description: shape.description,
    notation: shape.notation,
    document: documentFor(shape),
  })));

export type ExampleValidation = { ok: true } | { ok: false; error: string };

export function validateBundledExample(example: BundledExample): ExampleValidation {
  const notation = notationRegistry.get(example.notation);
  if (!notation) return { ok: false, error: 'Example notation is not installed.' };
  if (!availableExampleNotations028.has(example.notation)) {
    return { ok: false, error: 'Example diagram type is unavailable in Coral 0.2.8.' };
  }
  if (example.document.settings.notation !== example.notation) {
    return { ok: false, error: 'Example notation does not match its document.' };
  }
  try {
    deserialize(example.document);
  } catch {
    return { ok: false, error: 'Example document is invalid.' };
  }
  const graph = example.document.content.graphIR;
  if (!graph) return { ok: false, error: 'Example document is invalid.' };
  if (graph.metadata?.notation !== example.notation) {
    return { ok: false, error: 'Example notation does not match its graph.' };
  }
  if (example.notation === UML_SEQUENCE_NOTATION) {
    const [issue] = validateSequenceInteraction(graph);
    return issue ? { ok: false, error: `Example is not a valid UML sequence: ${issue.message}` } : { ok: true };
  }
  const nodes = graph.nodes.flatMap(function flatten(node): typeof graph.nodes {
    return [node, ...(node.children?.flatMap(flatten) ?? [])];
  });
  if (nodes.some((node) => !node.symbol || !notation.symbols.includes(node.symbol))) {
    return { ok: false, error: 'Example contains a symbol outside its notation.' };
  }
  if (nodes.some((node) => !KNOWN_NODE_TYPES.has(node.type) || notation.symbols.includes(node.type))) {
    return { ok: false, error: 'Example contains an invalid semantic node type.' };
  }
  if (nodes.some((node) => semanticTypeForSymbol(node.symbol!, example.notation) !== node.type)) {
    return { ok: false, error: 'Example semantic node type does not match its symbol.' };
  }
  if (nodes.some((node) => {
    if (node.variant === undefined) return false;
    const variants = symbolRegistry.get(node.symbol!)?.variants;
    return variants === undefined || !hasOwn(variants, node.variant);
  })) {
    return { ok: false, error: 'Example contains a variant outside its symbol.' };
  }
  if (graph.edges.some((edge) => edge.type !== undefined
    && (notation.edgeStyles === undefined || !hasOwn(notation.edgeStyles, edge.type)))) {
    return { ok: false, error: 'Example contains an edge style outside its notation.' };
  }
  if (checkGraphConformance028(graph, { savedLevel: 'typical' }).findings
    .some((finding) => finding.severity === 'error')) {
    return { ok: false, error: 'Example does not satisfy its notation.' };
  }
  const nodeInfo = new Map(nodes.map((node) => [node.id, {
    id: node.id, symbolId: node.symbol!, variant: node.variant,
  }]));
  if (getEdgeCompatibility(graph.edges, {
    notationId: example.notation, nodeInfo, existingEdges: graph.edges,
  }).some((result) => result.status === 'incompatible')) {
    return { ok: false, error: 'Example contains an invalid connection.' };
  }
  return { ok: true };
}

let cloneSequence = 0;

export function cloneBundledExample(
  id: string,
  now: () => Date = () => new Date(),
): CoralDocument {
  const example = bundledExamples.find((candidate) => candidate.id === id);
  if (!example) throw new Error('The selected example is not available.');
  const validation = validateBundledExample(example);
  if (!validation.ok) throw new Error(validation.error);
  const clone = typeof structuredClone === 'function'
    ? structuredClone(example.document)
    : JSON.parse(JSON.stringify(example.document)) as CoralDocument;
  const timestamp = now().toISOString();
  clone.metadata.created = timestamp;
  clone.metadata.modified = timestamp;
  if (clone.content.graphIR) {
    clone.content.graphIR.id = `${example.id}-${now().valueOf()}-${++cloneSequence}`;
  }
  return clone;
}
