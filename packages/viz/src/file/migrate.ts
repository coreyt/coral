/**
 * Coral Document Migration (CORAL-REQ-008)
 *
 * Handles schema version upgrades for backward compatibility.
 */

import type { CoralDocument } from './schema.js';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './schema.js';

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
export function migrateDocument(doc: CoralDocument): CoralDocument {
  const currentVersion = doc.schemaVersion;

  // Already at current version
  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return doc;
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

  return result as CoralDocument;
}

/**
 * Check if a document needs migration
 *
 * @param doc - Document to check
 * @returns true if document needs migration
 */
export function needsMigration(doc: CoralDocument): boolean {
  return doc.schemaVersion !== CURRENT_SCHEMA_VERSION;
}

/**
 * Get the migration path for a document
 *
 * @param doc - Document to check
 * @returns Array of migration steps, empty if no migration needed
 */
export function getMigrationSteps(doc: CoralDocument): string[] {
  return getMigrationPath(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
}
