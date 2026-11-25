import type { GraphNode } from '@graph-ir/core';

/** Visit nested authored nodes once, without looping on malformed cyclic input. */
export function allGraphNodes028(nodes: readonly GraphNode[]): GraphNode[] {
  const result: GraphNode[] = [];
  const seen = new Set<GraphNode>();
  const visit = (node: GraphNode): void => {
    if (seen.has(node)) return;
    seen.add(node);
    result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return result;
}
