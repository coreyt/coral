import type { GraphIR } from '@coral-viz/language';
import type {
  CapturedNodeGeometry,
  ResolvedSpatialOperation,
  SpatialDiagnostic,
  SpatialPlanResult,
  SpatialRecognition,
  SpatialSnapshotNode,
} from './types';

export interface ResolveSpatialPlanOptions {
  readonly gap?: number;
  readonly tolerance?: number;
}

export function resolveSpatialPlan(
  graph: GraphIR,
  geometry: readonly CapturedNodeGeometry[],
  recognition: SpatialRecognition,
  options: ResolveSpatialPlanOptions = {},
): SpatialPlanResult {
  if ((recognition.classification !== 'spatial-only' && recognition.classification !== 'mixed') || !recognition.command) {
    return { success: false, diagnostics: recognition.diagnostics.length ? recognition.diagnostics : [diagnostic('spatial.unsupported', 'No supported spatial command was recognized')] };
  }
  const gap = options.gap ?? 24;
  const tolerance = options.tolerance ?? 0.5;
  if (!finiteNonNegative(gap) || !finiteNonNegative(tolerance)) {
    return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', 'Gap and tolerance must be finite non-negative numbers')] };
  }

  const flattened = flattenGraph(graph);
  if (!flattened.success) return { success: false, diagnostics: flattened.diagnostics };
  const snapshotResult = buildSnapshot(flattened.nodes, geometry);
  if (!snapshotResult.success) return { success: false, diagnostics: snapshotResult.diagnostics };
  const snapshot = snapshotResult.snapshot;
  const nodeById = new Map(snapshot.map((node) => [node.id, node]));
  const flatById = new Map(flattened.nodes.map((entry) => [entry.node.id, entry]));
  const labels = new Map<string, string[]>();
  for (const node of snapshot) {
    if (!node.label) continue;
    const key = normalizeLabel(node.label);
    const ids = labels.get(key) ?? [];
    ids.push(node.id);
    labels.set(key, ids);
  }
  const resolveRef = (text: string): { id?: string; error?: SpatialDiagnostic } => {
    if (nodeById.has(text)) return { id: text };
    const normalized = normalizeLabel(text);
    const matches = labels.get(normalized) ?? [];
    if (matches.length === 1) return { id: matches[0] };
    if (matches.length > 1) return { error: diagnostic('spatial.reference.ambiguous', `Reference "${text}" matches multiple nodes`, matches) };
    return { error: diagnostic('spatial.reference.missing', `Reference "${text}" does not match a node`) };
  };

  const command = recognition.command;
  let operation: ResolvedSpatialOperation;
  if (command.kind === 'relative') {
    const subject = resolveRef(command.subject.text);
    const target = resolveRef(command.target.text);
    const errors = [subject.error, target.error].filter((value): value is SpatialDiagnostic => Boolean(value));
    if (errors.length) return { success: false, diagnostics: errors };
    if (subject.id === target.id || isAncestor(flatById, subject.id!, target.id!) || isAncestor(flatById, target.id!, subject.id!)) {
      return { success: false, diagnostics: [diagnostic('spatial.contradiction', 'Relative subject and target must be independent nodes', [subject.id!, target.id!])] };
    }
    operation = { kind: 'relative', subjectIds: [subject.id!], relation: command.relation, targetId: target.id! };
  } else if (command.kind === 'boundary') {
    const subject = resolveRef(command.subject.text);
    if (subject.error) return { success: false, diagnostics: [subject.error] };
    if (command.scope.kind === 'diagram') {
      operation = { kind: 'boundary', subjectIds: [subject.id!], side: command.side, scope: { kind: 'diagram' } };
    } else {
      const scope = resolveRef(command.scope.reference.text);
      if (scope.error) return { success: false, diagnostics: [scope.error] };
      const scopeNode = nodeById.get(scope.id!);
      if (!scopeNode || scopeNode.type !== 'group') {
        return { success: false, diagnostics: [diagnostic('spatial.scope.invalid', `Scope "${scope.id}" is not a group`, [scope.id!])] };
      }
      if (subject.id === scope.id || !isAncestor(flatById, scope.id!, subject.id!)) {
        return { success: false, diagnostics: [diagnostic('spatial.scope.invalid', 'A group-boundary subject must be inside that group', [subject.id!, scope.id!])] };
      }
      const subjectBounds = nodeById.get(subject.id!)!.bounds;
      const scopeBounds = scopeNode.bounds;
      if (subjectBounds.width > scopeBounds.width - 2 * gap
        || subjectBounds.height > scopeBounds.height - 2 * gap) {
        return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', 'The subject cannot fit inside the group boundary inset', [subject.id!, scope.id!])] };
      }
      operation = { kind: 'boundary', subjectIds: [subject.id!], side: command.side, scope: { kind: 'group', id: scope.id! } };
    }
  } else {
    let memberIds: string[] = [];
    if (command.members.kind === 'group') {
      const groupRef = resolveRef(command.members.reference.text);
      if (groupRef.error) return { success: false, diagnostics: [groupRef.error] };
      const groupNode = nodeById.get(groupRef.id!);
      if (!groupNode || groupNode.type !== 'group') {
        return { success: false, diagnostics: [diagnostic('spatial.scope.invalid', `Arrangement scope "${groupRef.id}" is not a group`, [groupRef.id!])] };
      }
      memberIds = [...groupNode.childIds];
    } else {
      const resolutions = command.members.references.map((reference) => resolveRef(reference.text));
      const errors = resolutions.flatMap((result) => result.error ? [result.error] : []);
      if (errors.length) return { success: false, diagnostics: errors };
      memberIds = resolutions.map((result) => result.id!);
    }
    if (memberIds.length < 2) {
      return { success: false, diagnostics: [diagnostic('spatial.scope.invalid', 'An arrangement requires at least two members', memberIds)] };
    }
    const memberSet = new Set<string>();
    const duplicate = memberIds.find((id) => memberSet.has(id) || !memberSet.add(id));
    if (duplicate) return { success: false, diagnostics: [diagnostic('spatial.member.duplicate', `Arrangement member "${duplicate}" is duplicated`, [duplicate])] };
    const ancestryConflict = findAncestryConflict(flattened.nodes, memberIds);
    if (ancestryConflict) {
      return { success: false, diagnostics: [diagnostic('spatial.contradiction', 'An arrangement cannot contain an ancestor and its descendant', ancestryConflict)] };
    }
    operation = { kind: 'arrange', subjectIds: memberIds, axis: command.axis, direction: command.direction };
  }

  const required = new Set<string>(operation.subjectIds);
  if (operation.kind === 'relative') required.add(operation.targetId);
  if (operation.kind === 'boundary') {
    if (operation.scope.kind === 'group') required.add(operation.scope.id);
    else for (const node of snapshot) required.add(node.id);
  }
  for (let index = snapshot.length - 1; index >= 0; index--) {
    const node = snapshot[index];
    if (required.has(node.id) && node.parentId) required.add(node.parentId);
  }

  const plan = deepFreeze({
    version: 1 as const,
    graphId: graph.id,
    graphVersion: graph.version,
    classification: recognition.classification,
    operation,
    snapshot,
    gap,
    tolerance,
    pinPolicy: 'direct-move-preserves-pin-arrangement-pins-anchor' as const,
    positionDependencies: snapshot.filter((node) => required.has(node.id)).map((node) => node.id),
    baselineEdges: graph.edges.map((edge) => ({
      id: edge.id, source: edge.source, target: edge.target,
      ...(edge.sourcePort !== undefined ? { sourcePort: edge.sourcePort } : {}),
      ...(edge.targetPort !== undefined ? { targetPort: edge.targetPort } : {}),
    })),
  });
  return {
    success: true,
    plan,
    diagnostics: [],
  };
}

