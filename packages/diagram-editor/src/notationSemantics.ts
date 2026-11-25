import { approvedNotationTypeWords028, notationRegistry, resolveNotationNode028,
  type CatalogSnapshot028 } from '@coral-viz/render';

export type NotationType =
  | 'block'
  | 'architecture'
  | 'flowchart'
  | 'bpmn'
  | 'erd'
  | 'code'
  | 'aiml'
  | 'data-engineering'
  | 'sketch'
  | 'uml-class'
  | 'uml-sequence';

interface NotationSemanticMapping {
  readonly symbolTypes: Readonly<Record<string, string>>;
  readonly typeSymbols: Readonly<Record<string, string>>;
}

const baseAliases = (
  service: string,
  database: string,
  module: string,
  externalApi: string,
  actor: string,
  group: string,
): Record<string, string> => ({
  service, database, module, external_api: externalApi, actor, group,
});

const NOTATION_SEMANTICS: Readonly<Record<NotationType, NotationSemanticMapping>> = {
  block: {
    symbolTypes: { 'block-unit': 'block' },
    typeSymbols: { block: 'block-unit' },
  },
  architecture: {
    symbolTypes: {
      'arch-service': 'service', 'arch-database': 'database', 'arch-queue': 'queue',
      'arch-external-api': 'external_api', 'arch-actor': 'actor', 'arch-load-balancer': 'load_balancer',
      'arch-container': 'group', 'arch-cdn': 'cdn', 'arch-storage': 'storage',
      'arch-function': 'function', 'arch-annotation': 'label',
    },
    typeSymbols: {
      ...baseAliases('arch-service', 'arch-database', 'arch-service', 'arch-external-api', 'arch-actor', 'arch-container'),
      queue: 'arch-queue', load_balancer: 'arch-load-balancer', cdn: 'arch-cdn', storage: 'arch-storage',
      function: 'arch-function', label: 'arch-annotation',
    },
  },
  flowchart: {
    symbolTypes: {
      'flowchart-terminal': 'terminal', 'flowchart-process': 'process',
      'flowchart-decision': 'decision', 'flowchart-io': 'external_api',
      'flowchart-document': 'document', 'flowchart-predefined': 'database',
      'flowchart-connector': 'group', 'flowchart-annotation': 'label',
    },
    typeSymbols: {
      ...baseAliases('flowchart-process', 'flowchart-predefined', 'flowchart-decision', 'flowchart-io', 'flowchart-terminal', 'flowchart-connector'),
      process: 'flowchart-process', decision: 'flowchart-decision', terminal: 'flowchart-terminal',
      document: 'flowchart-document',
      label: 'flowchart-annotation',
    },
  },
  bpmn: {
    symbolTypes: {
      'bpmn-start-event': 'startEvent', 'bpmn-end-event': 'endEvent',
      'bpmn-intermediate-event': 'event', 'bpmn-task': 'task',
      'bpmn-subprocess': 'subprocess', 'bpmn-gateway-exclusive': 'exclusiveGateway',
      'bpmn-gateway-parallel': 'parallelGateway', 'bpmn-gateway-inclusive': 'decision',
      'bpmn-gateway-event': 'decision', 'bpmn-data-object': 'document',
      'bpmn-data-store': 'database', 'bpmn-pool': 'group', 'bpmn-lane': 'group',
      'bpmn-annotation': 'label',
    },
    typeSymbols: {
      ...baseAliases('bpmn-task', 'bpmn-data-store', 'bpmn-gateway-exclusive', 'bpmn-task', 'bpmn-start-event', 'bpmn-pool'),
      startEvent: 'bpmn-start-event', endEvent: 'bpmn-end-event',
      task: 'bpmn-task', exclusiveGateway: 'bpmn-gateway-exclusive',
      parallelGateway: 'bpmn-gateway-parallel',
      process: 'bpmn-task', decision: 'bpmn-gateway-exclusive', terminal: 'bpmn-end-event',
      event: 'bpmn-intermediate-event', subprocess: 'bpmn-subprocess', document: 'bpmn-data-object',
      label: 'bpmn-annotation',
    },
  },
  erd: {
    symbolTypes: {
      'erd-entity': 'database', 'erd-relationship': 'relationship', 'erd-attribute': 'property',
      'erd-cardinality': 'type_alias', 'erd-isa': 'decision', 'erd-note': 'label',
    },
    typeSymbols: {
      ...baseAliases('erd-entity', 'erd-entity', 'erd-attribute', 'erd-entity', 'erd-entity', 'erd-entity'),
      relationship: 'erd-relationship', property: 'erd-attribute', type_alias: 'erd-cardinality', decision: 'erd-isa', label: 'erd-note',
    },
  },
  code: {
    symbolTypes: {
      'code-function': 'function', 'code-class': 'class', 'code-module': 'module',
      'code-variable': 'variable', 'code-type': 'interface', 'code-namespace': 'namespace',
      'code-external': 'external_module', 'code-comment': 'label',
    },
    typeSymbols: {
      ...baseAliases('code-function', 'code-module', 'code-module', 'code-external', 'code-external', 'code-module'),
      function: 'code-function', method: 'code-function', class: 'code-class', interface: 'code-type',
      external_module: 'code-external', type_alias: 'code-type', variable: 'code-variable',
      constant: 'code-variable', property: 'code-variable', struct: 'code-class',
      namespace: 'code-namespace', label: 'code-comment',
    },
  },
  aiml: {
    symbolTypes: {
      'aiml-model': 'model', 'aiml-llm': 'llm', 'aiml-dataset': 'dataset',
      'aiml-vector-store': 'vector_store', 'aiml-embedding': 'embedding',
      'aiml-training': 'training', 'aiml-inference': 'inference',
      'aiml-feature-store': 'feature_store', 'aiml-gpu': 'gpu', 'aiml-agent': 'agent',
      'aiml-prompt': 'prompt', 'aiml-guardrail': 'guardrail', 'aiml-evaluator': 'evaluator',
      'aiml-retriever': 'retriever', 'aiml-memory': 'memory', 'aiml-tool': 'tool',
      'aiml-annotation': 'label',
    },
    typeSymbols: {
      ...baseAliases('aiml-model', 'aiml-vector-store', 'aiml-tool', 'aiml-tool', 'aiml-agent', 'aiml-agent'),
      model: 'aiml-model', llm: 'aiml-llm', dataset: 'aiml-dataset',
      vector_store: 'aiml-vector-store', embedding: 'aiml-embedding', training: 'aiml-training',
      inference: 'aiml-inference', feature_store: 'aiml-feature-store', gpu: 'aiml-gpu',
      agent: 'aiml-agent', prompt: 'aiml-prompt', guardrail: 'aiml-guardrail',
      evaluator: 'aiml-evaluator', retriever: 'aiml-retriever', memory: 'aiml-memory',
      tool: 'aiml-tool', label: 'aiml-annotation',
    },
  },
  'data-engineering': {
    symbolTypes: {
      'data-source': 'source', 'data-sink': 'sink', 'data-transform': 'transform',
      'data-lake': 'lake', 'data-warehouse': 'warehouse', 'data-stream': 'stream',
      'data-batch': 'batch', 'data-quality': 'quality', 'data-schema': 'schema',
      'data-catalog': 'catalog', 'data-cdc': 'cdc', 'data-dashboard': 'dashboard',
      'data-pipeline': 'pipeline', 'data-annotation': 'label',
    },
    typeSymbols: {
      ...baseAliases('data-transform', 'data-warehouse', 'data-pipeline', 'data-source', 'data-source', 'data-pipeline'),
      source: 'data-source', sink: 'data-sink', transform: 'data-transform', lake: 'data-lake',
      warehouse: 'data-warehouse', stream: 'data-stream', batch: 'data-batch', quality: 'data-quality',
      schema: 'data-schema', catalog: 'data-catalog', cdc: 'data-cdc', dashboard: 'data-dashboard',
      pipeline: 'data-pipeline', label: 'data-annotation',
    },
  },
  sketch: {
    symbolTypes: {
      'sketch-step': 'step', 'sketch-label': 'label', 'sketch-box': 'box',
      'sketch-decision': 'decision', 'sketch-circle': 'circle', 'sketch-cloud': 'cloud',
      'sketch-group': 'group',
    },
    typeSymbols: {
      ...baseAliases('sketch-step', 'sketch-box', 'sketch-box', 'sketch-cloud', 'sketch-circle', 'sketch-group'),
      step: 'sketch-step', label: 'sketch-label', box: 'sketch-box', decision: 'sketch-decision',
      circle: 'sketch-circle', cloud: 'sketch-cloud',
    },
  },
  'uml-class': {
    symbolTypes: {
      'uml-class': 'class', 'uml-interface': 'interface', 'uml-enum': 'enum',
    },
    typeSymbols: {
      class: 'uml-class', interface: 'uml-interface', enum: 'uml-enum',
    },
  },
  'uml-sequence': {
    symbolTypes: { 'uml-participant': 'participant', 'uml-actor': 'actor' },
    typeSymbols: { participant: 'uml-participant', actor: 'uml-actor' },
  },
};

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

