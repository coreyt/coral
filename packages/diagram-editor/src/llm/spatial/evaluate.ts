import type { GraphIR } from '@coral-viz/language';
import type { SpatialEvaluationResult, SpatialEvidence, SpatialPlan, SpatialRect, SpatialRelation } from './types';
import { indexNodes } from './graph';

export function evaluateSpatialPlan(graph: GraphIR, plan: SpatialPlan): SpatialEvaluationResult {
  const bounds = currentBounds(graph, plan);
  if (!bounds.success) return bounds.result;
  const operation = plan.operation;
  let evidence: SpatialEvidence[];
  if (operation.kind === 'relative') {
    evidence = relativeEvidence(
      bounds.value.get(operation.subjectIds[0])!,
      bounds.value.get(operation.targetId)!,
      operation.relation,
      operation.subjectIds[0],
      operation.targetId,
      plan,
    );
  } else if (operation.kind === 'boundary') {
    const subject = bounds.value.get(operation.subjectIds[0])!;
    const scopeId = operation.scope.kind === 'group' ? operation.scope.id : undefined;
    const scope = scopeId
      ? plan.snapshot.find((node) => node.id === scopeId)!.bounds
      : union(plan.snapshot.map((node) => node.bounds));
    if (!finiteRect(scope)) return missing(operation.subjectIds[0]).result;
    evidence = boundaryEvidence(subject, scope, operation.side, operation.subjectIds[0], plan, operation.scope.kind === 'group');
  } else {
    evidence = arrangementEvidence(operation.subjectIds.map((id) => bounds.value.get(id)!), operation.subjectIds, plan);
  }
  const invalid = evidence.find((item) => !Number.isFinite(item.actual) || !Number.isFinite(item.expected));
  if (invalid) return missing(invalid.entityIds[0]).result;
  const failed = evidence.find((item) => !item.satisfied);
  if (failed) {
    return {
      success: false,
      evidence,
      diagnostics: [{
        code: 'spatial.outcome.unsatisfied',
        message: 'The applied graph does not satisfy the spatial plan',
        entityIds: failed.entityIds,
      }],
    };
  }
  return { success: true, evidence, diagnostics: [] };
}

function currentBounds(graph: GraphIR, plan: SpatialPlan):
  | { success: true; value: Map<string, SpatialRect> }
  | { success: false; result: SpatialEvaluationResult } {
  const indexed = indexNodes(graph);
  const snapshot = new Map(plan.snapshot.map((node) => [node.id, node]));
  const subjects = new Set(plan.operation.subjectIds);
  if (!indexed) return missing(plan.operation.subjectIds[0]);
  const canonical = new Map<string, { x: number; y: number }>();
  for (const item of plan.snapshot) {
    const position = subjects.has(item.id) ? indexed.get(item.id)?.node.position : item.canonicalPosition;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return missing(item.id);
    canonical.set(item.id, position);
  }
  const absolute = new Map<string, { x: number; y: number }>();
  const visiting = new Set<string>();
  const resolve = (id: string): { x: number; y: number } | undefined => {
    const known = absolute.get(id);
    if (known) return known;
    const item = snapshot.get(id);
    const position = canonical.get(id);
    if (!item || !position || visiting.has(id)) return undefined;
    visiting.add(id);
    const parent = item.parentId ? resolve(item.parentId) : { x: 0, y: 0 };
    visiting.delete(id);
    if (!parent) return undefined;
    const point = { x: parent.x + position.x, y: parent.y + position.y };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    absolute.set(id, point);
    return point;
  };
  const result = new Map<string, SpatialRect>();
  for (const item of plan.snapshot) {
    const point = resolve(item.id);
    if (!point) return missing(item.id);
    result.set(item.id, { ...point, width: item.bounds.width, height: item.bounds.height });
  }
  return { success: true, value: result };
}

function missing(id: string): { success: false; result: SpatialEvaluationResult } {
  return {
    success: false,
    result: {
      success: false,
      evidence: [],
      diagnostics: [{ code: 'spatial.outcome.unsatisfied', message: 'A spatial subject has no finite position', entityIds: [id] }],
    },
  };
}

