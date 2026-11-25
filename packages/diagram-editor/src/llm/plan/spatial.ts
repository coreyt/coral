/**
 * Deterministic spatial integration for `coral-plan/1` (0.2.10 design,
 * "Geometry and semantic meaning"; plan slice 60).
 *
 * Topology and labels compile first. The structural candidate is measured in
 * detached staging; the existing deterministic calculations
 * (llm/spatial/transform.ts) run on that successor geometry; and each placed
 * node gets an authored `@ (x, y)` through a source-owned position edit. No
 * GraphIR 3 finalizer or generated document is involved. The positioned
 * candidate is measured again, and every operation's predicate, and the
 * position of every node the plan does not place, must hold in that final
 * geometry; otherwise the whole plan is refused and nothing is written.
 */
import { successorSourceDisplayWithSemanticPorts028,
  type SvgOptions, type SuccessorSourceGraph028, type SuccessorSourceNode028 } from '@coral-viz/render';
import type { ResolvedLayoutDiagnostic } from '@coral-viz/render/layout';
import { layoutGraphForSvg } from '@coral-viz/render/svg-layout';
import { setSourceOwnedNodePosition028 } from '../../sourceOwnedEdits028';
import { computeSpatialPositions } from '../spatial/transform';
import type { ArrangementDirection, SpatialPlan, SpatialRect, SpatialSnapshotNode } from '../spatial/types';
import type { PlanOperation, PlanResponse } from './decode';
import {
  admitCandidate, compilePass, preparePlan, refuse, Refusal, type ExecutionResult, type PlanExecution, type SpatialIntent,
} from './execute';
import { preorder, type PlanCapture } from './snapshot';

/**
 * Graph-absolute rectangles by node ID, as the staged layout measured them,
 * with that layout's diagnostics (for example `layout.route.degraded`).
 */
export type PlanGeometry = ReadonlyMap<string, SpatialRect> & { readonly diagnostics?: readonly ResolvedLayoutDiagnostic[] };
/** Measure a candidate; `source` is its compiled text, from which the canvas lays it out. */
export type MeasurePlanGeometry = (graph: SuccessorSourceGraph028, source: string) => Promise<PlanGeometry>;

/** Design spacing in logical diagram units. */
const SPACING = { compact: 16, normal: 32, wide: 64 } as const;
const TOLERANCE = 0.5;
/** Owner, 2026-11-15: the farthest the local overlap repair moves one automatic node. */
export const LOCAL_REPAIR_LIMIT = 200;
const round = (value: number) => Math.round(value * 100) / 100 + 0;

/**
 * Measurement with the shared SVG layout of the successor display graph.
 * Coordinates are valid only for the layout that measured them, so the
 * caller passes the direction and options of the layout the user sees.
 */
export function previewGeometry(options: { direction: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'; svgOptions: SvgOptions;
  spacing?: { nodeNode?: number; layerSpacing?: number } }): MeasurePlanGeometry {
  return async graph => {
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const laid = await layoutGraphForSvg(display, { direction: options.direction, svgOptions: options.svgOptions, semanticInterpretations,
      ...(options.spacing?.nodeNode !== undefined ? { nodeSpacing: options.spacing.nodeNode } : {}),
      ...(options.spacing?.layerSpacing !== undefined ? { layerSpacing: options.spacing.layerSpacing } : {}) });
    return Object.assign(new Map(laid.nodes.map(node => [node.id, { x: node.position?.x ?? NaN, y: node.position?.y ?? NaN,
      width: node.dimensions?.width ?? NaN, height: node.dimensions?.height ?? NaN }])), { diagnostics: laid.layoutDiagnostics028 ?? [] });
  };
}

const ARRANGEMENT: Record<string, ArrangementDirection> = {
  'row:forward': 'left-to-right', 'row:reverse': 'right-to-left', 'column:forward': 'top-to-bottom', 'column:reverse': 'bottom-to-top',
};