interface FlatNode {
  node: GraphIR['nodes'][number];
  parentId?: string;
  childIds: string[];
  preorder: number;
  subtreeEnd: number;
}

function diagnostic(code: SpatialDiagnostic['code'], message: string, entityIds?: string[]): SpatialDiagnostic {
  return { code, message, ...(entityIds ? { entityIds } : {}) };
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function flattenGraph(graph: GraphIR): { success: true; nodes: FlatNode[] } | { success: false; diagnostics: SpatialDiagnostic[] } {
  const nodes: FlatNode[] = [];
  const seen = new Set<string>();
  const visit = (node: GraphIR['nodes'][number], inheritedParent?: string): boolean => {
    if (seen.has(node.id)) return false;
    if (!inheritedParent && node.parent) return false;
    seen.add(node.id);
    const parentId = inheritedParent ?? node.parent;
    if (inheritedParent && node.parent && node.parent !== inheritedParent) return false;
    const children = node.children ?? [];
    const entry: FlatNode = { node, parentId, childIds: children.map((child) => child.id), preorder: nodes.length, subtreeEnd: -1 };
    nodes.push(entry);
    if (!children.every((child) => visit(child, node.id))) return false;
    entry.subtreeEnd = nodes.length;
    return true;
  };
  if (!graph.nodes.every((node) => visit(node))) {
    return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', 'Graph hierarchy contains duplicate IDs or conflicting parents')] };
  }
  const ids = new Set(nodes.map((entry) => entry.node.id));
  if (nodes.some((entry) => entry.parentId && !ids.has(entry.parentId))) {
    return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', 'Graph hierarchy references a missing parent')] };
  }
  return { success: true, nodes };
}

function buildSnapshot(
  nodes: FlatNode[],
  geometry: readonly CapturedNodeGeometry[],
): { success: true; snapshot: SpatialSnapshotNode[] } | { success: false; diagnostics: SpatialDiagnostic[] } {
  const geometryById = new Map<string, CapturedNodeGeometry>();
  for (const item of geometry) {
    if (geometryById.has(item.id)) return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', `Geometry for "${item.id}" is duplicated`, [item.id])] };
    geometryById.set(item.id, item);
  }
  const flatById = new Map(nodes.map((entry) => [entry.node.id, entry]));
  const absolute = new Map<string, { x: number; y: number }>();
  const resolving = new Set<string>();
  const canonical = new Map<string, { x: number; y: number; origin: readonly [number, number] }>();
  const compute = (id: string): { x: number; y: number } | undefined => {
    const cached = absolute.get(id);
    if (cached) return cached;
    if (resolving.has(id)) return undefined;
    const entry = flatById.get(id);
    const item = geometryById.get(id);
    if (!entry || !item || entry.parentId !== item.parentId || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y)
      || !Number.isFinite(item.width) || item.width <= 0 || !Number.isFinite(item.height) || item.height <= 0) return undefined;
    const origin: readonly [number, number] = item.origin ? [item.origin[0], item.origin[1]] : [0, 0];
    if (origin.length !== 2 || !origin.every(Number.isFinite)) return undefined;
    const relative = { x: item.position.x - origin[0] * item.width, y: item.position.y - origin[1] * item.height };
    canonical.set(id, { ...relative, origin });
    resolving.add(id);
    const parent = entry.parentId ? compute(entry.parentId) : { x: 0, y: 0 };
    resolving.delete(id);
    if (!parent) return undefined;
    const value = { x: parent.x + relative.x, y: parent.y + relative.y };
    absolute.set(id, value);
    return value;
  };
  for (const entry of nodes) if (!compute(entry.node.id)) {
    return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', `Geometry for "${entry.node.id}" is missing or invalid`, [entry.node.id])] };
  }
  if (geometryById.size !== nodes.length) {
    return { success: false, diagnostics: [diagnostic('spatial.geometry.invalid', 'Geometry contains an unknown node')] };
  }
  return {
    success: true,
    snapshot: nodes.map((entry) => {
      const item = geometryById.get(entry.node.id)!;
      const position = canonical.get(entry.node.id)!;
      const point = absolute.get(entry.node.id)!;
      return {
        id: entry.node.id,
        type: entry.node.type,
        ...(entry.node.label !== undefined ? { label: entry.node.label } : {}),
        ...(entry.parentId ? { parentId: entry.parentId } : {}),
        childIds: entry.childIds,
        pinned: entry.node.pinned === true,
        ...(entry.node.position ? { baselinePosition: { ...entry.node.position } } : {}),
        canonicalPosition: { x: position.x, y: position.y },
        origin: position.origin,
        bounds: { x: point.x, y: point.y, width: item.width, height: item.height },
        ...(entry.node.dimensions ? { dimensions: { ...entry.node.dimensions } } : {}),
      };
    }),
  };
}

