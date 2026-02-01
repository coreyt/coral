/**
 * ERD Symbols (Entity-Relationship Diagram - Chen Notation)
 */

import type { SymbolLibrary } from '../types';

export const erdSymbols: SymbolLibrary = {
  id: 'erd',
  name: 'ERD Symbols',
  version: '1.0.0',
  description: 'Entity-Relationship Diagram symbols using Chen notation',
  symbols: [
    {
      id: 'erd-entity',
      name: 'Entity',
      description: 'A table, object, or thing being modeled',
      shape: 'rectangle',
      tags: ['entity', 'table', 'data'],
      variants: {
        strong: {
          name: 'Strong Entity',
          description: 'Entity that can exist independently',
          defaults: { strokeWidth: 2 },
        },
        weak: {
          name: 'Weak Entity',
          description: 'Entity that depends on another entity',
          defaults: { strokeWidth: 2, strokeDasharray: '5,3' },
        },
      },
      defaults: { fill: '#e8f5e9', stroke: '#2e7d32', strokeWidth: 2 },
      ports: [
        { id: 'n', anchor: 'NORTH', direction: 'inout' },
        { id: 's', anchor: 'SOUTH', direction: 'inout' },
        { id: 'e', anchor: 'EAST', direction: 'inout' },
        { id: 'w', anchor: 'WEST', direction: 'inout' },
      ],
    },
    {
      id: 'erd-relationship',
      name: 'Relationship',
      description: 'Relationship between entities',
      shape: 'diamond',
      tags: ['relationship', 'association'],
      variants: {
        identifying: {
          name: 'Identifying Relationship',
          description: 'Relationship that helps identify a weak entity',
          defaults: { strokeWidth: 3 },
        },
      },
      defaults: { fill: '#fff3e0', stroke: '#e65100', strokeWidth: 2 },
      ports: [
        { id: 'n', anchor: 'NORTH', direction: 'inout' },
        { id: 's', anchor: 'SOUTH', direction: 'inout' },
        { id: 'e', anchor: 'EAST', direction: 'inout' },
        { id: 'w', anchor: 'WEST', direction: 'inout' },
      ],
    },
    {
      id: 'erd-attribute',
      name: 'Attribute',
      description: 'A property or field of an entity',
      shape: 'ellipse',
      tags: ['attribute', 'field', 'property'],
      variants: {
        'primary-key': {
          name: 'Primary Key',
          description: 'Primary key attribute',
          defaults: { textDecoration: 'underline' },
        },
        derived: {
          name: 'Derived Attribute',
          description: 'Computed from other attributes',
          defaults: { strokeDasharray: '5,3' },
        },
        multivalued: {
          name: 'Multivalued Attribute',
          description: 'Can have multiple values',
          defaults: { strokeWidth: 3 },
        },
        composite: {
          name: 'Composite Attribute',
          description: 'Composed of sub-attributes',
          defaults: { fill: '#f5f5f5' },
        },
      },
      defaults: { fill: '#e3f2fd', stroke: '#1565c0', strokeWidth: 1.5, width: 80, height: 40 },
      ports: [
        { id: 'entity', anchor: 'WEST', direction: 'out' },
        { id: 'sub', anchor: 'EAST', direction: 'in' },
      ],
    },
    {
      id: 'erd-cardinality',
      name: 'Cardinality',
      description: 'Relationship cardinality marker',
      shape: 'ellipse',
      tags: ['cardinality', 'constraint'],
      variants: {
        one: { name: 'One' },
        many: { name: 'Many' },
        'zero-one': { name: 'Zero or One' },
        'zero-many': { name: 'Zero or Many' },
        'one-many': { name: 'One or Many' },
      },
      defaults: { fill: '#ffffff', stroke: '#757575', strokeWidth: 1, width: 24, height: 24 },
      ports: [],
    },
    {
      id: 'erd-isa',
      name: 'ISA (Generalization)',
      description: 'Inheritance/specialization relationship',
      shape: 'triangle',
      tags: ['generalization', 'inheritance', 'isa'],
      defaults: { fill: '#fce4ec', stroke: '#c2185b', strokeWidth: 2 },
      ports: [
        { id: 'parent', anchor: 'NORTH', direction: 'out' },
        { id: 'child1', anchor: 'SOUTH', direction: 'in', position: 0.25 },
        { id: 'child2', anchor: 'SOUTH', direction: 'in', position: 0.75 },
      ],
    },
  ],
};
