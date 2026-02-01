/**
 * Coral File Format (CORAL-REQ-008)
 *
 * Exports for CoralDocument handling:
 * - Schema types
 * - Validation
 * - Serialization/Deserialization
 * - Migration
 */

// Schema
export {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type CoralDocument,
  type DocumentMetadata,
  type DocumentContent,
  type DocumentSettings,
  type LayoutDirection,
  type LayoutSettings,
  type LayoutSpacing,
  type ViewState,
  type NodePosition,
  type DslType,
  type CreateDocumentOptions,
  type SerializeOptions,
  type DeserializeResult,
  type ValidationResult,
  // Settings types (CORAL-REQ-009)
  type EdgeRouting,
  type LayoutAlgorithm,
  type LayoutPresetId,
  type LayoutPreset,
  type UserPreferences,
  type SettingsPanelState,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
} from './schema.js';

// Validation
export { validateDocument, assertValidDocument } from './validate.js';

// Serialization
export { createDocument, serialize } from './serialize.js';

// Deserialization
export { deserialize } from './deserialize.js';

// Migration
export { migrateDocument, needsMigration, getMigrationSteps } from './migrate.js';
