/**
 * Coral Document Validation (CORAL-REQ-008)
 *
 * Validates CoralDocument structure with helpful error messages.
 */

import type { CoralDocument, ValidationResult } from './schema.js';
import { SUPPORTED_SCHEMA_VERSIONS } from './schema.js';

/**
 * Valid layout directions
 */
const VALID_DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/**
 * Valid content formats
 */
const VALID_FORMATS = ['dsl', 'graph-ir'];

/**
 * Valid DSL types
 */
const VALID_DSL_TYPES = ['coral', 'mermaid', 'dot'];

/**
 * Validate a CoralDocument
 *
 * @param doc - Document to validate
 * @returns Validation result with errors
 */
export function validateDocument(doc: unknown): ValidationResult {
  const errors: string[] = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document must be an object'] };
  }

  const d = doc as Record<string, unknown>;

  // Schema version
  if (!d.schemaVersion || typeof d.schemaVersion !== 'string') {
    errors.push('Missing or invalid schemaVersion');
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(d.schemaVersion as typeof SUPPORTED_SCHEMA_VERSIONS[number])) {
    errors.push(`Unknown schemaVersion: ${d.schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`);
  }

  // Metadata
  if (!d.metadata || typeof d.metadata !== 'object') {
    errors.push('Missing or invalid metadata');
  } else {
    const meta = d.metadata as Record<string, unknown>;
    if (!meta.name || typeof meta.name !== 'string') {
      errors.push('Missing or invalid metadata.name');
    }
    if (meta.created !== undefined && typeof meta.created !== 'string') {
      errors.push('metadata.created must be a string');
    }
    if (meta.modified !== undefined && typeof meta.modified !== 'string') {
      errors.push('metadata.modified must be a string');
    }
    if (meta.tags !== undefined && !Array.isArray(meta.tags)) {
      errors.push('metadata.tags must be an array');
    }
  }

  // Content
  if (!d.content || typeof d.content !== 'object') {
    errors.push('Missing or invalid content');
  } else {
    const content = d.content as Record<string, unknown>;

    if (!content.format || !VALID_FORMATS.includes(content.format as string)) {
      errors.push(`content.format must be one of: ${VALID_FORMATS.join(', ')}`);
    }

    if (content.format === 'dsl') {
      if (content.dslType && !VALID_DSL_TYPES.includes(content.dslType as string)) {
        errors.push(`content.dslType must be one of: ${VALID_DSL_TYPES.join(', ')}`);
      }
      if (!content.text || typeof content.text !== 'string') {
        errors.push('content.text is required when format is "dsl"');
      }
    }

    if (content.format === 'graph-ir') {
      if (content.graphIR !== undefined && typeof content.graphIR !== 'object') {
        errors.push('content.graphIR must be an object');
      }
    }
  }

  // Settings
  if (!d.settings || typeof d.settings !== 'object') {
    errors.push('Missing or invalid settings');
  } else {
    const settings = d.settings as Record<string, unknown>;

    if (!settings.notation || typeof settings.notation !== 'string') {
      errors.push('Missing or invalid settings.notation');
    }

    if (!settings.layout || typeof settings.layout !== 'object') {
      errors.push('Missing or invalid settings.layout');
    } else {
      const layout = settings.layout as Record<string, unknown>;

      if (layout.direction !== undefined && !VALID_DIRECTIONS.includes(layout.direction as string)) {
        errors.push(`settings.layout.direction must be one of: ${VALID_DIRECTIONS.join(', ')}`);
      }

      if (layout.spacing !== undefined && typeof layout.spacing !== 'object') {
        errors.push('settings.layout.spacing must be an object');
      }

      if (layout.elkOptions !== undefined && typeof layout.elkOptions !== 'object') {
        errors.push('settings.layout.elkOptions must be an object');
      }
    }
  }

  // View state (optional)
  if (d.viewState !== undefined) {
    if (typeof d.viewState !== 'object') {
      errors.push('viewState must be an object');
    } else {
      const vs = d.viewState as Record<string, unknown>;
      if (vs.zoom !== undefined && typeof vs.zoom !== 'number') {
        errors.push('viewState.zoom must be a number');
      }
      if (vs.pan !== undefined) {
        if (typeof vs.pan !== 'object') {
          errors.push('viewState.pan must be an object');
        } else {
          const pan = vs.pan as Record<string, unknown>;
          if (typeof pan.x !== 'number' || typeof pan.y !== 'number') {
            errors.push('viewState.pan must have numeric x and y properties');
          }
        }
      }
    }
  }

  // Node positions (optional)
  if (d.nodePositions !== undefined) {
    if (typeof d.nodePositions !== 'object' || d.nodePositions === null) {
      errors.push('nodePositions must be an object');
    } else {
      const positions = d.nodePositions as Record<string, unknown>;
      for (const [nodeId, pos] of Object.entries(positions)) {
        if (typeof pos !== 'object' || pos === null) {
          errors.push(`nodePositions.${nodeId} must be an object`);
        } else {
          const p = pos as Record<string, unknown>;
          if (typeof p.x !== 'number' || typeof p.y !== 'number') {
            errors.push(`nodePositions.${nodeId} must have numeric x and y properties`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Assert that a document is valid, throwing if not
 *
 * @param doc - Document to validate
 * @throws Error if document is invalid
 */
export function assertValidDocument(doc: unknown): asserts doc is CoralDocument {
  const result = validateDocument(doc);
  if (!result.valid) {
    throw new Error(`Invalid CoralDocument:\n${result.errors.join('\n')}`);
  }
}
