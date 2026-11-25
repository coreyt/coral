import type { GraphIR, GraphNode, Position } from '@coral-viz/language';

export interface IndexedNode {
  readonly node: GraphNode;
  readonly parentId?: string;
  readonly childIds: readonly string[];
}

export function indexNodes(graph: GraphIR): Map<string, IndexedNode> | undefined {
  const result = new Map<string, IndexedNode>();
  const visit = (nodes: readonly GraphNode[], parentId?: string): boolean => {
    for (const node of nodes) {
      if (result.has(node.id)) return false;
      result.set(node.id, { node, parentId, childIds: (node.children ?? []).map((child) => child.id) });
      if (!visit(node.children ?? [], node.id)) return false;
    }
    return true;
  };
  return visit(graph.nodes) ? result : undefined;
}

export function updateNodePositions(graph: GraphIR, positions: ReadonlyMap<string, Readonly<Position>>): GraphIR {
  let changed = false;
  const visit = (nodes: readonly GraphNode[]): GraphNode[] => nodes.map((node) => {
    const children = node.children ? visit(node.children) : undefined;
    const position = positions.get(node.id);
    const positionChanged = position !== undefined && !deepEqual(node.position, position);
    const childrenChanged = children !== undefined && children.some((child, index) => child !== node.children![index]);
    if (!positionChanged && !childrenChanged) return node;
    changed = true;
    return {
      ...node,
      ...(children !== undefined ? { children } : {}),
      ...(position !== undefined ? { position: { x: position.x, y: position.y } } : {}),
    };
  });
  const nodes = visit(graph.nodes);
  return changed ? { ...graph, nodes } : graph;
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key]));
}

export function omit(record: object, excluded: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record)
    .filter(([key, value]) => !excluded.has(key) && value !== undefined));
}

export function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let index = 0;
  for (const value of haystack) {
    if (value === needle[index]) index++;
  }
  return index === needle.length;
}