/** The deterministic calculation's plan, built from successor structure and measured geometry. */
function legacyPlan(intent: SpatialIntent, graph: SuccessorSourceGraph028, rects: Map<string, SpatialRect>): SpatialPlan {
  const op = intent.op;
  const snapshot: SpatialSnapshotNode[] = preorder(graph.nodes).map(node => ({
    id: node.id, type: node.type, ...(node.parent ? { parentId: node.parent } : {}),
    childIds: (node.children ?? []).map(child => child.id), pinned: Boolean(node.pinned),
    canonicalPosition: node.position ?? { x: 0, y: 0 }, origin: [0, 0], bounds: rects.get(node.id)!,
  }));
  const operation: SpatialPlan['operation'] = op.op === 'layout.relative'
    ? { kind: 'relative', subjectIds: [intent.subjects[0]], relation: op.relation as 'above', targetId: intent.target! }
    : op.op === 'layout.boundary'
      ? { kind: 'boundary', subjectIds: [intent.subjects[0]], side: op.side as 'top',
        scope: intent.scope ? { kind: 'group', id: intent.scope } : { kind: 'diagram' } }
      : { kind: 'arrange', subjectIds: intent.subjects, axis: op.axis as 'row', direction: ARRANGEMENT[`${String(op.axis)}:${String(op.direction)}`] };
  return { version: 1, graphId: graph.id, graphVersion: graph.version, classification: 'spatial-only', operation, snapshot,
    gap: SPACING[op.spacing as keyof typeof SPACING], tolerance: TOLERANCE,
    pinPolicy: 'direct-move-preserves-pin-arrangement-pins-anchor', positionDependencies: [], baselineEdges: [] };
}

/** Each operation's predicate in final geometry, as the calculation defines it. */
function unsatisfied(intent: SpatialIntent, rects: PlanGeometry, anyPinned: boolean): string | undefined {
  const op = intent.op;
  const gap = SPACING[op.spacing as keyof typeof SPACING];
  const near = (actual: number, expected: number) => Math.abs(actual - expected) <= TOLERANCE;
  const cx = (r: SpatialRect) => r.x + r.width / 2;
  const cy = (r: SpatialRect) => r.y + r.height / 2;
  const subject = rects.get(intent.subjects[0])!;
  if (op.op === 'layout.relative') {
    const target = rects.get(intent.target!)!;
    const facing = { above: target.y - subject.y - subject.height, below: subject.y - target.y - target.height,
      'left-of': target.x - subject.x - subject.width, 'right-of': subject.x - target.x - target.width }[op.relation as 'above'];
    const aligned = op.relation === 'above' || op.relation === 'below' ? near(cx(subject), cx(target)) : near(cy(subject), cy(target));
    return near(facing, gap) && aligned ? undefined : `the ${String(op.relation)} gap or alignment`;
  }
  if (op.op === 'layout.boundary') {
    const scope = intent.scope ? rects.get(intent.scope)! : [...rects.values()].reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) }));
    const inset = intent.scope ? gap : 0;
    const edge = { left: [subject.x, scope.x + inset], right: [subject.x + subject.width, scope.x + scope.width - inset],
      top: [subject.y, scope.y + inset], bottom: [subject.y + subject.height, scope.y + scope.height - inset] }[op.side as 'top'];
    return near(edge[0], edge[1]) ? undefined : `the ${String(op.side)} boundary`;
  }
  const row = op.axis === 'row';
  const sign = op.direction === 'reverse' ? -1 : 1;
  const members = intent.subjects.map(id => rects.get(id)!);
  // Pinned anchors may stretch a gap; otherwise every gap is exact.
  const exact = !anyPinned;
  for (let k = 1; k < members.length; k++) {
    const [a, b] = [members[k - 1], members[k]];
    const space = sign > 0 ? (row ? b.x - a.x - a.width : b.y - a.y - a.height) : (row ? a.x - b.x - b.width : a.y - b.y - b.height);
    if ((exact ? !near(space, gap) : space + TOLERANCE < gap) || !near(row ? cy(b) : cx(b), row ? cy(members[0]) : cx(members[0]))) {
      return 'the arrangement order, gap or alignment';
    }
  }
  return undefined;
}