function relativeEvidence(
  subject: SpatialRect,
  target: SpatialRect,
  relation: SpatialRelation,
  subjectId: string,
  targetId: string,
  plan: SpatialPlan,
): SpatialEvidence[] {
  const vertical = relation === 'above' || relation === 'below';
  const gap = relation === 'above' ? target.y - (subject.y + subject.height)
    : relation === 'below' ? subject.y - (target.y + target.height)
      : relation === 'left-of' ? target.x - (subject.x + subject.width)
        : subject.x - (target.x + target.width);
  const alignment = vertical
    ? subject.x + subject.width / 2 - (target.x + target.width / 2)
    : subject.y + subject.height / 2 - (target.y + target.height / 2);
  const ids = [subjectId, targetId];
  return [exactEvidence('relative.gap', gap, plan.gap, ids, plan.tolerance), exactEvidence('relative.alignment', alignment, 0, ids, plan.tolerance)];
}

function boundaryEvidence(subject: SpatialRect, scope: SpatialRect, side: 'top' | 'bottom' | 'left' | 'right', subjectId: string, plan: SpatialPlan, group: boolean): SpatialEvidence[] {
  const inset = group ? plan.gap : 0;
  const horizontalSide = side === 'left' || side === 'right';
  const actualEdge = side === 'left' ? subject.x : side === 'right' ? subject.x + subject.width
    : side === 'top' ? subject.y : subject.y + subject.height;
  const expectedEdge = side === 'left' ? scope.x + inset : side === 'right' ? scope.x + scope.width - inset
    : side === 'top' ? scope.y + inset : scope.y + scope.height - inset;
  const actualMin = horizontalSide ? subject.y : subject.x;
  const expectedMin = (horizontalSide ? scope.y : scope.x) + inset;
  const actualMax = horizontalSide ? subject.y + subject.height : subject.x + subject.width;
  const expectedMax = (horizontalSide ? scope.y + scope.height : scope.x + scope.width) - inset;
  return [
    exactEvidence('boundary.edge', actualEdge, expectedEdge, [subjectId], plan.tolerance),
    thresholdEvidence('boundary.minimum', actualMin, expectedMin, [subjectId], plan.tolerance, 'minimum'),
    thresholdEvidence('boundary.maximum', actualMax, expectedMax, [subjectId], plan.tolerance, 'maximum'),
  ];
}

function arrangementEvidence(rectangles: SpatialRect[], ids: readonly string[], plan: SpatialPlan): SpatialEvidence[] {
  if (plan.operation.kind !== 'arrange') return [];
  const horizontal = plan.operation.axis === 'row';
  const positive = plan.operation.direction === 'left-to-right' || plan.operation.direction === 'top-to-bottom';
  const size = (rect: SpatialRect) => horizontal ? rect.width : rect.height;
  const leading = (rect: SpatialRect) => {
    const coordinate = horizontal ? rect.x : rect.y;
    return positive ? coordinate : -(coordinate + size(rect));
  };
  const center = (rect: SpatialRect) => horizontal ? rect.y + rect.height / 2 : rect.x + rect.width / 2;
  const evidence: SpatialEvidence[] = [];
  for (let index = 1; index < rectangles.length; index++) {
    const pair = [ids[index - 1], ids[index]];
    const gap = leading(rectangles[index]) - leading(rectangles[index - 1]) - size(rectangles[index - 1]);
    evidence.push(thresholdEvidence('arrangement.minimum-gap', gap, plan.gap, pair, plan.tolerance, 'minimum'));
    evidence.push(exactEvidence('arrangement.alignment', center(rectangles[index]) - center(rectangles[0]), 0, [ids[0], ids[index]], plan.tolerance));
  }
  return evidence;
}

function exactEvidence(predicate: string, actual: number, expected: number, entityIds: string[], tolerance: number): SpatialEvidence {
  return { predicate, satisfied: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, entityIds, actual, expected, tolerance };
}

function thresholdEvidence(predicate: string, actual: number, expected: number, entityIds: string[], tolerance: number, mode: 'minimum' | 'maximum'): SpatialEvidence {
  const satisfied = Number.isFinite(actual) && (mode === 'minimum' ? actual + tolerance >= expected : actual - tolerance <= expected);
  return { predicate, satisfied, entityIds, actual, expected, tolerance };
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

function finiteRect(rect: SpatialRect): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y)
    && Number.isFinite(rect.width) && Number.isFinite(rect.height)
    && Number.isFinite(rect.x + rect.width) && Number.isFinite(rect.y + rect.height);
}
