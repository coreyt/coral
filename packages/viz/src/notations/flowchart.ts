/**
 * Flowchart Notation (ISO 5807)
 */

import type { NotationDefinition } from '../types';

export const flowchartNotation: NotationDefinition = {
  id: 'flowchart',
  name: 'Flowchart',
  description: 'Standard flowchart notation based on ISO 5807',
  version: '1.0.0',

  symbols: [
    'flowchart-terminal',
    'flowchart-process',
    'flowchart-decision',
    'flowchart-io',
    'flowchart-document',
    'flowchart-predefined',
    'flowchart-connector',
  ],

  edgeStyles: {
    flow: {
      name: 'Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#666666',
      strokeWidth: 1.5,
    },
  },

  defaultEdgeStyle: 'flow',

  connectionRules: [
    // Terminal (start) - only outgoing
    {
      from: 'flowchart-terminal',
      fromVariant: 'start',
      to: ['flowchart-process', 'flowchart-decision', 'flowchart-io', 'flowchart-predefined'],
      constraints: { maxOutgoing: 1, maxIncoming: 0 },
    },
    // Terminal (end) - only incoming
    {
      from: 'flowchart-terminal',
      fromVariant: 'end',
      to: [],
      constraints: { maxOutgoing: 0 },
    },
    // Process - one in, one out
    {
      from: 'flowchart-process',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-document',
        'flowchart-predefined',
        'flowchart-terminal',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 1 },
    },
    // Decision - one in, multiple labeled outs
    {
      from: 'flowchart-decision',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-document',
        'flowchart-predefined',
        'flowchart-terminal',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 3, requiresLabel: true },
    },
    // I/O
    {
      from: 'flowchart-io',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-document',
        'flowchart-predefined',
        'flowchart-terminal',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 1 },
    },
    // Document
    {
      from: 'flowchart-document',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-terminal',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 1 },
    },
    // Predefined Process
    {
      from: 'flowchart-predefined',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-document',
        'flowchart-terminal',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 1 },
    },
    // Connector
    {
      from: 'flowchart-connector',
      to: [
        'flowchart-process',
        'flowchart-decision',
        'flowchart-io',
        'flowchart-predefined',
        'flowchart-connector',
      ],
      constraints: { maxOutgoing: 1, maxIncoming: 1 },
    },
  ],

  validation: {
    entryPoints: [{ symbol: 'flowchart-terminal', variant: 'start', min: 1, max: 1 }],
    exitPoints: [{ symbol: 'flowchart-terminal', variant: 'end', min: 1 }],
    rules: [
      {
        id: 'no-orphans',
        description: 'All symbols must be connected to the flow',
        mustBeConnected: true,
        symbols: ['flowchart-process', 'flowchart-decision', 'flowchart-io'],
      },
      {
        id: 'decision-branches',
        description: 'Decisions must have at least 2 outgoing edges',
        symbol: 'flowchart-decision',
        minOutgoing: 2,
      },
    ],
  },
};