/** Nodes whose measured rectangle an operation reads: a relative target or a boundary group. */
const reads = (intent: SpatialIntent) => [intent.target, intent.scope].filter((id): id is string => Boolean(id));

/**
 * Placements in dependency order: an operation runs after every operation
 * that moves a node it reads, or that node's ancestors or descendants; a
 * diagram boundary runs after every other operation that does not read what
 * it moves. A cycle cannot be placed.
 */
function placementOrder(spatial: SpatialIntent[], ancestors: (id: string) => string[], descendants: (id: string) => string[]): SpatialIntent[] {
  const affects = (intent: SpatialIntent) => new Set(intent.subjects.flatMap(id => [id, ...ancestors(id), ...descendants(id)]));
  const diagram = (intent: SpatialIntent) => intent.op.op === 'layout.boundary' && intent.scope === null;
  const readsFrom = (x: SpatialIntent, y: SpatialIntent) => reads(x).some(id => affects(y).has(id));
  const after = new Map(spatial.map(x => [x, spatial.filter(y => y !== x &&
    (diagram(x) ? !diagram(y) && !readsFrom(y, x) : readsFrom(x, y)))]));
  const order: SpatialIntent[] = [];
  while (order.length < spatial.length) {
    const next = spatial.find(x => !order.includes(x) && after.get(x)!.every(y => order.includes(y)));
    if (!next) {
      const cycle = spatial.filter(x => !order.includes(x));
      return refuse('coral.plan.spatial.cycle', `Operations ${cycle.map(x => x.op.id).join(', ')} each place a node another reads.`, cycle[0].op.id);
    }
    order.push(next);
  }
  return order;
}

const sameRect = (a: SpatialRect | undefined, b: SpatialRect | undefined) => Boolean(a && b) &&
  (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(a![key] - b![key]) <= TOLERANCE);

/**
 * Execute a decoded plan, placing spatial operations with staged
 * measurement. Plans without spatial operations compile as in executePlan.
 */
