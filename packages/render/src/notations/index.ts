/**
 * Notation Registry - Loads and provides access to notation definitions
 *
 * Notations define the grammar: which symbols are valid, how they connect,
 * and validation rules for a complete diagram.
 */

import type {
  NotationDefinition,
  NotationRegistry,
} from '../types.js';
import { editionAdmits0214, HEADER_MANIFEST_028 } from '@coral-viz/language';
import { symbolRegistry } from '../symbols/index.js';
import { shapeRegistry } from '../shapes/index.js';
import { glyphRegistry } from '../glyphs/index.js';
import { freezeCatalog028 } from '../catalogFreeze028.js';
import { sha256Hex028 } from '../catalogDigest028.js';
import { resolveNodeInterpretation028, type CatalogSnapshot028, type NodeInterpretation028,
  type NodeInterpretationInput028 } from '../interpretation028.js';

// Import notation definitions
import { flowchartNotation } from './flowchart.js';
import { blockNotation } from './block.js';
import { bpmnNotation } from './bpmn.js';
import { erdNotation } from './erd.js';
import { codeNotation } from './code.js';
import { architectureNotation } from './architecture.js';
import { infrastructureNotation } from './infrastructure.js';
import { aimlNotation } from './aiml.js';
import { dataEngineeringNotation } from './data-engineering.js';
import { sketchNotation } from './sketch.js';
import { umlClassNotation, umlSequenceNotation } from './uml.js';
import { umlStateNotation } from './state.js';

// Combine all notations
const allNotations: NotationDefinition[] = [
  blockNotation,
  flowchartNotation,
  bpmnNotation,
  erdNotation,
  codeNotation,
  architectureNotation,
  infrastructureNotation,
  aimlNotation,
  dataEngineeringNotation,
  sketchNotation,
  umlClassNotation,
  umlSequenceNotation,
  umlStateNotation,
];

// Build notation map
const notationMap = new Map<string, NotationDefinition>();
allNotations.forEach((notation) => notationMap.set(notation.id, notation));
freezeCatalog028(allNotations);

function contentFingerprint(value: unknown): string {
  return `sha256-${sha256Hex028(JSON.stringify(value))}`;
}

