/**
 * Properties Module
 *
 * Components and utilities for displaying and editing node properties.
 */

// Components
export { NodePropertiesPanel } from './NodePropertiesPanel.js';

// Types
export type {
  NodePropertiesPanelProps,
  PropertyChange,
} from './NodePropertiesPanel.js';

// Utilities
export {
  detectPropertyType,
  isEditableProperty,
  parsePropertyValue,
  extractPropertyFields,
} from './propertyUtils.js';

// Utility types
export type {
  PropertyType,
  PropertyValue,
  PropertyFieldMeta,
} from './propertyUtils.js';
