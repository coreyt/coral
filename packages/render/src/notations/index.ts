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
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
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
/** Author-facing implicit type words approved for this profile edition. */
export function approvedNotationTypeWords028(notationId: string): readonly string[] {
  return notationMap.has(notationId) ? Object.keys(approvedTypeWords[notationId] ?? {}) : [];
}
function snapshotFor(notation: NotationDefinition): CatalogSnapshot028 {
  const installed = notationMap.get(notation.id) === notation;
  const prior = installed ? catalogSnapshots.get(notation.id) : undefined;
  if (prior) return prior;
  const symbols = symbolRegistry.getAll();
  const shapes = shapeRegistry.getAll();
  const glyphs = glyphRegistry.getAll();
  const typeSymbols = new Map(notation.symbols.map((id) => [id, id]));
  for (const [word, symbolId] of Object.entries(approvedTypeWords[notation.id] ?? {})) {
    typeSymbols.set(word, symbolId);
  }
  const snapshot: CatalogSnapshot028 = {
    identity: { id: notation.id, version: notation.version,
      digest: contentFingerprint({ notation, symbols: [...symbols].sort((a, b) => a.id.localeCompare(b.id)),
        shapes: [...shapes].sort((a, b) => a.id.localeCompare(b.id)),
        glyphs: [...glyphs].sort((a, b) => a.id.localeCompare(b.id)),
        typeSymbols: [...typeSymbols].sort(([a], [b]) => a.localeCompare(b)) }) },
    profileId: notation.id,
    symbols: new Map(symbols.map((symbol) => [symbol.id, symbol])),
    allowedSymbolIds: new Set(notation.symbols),
    // Remaining profile words are an author gate; unmapped types stay generic.
    typeSymbols,
  };
  if (installed) catalogSnapshots.set(notation.id, snapshot);
  return snapshot;
}

/** Exact installed catalog used by the shared 0.2.8 node interpreter. */
export function notationCatalogIdentity028(notationId: string): CatalogSnapshot028['identity'] | undefined {
  const notation = notationRegistry.get(notationId);
  return notation ? { ...snapshotFor(notation).identity } : undefined;
}

/** The frozen installed snapshot for a notation; document overlays build on it. */
export function installedCatalogSnapshot028(notationId: string): CatalogSnapshot028 {
  const notation = notationRegistry.get(notationId);
  if (!notation) throw new Error(`Unknown notation ${notationId}`);
  return snapshotFor(notation);
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

// Re-export individual notations
export { blockNotation } from './block.js';
export { flowchartNotation } from './flowchart.js';
export { bpmnNotation } from './bpmn.js';
export { erdNotation } from './erd.js';
export { codeNotation } from './code.js';
export { architectureNotation } from './architecture.js';
export { aimlNotation } from './aiml.js';
export { dataEngineeringNotation } from './data-engineering.js';
export { sketchNotation } from './sketch.js';
export { umlClassNotation, umlSequenceNotation } from './uml.js';
export { umlStateNotation } from './state.js';
