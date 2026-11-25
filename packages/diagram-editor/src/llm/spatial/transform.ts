import type {
  SpatialDiagnostic,
  SpatialPlan,
  SpatialPositionResult,
  SpatialRect,
  SpatialSnapshotNode,
} from './types';

type Point = { x: number; y: number };

export function computeSpatialPositions(plan: SpatialPlan): SpatialPositionResult {
  const invalid = plan.snapshot.find((node) => !hasFiniteExtents(node.bounds));
  if (invalid) {
    return failure('spatial.geometry.invalid', 'The spatial snapshot contains non-finite geometry', [invalid.id]);
  }
  const byId = new Map(plan.snapshot.map((node) => [node.id, node]));
  const operation = plan.operation;
  if (operation.kind === 'relative') {
    const subject = byId.get(operation.subjectIds[0])!;
    const target = byId.get(operation.targetId)!;
    const point: Point = { x: subject.bounds.x, y: subject.bounds.y };
    if (operation.relation === 'above' || operation.relation === 'below') {
      point.x = target.bounds.x + (target.bounds.width - subject.bounds.width) / 2;
      point.y = operation.relation === 'above'
        ? target.bounds.y - plan.gap - subject.bounds.height
        : target.bounds.y + target.bounds.height + plan.gap;
    } else {
      point.x = operation.relation === 'left-of'
        ? target.bounds.x - plan.gap - subject.bounds.width
        : target.bounds.x + target.bounds.width + plan.gap;
      point.y = target.bounds.y + (target.bounds.height - subject.bounds.height) / 2;
    }
    return success([{ id: subject.id, position: toCanonical(subject, point, byId) }]);
  }

  if (operation.kind === 'boundary') {
    const subject = byId.get(operation.subjectIds[0])!;
    const scope = operation.scope.kind === 'group'
      ? byId.get(operation.scope.id)!.bounds
      : union(plan.snapshot.map((node) => node.bounds));
    if (!hasFiniteExtents(scope)) {
      return failure('spatial.geometry.invalid', 'The spatial scope contains non-finite geometry', [subject.id]);
    }
    const inset = operation.scope.kind === 'group' ? plan.gap : 0;
    const minX = scope.x + inset;
    const maxX = scope.x + scope.width - inset - subject.bounds.width;
    const minY = scope.y + inset;
    const maxY = scope.y + scope.height - inset - subject.bounds.height;
    const scopeId = operation.scope.kind === 'group' ? operation.scope.id : undefined;
    if (minX > maxX || minY > maxY
      || ((operation.side === 'top' || operation.side === 'bottom')
        && (subject.bounds.x < minX - plan.tolerance || subject.bounds.x > maxX + plan.tolerance))
      || ((operation.side === 'left' || operation.side === 'right')
        && (subject.bounds.y < minY - plan.tolerance || subject.bounds.y > maxY + plan.tolerance))) {
      return failure('spatial.outcome.unsatisfied', 'The subject cannot fit at the requested scope boundary', [subject.id, ...(scopeId ? [scopeId] : [])]);
    }
    const point = { x: subject.bounds.x, y: subject.bounds.y };
    if (operation.side === 'left') point.x = minX;
    else if (operation.side === 'right') point.x = maxX;
    else if (operation.side === 'top') point.y = minY;
    else point.y = maxY;
    return success([{ id: subject.id, position: toCanonical(subject, point, byId) }]);
  }

  return arrange(plan, operation.subjectIds.map((id) => byId.get(id)!));
}

