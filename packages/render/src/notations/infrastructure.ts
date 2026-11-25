/**
 * Cloud Infrastructure Notation (Edition 0.2.14 — AWS, Azure, GCP & Kubernetes)
 */
import type { NotationDefinition } from '../types.js';

const ALL_NODES = [
  'infra-users', 'infra-cdn', 'infra-dns', 'infra-waf', 'infra-gateway',
  'infra-load-balancer', 'infra-compute', 'infra-container', 'infra-kubernetes',
  'infra-function', 'infra-database', 'infra-cache', 'infra-storage',
  'infra-queue', 'infra-iam', 'infra-monitoring', 'infra-ml', 'infra-note',
];

export const infrastructureNotation: NotationDefinition = {
  id: 'infrastructure',
  name: 'Cloud Infrastructure Diagram',
  description: 'Cloud topology notation for AWS, Azure, GCP, and Kubernetes deployments',
  version: '1.0.0',
  layoutProfile: {
    algorithm: 'layered', direction: 'RIGHT',
    spacing: { nodeNode: 70, edgeNode: 25, layerSpacing: 95 }, edgeRouting: 'ORTHOGONAL',
    elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  },
  symbols: [...ALL_NODES, 'infra-boundary'],
  edgeStyles: {
    network: { name: 'Network Traffic', targetArrow: 'arrow', lineStyle: 'solid', stroke: '#475569', strokeWidth: 1.5 },
    sync: { name: 'Synchronous Request', targetArrow: 'arrow', lineStyle: 'solid', stroke: '#334155', strokeWidth: 1.5 },
    async: { name: 'Asynchronous Event', targetArrow: 'arrow', lineStyle: 'dashed', stroke: '#6d28d9', strokeWidth: 1.5 },
    data: { name: 'Data Path', targetArrow: 'arrow', lineStyle: 'solid', stroke: '#b45309', strokeWidth: 2 },
    dns: { name: 'DNS Resolution', targetArrow: 'arrow', lineStyle: 'dotted', stroke: '#0369a1', strokeWidth: 1.5 },
    replication: { name: 'Replication', targetArrow: 'arrow', sourceArrow: 'arrow', lineStyle: 'dashed', stroke: '#0f766e', strokeWidth: 1.5 },
    monitoring: { name: 'Telemetry', targetArrow: 'arrow', lineStyle: 'dotted', stroke: '#64748b', strokeWidth: 1.25 },
    annotation: { name: 'Annotation', targetArrow: 'none', lineStyle: 'dashed', stroke: '#94a3b8', strokeWidth: 1 },
  },
  defaultEdgeStyle: 'network',
  connectionRules: ALL_NODES.map((from) => ({ from, to: ALL_NODES })),
};
