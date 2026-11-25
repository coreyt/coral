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
  type LayoutProfileOverrides,
  type ViewState,
  type NodePosition,
  type DslType,
  type CreateDocumentOptions,
  type SerializeOptions,
  type DeserializeResult,
  type ValidationResult,
  type FontSettings,
  type DiagramFontSettings,
  type FontFamilyPreset,
  type FontSizePreset,
  DEFAULT_FONT_SETTINGS,
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  FONT_SIZE_PRESETS,
  getFontFamilyPreset,
  getFontSizePreset,
  normalizeDiagramFontSettings,
  // Settings types (CORAL-REQ-009)
  type EdgeRouting,
  type LayoutAlgorithm,
  type LayoutPresetId,
  type LayoutPreset,
  type UserPreferences,
  type LLMProviderPreference,
  type SpeechRecognitionMode,
  type SettingsPanelState,
  DEFAULT_USER_PREFERENCES,
  normalizeLlmMaxRetries,
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
} from './schema.js';

export {
  resolveNotationLayout,
  type LayoutProfileDiagnostic,
  type ResolvedLayoutProfile,
} from './layoutProfile.js';

// Validation
export { validateDocument, assertValidDocument } from './validate.js';

// Serialization
export { createDocument, serialize } from './serialize.js';

// Deserialization
export { deserialize } from './deserialize.js';

// Migration
export {
  migrateDocument,
  migrateDocumentWithDiagnostics,
  needsMigration,
  getMigrationSteps,
  type DocumentGraphIRMigrationEvidence,
  type DocumentMigrationResult,
  type DocumentMigrationOptions,
} from './migrate.js';

export {
  materializeReferencedPorts,
  stripResolvedPorts,
  type GraphPort,
  type PortResolver,
  type PortMaterializationResult,
} from './portMaterialization.js';
