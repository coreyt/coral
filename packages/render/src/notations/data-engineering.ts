/**
 * Data Engineering Notation (ETL, pipelines, streaming, warehousing)
 */

import type { NotationDefinition } from '../types.js';

export const dataEngineeringNotation: NotationDefinition = {
  id: 'data-engineering',
  name: 'Data Engineering Diagram',
  description: 'Data pipeline, ETL, streaming, and data infrastructure notation',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 70, edgeNode: 25, layerSpacing: 100 }, edgeRouting: 'ORTHOGONAL',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.crossingMinimization.forceNodeModelOrder': true },
  },

  symbols: [
    'data-source',
    'data-sink',
    'data-transform',
    'data-lake',
    'data-warehouse',
    'data-stream',
    'data-batch',
    'data-quality',
    'data-schema',
    'data-catalog',
    'data-cdc',
    'data-dashboard',
    'data-pipeline',
    'data-annotation',
  ],

  edgeStyles: {
    'batch-flow': {
      name: 'Batch Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#1565c0',
      strokeWidth: 1.5,
    },
    'stream-flow': {
      name: 'Stream Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#00695c',
      strokeWidth: 2.5,
    },
    lineage: {
      name: 'Data Lineage',
      targetArrow: 'arrow',
      lineStyle: 'dashed',
      stroke: '#616161',
      strokeWidth: 1.5,
    },
    quality: {
      name: 'Quality Check',
      targetArrow: 'arrow',
      lineStyle: 'dotted',
      stroke: '#ff8f00',
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

  defaultEdgeStyle: 'batch-flow',

  connectionRules: [
    // Source is entry point (no incoming)
    {
      from: 'data-source',
      to: ['data-transform', 'data-stream', 'data-batch', 'data-lake', 'data-warehouse', 'data-quality'],
      edgeStyle: 'batch-flow',
      constraints: { maxIncoming: 0 },
    },
    // Sink is terminal (no outgoing)
    {
      from: 'data-sink',
      to: [],
      edgeStyle: 'batch-flow',
      constraints: { maxOutgoing: 0 },
    },
    // Dashboard is terminal (no outgoing)
    {
      from: 'data-dashboard',
      to: [],
      edgeStyle: 'batch-flow',
      constraints: { maxOutgoing: 0 },
    },
    // Transform to downstream
    {
      from: 'data-transform',
      to: ['data-transform', 'data-sink', 'data-lake', 'data-warehouse', 'data-quality', 'data-stream', 'data-dashboard'],
      edgeStyle: 'batch-flow',
    },
    // Stream to transform/downstream
    {
      from: 'data-stream',
      to: ['data-transform', 'data-sink', 'data-lake', 'data-warehouse', 'data-batch'],
      edgeStyle: 'stream-flow',
    },
    // Batch to downstream
    {
      from: 'data-batch',
      to: ['data-transform', 'data-sink', 'data-lake', 'data-warehouse', 'data-quality', 'data-dashboard'],
      edgeStyle: 'batch-flow',
    },
    // CDC to transform/stream
    {
      from: 'data-cdc',
      to: ['data-transform', 'data-stream', 'data-sink', 'data-lake'],
      edgeStyle: 'stream-flow',
    },
    // Lake to downstream
    {
      from: 'data-lake',
      to: ['data-transform', 'data-warehouse', 'data-batch', 'data-quality'],
      edgeStyle: 'batch-flow',
    },
    // Warehouse to downstream
    {
      from: 'data-warehouse',
      to: ['data-transform', 'data-dashboard', 'data-batch', 'data-quality'],
      edgeStyle: 'batch-flow',
    },
    // Quality gate pass/fail
    {
      from: 'data-quality',
      to: ['data-sink', 'data-lake', 'data-warehouse', 'data-transform', 'data-dashboard'],
      edgeStyle: 'quality',
    },
    // Schema references (bidirectional metadata)
    {
      from: 'data-schema',
      to: ['data-source', 'data-sink', 'data-transform', 'data-stream'],
      edgeStyle: 'lineage',
    },
    // Container: catalog
    {
      from: 'data-catalog',
      to: ['data-source', 'data-sink', 'data-transform', 'data-schema', 'data-lake', 'data-warehouse'],
      edgeStyle: 'lineage',
      isContainment: true,
    },
    // Container: pipeline
    {
      from: 'data-pipeline',
      to: ['data-source', 'data-transform', 'data-sink', 'data-batch', 'data-quality', 'data-stream'],
      edgeStyle: 'batch-flow',
      isContainment: true,
    },
    // Annotation
    {
      from: 'data-annotation',
      to: [
        'data-source', 'data-sink', 'data-transform', 'data-lake', 'data-warehouse',
        'data-stream', 'data-batch', 'data-quality', 'data-schema',
        'data-catalog', 'data-cdc', 'data-dashboard', 'data-pipeline',
      ],
      edgeStyle: 'annotation',
    },
  ],

  graphModes: {
    pipeline: {
      name: 'Data Pipeline',
      description: 'Source → Transform → Sink ETL/ELT flow',
      primarySymbols: ['data-source', 'data-transform', 'data-sink', 'data-quality', 'data-batch'],
      primaryEdge: 'batch-flow',
    },
    lineage: {
      name: 'Data Lineage',
      description: 'Data provenance and dependency tracking',
      primarySymbols: ['data-source', 'data-transform', 'data-lake', 'data-warehouse', 'data-dashboard'],
      primaryEdge: 'lineage',
    },
  },

  validation: {
    rules: [
      {
        id: 'quality-gate-branches',
        description: 'Quality gates must have at least 2 outgoing connections (pass + fail)',
        symbol: 'data-quality',
        minOutgoing: 2,
      },
      {
        id: 'transform-connected',
        description: 'Transforms should be connected to the pipeline',
        symbol: 'data-transform',
        mustBeConnected: true,
      },
      {
        id: 'source-connected',
        description: 'Sources should be connected to downstream',
        symbol: 'data-source',
        mustBeConnected: true,
      },
    ],
  },
};
