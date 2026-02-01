/**
 * Property Utilities Tests
 *
 * Tests for property type detection, parsing, and field extraction.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPropertyType,
  isEditableProperty,
  parsePropertyValue,
  extractPropertyFields,
  type PropertyFieldMeta,
  type PropertyType,
} from '../src/properties/propertyUtils.js';

// ============================================================================
// detectPropertyType Tests
// ============================================================================

describe('detectPropertyType', () => {
  it('should detect string type', () => {
    expect(detectPropertyType('hello')).toBe('string');
    expect(detectPropertyType('')).toBe('string');
    expect(detectPropertyType('123')).toBe('string');
  });

  it('should detect number type', () => {
    expect(detectPropertyType(42)).toBe('number');
    expect(detectPropertyType(0)).toBe('number');
    expect(detectPropertyType(-5.5)).toBe('number');
    expect(detectPropertyType(Infinity)).toBe('number');
    expect(detectPropertyType(NaN)).toBe('number');
  });

  it('should detect boolean type', () => {
    expect(detectPropertyType(true)).toBe('boolean');
    expect(detectPropertyType(false)).toBe('boolean');
  });

  it('should detect array type', () => {
    expect(detectPropertyType([])).toBe('array');
    expect(detectPropertyType([1, 2, 3])).toBe('array');
    expect(detectPropertyType(['a', 'b'])).toBe('array');
  });

  it('should detect object type', () => {
    expect(detectPropertyType({})).toBe('object');
    expect(detectPropertyType({ key: 'value' })).toBe('object');
  });

  it('should detect null as unknown', () => {
    expect(detectPropertyType(null)).toBe('unknown');
  });

  it('should detect undefined as unknown', () => {
    expect(detectPropertyType(undefined)).toBe('unknown');
  });
});

// ============================================================================
// isEditableProperty Tests
// ============================================================================

describe('isEditableProperty', () => {
  it('should return true for strings', () => {
    expect(isEditableProperty('hello')).toBe(true);
    expect(isEditableProperty('')).toBe(true);
  });

  it('should return true for numbers', () => {
    expect(isEditableProperty(42)).toBe(true);
    expect(isEditableProperty(0)).toBe(true);
    expect(isEditableProperty(-3.14)).toBe(true);
  });

  it('should return true for booleans', () => {
    expect(isEditableProperty(true)).toBe(true);
    expect(isEditableProperty(false)).toBe(true);
  });

  it('should return false for arrays', () => {
    expect(isEditableProperty([])).toBe(false);
    expect(isEditableProperty([1, 2, 3])).toBe(false);
  });

  it('should return false for objects', () => {
    expect(isEditableProperty({})).toBe(false);
    expect(isEditableProperty({ key: 'value' })).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isEditableProperty(null)).toBe(false);
    expect(isEditableProperty(undefined)).toBe(false);
  });
});

// ============================================================================
// parsePropertyValue Tests
// ============================================================================

describe('parsePropertyValue', () => {
  describe('string parsing', () => {
    it('should return input as-is for string type', () => {
      expect(parsePropertyValue('hello', 'string')).toBe('hello');
      expect(parsePropertyValue('', 'string')).toBe('');
      expect(parsePropertyValue('123', 'string')).toBe('123');
    });
  });

  describe('number parsing', () => {
    it('should parse valid numbers', () => {
      expect(parsePropertyValue('42', 'number')).toBe(42);
      expect(parsePropertyValue('3.14', 'number')).toBe(3.14);
      expect(parsePropertyValue('-10', 'number')).toBe(-10);
      expect(parsePropertyValue('0', 'number')).toBe(0);
    });

    it('should return 0 for invalid number strings', () => {
      expect(parsePropertyValue('not a number', 'number')).toBe(0);
      expect(parsePropertyValue('', 'number')).toBe(0);
    });
  });

  describe('boolean parsing', () => {
    it('should parse "true" as true', () => {
      expect(parsePropertyValue('true', 'boolean')).toBe(true);
      expect(parsePropertyValue('TRUE', 'boolean')).toBe(false); // Case sensitive
    });

    it('should parse "1" as true', () => {
      expect(parsePropertyValue('1', 'boolean')).toBe(true);
    });

    it('should parse other values as false', () => {
      expect(parsePropertyValue('false', 'boolean')).toBe(false);
      expect(parsePropertyValue('0', 'boolean')).toBe(false);
      expect(parsePropertyValue('', 'boolean')).toBe(false);
      expect(parsePropertyValue('anything', 'boolean')).toBe(false);
    });
  });

  describe('non-editable types', () => {
    it('should return input as string for object type', () => {
      expect(parsePropertyValue('{}', 'object')).toBe('{}');
    });

    it('should return input as string for array type', () => {
      expect(parsePropertyValue('[]', 'array')).toBe('[]');
    });

    it('should return input as string for unknown type', () => {
      expect(parsePropertyValue('something', 'unknown')).toBe('something');
    });
  });
});

// ============================================================================
// extractPropertyFields Tests
// ============================================================================

describe('extractPropertyFields', () => {
  it('should return empty array for undefined properties', () => {
    expect(extractPropertyFields(undefined)).toEqual([]);
  });

  it('should return empty array for empty object', () => {
    expect(extractPropertyFields({})).toEqual([]);
  });

  it('should extract string properties', () => {
    const result = extractPropertyFields({ name: 'test' });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'name',
      type: 'string',
      value: 'test',
      isEditable: true,
    });
  });

  it('should extract number properties', () => {
    const result = extractPropertyFields({ count: 42 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'count',
      type: 'number',
      value: 42,
      isEditable: true,
    });
  });

  it('should extract boolean properties', () => {
    const result = extractPropertyFields({ active: true });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'active',
      type: 'boolean',
      value: true,
      isEditable: true,
    });
  });

  it('should extract array properties as non-editable', () => {
    const result = extractPropertyFields({ items: [1, 2, 3] });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'items',
      type: 'array',
      value: [1, 2, 3],
      isEditable: false,
    });
  });

  it('should extract object properties as non-editable', () => {
    const nested = { inner: 'value' };
    const result = extractPropertyFields({ nested });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'nested',
      type: 'object',
      value: nested,
      isEditable: false,
    });
  });

  it('should extract multiple properties', () => {
    const result = extractPropertyFields({
      name: 'test',
      count: 5,
      active: false,
    });

    expect(result).toHaveLength(3);

    const names = result.map((f) => f.key);
    expect(names).toContain('name');
    expect(names).toContain('count');
    expect(names).toContain('active');
  });

  it('should preserve property order', () => {
    const props = { a: 1, b: 2, c: 3 };
    const result = extractPropertyFields(props);

    expect(result.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('should handle mixed editable and non-editable properties', () => {
    const result = extractPropertyFields({
      name: 'test',
      items: [1, 2],
      count: 10,
      config: { option: true },
    });

    const editable = result.filter((f) => f.isEditable);
    const nonEditable = result.filter((f) => !f.isEditable);

    expect(editable).toHaveLength(2);
    expect(nonEditable).toHaveLength(2);
  });
});
