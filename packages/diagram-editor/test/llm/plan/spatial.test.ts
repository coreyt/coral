import { describe, expect, it } from 'vitest';
import { validatePlanResponse, type PlanResponse } from '../../../src/llm/plan/decode';
import { executePlan, type ExecutionResult } from '../../../src/llm/plan/execute';
import { capturePlanSnapshot, type PlanCapture } from '../../../src/llm/plan/snapshot';
import { executePlanWithGeometry, LOCAL_REPAIR_LIMIT, previewGeometry, type PlanGeometry } from '../../../src/llm/plan/spatial';
import { captureFixtureDiagram, parityFixture, remapResponse } from './parityFixture';
import { canvasGeometry } from '../../../src/llm/plan/canvasMeasure';

const measure = previewGeometry({ direction: 'RIGHT', svgOptions: {} });
function capture(source: string): PlanCapture {
  const result = capturePlanSnapshot({ source, sourceRevision: 1, requestId: 'r' });
  if (!result.ok) throw new Error(result.refusal.message);
  return result.capture;
}
const decode = (taken: PlanCapture, operations: Record<string, unknown>[]): PlanResponse => validatePlanResponse(
  { protocol: 'coral-plan/1', snapshot: taken.token, kind: 'plan', operations: operations.map((op, k) => ({ id: `o${k + 1}`, ...op })) }, taken.view);
const run = (taken: PlanCapture, ...operations: Record<string, unknown>[]) => executePlanWithGeometry(taken, decode(taken, operations), measure);
const code = (result: ExecutionResult) => (result.ok ? 'compiled' : result.refusal.code);
const compiled = (result: ExecutionResult) => {
  if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
  return result.execution;
};
const n = (ref: string) => ({ existing: ref });
const place = (subject: unknown, relation: string, target: unknown, spacing = 'normal') =>
  ({ op: 'layout.relative', subject, target, relation, spacing });
const geometry = async (source: string): Promise<PlanGeometry> => measure(capture(source).graph);
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5);
const POSITION = / @ \((-?[\d.]+), (-?[\d.]+)\)/;

const ROOT = '@diagram flowchart\nstart terminal as "Start"\nreview process as "Review request"\nother process as "Other"\nstart -> review\n';