const catalogSnapshots = new Map<string, CatalogSnapshot028>();
const catalogSnapshots0214 = new Map<string, CatalogSnapshot028>();
const approvedTypeWords: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  block: { block: 'block-unit' },
  architecture: {
    service: 'arch-service', database: 'arch-database', actor: 'arch-actor',
  },
  flowchart: {
    process: 'flowchart-process', decision: 'flowchart-decision', terminal: 'flowchart-terminal',
    io: 'flowchart-io', document: 'flowchart-document',
  },
  bpmn: {
    task: 'bpmn-task', startEvent: 'bpmn-start-event', endEvent: 'bpmn-end-event',
    exclusiveGateway: 'bpmn-gateway-exclusive', parallelGateway: 'bpmn-gateway-parallel',
  },
  erd: { entity: 'erd-entity', attribute: 'erd-attribute', relationship: 'erd-relationship' },
  'uml-class': { class: 'uml-class', interface: 'uml-interface', enum: 'uml-enum' },
  'uml-sequence': { participant: 'uml-participant', actor: 'uml-actor' },
  // A generic BPMN event remains unspecified, never an intermediate event.
};
/** Edition 0.2.14 additive type-word mappings (N1 + N2 + N3 + N4 + N5). */
const approvedTypeWords0214Extra: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  block: {
    box: 'block-unit', rounded: 'block-rounded', circle: 'block-circle',
    oval: 'block-oval', triangle: 'block-triangle', diamond: 'block-diamond',
    cylinder: 'block-cylinder', pill: 'block-pill', note: 'block-note',
    group: 'block-group',
  },
  architecture: {
    person: 'arch-actor', system: 'arch-system', externalSystem: 'arch-external-system',
    container: 'arch-deployable', component: 'arch-component', queue: 'arch-queue',
    storage: 'arch-storage', cdn: 'arch-cdn', function: 'arch-function',
    loadBalancer: 'arch-load-balancer', gateway: 'arch-load-balancer',
    boundary: 'arch-container', systemBoundary: 'arch-system-boundary',
    containerBoundary: 'arch-container-boundary', group: 'arch-container',
  },
  infrastructure: {
    users: 'infra-users', cdn: 'infra-cdn', dns: 'infra-dns',
    waf: 'infra-waf', firewall: 'infra-waf', gateway: 'infra-gateway',
    loadBalancer: 'infra-load-balancer', compute: 'infra-compute',
    vm: 'infra-compute', container: 'infra-container',
    kubernetes: 'infra-kubernetes', k8s: 'infra-kubernetes',
    function: 'infra-function', database: 'infra-database',
    nosql: 'infra-database', cache: 'infra-cache',
    storage: 'infra-storage', blockStorage: 'infra-storage',
    queue: 'infra-queue', eventBus: 'infra-queue',
    iam: 'infra-iam', secrets: 'infra-iam',
    monitoring: 'infra-monitoring', ml: 'infra-ml', note: 'infra-note',
    cloud: 'infra-boundary', account: 'infra-boundary',
    subscription: 'infra-boundary', project: 'infra-boundary',
    region: 'infra-boundary', az: 'infra-boundary',
    availabilityZone: 'infra-boundary', vpc: 'infra-boundary',
    vnet: 'infra-boundary', subnet: 'infra-boundary',
    cluster: 'infra-boundary', securityGroup: 'infra-boundary',
    boundary: 'infra-boundary',
  },
  aiml: {
    model: 'aiml-model', llm: 'aiml-llm', dataset: 'aiml-dataset',
    vectorStore: 'aiml-vector-store', vectorDb: 'aiml-vector-store',
    embedding: 'aiml-embedding', training: 'aiml-training',
    inference: 'aiml-inference', featureStore: 'aiml-feature-store',
    gpu: 'aiml-gpu', agent: 'aiml-agent', prompt: 'aiml-prompt',
    guardrail: 'aiml-guardrail', evaluator: 'aiml-evaluator',
    retriever: 'aiml-retriever', rag: 'aiml-retriever',
    memory: 'aiml-memory', tool: 'aiml-tool', annotation: 'aiml-annotation',
  },
  'data-engineering': {
    source: 'data-source', sink: 'data-sink', transform: 'data-transform',
    lake: 'data-lake', warehouse: 'data-warehouse', stream: 'data-stream',
    batch: 'data-batch', quality: 'data-quality', schema: 'data-schema',
    catalog: 'data-catalog', cdc: 'data-cdc', dashboard: 'data-dashboard',
    pipeline: 'data-pipeline', annotation: 'data-annotation',
  },
  code: {
    function: 'code-function', class: 'code-class', module: 'code-module',
    variable: 'code-variable', type: 'code-type', namespace: 'code-namespace',
    external: 'code-external', comment: 'code-comment',
  },
  sketch: {
    step: 'sketch-step', label: 'sketch-label', box: 'sketch-box',
    decision: 'sketch-decision', circle: 'sketch-circle',
    cloud: 'sketch-cloud', group: 'sketch-group',
  },
  erd: {
    entity: 'erd-entity', weakEntity: 'erd-weak-entity', table: 'erd-entity',
    view: 'erd-view', note: 'erd-note',
  },
};
const UPGRADED_IN_0214 = new Set(['aiml', 'data-engineering', 'code', 'sketch', 'block', 'architecture', 'erd']);
/** Author-facing implicit type words approved for this profile edition. */
export function approvedNotationTypeWords028(notationId: string): readonly string[] {
  if (notationId === 'infrastructure') return Object.keys(approvedTypeWords0214Extra.infrastructure ?? {});
  return notationMap.has(notationId) ? Object.keys(approvedTypeWords[notationId] ?? {}) : [];
}
/** Author-facing implicit type words approved for edition 0.2.14. */
export function approvedNotationTypeWords0214(notationId: string): readonly string[] {
  if (!notationMap.has(notationId)) return [];
  const merged = notationId === 'erd'
    ? (approvedTypeWords0214Extra.erd ?? {})
    : { ...(approvedTypeWords[notationId] ?? {}), ...(approvedTypeWords0214Extra[notationId] ?? {}) };
  return Object.keys(merged);
}
function snapshotFor(notation: NotationDefinition): CatalogSnapshot028 {
  // infrastructure was introduced in edition 0.2.14 (no 0.2.8 digest exists).
  if (notation.id === 'infrastructure') return snapshotFor0214(notation);
  const installed = notationMap.get(notation.id) === notation;
  const prior = installed ? catalogSnapshots.get(notation.id) : undefined;
  if (prior) return prior;
  // Isolate 0.2.8 baseline items so 0.2.8/0.2.9 digests remain byte-identical forever.
  const symbols = symbolRegistry.getAll().filter((s) => !s.addedInEdition);
  const shapes = shapeRegistry.getAll().filter((s) => !s.addedInEdition);
  const glyphs = glyphRegistry.getAll().filter((g) => !g.addedInEdition);
  const baselineSymbolIds = new Set(symbols.map((s) => s.id));
  const baselineNotationSymbols = notation.symbols.filter((id) => baselineSymbolIds.has(id));
  const { symbols0214: _omit0214, ...baselineNotation } = notation;
  void _omit0214;
  const typeSymbols = new Map(baselineNotationSymbols.map((id) => [id, id]));
  for (const [word, symbolId] of Object.entries(approvedTypeWords[notation.id] ?? {})) {
    typeSymbols.set(word, symbolId);
  }
  const snapshot: CatalogSnapshot028 = {
    identity: { id: notation.id, version: notation.version,
      digest: contentFingerprint({ notation: baselineNotation, symbols: [...symbols].sort((a, b) => a.id.localeCompare(b.id)),
        shapes: [...shapes].sort((a, b) => a.id.localeCompare(b.id)),
        glyphs: [...glyphs].sort((a, b) => a.id.localeCompare(b.id)),
        typeSymbols: [...typeSymbols].sort(([a], [b]) => a.localeCompare(b)) }) },
    profileId: notation.id,
    symbols: new Map(symbols.map((symbol) => [symbol.id, symbol])),
    allowedSymbolIds: new Set(baselineNotationSymbols),
    // Remaining profile words are an author gate; unmapped types stay generic.
    typeSymbols,
  };
  if (installed) catalogSnapshots.set(notation.id, snapshot);
  return snapshot;
}
function snapshotFor0214(notation: NotationDefinition): CatalogSnapshot028 {
  const installed = notationMap.get(notation.id) === notation;
  if (!UPGRADED_IN_0214.has(notation.id) && notation.id !== 'infrastructure') {
    return snapshotFor(notation);
  }
  const prior = installed ? catalogSnapshots0214.get(notation.id) : undefined;
  if (prior) return prior;
  const symbols = symbolRegistry.getAll();
  const shapes = shapeRegistry.getAll();
  const glyphs = glyphRegistry.getAll();
  const allNotationSymbols = [...notation.symbols, ...(notation.symbols0214 ?? [])];
  const typeSymbols = new Map(allNotationSymbols.map((id) => [id, id]));
  const words0214 = notation.id === 'erd'
    ? (approvedTypeWords0214Extra.erd ?? {})
    : { ...(approvedTypeWords[notation.id] ?? {}), ...(approvedTypeWords0214Extra[notation.id] ?? {}) };
  for (const [word, symbolId] of Object.entries(words0214)) {
    typeSymbols.set(word, symbolId);
  }
  const version = notation.id === 'infrastructure' ? notation.version : '1.1.0';
  const snapshot: CatalogSnapshot028 = {
    identity: { id: notation.id, version,
      digest: contentFingerprint({ notation: { ...notation, symbols: allNotationSymbols, version },
        symbols: [...symbols].sort((a, b) => a.id.localeCompare(b.id)),
        shapes: [...shapes].sort((a, b) => a.id.localeCompare(b.id)),
        glyphs: [...glyphs].sort((a, b) => a.id.localeCompare(b.id)),
        typeSymbols: [...typeSymbols].sort(([a], [b]) => a.localeCompare(b)) }) },
    profileId: notation.id,
    symbols: new Map(symbols.map((symbol) => [symbol.id, symbol])),
    allowedSymbolIds: new Set(allNotationSymbols),
    typeSymbols,
  };
  if (installed) catalogSnapshots0214.set(notation.id, snapshot);
  return snapshot;
}

