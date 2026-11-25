/**
 * AI/ML Notation (AI pipelines, LLM architectures, GenAI systems)
 */

import type { NotationDefinition } from '../types.js';

export const aimlNotation: NotationDefinition = {
  id: 'aiml',
  name: 'AI/ML Diagram',
  description: 'AI/ML pipeline, LLM architecture, and GenAI system notation',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 60, edgeNode: 20, layerSpacing: 90 }, edgeRouting: 'ORTHOGONAL',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },

  symbols: [
    'aiml-model',
    'aiml-llm',
    'aiml-dataset',
    'aiml-vector-store',
    'aiml-embedding',
    'aiml-training',
    'aiml-inference',
    'aiml-feature-store',
    'aiml-gpu',
    'aiml-agent',
    'aiml-prompt',
    'aiml-guardrail',
    'aiml-evaluator',
    'aiml-retriever',
    'aiml-memory',
    'aiml-tool',
    'aiml-annotation',
  ],

  edgeStyles: {
    'data-flow': {
      name: 'Data Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#1565c0',
      strokeWidth: 1.5,
    },
    training: {
      name: 'Training Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#e65100',
      strokeWidth: 2.5,
    },
    inference: {
      name: 'Inference Flow',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#2e7d32',
      strokeWidth: 1.5,
    },
    embedding: {
      name: 'Embedding Flow',
      targetArrow: 'arrow',
      lineStyle: 'dashed',
      stroke: '#7b1fa2',
      strokeWidth: 1.5,
    },
    'tool-use': {
      name: 'Tool Invocation',
      targetArrow: 'arrow',
      lineStyle: 'dotted',
      stroke: '#616161',
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

  defaultEdgeStyle: 'data-flow',

  connectionRules: [
    // Agent connections
    {
      from: 'aiml-agent',
      to: ['aiml-llm', 'aiml-tool', 'aiml-memory', 'aiml-retriever'],
      edgeStyle: 'tool-use',
    },
    // Prompt to LLM
    {
      from: 'aiml-prompt',
      to: ['aiml-llm', 'aiml-model'],
      edgeStyle: 'data-flow',
    },
    // LLM outputs
    {
      from: 'aiml-llm',
      to: ['aiml-guardrail', 'aiml-tool', 'aiml-inference', 'aiml-evaluator'],
      edgeStyle: 'inference',
    },
    // Dataset to training
    {
      from: 'aiml-dataset',
      to: ['aiml-training', 'aiml-embedding', 'aiml-feature-store'],
      edgeStyle: 'training',
    },
    // Training to model
    {
      from: 'aiml-training',
      to: ['aiml-model', 'aiml-evaluator'],
      edgeStyle: 'training',
    },
    // Model to inference
    {
      from: 'aiml-model',
      to: ['aiml-inference', 'aiml-evaluator', 'aiml-guardrail'],
      edgeStyle: 'inference',
    },
    // Retriever to vector store
    {
      from: 'aiml-retriever',
      to: ['aiml-vector-store', 'aiml-llm'],
      edgeStyle: 'data-flow',
    },
    // Embedding to vector store
    {
      from: 'aiml-embedding',
      to: ['aiml-vector-store'],
      edgeStyle: 'embedding',
    },
    // Guardrail pass/fail branches
    {
      from: 'aiml-guardrail',
      to: ['aiml-llm', 'aiml-model', 'aiml-inference', 'aiml-agent', 'aiml-evaluator'],
      edgeStyle: 'data-flow',
    },
    // Feature store to training/inference
    {
      from: 'aiml-feature-store',
      to: ['aiml-training', 'aiml-inference'],
      edgeStyle: 'data-flow',
    },
    // GPU to training
    {
      from: 'aiml-gpu',
      to: ['aiml-training', 'aiml-inference'],
      edgeStyle: 'data-flow',
    },
    // Inference endpoint
    {
      from: 'aiml-inference',
      to: ['aiml-guardrail', 'aiml-evaluator'],
      edgeStyle: 'inference',
    },
    // Tool results
    {
      from: 'aiml-tool',
      to: ['aiml-agent', 'aiml-llm'],
      edgeStyle: 'tool-use',
    },
    // Memory read/write
    {
      from: 'aiml-memory',
      to: ['aiml-agent', 'aiml-llm'],
      edgeStyle: 'data-flow',
    },
    // Annotation
    {
      from: 'aiml-annotation',
      to: [
        'aiml-model', 'aiml-llm', 'aiml-dataset', 'aiml-vector-store',
        'aiml-embedding', 'aiml-training', 'aiml-inference', 'aiml-feature-store',
        'aiml-gpu', 'aiml-agent', 'aiml-prompt', 'aiml-guardrail',
        'aiml-evaluator', 'aiml-retriever', 'aiml-memory', 'aiml-tool',
      ],
      edgeStyle: 'annotation',
    },
  ],

  graphModes: {
    'training-pipeline': {
      name: 'Training Pipeline',
      description: 'Data → Training → Model → Evaluation flow',
      primarySymbols: ['aiml-dataset', 'aiml-training', 'aiml-model', 'aiml-evaluator', 'aiml-gpu'],
      primaryEdge: 'training',
    },
    'inference-pipeline': {
      name: 'Inference Pipeline',
      description: 'Request → Model → Response with guardrails',
      primarySymbols: ['aiml-model', 'aiml-inference', 'aiml-guardrail'],
      primaryEdge: 'inference',
    },
    'rag-pipeline': {
      name: 'RAG Pipeline',
      description: 'Retrieval-Augmented Generation flow',
      primarySymbols: ['aiml-retriever', 'aiml-vector-store', 'aiml-embedding', 'aiml-llm', 'aiml-prompt'],
      primaryEdge: 'data-flow',
    },
    'agent-architecture': {
      name: 'Agent Architecture',
      description: 'Agent with tools, memory, and LLM',
      primarySymbols: ['aiml-agent', 'aiml-llm', 'aiml-tool', 'aiml-memory', 'aiml-prompt'],
      primaryEdge: 'tool-use',
    },
  },

  validation: {
    rules: [
      {
        id: 'guardrail-branches',
        description: 'Guardrails must have at least 2 outgoing connections (pass + fail)',
        symbol: 'aiml-guardrail',
        minOutgoing: 2,
      },
      {
        id: 'model-connected',
        description: 'Models should be connected to the pipeline',
        symbols: ['aiml-model', 'aiml-llm'],
        mustBeConnected: true,
      },
      {
        id: 'retriever-connected',
        description: 'Retrievers should be connected',
        symbol: 'aiml-retriever',
        mustBeConnected: true,
      },
    ],
  },
};
