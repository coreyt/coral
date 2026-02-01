/**
 * ERD Notation (Chen Notation)
 */

import type { NotationDefinition } from '../types';

export const erdNotation: NotationDefinition = {
  id: 'erd',
  name: 'Entity-Relationship Diagram',
  description: 'Entity-Relationship Diagram using Chen notation',
  version: '1.0.0',

  symbols: [
    'erd-entity',
    'erd-relationship',
    'erd-attribute',
    'erd-cardinality',
    'erd-isa',
  ],

  edgeStyles: {
    relationship: {
      name: 'Relationship Line',
      targetArrow: 'none',
      lineStyle: 'solid',
      stroke: '#424242',
      strokeWidth: 1.5,
    },
    attribute: {
      name: 'Attribute Line',
      targetArrow: 'none',
      lineStyle: 'solid',
      stroke: '#90a4ae',
      strokeWidth: 1,
    },
    inheritance: {
      name: 'Inheritance Line',
      targetArrow: 'none',
      lineStyle: 'solid',
      stroke: '#c2185b',
      strokeWidth: 1.5,
    },
  },

  defaultEdgeStyle: 'relationship',

  connectionRules: [
    // Entity to relationship
    {
      from: 'erd-entity',
      to: ['erd-relationship'],
      edgeStyle: 'relationship',
      constraints: { cardinalityLabel: true },
    },
    // Entity to attribute
    {
      from: 'erd-entity',
      to: ['erd-attribute'],
      edgeStyle: 'attribute',
    },
    // Relationship to entity
    {
      from: 'erd-relationship',
      to: ['erd-entity'],
      edgeStyle: 'relationship',
      constraints: { minConnections: 2, cardinalityLabel: true },
    },
    // Composite attribute to sub-attributes
    {
      from: 'erd-attribute',
      fromVariant: 'composite',
      to: ['erd-attribute'],
      edgeStyle: 'attribute',
    },
    // ISA to entity (child)
    {
      from: 'erd-isa',
      to: ['erd-entity'],
      edgeStyle: 'inheritance',
    },
    // Entity to ISA (parent)
    {
      from: 'erd-entity',
      to: ['erd-isa'],
      edgeStyle: 'inheritance',
      constraints: { maxOutgoing: 1 },
    },
  ],

  validation: {
    rules: [
      {
        id: 'relationship-binary',
        description: 'Relationships typically connect 2 entities',
        symbol: 'erd-relationship',
        minOutgoing: 2,
      },
      {
        id: 'attributes-connected',
        description: 'Attributes must be connected to an entity or relationship',
        symbol: 'erd-attribute',
        mustBeConnected: true,
      },
    ],
  },
};
