/**
 * Property Utilities
 *
 * Utility functions for detecting property types, parsing values,
 * and extracting property field metadata for the NodePropertiesPanel.
 */

/**
 * Supported property types
 */
export type PropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';

/**
 * Property values that can be edited inline
 */
export type PropertyValue = string | number | boolean | null | undefined;

/**
 * Metadata about a property field for rendering
 */
export interface PropertyFieldMeta {
  /** Property key name */
  key: string;
  /** Detected type of the value */
  type: PropertyType;
  /** Current value */
  value: unknown;
  /** Whether this property can be edited inline (string, number, boolean only) */
  isEditable: boolean;
}

/**
 * Detect the type of a property value
 *
 * @param value - The value to check
 * @returns The detected property type
 */
export function detectPropertyType(value: unknown): PropertyType {
  if (value === null || value === undefined) {
    return 'unknown';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  return 'unknown';
}

/**
 * Check if a property value can be edited inline
 *
 * Only primitive types (string, number, boolean) are editable.
 * Complex types (array, object) and null/undefined are not.
 *
 * @param value - The value to check
 * @returns true if the value can be edited inline
 */
export function isEditableProperty(value: unknown): boolean {
  const type = detectPropertyType(value);
  return type === 'string' || type === 'number' || type === 'boolean';
}

/**
 * Parse a string input to the correct property type
 *
 * @param input - The string input to parse
 * @param targetType - The type to parse as
 * @returns The parsed value
 */
export function parsePropertyValue(input: string, targetType: PropertyType): PropertyValue {
  switch (targetType) {
    case 'string':
      return input;

    case 'number': {
      const num = parseFloat(input);
      return isNaN(num) ? 0 : num;
    }

    case 'boolean':
      return input === 'true' || input === '1';

    // Non-editable types return input as string (for display purposes)
    case 'object':
    case 'array':
    case 'unknown':
    default:
      return input;
  }
}

/**
 * Extract property field metadata from a properties object
 *
 * @param properties - The properties object to extract from
 * @returns Array of property field metadata
 */
export function extractPropertyFields(
  properties: Record<string, unknown> | undefined
): PropertyFieldMeta[] {
  if (!properties) {
    return [];
  }

  return Object.entries(properties).map(([key, value]) => ({
    key,
    type: detectPropertyType(value),
    value,
    isEditable: isEditableProperty(value),
  }));
}
