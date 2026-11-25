/**
 * BPMN Notation (Business Process Model and Notation 2.0)
 */

import type { NotationDefinition } from '../types.js';

export const bpmnNotation: NotationDefinition = {
  id: 'bpmn',
  name: 'BPMN',
  description: 'Business Process Model and Notation 2.0',
  version: '1.0.1',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 60, edgeNode: 25, layerSpacing: 90 }, edgeRouting: 'ORTHOGONAL',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.crossingMinimization.forceNodeModelOrder': true },
  },

  symbols: [
    'bpmn-start-event',
    'bpmn-end-event',
    'bpmn-intermediate-event',
    'bpmn-task',
    'bpmn-subprocess',
    'bpmn-gateway-exclusive',
    'bpmn-gateway-parallel',
    'bpmn-gateway-inclusive',
    'bpmn-gateway-event',
    'bpmn-data-object',
    'bpmn-data-store',
    'bpmn-pool',
    'bpmn-lane',
    'bpmn-annotation',
  ],

  edgeStyles: {
    sequence: {
      name: 'Sequence Flow',
      targetArrow: 'triangle',
      targetFill: 'filled',
      lineStyle: 'solid',
      stroke: '#424242',
      strokeWidth: 1.5,
    },
    message: {
      name: 'Message Flow',
      targetArrow: 'arrow',
      lineStyle: 'dashed',
      stroke: '#424242',
      strokeWidth: 1.5,
    },
    association: {
      name: 'Association',
      targetArrow: 'none',
      lineStyle: 'dotted',
      stroke: '#9e9e9e',
      strokeWidth: 1,
    },
    annotation: {
      name: 'Annotation',
      targetArrow: 'none',
      lineStyle: 'dashed',
      stroke: '#9e9e9e',
      strokeWidth: 1,
    },
  },

  defaultEdgeStyle: 'sequence',

  connectionRules: [
    // Start Event
    {
      from: 'bpmn-start-event',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
        'bpmn-gateway-event',
        'bpmn-intermediate-event',
      ],
      edgeStyle: 'sequence',
      // BPMN 2.0.2 §10.5.2 permits multiple outgoing Sequence Flows.
      constraints: { maxIncoming: 0 },
    },
    // End Event
    {
      from: 'bpmn-end-event',
      to: [],
      constraints: { maxOutgoing: 0 },
    },
    // Task
    {
      from: 'bpmn-task',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
      ],
      edgeStyle: 'sequence',
    },
    // Subprocess
    {
      from: 'bpmn-subprocess',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
      ],
      edgeStyle: 'sequence',
    },
    // Exclusive Gateway
    {
      from: 'bpmn-gateway-exclusive',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
      ],
      edgeStyle: 'sequence',
      constraints: { minOutgoing: 2 },
    },
    // Parallel Gateway
    {
      from: 'bpmn-gateway-parallel',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
      ],
      edgeStyle: 'sequence',
      constraints: { minOutgoing: 2 },
    },
    // Inclusive Gateway
    {
      from: 'bpmn-gateway-inclusive',
      to: [
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
      ],
      edgeStyle: 'sequence',
      constraints: { minOutgoing: 2 },
    },
    // Data associations
    {
      from: 'bpmn-task',
      to: ['bpmn-data-object', 'bpmn-data-store'],
      edgeStyle: 'association',
    },
    {
      from: 'bpmn-data-object',
      to: ['bpmn-task'],
      edgeStyle: 'association',
    },
    {
      from: 'bpmn-data-store',
      to: ['bpmn-task'],
      edgeStyle: 'association',
    },
    // Annotation
    {
      from: 'bpmn-annotation',
      to: [
        'bpmn-start-event',
        'bpmn-end-event',
        'bpmn-intermediate-event',
        'bpmn-task',
        'bpmn-subprocess',
        'bpmn-gateway-exclusive',
        'bpmn-gateway-parallel',
        'bpmn-gateway-inclusive',
        'bpmn-gateway-event',
        'bpmn-data-object',
        'bpmn-data-store',
        'bpmn-pool',
        'bpmn-lane',
      ],
      edgeStyle: 'annotation',
    },
  ],

  validation: {
    entryPoints: [{ symbol: 'bpmn-start-event', min: 1 }],
    exitPoints: [{ symbol: 'bpmn-end-event', min: 1 }],
    rules: [
      {
        id: 'no-orphan-activities',
        description: 'All activities must be connected to the flow',
        mustBeConnected: true,
        symbols: ['bpmn-task', 'bpmn-subprocess'],
      },
    ],
  },
};