function mapping(notation: string): NotationSemanticMapping | undefined {
  return hasOwn(NOTATION_SEMANTICS, notation) ? NOTATION_SEMANTICS[notation as NotationType] : undefined;
}

function own(record: Readonly<Record<string, string>> | undefined, key: string): string | undefined {
  return record !== undefined && hasOwn(record, key) ? record[key] : undefined;
}

/** Legacy parser/AI lookup; not an approved 0.2.8 implicit source word. */
export function symbolForSemanticType(semanticType: string, notation: string): string | undefined {
  return own(mapping(notation)?.typeSymbols, semanticType);
}

/** The narrower implicit spelling set used by the staged U1 language. */
export function approvedImplicitSymbol028(semanticType: string, notation: string): string | undefined {
  if (!approvedNotationTypeWords028(notation).includes(semanticType)) return undefined;
  return effectiveSymbolId({ type: semanticType }, notation);
}

export function semanticTypeForSymbol(symbolId: string, notation: string): string | undefined {
  return own(mapping(notation)?.symbolTypes, symbolId);
}

/**
 * The semantic type a prompt or lint surface may advertise for a symbol: only
 * when that type projects back to the same symbol. `symbolTypes` stays
 * many-to-one for palette creation; this guard keeps advertised claims true.
 */
export function advertisedSemanticTypeForSymbol(symbolId: string, notation: string): string | undefined {
  const current = mapping(notation);
  const semanticType = own(current?.symbolTypes, symbolId);
  return semanticType !== undefined && effectiveSymbolId({ type: semanticType }, notation) === symbolId
    ? semanticType : undefined;
}

/** Legacy parser/AI vocabulary; 0.2.8 source must use approvedNotationTypeWords028. */
export function getSemanticTypesForNotation(notation: string): string[] {
  return Object.keys(mapping(notation)?.typeSymbols ?? {});
}

/** A `local.` symbol resolves only through its document catalog; without one it stays unresolved. */
export function effectiveSymbolId(
  node: { type: string; symbol?: string }, notation: string, catalog?: CatalogSnapshot028,
): string | undefined {
  if (!notationRegistry.has(notation)) return undefined;
  return resolveNotationNode028({ id: '', type: node.type, ...('symbol' in node ? { symbol: node.symbol } : {}) },
    notation, catalog).effectiveSymbolId;
}