describe('spatial operations through staged measurement', () => {
  it('places an unpositioned node with a canonical position, verified in final geometry', async () => {
    const taken = capture(ROOT);
    const execution = compiled(await run(taken, place(n('n3'), 'below', n('n2'))));
    const [line] = execution.source.split('\n').filter(text => text.startsWith('other process'));
    expect(line).toMatch(/^other process as "Other" @ \(-?[\d.]+, -?[\d.]+\)$/);
    expect(execution.source.replace(POSITION, '')).toBe(ROOT);
    const [before, after] = [await geometry(ROOT), await measure(execution.graph)];
    const [review, other] = [after.get('review')!, after.get('other')!];
    near(other.y - review.y - review.height, 32);
    near(other.x + other.width / 2, review.x + review.width / 2);
    for (const id of ['start', 'review']) expect(after.get(id)).toEqual(before.get(id));
  });

  it('moves a pinned subject and keeps its pin, and places a new node', async () => {
    const source = ROOT.replace('other process as "Other"', 'other process as "Other" @ (900, 900) pinned');
    const moved = compiled(await run(capture(source), place(n('n3'), 'right-of', n('n2'), 'wide')));
    expect(moved.source).toMatch(/other process as "Other" @ \([\d.]+, [\d.]+\) pinned\n/);
    expect(moved.source).not.toContain('@ (900, 900)');
    const after = await measure(moved.graph);
    near(after.get('other')!.x - after.get('review')!.x - after.get('review')!.width, 64);
    const pair = '@diagram flowchart\nstart terminal as "Start"\nreview process as "Review request"\nstart -> review\n';
    const added = compiled(await run(capture(pair), { op: 'node.add', as: 'x', parent: null, type: 'process', label: 'Audit' },
      place({ new: 'x' }, 'above', n('n1'), 'compact')));
    expect(added.source).toMatch(/\naudit process as "Audit" @ \(-?[\d.]+, -?[\d.]+\)\n$/);
    const laid = await measure(added.graph);
    near(laid.get('start')!.y - laid.get('audit')!.y - laid.get('audit')!.height, 16);
  });

  it('places at a diagram boundary and arranges in order, reversed', async () => {
    const spread = '@diagram flowchart\na process @ (0, 0)\nb process @ (0, 200)\nc process @ (300, 100)\n';
    const boundary = compiled(await run(capture(spread), { op: 'layout.boundary', subject: n('n3'), side: 'left', scope: { kind: 'diagram' }, spacing: 'normal' }));
    expect(boundary.source).toBe(spread.replace('c process @ (300, 100)', 'c process @ (0, 100)'));
    const laid = await measure(boundary.graph);
    near(laid.get('c')!.x, Math.min(...[...laid.values()].map(rect => rect.x)));
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\nc process as "C"\n';
    const arranged = compiled(await run(capture(source),
      { op: 'layout.arrange', members: [n('n1'), n('n2'), n('n3')], axis: 'row', direction: 'reverse', spacing: 'compact' }));
    const rects = await measure(arranged.graph);
    const [a, b, c] = ['a', 'b', 'c'].map(id => rects.get(id)!);
    near(a.x - b.x - b.width, 16);
    near(b.x - c.x - c.width, 16);
    near(a.y + a.height / 2, c.y + c.height / 2);
  });

  it('writes local coordinates inside a group, at its boundary inset', async () => {
    const source = '@diagram flowchart\ng group as "Group" {\n  a process as "A" @ (20, 300)\n  b process as "B" @ (40, 150)\n}\n';
    const execution = compiled(await run(capture(source), { op: 'layout.boundary', subject: n('n3'), side: 'top', scope: { kind: 'group', target: n('n1') }, spacing: 'compact' }));
    expect(execution.source.split('\n')[3]).toBe('  b process as "B" @ (40, 16)');
    const rects = await measure(execution.graph);
    near(rects.get('g.b')!.y - rects.get('g')!.y, 16);
    expect(execution.source.split('\n')[2]).toBe('  a process as "A" @ (20, 300)');
  });

  it('keeps authored routes, comments and CRLF bytes', async () => {
    const source = '// layout notes\r\n@diagram flowchart\r\na process as "A" @ (0, 0) // first\r\nb process as "B" @ (300, 0)\r\n' +
      'c process as "C"\r\nab = a -> b\r\nroute edge ab {\r\n  turn = waypoint at (240, -40)\r\n}\r\n';
    const taken = capture(source);
    const execution = compiled(await run(taken, place(n('n3'), 'below', n('n1'))));
    const [placed] = /c process as "C" @ \([\d.]+, [\d.]+\)/.exec(execution.source)!;
    expect(execution.source).toBe(source.replace('c process as "C"', placed));
    expect(execution.source.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(execution.graph.edges).toEqual(taken.graph.edges);
  });

  it('refuses self-relative, nested, scoped, cross-parent and repeated placements', async () => {
    const source = '@diagram flowchart\nouter process\ng group as "G" {\n  a process @ (20, 60)\n  b process @ (300, 60)\n}\nh group as "H" {\n  c process @ (20, 60)\n}\n';
    const taken = capture(source);
    expect(code(await run(taken, place(n('n1'), 'below', n('n1'))))).toBe('coral.plan.spatial.self');
    expect(code(await run(taken, place(n('n3'), 'below', n('n2'))))).toBe('coral.plan.spatial.nested');
    expect(code(await run(taken, { op: 'layout.boundary', subject: n('n1'), side: 'top', scope: { kind: 'group', target: n('n2') }, spacing: 'normal' })))
      .toBe('coral.plan.spatial.scope');
    expect(code(await run(taken, { op: 'layout.arrange', members: [n('n3'), n('n6')], axis: 'row', direction: 'forward', spacing: 'normal' })))
      .toBe('coral.plan.spatial.cross-parent');
    expect(code(await run(taken, { op: 'layout.arrange', members: [n('n2'), n('n3')], axis: 'row', direction: 'forward', spacing: 'normal' })))
      .toBe('coral.plan.spatial.nested');
    expect(code(await run(taken, place(n('n3'), 'below', n('n4')), place(n('n2'), 'below', n('n1'))))).toBe('coral.plan.repeated-write');
    expect(code(await run(taken, place(n('n1'), 'below', n('n5')), { op: 'node.remove', target: n('n1') }))).toBe('coral.plan.cancellation');
  });

  it('refuses unsafe or unsatisfiable placements without writing anything', async () => {
    const crowded = '@diagram flowchart\na process as "A" @ (0, 0)\nb process as "B" @ (0, 94)\nc process as "C" @ (400, 0)\n';
    expect(code(await run(capture(crowded), place(n('n3'), 'below', n('n1'))))).toBe('coral.plan.spatial.overlap');
    const pinned = '@diagram flowchart\na process @ (0, 0) pinned\nb process @ (400, 0) pinned\n';
    const contradiction = await run(capture(pinned), { op: 'layout.arrange', members: [n('n2'), n('n1')], axis: 'row', direction: 'forward', spacing: 'normal' });
    expect(code(contradiction)).toBe('coral.plan.spatial.unsatisfied');
    const contained = '@diagram flowchart\ng group as "G" {\n  a process @ (20, 60)\n}\nb process @ (600, 0)\n';
    // A child placed far outside its group: the group grows over the target, and the final check refuses the overlap.
    expect(code(await run(capture(contained), place(n('n2'), 'right-of', n('n3'))))).toBe('coral.plan.spatial.overlap');
  });

  it('moves an automatic node a placement overlaps clear of it, within the bound, and lists the move (owner, 2026-11-15)', async () => {
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\nc process as "C"\na -> b\n';
    const before = await geometry(source);
    const execution = compiled(await run(capture(source), place(n('n3'), 'right-of', n('n1'))));
    expect(execution.moved).toHaveLength(1);
    const [move] = execution.moved!;
    expect(move.id).toBe('b');
    expect(move.from).toEqual({ x: before.get('b')!.x, y: before.get('b')!.y });
    expect(move.distance).toBeGreaterThan(0);
    expect(move.distance).toBeLessThanOrEqual(LOCAL_REPAIR_LIMIT);
    expect(execution.source).toMatch(/\nb process as "B" @ \(-?[\d.]+, -?[\d.]+\)\n/);
    const after = await measure(execution.graph);
    expect({ x: after.get('b')!.x, y: after.get('b')!.y }).toEqual(move.to);
    expect(after.get('a')).toEqual(before.get('a'));
    // A pinned or authored node in the way never moves.
    const at = `@ (${before.get('b')!.x}, ${before.get('b')!.y})`;
    const pinned = await run(capture(source.replace('b process as "B"', `b process as "B" ${at} pinned`)), place(n('n3'), 'right-of', n('n1')));
    expect(pinned).toMatchObject({ ok: false, refusal: { code: 'coral.plan.spatial.overlap', message: 'c would overlap b, which cannot move: is pinned.' } });
    const authored = await run(capture(source.replace('b process as "B"', `b process as "B" ${at}`)), place(n('n3'), 'right-of', n('n1')));
    expect(authored).toMatchObject({ ok: false, refusal: { message: 'c would overlap b, which cannot move: has an authored position.' } });
  });

  it('moves a group up when a placement needs a negative local position, keeping absolute positions (owner, 2026-11-15)', async () => {
    const grouped = '@diagram flowchart\ng group as "G" {\n  a process as "A"\n  b process as "B"\n}\n';
    const before = await geometry(grouped);
    const execution = compiled(await run(capture(grouped), place(n('n3'), 'above', n('n2'))));
    expect(execution.source).toMatch(/^@diagram flowchart\ng group as "G" @ \(12, -?[\d.]+\) \{\n {2}a process as "A" @ \(20, [\d.]+\)\n {2}b process as "B" @ \(20, [\d.]+\)\n\}\n$/);
    const after = await measure(execution.graph);
    expect(after.get('g.a')).toEqual(before.get('g.a'));
    near(after.get('g.a')!.y - after.get('g.b')!.y - after.get('g.b')!.height, 32);
    expect(after.get('g.b')!.y - after.get('g')!.y).toBe(before.get('g.a')!.y - before.get('g')!.y);
    // The group's move is listed and bounded; it is not "kept in place".
    const [shift] = execution.moved!;
    expect(shift).toMatchObject({ id: 'g', from: { x: before.get('g')!.x, y: before.get('g')!.y }, to: { x: after.get('g')!.x, y: after.get('g')!.y } });
    expect(shift.distance).toBeLessThanOrEqual(LOCAL_REPAIR_LIMIT);
    expect(execution.anchored).toEqual(['g.a']);
  });

  it('shifts nested groups innermost first, and keeps an authored child in place when its coordinates are rewritten', async () => {
    const nested = '@diagram flowchart\no group as "O" {\n  g group as "G" {\n    a process as "A"\n    b process as "B"\n  }\n}\n';
    const before = await geometry(nested);
    const execution = compiled(await run(capture(nested), place(n('n4'), 'above', n('n3'))));
    expect(execution.moved!.map(item => item.id)).toEqual(['o.g', 'o']);
    const after = await measure(execution.graph);
    expect(after.get('o.g.a')).toEqual(before.get('o.g.a'));
    const authored = '@diagram flowchart\ng group as "G" {\n  a process as "A" @ (20, 40)\n  b process as "B" @ (20, 140)\n}\n';
    const kept = compiled(await run(capture(authored), place(n('n3'), 'above', n('n2'))));
    expect(kept.moved!.map(item => item.id)).toEqual(['g']);
    expect(kept.anchored).toEqual(['g.a']);
    expect((await measure(kept.graph)).get('g.a')).toEqual((await geometry(authored)).get('g.a'));
  });

  it('refuses a frame shift for a pinned or authored group, or one over the bound', async () => {
    const grouped = (at: string) => `@diagram flowchart\ng group as "G"${at} {\n  a process as "A"\n  b process as "B"\n}\n`;
    // Fable's probe: the authored group used to move 94 units, unlisted.
    expect(await run(capture(grouped(' @ (300, 300)')), place(n('n3'), 'above', n('n2')))).toMatchObject({ ok: false,
      refusal: { code: 'coral.plan.spatial.containment', message: 'g would need to move up or left to hold its children, but it has an authored position.' } });
    expect(await run(capture(grouped(' @ (300, 300) pinned')), place(n('n3'), 'above', n('n2')))).toMatchObject({ ok: false,
      refusal: { code: 'coral.plan.spatial.containment', message: 'g would need to move up or left to hold its children, but it is pinned.' } });
    const wide = '@diagram flowchart\ng group as "G" {\n  a process as "A"\n  r group as "Row" {\n    p process as "P"\n    q process as "Q"\n    s process as "S"\n    p -> q\n    q -> s\n  }\n}\n';
    expect(await run(capture(wide), place(n('n3'), 'left-of', n('n2'), 'wide'))).toMatchObject({ ok: false,
      refusal: { code: 'coral.plan.spatial.containment', message: expect.stringMatching(/^g would need to move [\d.]+ units to hold its children, over the 200-unit bound\.$/) } });
  });

  it('writes the measured places of automatic siblings so the group layout keeps them (owner, 2026-11-15)', async () => {
    const grouped = '@diagram flowchart\ng group as "G" {\n  a process as "A"\n  b process as "B"\n}\n';
    const execution = compiled(await run(capture(grouped), place(n('n3'), 'below', n('n2'))));
    expect(execution.source).toBe('@diagram flowchart\ng group as "G" {\n  a process as "A" @ (20, 44)\n  b process as "B" @ (20, 138)\n}\n');
    const [before, after] = [await geometry(grouped), await measure(execution.graph)];
    expect(after.get('g.a')).toEqual(before.get('g.a'));
    near(after.get('g.b')!.y - after.get('g.a')!.y - after.get('g.a')!.height, 32);
  });

  it('orders placements by dependency and refuses a cycle', async () => {
    const row = '@diagram flowchart\na process @ (0, 0)\nb process @ (300, 0)\nc process @ (600, 0)\n';
    const chained = compiled(await run(capture(row), place(n('n1'), 'below', n('n2')), place(n('n2'), 'below', n('n3'))));
    expect(chained.source).toBe('@diagram flowchart\na process @ (600, 188)\nb process @ (600, 94)\nc process @ (600, 0)\n');
    const pair = '@diagram flowchart\na process @ (0, 0)\nb process @ (300, 0)\n';
    expect(code(await run(capture(pair), place(n('n1'), 'below', n('n2')), place(n('n2'), 'right-of', n('n1'))))).toBe('coral.plan.spatial.cycle');
  });

  it('arranges a column around a pinned anchor that stays put', async () => {
    const source = '@diagram flowchart\na process @ (0, 0)\nb process @ (200, 300) pinned\nc process @ (400, 600)\n';
    const execution = compiled(await run(capture(source),
      { op: 'layout.arrange', members: [n('n1'), n('n2'), n('n3')], axis: 'column', direction: 'forward', spacing: 'normal' }));
    expect(execution.source.split('\n')[2]).toBe('b process @ (200, 300) pinned');
    const rects = await measure(execution.graph);
    const [a, b, c] = ['a', 'b', 'c'].map(id => rects.get(id)!);
    expect([b.x, b.y]).toEqual([200, 300]);
    near(b.y - a.y - a.height, 32);
    near(c.y - b.y - b.height, 32);
    near(a.x, c.x);
  });

  it('moves a group with its children at their local positions', async () => {
    const source = '@diagram flowchart\ng group as "G" @ (0, 0) {\n  a process as "A" @ (20, 60)\n}\nb process @ (400, 0)\n';
    const execution = compiled(await run(capture(source), place(n('n1'), 'below', n('n3'))));
    expect(execution.source).toBe(source.replace('g group as "G" @ (0, 0)', 'g group as "G" @ (376, 94)'));
    const rects = await measure(execution.graph);
    expect([rects.get('g.a')!.x - rects.get('g')!.x, rects.get('g.a')!.y - rects.get('g')!.y]).toEqual([20, 60]);
  });

  it('keeps an authored route on a moved node, or refuses when the layout cannot honour it', async () => {
    const source = '@diagram flowchart\na process @ (0, 0)\nb process @ (300, 0)\nc process @ (0, 300)\nab = a -> b\n' +
      'route edge ab {\n  turn = waypoint at (150, -40)\n}\n';
    const taken = capture(source);
    const result = await run(taken, place(n('n1'), 'right-of', n('n2')));
    if (result.ok) expect(result.execution.graph.edges).toEqual(taken.graph.edges);
    else expect(result.refusal.code).toMatch(/^coral\.plan\.spatial\.(layout-limit|reflow|overlap)$/);
  });

  it('measures under the layout the caller names: right and down give different, each verified, positions', async () => {
    const taken = capture(ROOT);
    const down = previewGeometry({ direction: 'DOWN', svgOptions: {} });
    const [right, downward] = await Promise.all([run(taken, place(n('n3'), 'below', n('n2'))),
      executePlanWithGeometry(taken, decode(taken, [place(n('n3'), 'below', n('n2'))]), down)]);
    const [inRight, inDown] = [compiled(right), compiled(downward)];
    expect(inRight.source).not.toBe(inDown.source);
    const laid = await down(inDown.graph);
    near(laid.get('other')!.y - laid.get('review')!.y - laid.get('review')!.height, 32);
    near(laid.get('other')!.x + laid.get('other')!.width / 2, laid.get('review')!.x + laid.get('review')!.width / 2);
  });

  it('measures only after structure compiles, and reports a failed measurement', async () => {
    const taken = capture(ROOT);
    let calls = 0;
    const counting = async () => { calls++; throw new Error('layout unavailable'); };
    const structural = await executePlanWithGeometry(taken, decode(taken, [{ op: 'node.remove', target: n('n2') }, place(n('n3'), 'below', n('n1'))]), counting);
    expect([code(structural), calls]).toEqual(['coral.plan.dependency', 0]);
    expect(code(await executePlanWithGeometry(taken, decode(taken, [place(n('n3'), 'below', n('n1'))]), counting))).toBe('coral.plan.spatial.measure');
    expect(code(executePlan(taken, decode(taken, [place(n('n3'), 'below', n('n1'))])))).toBe('coral.plan.spatial.unmeasured');
    expect(compiled(await executePlanWithGeometry(taken, decode(taken, [{ op: 'entity.label.set', target: n('n3'), value: 'X' }]), counting)).changed).toBe(true);
    let second = 0;
    const failsSecond = async (graph: Parameters<typeof measure>[0]) => { if (++second === 2) throw new Error('Route penetrates obstacle'); return measure(graph); };
    expect(code(await executePlanWithGeometry(taken, decode(taken, [place(n('n3'), 'below', n('n1'))]), failsSecond))).toBe('coral.plan.spatial.layout-limit');
  });
});

describe('layout diagnostics of the measured candidate', () => {
  it('carries the final measurement\'s warnings, such as a degraded route, into the execution', async () => {
    const taken = capture(ROOT);
    expect((await measure(taken.graph)).diagnostics).toEqual([]);
    const degraded = { code: 'layout.route.degraded', severity: 'warning', message: 'Connector "edge-1" (start → review) shares a corridor with a parallel connector' } as const;
    let calls = 0;
    const warnsFinal = async (graph: Parameters<typeof measure>[0]) => Object.assign(new Map(await measure(graph)), { diagnostics: ++calls === 2 ? [degraded] : [] });
    const execution = compiled(await executePlanWithGeometry(taken, decode(taken, [place(n('n3'), 'below', n('n2'))]), warnsFinal));
    expect(execution.layoutDiagnostics).toEqual([degraded]);
    expect(compiled(await run(taken, place(n('n3'), 'below', n('n2')))).layoutDiagnostics).toBeUndefined();
  });
});

describe('spatial plans on the on-device parity fixture', () => {
  // Every 6th spatial plan (39) keeps this short; the full run is recorded in status/slice-60.md.
  // Measured as staging measures: with the canvas's own layout (RIGHT).
  const canvas = canvasGeometry(() => ({ notation: 'flowchart', layout: { algorithm: 'layered', direction: 'RIGHT' }, font: undefined }));
  it('compiles each sampled spatial plan with exact preservation, or refuses it with a specific reason', async () => {
    const spatial = parityFixture.replies.filter(reply => 'plan' in reply.expected &&
      ((reply.expected.plan as { operations?: { op: string }[] }).operations ?? []).some(op => op.op.startsWith('layout.')));
    expect(spatial).toHaveLength(234);
    const outcomes = new Map<string, number>();
    for (const reply of spatial.filter((_, k) => k % 6 === 0)) {
      const { capture: taken, refOf } = captureFixtureDiagram(parityFixture.diagrams[reply.diagram].snapshot);
      const result = await executePlanWithGeometry(taken, validatePlanResponse(remapResponse((reply.expected as { plan: unknown }).plan, refOf, taken.token), taken.view), canvas);
      outcomes.set(code(result), (outcomes.get(code(result)) ?? 0) + 1);
      if (result.ok) expect(result.execution.changed).toBe(true);
      for (const move of result.ok ? result.execution.moved ?? [] : []) expect(move.distance).toBeLessThanOrEqual(LOCAL_REPAIR_LIMIT);
    }
    // A frame that would have to move over the bound to hold a placement is refused (containment).
    expect(Object.fromEntries([...outcomes].sort())).toEqual({
      compiled: 7, 'coral.plan.parent': 1, 'coral.plan.spatial.containment': 6, 'coral.plan.spatial.cross-parent': 7,
      'coral.plan.spatial.cycle': 1, 'coral.plan.spatial.layout-limit': 2, 'coral.plan.spatial.overlap': 14,
      'coral.plan.spatial.reflow': 1,
    });
    // A node in the way that cannot move clear within the bound refuses the plan.
    const blocked = parityFixture.replies[20];
    const { capture: taken, refOf } = captureFixtureDiagram(parityFixture.diagrams[blocked.diagram].snapshot);
    const result = await executePlanWithGeometry(taken, validatePlanResponse(remapResponse((blocked.expected as { plan: unknown }).plan, refOf, taken.token), taken.view), canvas);
    expect(result.ok ? '' : result.refusal.message).toMatch(new RegExp(`which cannot move clear within ${LOCAL_REPAIR_LIMIT} units\\.$`));
  }, 120_000);
});
