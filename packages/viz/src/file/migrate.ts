/**
 * Coral Document Migration (CORAL-REQ-008)
 *
 * Handles schema version upgrades for backward compatibility.
 */

import type { CoralDocument } from './schema.js';
import type { GraphIR } from '../types.js';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './schema.js';
import {
  migrateGraphIR2To3,
  migrateIR,
  validateIR,
  type GraphIR2To3MigrationChange,
  type GraphIR2To3MigrationLoss,
  type MigrationDiagnostic,
} from '@graph-ir/core';
import {
  materializeReferencedPorts,
  stripResolvedPorts,
  type PortResolver,
} from './portMaterialization.js';

export interface DocumentGraphIRMigrationEvidence {
  fromVersion: string;
  toVersion: '3.0.0';
  changes: GraphIR2To3MigrationChange[];
  losses: GraphIR2To3MigrationLoss[];
  diagnostics: MigrationDiagnostic[];
}

export interface DocumentMigrationOptions {
  resolvePorts?: PortResolver;
}

export interface DocumentMigrationResult {
  document: CoralDocument;
  graphIR?: DocumentGraphIRMigrationEvidence;
}

/**
 * Move a legacy flat edge `lineStyle` into `style.lineStyle`. Coral 0.2.5 and
 * early 0.2.6 saves spread the editor's flat field into files, although
 * neither GraphIR 2 nor 3 allows it on an edge. An existing `style.lineStyle`
 * wins. The input is never mutated.
 */