export async function executePlanWithGeometry(capture: PlanCapture, response: PlanResponse,
  measure: MeasurePlanGeometry, shown?: ReadonlyMap<string, SpatialRect>): Promise<ExecutionResult> {
  try {
    const { expected, allocations, dependencies, renumbered, removedEdges, steps, spatial } = preparePlan(capture, response);
    let structural = compilePass(capture.source, steps);
    let structuralGraph = admitCandidate(capture, structural, expected);
    // Owner, 2026-11-16 (H3, every AI edit; revisit in 0.2.11): the canvas
    // keeps positions across edits, so a fresh layout of the source can differ
    // from what the user sees. The canvas place of each node a fresh layout
    // would move is written first, so neither Apply nor reopening moves it.
    // These nodes stay automatic for the overlap repair and are listed as kept.
    const unchanged = structural === capture.source && !spatial.length;
    const settled = shown && !unchanged ? await keepCanvas(structural, structuralGraph, measure, shown, spatial.length > 0) : new Map();
    if (settled.size) {
      const op = (response as Extract<PlanResponse, { kind: 'plan' }>).operations[0]!;
      structural = compilePass(structural, [...settled].map(([id, at]) => ({ op,
        owns: { kind: 'node' as const, id, block: false }, write: (draft: string) => setSourceOwnedNodePosition028(draft, id, at) })));
      const graph = structuredClone(structuralGraph);
      const byId = new Map(preorder(graph.nodes).map(node => [node.id, node]));
      for (const [id, at] of settled) byId.get(id)!.position = { ...at };
      structuralGraph = admitCandidate(capture, structural, graph);
    }
    const result = (source: string, graph: SuccessorSourceGraph028, extra: Pick<PlanExecution, 'layoutDiagnostics' | 'moved' | 'anchored'> = {}): ExecutionResult =>
      ({ ok: true, execution: { source, graph, changed: source !== capture.source, allocations, dependencies, renumbered, removedEdges,
        ...(extra.layoutDiagnostics?.length ? { layoutDiagnostics: extra.layoutDiagnostics } : {}),
        ...(extra.moved?.length ? { moved: extra.moved } : {}), ...(extra.anchored?.length ? { anchored: extra.anchored } : {}) } });
    if (!spatial.length) return result(structural, structuralGraph, { anchored: [...settled.keys()] });
    const nodes = new Map(preorder(structuralGraph.nodes).map(node => [node.id, node]));
    const descendants = (id: string): string[] => (nodes.get(id)?.children ?? []).flatMap(child => [child.id, ...descendants(child.id)]);
    const ancestors = (id: string): string[] => { const parent = nodes.get(id)?.parent; return parent ? [parent, ...ancestors(parent)] : []; };
    const ordered = placementOrder(spatial, ancestors, descendants);
    const measured = async (graph: SuccessorSourceGraph028, text: string, code: string) => {
      let geometry: PlanGeometry;
      try { geometry = await measure(graph, text); } catch (error) {
        return refuse(code, `The candidate could not be laid out: ${(error as Error).message}`, ordered[0].op.id);
      }
      const missing = preorder(graph.nodes).find(node => {
        const rect = geometry.get(node.id);
        return !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite);
      });
      if (missing) refuse(code, `${missing.id} has no measured geometry.`, ordered[0].op.id);
      return geometry;
    };
    const before = await measured(structuralGraph, structural, 'coral.plan.spatial.measure');
    const rects = new Map(before);
    // Where local (0, 0) of a frame lies: measured from a positioned child, else the frame's corner.
    const origin = (frame: string | undefined) => {
      if (!frame) return { x: 0, y: 0 };
      const child = nodes.get(frame)!.children?.find(item => item.position);
      const at = child ? before.get(child.id)! : before.get(frame)!;
      return child ? { x: at.x - child.position!.x, y: at.y - child.position!.y } : { x: at.x, y: at.y };
    };
    const positions = new Map<string, { x: number; y: number; op: PlanOperation }>();
    const intended = new Map<string, SpatialRect>();
    for (const intent of ordered) {
      const computed = computeSpatialPositions(legacyPlan(intent, structuralGraph, rects));
      if (!computed.success) {
        refuse('coral.plan.spatial.unsatisfied', computed.diagnostics.map(item => item.message).join('; '), intent.op.id, [...(computed.diagnostics[0]?.entityIds ?? [])]);
      }
      for (const { id, position } of computed.positions) {
        const node = nodes.get(id)!;
        if (intent.op.op === 'layout.arrange' && node.pinned) continue;
        const frame = node.parent ? rects.get(node.parent)! : { x: 0, y: 0 };
        const old = rects.get(id)!;
        const target = { x: frame.x + position.x, y: frame.y + position.y };
        const base = origin(node.parent);
        const local = { x: round(target.x - base.x), y: round(target.y - base.y) };
        const [dx, dy] = [base.x + local.x - old.x, base.y + local.y - old.y];
        for (const moved of [id, ...descendants(id)]) {
          const rect = rects.get(moved)!;
          rects.set(moved, { ...rect, x: rect.x + dx, y: rect.y + dy });
        }
        positions.set(id, { ...local, op: intent.op });
        intended.set(id, rects.get(id)!);
      }
    }
    const refOf = new Map([...capture.entities].map(([ref, entity]) => [`${entity.kind}:${entity.id}`, ref]));
    const refs = (ids: string[]) => ids.map(id => refOf.get(`node:${id}`) ?? id);
    const related = (a: string, b: string) => a === b || ancestors(a).includes(b) || ancestors(b).includes(a);
    const overlaps = (r: SpatialRect, q: SpatialRect) => r.x < q.x + q.width - TOLERANCE && q.x < r.x + r.width - TOLERANCE &&
      r.y < q.y + q.height - TOLERANCE && q.y < r.y + r.height - TOLERANCE;
    // Owner, 2026-11-15: bounded local repair. An automatic, unpinned node
    // that a placement overlaps moves the shortest way clear, at most
    // LOCAL_REPAIR_LIMIT, onto free space; its position is written and listed.
    // Pinned, authored, placed and read nodes never move; otherwise refuse.
    const read = new Set(ordered.flatMap(reads));
    const why = (id: string) => positions.has(id) ? 'is placed by the plan' : read.has(id) ? 'is a placement target'
      : nodes.get(id)!.pinned ? 'is pinned' : nodes.get(id)!.position && !settled.has(id) ? 'has an authored position' : undefined;
    const moved: Move[] = [];
    for (const [id, { op }] of [...positions]) {
      const placed = rects.get(id)!;
      const hit = [...rects.keys()].filter(other => !related(id, other) && overlaps(placed, rects.get(other)!));
      for (const other of hit.filter(other => !hit.includes(nodes.get(other)!.parent ?? ''))) {
        if (moved.some(item => item.id === other)) refuse('coral.plan.spatial.overlap', `${id} would overlap ${other}, which was already moved.`, op.id, refs([other]));
        const subtree = [other, ...descendants(other)];
        const blocker = subtree.find(why);
        if (blocker) {
          refuse('coral.plan.spatial.overlap', `${id} would overlap ${other}, which cannot move: ${blocker === other ? '' : `it holds ${blocker}, which `}${why(blocker)!}.`,
            op.id, refs([other]));
        }
        const gap = SPACING[op.spacing as keyof typeof SPACING] ?? SPACING.normal;
        const at = rects.get(other)!;
        const ways = ([['x', placed.x + placed.width + gap - at.x], ['y', placed.y + placed.height + gap - at.y],
          ['x', -(at.x + at.width + gap - placed.x)], ['y', -(at.y + at.height + gap - placed.y)]] as const)
          .map(([axis, by]) => ({ dx: axis === 'x' ? by : 0, dy: axis === 'y' ? by : 0, distance: Math.abs(by) }))
          .filter(step => step.distance <= LOCAL_REPAIR_LIMIT).sort((a, b) => a.distance - b.distance);
        const clear = ways.find(({ dx, dy }) => [...rects].every(([item, rect]) => subtree.includes(item) || ancestors(other).includes(item) ||
          !overlaps({ ...at, x: at.x + dx, y: at.y + dy }, rect)));
        if (!clear) {
          refuse('coral.plan.spatial.overlap', `${id} would overlap ${other}, which cannot move clear within ${LOCAL_REPAIR_LIMIT} units.`, op.id, refs([other]));
        }
        for (const item of subtree) { const rect = rects.get(item)!; rects.set(item, { ...rect, x: rect.x + clear!.dx, y: rect.y + clear!.dy }); }
        const base = origin(nodes.get(other)!.parent);
        const to = rects.get(other)!;
        positions.set(other, { x: round(to.x - base.x), y: round(to.y - base.y), op });
        intended.set(other, to);
        moved.push({ id: other, from: { x: at.x, y: at.y }, to: { x: to.x, y: to.y }, distance: round(clear!.distance) });
      }
    }
    for (const [id, { op }] of positions) {
      const overlapped = [...rects].filter(([other, r]) => !related(id, other) && !ancestors(other).includes(id) && overlaps(rects.get(id)!, r))
        .map(([other]) => other);
      if (overlapped.length) refuse('coral.plan.spatial.overlap', `${id} would overlap ${overlapped.join(', ')}.`, op.id, refs(overlapped));
    }
    // Owner, 2026-11-15: automatically placed siblings of each placed node and
    // of its ancestors keep their measured places as written positions, since
    // positioning one child switches its frame to frame-relative layout.
    const frames = new Set([...positions.keys()].flatMap(id => [id, ...ancestors(id)].map(item => nodes.get(item)!.parent))
      .filter((frame): frame is string => Boolean(frame)));
    const anchored: string[] = [];
    for (const frame of frames) {
      const base = origin(frame);
      for (const child of nodes.get(frame)!.children ?? []) {
        if (child.position || positions.has(child.id)) continue;
        const at = before.get(child.id)!;
        positions.set(child.id, { x: round(at.x - base.x), y: round(at.y - base.y), op: ordered[0].op });
        anchored.push(child.id);
      }
    }
    // A frame holding a placed node keeps its place too: once the canvas
    // positions of its children are written, a fresh layout moves the frame
    // as one block and could put it elsewhere.
    if (shown) {
      for (const frame of frames) {
        if (positions.has(frame) || nodes.get(frame)!.position) continue;
        const base = origin(nodes.get(frame)!.parent);
        const at = before.get(frame)!;
        positions.set(frame, { x: round(at.x - base.x), y: round(at.y - base.y), op: ordered[0].op });
        anchored.push(frame);
      }
    }
    const rewritten = shiftNegativeFrames(positions, intended, before, nodes, ancestors, origin, ordered[0].op, moved, new Set(settled.keys()),
      (frame, message) => refuse('coral.plan.spatial.containment', message, ordered[0].op.id, refs([frame])));
    // A shifted frame is listed as moved; authored children it rewrote stay where they are.
    const kept = [...new Set([...[...settled.keys(), ...anchored].filter(id => !intended.has(id) && !moved.some(item => item.id === id)), ...rewritten])];
    const placed = structuredClone(structuralGraph);
    const byId = new Map(preorder(placed.nodes).map(node => [node.id, node]));
    for (const [id, { x, y }] of positions) byId.get(id)!.position = { x, y };
    const source = compilePass(structural, [...positions].map(([id, { x, y, op }]) => ({ op,
      owns: { kind: 'node' as const, id, block: false }, write: (draft: string) => setSourceOwnedNodePosition028(draft, id, { x, y }) })));
    const graph = admitCandidate(capture, source, placed);
    const after = await measured(graph, source, 'coral.plan.spatial.layout-limit');
    const free = new Set([...intended.keys()].flatMap(id => [id, ...descendants(id), ...ancestors(id)]));
    const shifted = [...before.keys()].filter(id => !free.has(id) && !sameRect(before.get(id), after.get(id)));
    if (shifted.length) {
      refuse('coral.plan.spatial.reflow', `Placing the plan's nodes would move ${shifted.length} other node(s); nothing was changed.`,
        ordered[0].op.id, refs(shifted));
    }
    const misplaced = [...intended].filter(([id, rect]) => !sameRect(rect, after.get(id))).map(([id]) => id);
    if (misplaced.length) refuse('coral.plan.spatial.unsatisfied', `${misplaced.join(', ')} did not land where placed.`, ordered[0].op.id, refs(misplaced));
    const ids = [...after.keys()];
    const outside = ids.filter(id => { const parent = nodes.get(id)!.parent; return parent && !contains(after.get(parent)!, after.get(id)!); });
    if (outside.length) refuse('coral.plan.spatial.containment', `${outside.join(', ')} would leave a group.`, ordered[0].op.id, refs(outside));
    for (const a of ids) for (const b of ids) {
      if (a < b && !related(a, b) && overlaps(after.get(a)!, after.get(b)!) && !overlaps(before.get(a)!, before.get(b)!)) {
        refuse('coral.plan.spatial.overlap', `${a} would overlap ${b}.`, ordered[0].op.id, refs([a, b]));
      }
    }
    for (const intent of ordered) {
      const failure = unsatisfied(intent, after, intent.subjects.some(id => nodes.get(id)!.pinned));
      if (failure) refuse('coral.plan.spatial.unsatisfied', `After layout, ${failure} of operation ${intent.op.id} does not hold.`, intent.op.id);
    }
    return result(source, graph, { layoutDiagnostics: after.diagnostics, moved, anchored: kept });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, refusal: error.refusal };
    throw error;
  }
}