function isAncestor(nodes: Map<string, FlatNode>, possibleAncestor: string, id: string): boolean {
  const ancestor = nodes.get(possibleAncestor);
  const node = nodes.get(id);
  return Boolean(ancestor && node && ancestor.preorder < node.preorder && node.preorder < ancestor.subtreeEnd);
}

function findAncestryConflict(nodes: readonly FlatNode[], members: readonly string[]): [string, string] | undefined {
  const memberIndex = new Map(members.map((id, index) => [id, index]));
  const subtreeMinimum = new Map<string, number>();
  let best: [number, number] | undefined;
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    const descendantIndex = subtreeMinimum.get(node.node.id);
    const ownIndex = memberIndex.get(node.node.id);
    if (ownIndex !== undefined && descendantIndex !== undefined) {
      const pair: [number, number] = ownIndex < descendantIndex
        ? [ownIndex, descendantIndex]
        : [descendantIndex, ownIndex];
      if (!best || pair[0] < best[0] || (pair[0] === best[0] && pair[1] < best[1])) best = pair;
    }
    const minimum = ownIndex === undefined
      ? descendantIndex
      : descendantIndex === undefined ? ownIndex : Math.min(ownIndex, descendantIndex);
    if (minimum !== undefined && node.parentId) {
      const current = subtreeMinimum.get(node.parentId);
      if (current === undefined || minimum < current) subtreeMinimum.set(node.parentId, minimum);
    }
  }
  return best ? [members[best[0]], members[best[1]]] : undefined;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