function moveLegacyEdgeLineStyles<T>(graph: T): { graph: T; changes: GraphIR2To3MigrationChange[] } {
  const edges = (graph as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return { graph, changes: [] };
  const changes: GraphIR2To3MigrationChange[] = [];
  const moved = edges.map((edge: Record<string, unknown>, index) => {
    if (!edge || typeof edge !== 'object' || !('lineStyle' in edge)) return edge;
    const { lineStyle, ...rest } = edge;
    const style = (rest.style ?? {}) as Record<string, unknown>;
    changes.push({
      code: 'MOVE_EDGE_LINE_STYLE', path: `/edges/${index}/lineStyle`,
      message: style.lineStyle !== undefined && style.lineStyle !== lineStyle
        ? `Removed legacy flat lineStyle "${String(lineStyle)}"; style.lineStyle "${String(style.lineStyle)}" is kept`
        : 'Moved legacy flat lineStyle into style.lineStyle',
    });
    return lineStyle === undefined && style.lineStyle === undefined
      ? rest
      : { ...rest, style: { ...style, lineStyle: style.lineStyle ?? lineStyle } };
  });
  return changes.length ? { graph: { ...graph, edges: moved }, changes } : { graph, changes };
}

function migrateGraphIR(doc: CoralDocument, options: DocumentMigrationOptions = {}): DocumentMigrationResult {
  const original = doc.content.graphIR as unknown as { version?: unknown } | undefined;
  if (!original) return { document: doc };
  const { graph, changes: legacyChanges } = moveLegacyEdgeLineStyles(original);

  if (graph.version === '3.0.0') {
    const materialized = materializeReferencedPorts(graph as unknown as GraphIR, options.resolvePorts);
    const validation = validateIR(materialized.graph);
    if (validation.errors.length > 0) {
      throw new Error(`Invalid GraphIR 3 document: ${validation.errors.map((error) => `${error.code} ${error.path || '/'}: ${error.message}`).join('; ')}`);
    }
    const stripped = stripResolvedPorts(materialized.graph, options.resolvePorts);
    const changes = [...legacyChanges, ...materialized.changes, ...stripped.changes];
    if (changes.length === 0) return { document: doc };
    return {
      document: { ...doc, content: { ...doc.content, graphIR: stripped.graph } },
      graphIR: { fromVersion: '3.0.0', toVersion: '3.0.0', changes, losses: [], diagnostics: [] },
    };
  }

  let graph2: unknown = graph;
  const originalVersion = String(graph.version ?? 'unknown');
  if (graph.version === '1.0' || graph.version === '1.0.0') {
    const normalized = graph.version === '1.0'
      ? { ...(graph as Record<string, unknown>), version: '1.0.0' }
      : graph;
    const first = migrateIR(normalized);
    if (!first.success || !first.migrated) {
      const detail = [...first.errors, ...first.losses.map((loss) => `${loss.path}: ${loss.reason}`)].join('; ');
      throw new Error(`GraphIR 1.x document requires an explicit ambiguous-geometry migration decision: ${detail}`);
    }
    graph2 = first.migrated;
  } else if (graph.version !== '2.0.0') {
    throw new Error(`Unsupported GraphIR document version: ${originalVersion}`);
  }

  const materialized = materializeReferencedPorts(graph2 as GraphIR, options.resolvePorts);
  const second = migrateGraphIR2To3(materialized.graph);
  if (!second.success || !second.migrated) {
    const detail = [
      ...second.errors,
      ...second.losses.map((loss) => `${loss.code} ${loss.path || '/'}: ${loss.message}`),
    ].join('; ');
    throw new Error(`GraphIR ${originalVersion} document could not migrate to 3.0.0: ${detail}`);
  }
  const stripped = stripResolvedPorts(second.migrated, options.resolvePorts);
  return {
    document: { ...doc, content: { ...doc.content, graphIR: stripped.graph } },
    graphIR: {
      fromVersion: originalVersion,
      toVersion: '3.0.0',
      changes: [...legacyChanges, ...materialized.changes, ...second.changes, ...stripped.changes],
      losses: second.losses,
      diagnostics: second.diagnostics,
    },
  };
}

/**
 * Migration function type
 */
type MigrationFn = (doc: unknown) => unknown;

/**
 * Migration registry: maps "fromVersion→toVersion" to migration function
 */
const migrations: Record<string, MigrationFn> = {
  /**
   * Migrate from 0.9.0 to 1.0.0
   *
   * Changes:
   * - Added optional viewState.fitView field
   * - Added optional settings.layout.elkOptions field
   */
  '0.9.0→1.0.0': (doc: unknown): unknown => {
    const d = doc as Record<string, unknown>;
    return {
      ...d,
      schemaVersion: '1.0.0',
    };
  },
};

/**
 * Get the migration path from one version to another
 */
function getMigrationPath(fromVersion: string, toVersion: string): string[] {
  const path: string[] = [];
  const versionIndex = new Map<string, number>(
    SUPPORTED_SCHEMA_VERSIONS.map((v, i) => [v, i])
  );

  const fromIdx = versionIndex.get(fromVersion);
  const toIdx = versionIndex.get(toVersion);

  if (fromIdx === undefined || toIdx === undefined) {
    return [];
  }

  // Build migration path
  for (let i = fromIdx; i < toIdx; i++) {
    const from = SUPPORTED_SCHEMA_VERSIONS[i];
    const to = SUPPORTED_SCHEMA_VERSIONS[i + 1];
    path.push(`${from}→${to}`);
  }

  return path;
}

/**
 * Check if a schema version is known
 */
function isKnownVersion(version: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.includes(version as typeof SUPPORTED_SCHEMA_VERSIONS[number]);
}

/**
 * Migrate a document to the current schema version
 *
 * @param doc - Document to migrate (may be older version)
 * @returns Migrated document at current version
 * @throws Error if document has unknown schema version
 */
export function migrateDocument(doc: CoralDocument, options: DocumentMigrationOptions = {}): CoralDocument {
  return migrateDocumentWithDiagnostics(doc, options).document;
}

export function migrateDocumentWithDiagnostics(
  doc: CoralDocument,
  options: DocumentMigrationOptions = {},
): DocumentMigrationResult {
  const currentVersion = doc.schemaVersion;

  // Already at current version
  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return migrateGraphIR(doc, options);
  }

  // 1.0 was emitted briefly before semantic-version normalization.
  if (currentVersion === '1.0') {
    return migrateGraphIR({ ...doc, schemaVersion: CURRENT_SCHEMA_VERSION }, options);
  }

  // Check if version is known
  if (!isKnownVersion(currentVersion)) {
    throw new Error(
      `Unknown schema version: ${currentVersion}. ` +
        `Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`
    );
  }

  // Get migration path
  const path = getMigrationPath(currentVersion, CURRENT_SCHEMA_VERSION);

  // Apply migrations in sequence
  let result: unknown = doc;
  for (const step of path) {
    const migrateFn = migrations[step];
    if (migrateFn) {
      result = migrateFn(result);
    }
  }

  return migrateGraphIR(result as CoralDocument, options);
}

/**
 * Check if a document needs migration
 *
 * @param doc - Document to check
 * @returns true if document needs migration
 */
export function needsMigration(doc: CoralDocument): boolean {
  if (doc.schemaVersion !== CURRENT_SCHEMA_VERSION) return true;
  const graph = doc.content.graphIR as unknown as { version?: unknown } | undefined;
  return graph !== undefined && graph.version !== '3.0.0';
}

/**
 * Get the migration path for a document
 *
 * @param doc - Document to check
 * @returns Array of migration steps, empty if no migration needed
 */
export function getMigrationSteps(doc: CoralDocument): string[] {
  const path = getMigrationPath(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
  const graph = doc.content.graphIR as unknown as { version?: unknown } | undefined;
  if (graph?.version === '1.0' || graph?.version === '1.0.0') {
    path.push('GraphIR 1.0.0→2.0.0', 'GraphIR 2.0.0→3.0.0');
  } else if (graph?.version === '2.0.0') {
    path.push('GraphIR 2.0.0→3.0.0');
  }
  return path;
}