type Move = NonNullable<PlanExecution['moved']>[number];

/**
 * Owner, 2026-11-15: a frame whose positioned children need a negative local
 * coordinate moves up or left by that amount, and its positioned children's
 * local positions grow by it (to the inset its other children had), so
 * absolute positions are unchanged; auto-sized frames only grow right and
 * down. Innermost frames first. The frame's move is listed in `moved` and
 * bounded like the overlap repair; a frame that is pinned, has an authored
 * position or is placed by the plan never moves, so the plan is refused.
 * Returns the authored children whose coordinates were rewritten in place.
 */
function shiftNegativeFrames(positions: Map<string, { x: number; y: number; op: PlanOperation }>, placed: ReadonlyMap<string, SpatialRect>,
  before: PlanGeometry, nodes: ReadonlyMap<string, SuccessorSourceNode028>, ancestors: (id: string) => string[],
  origin: (frame: string | undefined) => { x: number; y: number }, op: PlanOperation, moved: Move[], settled: ReadonlySet<string>,
  fail: (frame: string, message: string) => never): string[] {
  const localOf = (id: string) => positions.get(id) ?? nodes.get(id)!.position;
  const rewritten = new Set<string>();
  for (let shifted = true; shifted;) {
    shifted = false;
    const frames = [...new Set([...nodes.values()].filter(node => node.parent && localOf(node.id)).map(node => node.parent!))]
      .sort((a, b) => ancestors(b).length - ancestors(a).length);
    for (const frame of frames) {
      const children = nodes.get(frame)!.children ?? [];
      const set = children.filter(child => localOf(child.id));
      const least = (axis: 'x' | 'y') => Math.min(...set.map(child => localOf(child.id)![axis]));
      const inset = (axis: 'x' | 'y') => {
        const values = children.filter(child => !placed.has(child.id)).map(child => before.get(child.id)![axis] - before.get(frame)![axis]);
        return values.length ? Math.max(0, Math.min(...values)) : 0;
      };
      const [mx, my] = [least('x'), least('y')];
      if (mx >= 0 && my >= 0) continue;
      const node = nodes.get(frame)!;
      const why = node.pinned ? 'is pinned' : node.position && !settled.has(frame) ? 'has an authored position'
        : placed.has(frame) && !moved.some(item => item.id === frame) ? 'is placed by the plan' : undefined;
      if (why) fail(frame, `${frame} would need to move up or left to hold its children, but it ${why}.`);
      const dx = mx < 0 ? round(inset('x') - mx) : 0;
      const dy = my < 0 ? round(inset('y') - my) : 0;
      const earlier = moved.find(item => item.id === frame);
      const from = earlier?.from ?? { x: before.get(frame)!.x, y: before.get(frame)!.y };
      const to = { x: round((earlier?.to.x ?? from.x) - dx), y: round((earlier?.to.y ?? from.y) - dy) };
      const distance = round(Math.hypot(to.x - from.x, to.y - from.y));
      if (distance > LOCAL_REPAIR_LIMIT) fail(frame, `${frame} would need to move ${distance} units to hold its children, over the ${LOCAL_REPAIR_LIMIT}-unit bound.`);
      if (earlier) Object.assign(earlier, { to, distance }); else moved.push({ id: frame, from, to, distance });
      for (const child of set) {
        const at = localOf(child.id)!;
        if (!positions.has(child.id)) rewritten.add(child.id);
        positions.set(child.id, { x: round(at.x + dx), y: round(at.y + dy), op: positions.get(child.id)?.op ?? op });
      }
      const base = origin(node.parent);
      const at = localOf(frame) ?? { x: before.get(frame)!.x - base.x, y: before.get(frame)!.y - base.y };
      positions.set(frame, { x: round(at.x - dx), y: round(at.y - dy), op: positions.get(frame)?.op ?? op });
      shifted = true;
      break;
    }
  }
  return [...rewritten];
}

