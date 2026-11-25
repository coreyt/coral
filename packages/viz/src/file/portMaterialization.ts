import type { GraphIR, GraphNode } from '../types.js';
import type { GraphIR2To3MigrationChange } from '@graph-ir/core';

export type GraphPort = NonNullable<GraphNode['ports']>[number];

/** Resolve the complete implicit port set supplied for a node by its notation symbol. */
export type PortResolver = (node: GraphNode, graph: GraphIR) => readonly GraphPort[] | undefined;

export interface PortMaterializationResult {
  graph: GraphIR;
  changes: GraphIR2To3MigrationChange[];
}

function clonePort(port: GraphPort): GraphPort {
  return {
    ...port,
    ...(port.properties ? { properties: { ...port.properties } } : {}),
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key]));
}

function samePortSet(left: readonly GraphPort[], right: readonly GraphPort[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((port) => [port.id, port]));
  return rightById.size === right.length
    && left.every((port) => {
      const candidate = rightById.get(port.id);
      return candidate !== undefined && deepEqual(port, candidate);
    });
}

function referencedPorts(graph: GraphIR): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const add = (nodeId: string, portId: string | undefined) => {
    if (!portId) return;
    const ports = result.get(nodeId) ?? new Set<string>();
    ports.add(portId);
    result.set(nodeId, ports);
  };
  for (const edge of graph.edges) {
    add(edge.source, edge.sourcePort);
    add(edge.target, edge.targetPort);
  }
  return result;
}

/**
 * Make implicit symbol ports portable at validation/persistence boundaries.
 * A node with authored `ports` remains authoritative. When any referenced
 * implicit port resolves, the symbol's complete port set is written so the
 * node keeps every handle when a GraphIR consumer reads it.
 */
export function materializeReferencedPorts(graph: GraphIR, resolvePorts?: PortResolver): PortMaterializationResult {
  if (!resolvePorts) return { graph, changes: [] };
  const referenced = referencedPorts(graph);
  const changes: GraphIR2To3MigrationChange[] = [];

  const visit = (nodes: GraphNode[], path: string): GraphNode[] => nodes.map((node, index) => {
    const nodePath = `${path}/${index}`;
    const children = node.children ? visit(node.children, `${nodePath}/children`) : node.children;
    if (node.ports !== undefined) return children === node.children ? node : { ...node, children };
    const required = referenced.get(node.id);
    if (!required?.size) return children === node.children ? node : { ...node, children };
    const resolved = resolvePorts(node, graph);
    if (!resolved?.length || ![...required].some((portId) => resolved.some((port) => port.id === portId))) {
      return children === node.children ? node : { ...node, children };
    }
    changes.push({
      code: 'MATERIALIZE_SYMBOL_PORTS',
      path: `${nodePath}/ports`,
      message: `Materialized ${resolved.length} notation-symbol ports for node "${node.id}"`,
    });
    return { ...node, ...(children ? { children } : {}), ports: resolved.map(clonePort) };
  });

  const nodes = visit(graph.nodes, '/nodes');
  return changes.length > 0 ? { graph: { ...graph, nodes }, changes } : { graph, changes };
}

/** Remove a persisted symbol-port set from the editor's source projection. */
export function stripResolvedPorts(graph: GraphIR, resolvePorts?: PortResolver): PortMaterializationResult {
  if (!resolvePorts) return { graph, changes: [] };
  const changes: GraphIR2To3MigrationChange[] = [];

  const visit = (nodes: GraphNode[], path: string): GraphNode[] => nodes.map((node, index) => {
    const nodePath = `${path}/${index}`;
    const children = node.children ? visit(node.children, `${nodePath}/children`) : node.children;
    const resolved = node.ports === undefined ? undefined : resolvePorts(node, graph);
    if (node.ports === undefined || !resolved || !samePortSet(node.ports, resolved)) {
      return children === node.children ? node : { ...node, children };
    }
    const withoutPorts = { ...node };
    delete withoutPorts.ports;
    changes.push({
      code: 'STRIP_SYMBOL_PORTS',
      path: `${nodePath}/ports`,
      message: `Restored ${resolved.length} notation-symbol ports for node "${node.id}" to implicit form`,
    });
    return { ...withoutPorts, ...(children ? { children } : {}) } as GraphNode;
  });

  const nodes = visit(graph.nodes, '/nodes');
  return changes.length > 0 ? { graph: { ...graph, nodes }, changes } : { graph, changes };
}
