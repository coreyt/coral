/**
 * Architecture Notation (System/Infrastructure diagrams)
 */

import type { NotationDefinition } from '../types';

export const architectureNotation: NotationDefinition = {
  id: 'architecture',
  name: 'Architecture Diagram',
  description: 'System architecture and infrastructure diagram notation',
  version: '1.0.0',

  symbols: [
    'arch-service',
    'arch-database',
    'arch-queue',
    'arch-external-api',
    'arch-actor',
    'arch-load-balancer',
    'arch-container',
    'arch-cdn',
    'arch-storage',
    'arch-function',
  ],

  edgeStyles: {
    sync: {
      name: 'Synchronous Call',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#424242',
      strokeWidth: 1.5,
    },
    async: {
      name: 'Asynchronous Message',
      targetArrow: 'arrow',
      lineStyle: 'dashed',
      stroke: '#ff9800',
      strokeWidth: 1.5,
    },
    data: {
      name: 'Data Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#4caf50',
      strokeWidth: 2,
    },
    bidirectional: {
      name: 'Bidirectional',
      targetArrow: 'arrow',
      sourceArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#2196f3',
      strokeWidth: 1.5,
    },
  },

  defaultEdgeStyle: 'sync',

  connectionRules: [
    // Actor interactions
    {
      from: 'arch-actor',
      to: ['arch-service', 'arch-load-balancer', 'arch-cdn'],
      edgeStyle: 'sync',
    },
    // Service to service
    {
      from: 'arch-service',
      to: ['arch-service', 'arch-external-api', 'arch-function'],
      edgeStyle: 'sync',
    },
    // Service to data
    {
      from: 'arch-service',
      to: ['arch-database', 'arch-storage'],
      edgeStyle: 'data',
    },
    // Service to queue
    {
      from: 'arch-service',
      to: ['arch-queue'],
      edgeStyle: 'async',
    },
    // Queue to service
    {
      from: 'arch-queue',
      to: ['arch-service', 'arch-function'],
      edgeStyle: 'async',
    },
    // Load balancer
    {
      from: 'arch-load-balancer',
      to: ['arch-service'],
      edgeStyle: 'sync',
    },
    // CDN to origin
    {
      from: 'arch-cdn',
      to: ['arch-service', 'arch-storage'],
      edgeStyle: 'sync',
    },
    // Function integrations
    {
      from: 'arch-function',
      to: ['arch-database', 'arch-storage', 'arch-queue', 'arch-service'],
      edgeStyle: 'sync',
    },
    // Container containment
    {
      from: 'arch-container',
      to: ['arch-service', 'arch-database', 'arch-queue', 'arch-function'],
      edgeStyle: 'data',
      isContainment: true,
    },
  ],

  validation: {
    rules: [
      {
        id: 'actor-entry',
        description: 'Actors should connect to entry points',
        symbol: 'arch-actor',
        mustConnectTo: ['arch-load-balancer', 'arch-cdn', 'arch-service'],
      },
      {
        id: 'database-internal',
        description: 'Databases should not be directly exposed to actors',
        symbol: 'arch-database',
        notDirectlyConnectedTo: ['arch-actor'],
      },
      {
        id: 'load-balancer-targets',
        description: 'Load balancers should have at least 2 targets',
        symbol: 'arch-load-balancer',
        minOutgoing: 2,
      },
    ],
  },
};