const contains = (frame: SpatialRect, rect: SpatialRect) => rect.x >= frame.x - TOLERANCE && rect.y >= frame.y - TOLERANCE &&
  rect.x + rect.width <= frame.x + frame.width + TOLERANCE && rect.y + rect.height <= frame.y + frame.height + TOLERANCE;

/**
 * The local positions to write so that a fresh layout of `source` puts every
 * node the canvas shows where the canvas shows it (top-left; sizes may differ
 * after a rename). Each round writes the canvas place of every node still
 * misplaced, outermost first; a frame's origin is read from a positioned
 * child, else its corner. A spatial plan is refused if it does not converge,
 * since its coordinates would not match the canvas; any other plan keeps
 * what was found. Pinned nodes and nodes the canvas lacks are left alone.
 */
async function keepCanvas(source: string, graph: SuccessorSourceGraph028, measure: MeasurePlanGeometry,
  shown: ReadonlyMap<string, SpatialRect>, required: boolean): Promise<Map<string, { x: number; y: number }>> {
  const nodes = new Map(preorder(graph.nodes).map(node => [node.id, node]));
  const ancestors = (id: string): string[] => { const parent = nodes.get(id)?.parent; return parent ? [parent, ...ancestors(parent)] : []; };
  const settle = new Map<string, { x: number; y: number }>();
  const giveUp = (message: string) => required ? refuse('coral.plan.spatial.measure', message) : settle;
  for (let pass = 0; pass < 10; pass++) {
    // Origins are read from this pass's measurement, so only positions it measured count.
    const prior = new Map(settle);
    const position = (id: string) => prior.get(id) ?? nodes.get(id)!.position;
    let text = source;
    try { for (const [id, at] of settle) text = setSourceOwnedNodePosition028(text, id, at); } catch (error) {
      return giveUp(`The canvas could not be kept as shown: ${(error as Error).message}`);
    }
    const candidate = structuredClone(graph);
    for (const node of preorder(candidate.nodes)) if (settle.has(node.id)) node.position = { ...settle.get(node.id)! };
    let measured: PlanGeometry;
    try { measured = await measure(candidate, text); } catch (error) {
      return giveUp(`The diagram could not be measured: ${(error as Error).message}`);
    }
    const off = [...nodes.keys()].filter(id => { const m = measured.get(id), c = shown.get(id);
      return m && c && !nodes.get(id)!.pinned && (Math.abs(m.x - c.x) > TOLERANCE || Math.abs(m.y - c.y) > TOLERANCE); });
    if (!off.length) return settle;
    const outermost = off.filter(id => !ancestors(id).some(item => off.includes(item)));
    for (const id of outermost) {
      const frame = nodes.get(id)!.parent;
      const anchor = frame ? (nodes.get(frame)!.children ?? []).find(child => position(child.id)) : undefined;
      const corner = frame ? measured.get(anchor?.id ?? frame) : undefined;
      if (frame && !corner) continue;
      const origin = !frame ? { x: 0, y: 0 } : anchor
        ? { x: corner!.x - position(anchor.id)!.x, y: corner!.y - position(anchor.id)!.y } : { x: corner!.x, y: corner!.y };
      const at = shown.get(id)!;
      settle.set(id, { x: round(at.x - origin.x), y: round(at.y - origin.y) });
    }
    if (pass === 9) return giveUp(`The canvas could not be kept as shown (at ${off.slice(0, 3).join(', ')}); nothing was placed.`);
  }
  return settle;
}
