/**
 * Generic code graph notation
 */

import type { NotationDefinition } from '../types.js';

export const codeNotation: NotationDefinition = {
  id: 'code',
  name: 'Code Graph',
  description: 'Notation for rendering caller-supplied code structure GraphIR',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'DOWN',
    spacing: { nodeNode: 50, edgeNode: 20, layerSpacing: 80 }, edgeRouting: 'ORTHOGONAL',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },

  symbols: [
    'code-function',
    'code-class',
    'code-module',
    'code-variable',
    'code-type',
    'code-namespace',
    'code-external',
    'code-comment',
  ],

  edgeStyles: {
    calls: {
      name: 'Function Call',
      targetArrow: 'arrow',
      lineStyle: 'solid',
      stroke: '#0288d1',
      strokeWidth: 1.5,
    },
    imports: {
      name: 'Import/Dependency',
      targetArrow: 'arrow',
      lineStyle: 'dashed',
      stroke: '#388e3c',
      strokeWidth: 1.5,
    },
    extends: {
      name: 'Inheritance',
      targetArrow: 'triangle',
      lineStyle: 'solid',
      stroke: '#8e24aa',
      strokeWidth: 2,
    },
    implements: {
      name: 'Implements',
      targetArrow: 'triangle',
      lineStyle: 'dashed',
      stroke: '#43a047',
      strokeWidth: 1.5,
    },
    uses: {
      name: 'Uses/References',
      targetArrow: 'arrow',
      lineStyle: 'dotted',
      stroke: '#757575',
      strokeWidth: 1,
    },
    contains: {
      name: 'Contains',
      targetArrow: 'none',
      lineStyle: 'solid',
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

  defaultEdgeStyle: 'uses',

  graphModes: {
    'call-graph': {
      name: 'Call Graph',
      description: 'Function call relationships',
      primarySymbols: ['code-function'],
      primaryEdge: 'calls',
    },
    'dependency-graph': {
      name: 'Dependency Graph',
      description: 'Module/package dependencies',
      primarySymbols: ['code-module', 'code-external'],
      primaryEdge: 'imports',
    },
    'inheritance-tree': {
      name: 'Inheritance Tree',
      description: 'Class inheritance hierarchy',
      primarySymbols: ['code-class'],
      primaryEdge: 'extends',
    },
    'impact-graph': {
      name: 'Impact Graph',
      description: 'What is affected by changes',
      primarySymbols: ['code-function', 'code-class', 'code-module'],
      primaryEdge: 'uses',
    },
  },

  connectionRules: [
    // Function calls
    {
      from: 'code-function',
      to: ['code-function'],
      edgeStyle: 'calls',
    },
    // Class inheritance
    {
      from: 'code-class',
      to: ['code-class'],
      edgeStyle: 'extends',
      constraints: { singleInheritance: true },
    },
    // Interface implementation
    {
      from: 'code-class',
      to: ['code-type'],
      edgeStyle: 'implements',
    },
    // Module imports
    {
      from: 'code-module',
      to: ['code-module', 'code-external'],
      edgeStyle: 'imports',
    },
    // Module contains
    {
      from: 'code-module',
      to: ['code-function', 'code-class', 'code-variable'],
      edgeStyle: 'contains',
    },
    // Class contains
    {
      from: 'code-class',
      to: ['code-function', 'code-variable'],
      edgeStyle: 'contains',
    },
    // Namespace contains
    {
      from: 'code-namespace',
      to: ['code-module', 'code-class', 'code-function'],
      edgeStyle: 'contains',
    },
    // Annotation
    {
      from: 'code-comment',
      to: ['code-function', 'code-class', 'code-module', 'code-variable', 'code-type', 'code-namespace', 'code-external'],
      edgeStyle: 'annotation',
    },
  ],

  validation: {
    rules: [
      {
        id: 'no-circular-inheritance',
        description: 'Inheritance cannot form cycles',
        acyclic: true,
      },
    ],
  },
};