/** Exact installed catalog used by the shared 0.2.8 node interpreter. */
export function notationCatalogIdentity028(notationId: string): CatalogSnapshot028['identity'] | undefined {
  const notation = notationRegistry.get(notationId);
  return notation ? { ...snapshotFor(notation).identity } : undefined;
}

/** Exact installed catalog identity for edition 0.2.14. */
export function notationCatalogIdentity0214(notationId: string): CatalogSnapshot028['identity'] | undefined {
  const notation = notationRegistry.get(notationId);
  return notation ? { ...snapshotFor0214(notation).identity } : undefined;
}

/** The frozen installed snapshot for a notation; document overlays build on it. */
export function installedCatalogSnapshot028(notationId: string): CatalogSnapshot028 {
  const notation = notationRegistry.get(notationId);
  if (!notation) throw new Error(`Unknown notation ${notationId}`);
  return snapshotFor(notation);
}

/** The frozen edition 0.2.14 installed snapshot for a notation. */
export function installedCatalogSnapshot0214(notationId: string): CatalogSnapshot028 {
  const notation = notationRegistry.get(notationId);
  if (!notation) throw new Error(`Unknown notation ${notationId}`);
  return snapshotFor0214(notation);
}

/** Edition-aware installed snapshot selector (defaults to 0.2.8 when omitted). */
export function installedCatalogSnapshotForEdition(notationId: string, edition?: string): CatalogSnapshot028 {
  return edition !== undefined && editionAdmits0214(edition)
    ? installedCatalogSnapshot0214(notationId)
    : installedCatalogSnapshot028(notationId);
}

