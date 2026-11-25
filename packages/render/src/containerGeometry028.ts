/** Derived rectangular container geometry. Source positions and dimensions stay authoritative. */
import type { GraphNode } from '@graph-ir/core';
import type { ShapeDefinition } from './types.js';

const CONTAINER_TYPES_0214 = new Set([
  'group', 'boundary', 'systemBoundary', 'containerBoundary',
  'account', 'subscription', 'project', 'region', 'az', 'availabilityZone',
  'vpc', 'vnet', 'subnet', 'cluster', 'securityGroup',
]);

export function isContainerNode028(node: Pick<GraphNode, 'type' | 'children' | 'classifier' | 'symbol'>): boolean {
  return !node.classifier && (
    CONTAINER_TYPES_0214.has(node.type)
    || node.symbol === 'infra-boundary'
    || Boolean(node.children?.length)
  );
}

/** Containers are elastic frames; ordinary symbols retain their native aspect ratio. */
export function containerStencilShape028(shape: ShapeDefinition, width: number, height: number,
  container = false): ShapeDefinition {
  if (!container || shape.id !== 'rectangle') return shape;
  return { ...shape, viewBox: `0 0 ${width} ${height}`,
    path: `M0 0 L${width} 0 L${width} ${height} L0 ${height} Z` };
}

/** Includes flattened adapter inputs whose child ownership lives in parent IDs. */
export function containerNodeIds028(nodes: readonly GraphNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (items: readonly GraphNode[]) => { for (const node of items) {
    if (isContainerNode028(node)) ids.add(node.id);
    if (node.parent) ids.add(node.parent);
    visit(node.children ?? []);
  } };
  visit(nodes); return ids;
}

/** Ancestry survives adapters that flatten nested source nodes. */
export function containerParentIds028(nodes: readonly GraphNode[]): Map<string, string> {
  const parents = new Map<string, string>();
  const visit = (items: readonly GraphNode[], owner?: string) => { for (const node of items) {
    const parent = node.parent ?? owner;
    if (parent) parents.set(node.id, parent);
    visit(node.children ?? [], node.id);
  } };
  visit(nodes); return parents;
}