function arrange(plan: SpatialPlan, nodes: SpatialSnapshotNode[]): SpatialPositionResult {
  const axis = plan.operation.kind === 'arrange' ? plan.operation.axis : 'row';
  const direction = plan.operation.kind === 'arrange' ? plan.operation.direction : 'left-to-right';
  const horizontal = axis === 'row';
  const positive = direction === 'left-to-right' || direction === 'top-to-bottom';
  const size = (node: SpatialSnapshotNode) => horizontal ? node.bounds.width : node.bounds.height;
  const leading = (node: SpatialSnapshotNode) => {
    const coordinate = horizontal ? node.bounds.x : node.bounds.y;
    return positive ? coordinate : -(coordinate + size(node));
  };
  const orthCenter = (node: SpatialSnapshotNode) => horizontal
    ? node.bounds.y + node.bounds.height / 2
    : node.bounds.x + node.bounds.width / 2;
  const anchors = nodes.map((node, index) => node.pinned ? index : -1).filter((index) => index >= 0);
  const logical: number[] = new Array(nodes.length);
  let center = orthCenter(nodes[anchors[0] ?? 0]);

  for (let index = 1; index < anchors.length; index++) {
    const leftIndex = anchors[index - 1];
    const rightIndex = anchors[index];
    const left = nodes[leftIndex];
    const right = nodes[rightIndex];
    if (Math.abs(orthCenter(right) - center) > plan.tolerance) {
      return failure('spatial.anchor.alignment', 'Pinned arrangement anchors are not aligned', [nodes[anchors[0]].id, right.id]);
    }
    if (leading(right) < leading(left) + size(left)) {
      return failure('spatial.anchor.order', 'Pinned arrangement anchors contradict the requested order', [left.id, right.id]);
    }
    const intermediateWidth = nodes.slice(leftIndex + 1, rightIndex).reduce((total, node) => total + size(node), 0);
    const availableGap = leading(right) - leading(left) - size(left) - intermediateWidth;
    const requiredGap = plan.gap * (rightIndex - leftIndex);
    if (availableGap + plan.tolerance < requiredGap) {
      return failure('spatial.anchor.space', 'Pinned arrangement anchors leave insufficient space', [left.id, right.id]);
    }
  }

  if (!anchors.length) {
    logical[0] = leading(nodes[0]);
    for (let index = 1; index < nodes.length; index++) {
      logical[index] = logical[index - 1] + size(nodes[index - 1]) + plan.gap;
    }
  } else {
    for (const anchor of anchors) logical[anchor] = leading(nodes[anchor]);
    const first = anchors[0];
    for (let index = first - 1; index >= 0; index--) {
      logical[index] = logical[index + 1] - size(nodes[index]) - plan.gap;
    }
    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex++) {
      const left = anchors[anchorIndex];
      const right = anchors[anchorIndex + 1];
      const intermediateWidth = nodes.slice(left + 1, right).reduce((total, node) => total + size(node), 0);
      const gap = (logical[right] - logical[left] - size(nodes[left]) - intermediateWidth) / (right - left);
      for (let index = left + 1; index < right; index++) {
        logical[index] = logical[index - 1] + size(nodes[index - 1]) + gap;
      }
    }
    const last = anchors[anchors.length - 1];
    for (let index = last + 1; index < nodes.length; index++) {
      logical[index] = logical[index - 1] + size(nodes[index - 1]) + plan.gap;
    }
  }

  const byId = new Map(plan.snapshot.map((node) => [node.id, node]));
  return success(nodes.map((node, index) => {
    if (node.pinned) return { id: node.id, position: { ...node.canonicalPosition } };
    const axisPosition = positive ? logical[index] : -logical[index] - size(node);
    const point: Point = horizontal
      ? { x: axisPosition, y: center - node.bounds.height / 2 }
      : { x: center - node.bounds.width / 2, y: axisPosition };
    return { id: node.id, position: toCanonical(node, point, byId) };
  }));
}

function toCanonical(node: SpatialSnapshotNode, absolute: Point, byId: ReadonlyMap<string, SpatialSnapshotNode>): Point {
  const parent = node.parentId ? byId.get(node.parentId)?.bounds : undefined;
  return { x: absolute.x - (parent?.x ?? 0), y: absolute.y - (parent?.y ?? 0) };
}

function union(rectangles: readonly SpatialRect[]): SpatialRect {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rectangles) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function hasFiniteExtents(rect: SpatialRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && Number.isFinite(rect.x + rect.width)
    && Number.isFinite(rect.y + rect.height);
}

function success(positions: Array<{ id: string; position: Point }>): SpatialPositionResult {
  const invalid = positions.find((entry) => !Number.isFinite(entry.position.x) || !Number.isFinite(entry.position.y));
  if (invalid) return failure('spatial.geometry.invalid', 'The spatial transform produced non-finite geometry', [invalid.id]);
  for (const entry of positions) {
    Object.freeze(entry.position);
    Object.freeze(entry);
  }
  return Object.freeze({
    success: true,
    positions: Object.freeze(positions),
    diagnostics: Object.freeze([] as []),
  });
}

function failure(code: SpatialDiagnostic['code'], message: string, entityIds: string[]): SpatialPositionResult {
  return { success: false, positions: [], diagnostics: [{ code, message, entityIds }] };
}