/** Installed-catalog adapter for the pure U1 interpretation seam. A document
 * catalog (`documentCatalog029`) replaces the installed snapshot when given. */
export function resolveNotationNode028(
  node: NodeInterpretationInput028,
  notationId: string,
  catalog?: CatalogSnapshot028,
): NodeInterpretation028 {
  const notation = notationRegistry.get(notationId);
  if (!notation) throw new Error(`Unknown notation ${notationId}`);
  if (catalog && catalog.profileId !== notationId)
    throw new Error(`Document catalog for ${catalog.profileId} cannot resolve notation ${notationId}`);
  return resolveNodeInterpretation028(node, catalog ?? snapshotFor(notation));
}

/**
 * Notation registry implementation
 */
export const notationRegistry: NotationRegistry = {
  get(id: string): NotationDefinition | undefined {
    return notationMap.get(id);
  },

  getAll(): NotationDefinition[] {
    return allNotations;
  },

  has(id: string): boolean {
    return notationMap.has(id);
  },

};

/**
 * Get a notation by ID (convenience function)
 */
export function getNotation(id: string): NotationDefinition | undefined {
  return notationRegistry.get(id);
}

/**
 * Get all available notations
 */
export function getAllNotations(): NotationDefinition[] {
  return notationRegistry.getAll();
}

/** Diagram types offered for new visual Coral 0.2.8 documents. Character-only,
 * research and older catalogs remain installed without becoming visual types. */
export function getAvailableNotations028(): NotationDefinition[] {
  const editions = HEADER_MANIFEST_028['0.2.8'];
  return allNotations.filter((notation) => {
    const edition = editions?.[notation.id];
    return edition !== undefined && edition.enabled !== false && notation.id !== 'uml-state';
  });
}

/** Diagram types offered for new visual Coral 0.2.14 documents (includes Crow's Foot ERD and infrastructure). */
export function getAvailableNotations0214(): NotationDefinition[] {
  const editions = HEADER_MANIFEST_028['0.2.14'];
  return allNotations.filter((notation) => {
    const edition = editions?.[notation.id];
    return edition !== undefined && edition.enabled !== false && notation.id !== 'uml-state';
  });
}

// Re-export individual notations
export { blockNotation } from './block.js';
export { flowchartNotation } from './flowchart.js';
export { bpmnNotation } from './bpmn.js';
export { erdNotation } from './erd.js';
export { codeNotation } from './code.js';
export { architectureNotation } from './architecture.js';
export { infrastructureNotation } from './infrastructure.js';
export { aimlNotation } from './aiml.js';
export { dataEngineeringNotation } from './data-engineering.js';
export { sketchNotation } from './sketch.js';
export { umlClassNotation, umlSequenceNotation } from './uml.js';
export { umlStateNotation } from './state.js';
