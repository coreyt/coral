/**
 * ERD Notation (Chen Notation)
 */

import type { NotationDefinition } from '../types.js';

export const erdNotation: NotationDefinition = {
  id: 'erd',
  name: 'Entity-Relationship Diagram',
  description: 'Entity-Relationship Diagram using Chen notation',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 80, edgeNode: 20, layerSpacing: 80 }, edgeRouting: 'POLYLINE',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },

  symbols: [
    'erd-entity',
    'erd-relationship',
    'erd-attribute',
    'erd-cardinality',
    'erd-isa',
    'erd-note',
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
    annotation: {
      name: 'Annotation',
      targetArrow: 'none',
      lineStyle: 'dashed',
      stroke: '#9e9e9e',
      strokeWidth: 1,
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
    // Annotation
    {
      from: 'erd-note',
      to: ['erd-entity', 'erd-relationship', 'erd-attribute', 'erd-cardinality', 'erd-isa'],
      edgeStyle: 'annotation',
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
