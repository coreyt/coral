import { describe, expect, it, vi } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { validatePlanResponse, type PlanResponse } from '../../../src/llm/plan/decode';
import { capturePlanSnapshot, type PlanCapture } from '../../../src/llm/plan/snapshot';
import { diffPlanDocuments, discardPlanStage, planStageIsOpen, runPlanPreviewTask, stagePlan,
  type PlanBase, type PlanPreviewRequest, type PlanStageResult } from '../../../src/llm/plan/stage';
import { previewGeometry, type MeasurePlanGeometry } from '../../../src/llm/plan/spatial';

const layout = vi.hoisted(() => ({ fail: false }));
vi.mock('@coral-viz/render/svg-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/render/svg-layout')>();
  return { ...actual, layoutGraphForSvg: (...args: Parameters<typeof actual.layoutGraphForSvg>) =>
    layout.fail ? Promise.reject(new Error('layout exploded')) : actual.layoutGraphForSvg(...args) };
});

const DESIGN = '@diagram flowchart\nstart terminal as "Start"\nreview process as "Review request"\ntoReview = start -> review\n';
const base: PlanBase = { source: DESIGN, sourceRevision: 3, geometryRevision: 7 };

function capture(source = DESIGN): PlanCapture {
  const result = capturePlanSnapshot({ source, sourceRevision: 3, geometryRevision: 7, requestId: 'r' });
  if (!result.ok) throw new Error(result.refusal.message);
  return result.capture;
}
const plan = (taken: PlanCapture, ...operations: Record<string, unknown>[]): PlanResponse => validatePlanResponse(
  { protocol: 'coral-plan/1', snapshot: taken.token, kind: 'plan', operations: operations.map((op, k) => ({ id: `o${k + 1}`, ...op })) }, taken.view);
const insert = (taken: PlanCapture) => plan(taken,
  { op: 'node.add', as: 'newReview', parent: null, type: 'process', label: 'Security review' },
  { op: 'edge.remove', target: { existing: 'e1' } },
  { op: 'edge.add', as: 'a', type: 'flow', first: { node: { existing: 'n1' } }, second: { node: { new: 'newReview' } }, direction: 'first-to-second' },
  { op: 'edge.add', as: 'b', type: 'flow', first: { node: { new: 'newReview' } }, second: { node: { existing: 'n2' } }, direction: 'first-to-second' });
const staged = (result: PlanStageResult) => {
  if (result.status !== 'staged') throw new Error(JSON.stringify(result));
  return result.stage;
};

describe('detached plan staging', () => {
  it('stages a rendered candidate with a change list computed from the documents', async () => {
    const taken = capture();
    const stage = staged(await stagePlan(taken, insert(taken), () => base));
    expect(stage.source).toContain('\nsecurityReview -> review\n');
    expect(stage.changes).toEqual([
      { change: 'added', kind: 'node', id: 'securityReview', type: 'process', label: 'Security review' },
      { change: 'removed', kind: 'relation', id: 'toReview', first: 'start', second: 'review' },
      { change: 'added', kind: 'relation', id: 'edge-1', first: 'start', second: 'securityReview' },
      { change: 'added', kind: 'relation', id: 'edge-2', first: 'securityReview', second: 'review' },
    ]);
    expect(stage.removed).toEqual({ nodes: [], relations: ['toReview'] });
    expect(stage.preview).toMatch(/^<svg[\s\S]*Security review[\s\S]*<\/svg>$/);
    expect(planStageIsOpen(stage)).toBe(true);
  });

  it('stages a spatial plan with the caller\'s measurement once it reproduces the canvas, listing a node moved clear', async () => {
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\nc process as "C"\na -> b\n';
    const taken = capture(source);
    const layout = previewGeometry({ direction: 'RIGHT', svgOptions: {} });
    const sources: string[] = [];
    const measure: MeasurePlanGeometry = (graph, text) => { sources.push(text); return layout(graph, text); };
    const shown = await layout(taken.graph, source);
    const place = plan(taken, { op: 'layout.relative', subject: { existing: 'n3' }, target: { existing: 'n1' }, relation: 'right-of', spacing: 'normal' });
    const stage = staged(await stagePlan(taken, place, () => ({ ...base, source }), { measure, canvas: () => shown }));
    // The structure is measured until it reproduces the canvas; then the placed candidate.
    expect(sources[0]).toBe(source);
    expect(sources).toHaveLength(3);
    expect(sources[2]).toBe(stage.source);
    expect(stage.moved.map(item => item.id)).toEqual(['b']);
    expect(stage.changes.filter(change => change.change === 'changed').map(change => [change.id, change.fields!.map(field => field.field)]))
      .toEqual([['b', ['position']], ['c', ['position']]]);
    // A canvas a fresh layout does not reproduce is kept as shown: the moved
    // node's canvas place is written first and listed as kept (H3).
    const moved = new Map(shown);
    moved.set('a', { ...shown.get('a')!, y: shown.get('a')!.y + 30 });
    const kept = staged(await stagePlan(taken, place, () => ({ ...base, source }), { measure, canvas: () => moved }));
    expect(kept.anchored).toContain('a');
    expect(kept.source).toContain(`a process as "A" @ (${moved.get('a')!.x}, ${moved.get('a')!.y})`);
    // The plan's own subject is placed, not kept, even when the canvas had moved it.
    const subjectMoved = new Map(shown);
    subjectMoved.set('c', { ...shown.get('c')!, y: shown.get('c')!.y + 30 });
    const placedNotKept = staged(await stagePlan(taken, place, () => ({ ...base, source }), { measure, canvas: () => subjectMoved }));
    expect(placedNotKept.anchored).not.toContain('c');
    expect(await stagePlan(taken, place, () => ({ ...base, source }))).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.spatial.measure' } });
  });

  it('writes the canvas place of nodes a fresh layout would move on every AI edit, not only placements', async () => {
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b\n';
    const taken = capture(source);
    const layout = previewGeometry({ direction: 'RIGHT', svgOptions: {} });
    const shown = new Map(await layout(taken.graph, source));
    const rename = plan(taken, { op: 'entity.label.set', target: { existing: 'n2' }, value: 'C' });
    // A same-size label: a canvas a fresh layout reproduces adds no positions.
    expect(staged(await stagePlan(taken, rename, () => ({ ...base, source }), { measure: layout, canvas: () => shown })).source)
      .toBe(source.replace('"B"', '"C"'));
    shown.set('b', { ...shown.get('b')!, y: shown.get('b')!.y + 40 });
    const stage = staged(await stagePlan(taken, rename, () => ({ ...base, source }), { measure: layout, canvas: () => shown }));
    expect(stage.anchored).toEqual(['b']);
    expect(stage.source).toContain(`b process as "C" @ (${shown.get('b')!.x}, ${shown.get('b')!.y})`);
    // A plan that changes nothing stays no-change, whatever the canvas shows.
    expect(await stagePlan(taken, plan(taken, { op: 'entity.label.set', target: { existing: 'n2' }, value: 'B' }), () => ({ ...base, source }),
      { measure: layout, canvas: () => shown })).toEqual({ status: 'no-change' });
  });

  it('diffs every field independently of the plan, including label removal and document fields', () => {
    const before = projectInstalledSourceToSuccessor028('@diagram flowchart\na process as "A"\nb process\nx = a -> b as "go"\n').graph!;
    const after = projectInstalledSourceToSuccessor028('@diagram flowchart\na process\nb decision\nx = a -> b as "went"\n').graph!;
    expect(diffPlanDocuments(before, after)).toEqual([
      { change: 'changed', kind: 'node', id: 'a', type: 'process', fields: [{ field: 'label', before: 'A' }] },
      { change: 'changed', kind: 'node', id: 'b', type: 'decision', fields: [{ field: 'type', before: 'process', after: 'decision' }] },
      { change: 'changed', kind: 'relation', id: 'x', label: 'went', first: 'a', second: 'b',
        fields: [{ field: 'label', before: 'go', after: 'went' }] },
    ]);
    expect(diffPlanDocuments(before, { ...before, conformanceLevel: 'strict' })).toEqual([{ change: 'changed', kind: 'document', id: '',
      fields: [{ field: 'conformanceLevel', before: before.conformanceLevel, after: 'strict' }] }]);
    expect(diffPlanDocuments(before, before)).toEqual([]);
  });

  it('marks removed nodes for review', async () => {
    const source = '@diagram flowchart\na process\nb process\nc process\n';
    const taken = capture(source);
    const stage = staged(await stagePlan(taken, plan(taken, { op: 'node.remove', target: { existing: 'n2' } }),
      () => ({ ...base, source })));
    expect(stage.removed).toEqual({ nodes: ['b'], relations: [] });
    expect(stage.changes).toEqual([{ change: 'removed', kind: 'node', id: 'b', type: 'process' }]);
  });

  it('returns no-change for a plan that leaves the source unchanged, and never stages one', async () => {
    const taken = capture();
    expect(await stagePlan(taken, plan(taken, { op: 'entity.label.set', target: { existing: 'n1' }, value: 'Start' }), () => base))
      .toEqual({ status: 'no-change' });
    const noChange = validatePlanResponse({ protocol: 'coral-plan/1', snapshot: taken.token, kind: 'no_change', reason: 'already-satisfied', message: 'Already done.' }, taken.view);
    expect(await stagePlan(taken, noChange, () => base)).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.not-a-plan' } });
  });

  it('refuses a late response for an edited document before executing it', async () => {
    const taken = capture();
    for (const current of [{ ...base, source: `${DESIGN}x process\n` }, { ...base, sourceRevision: 4 }, { ...base, geometryRevision: 8 }, null]) {
      expect(await stagePlan(taken, insert(taken), () => current)).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.stale' } });
    }
  });

  it('refuses a stage when the document is edited during the detached render', async () => {
    const taken = capture();
    let reads = 0;
    const result = await stagePlan(taken, insert(taken), () => (++reads === 1 ? base : { ...base, geometryRevision: 8 }));
    expect(reads).toBe(2);
    expect(result).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.stale' } });
  });

  it('cancels before execution and during layout', async () => {
    const taken = capture();
    const before = new AbortController();
    before.abort();
    expect(await stagePlan(taken, insert(taken), () => base, { signal: before.signal })).toEqual({ status: 'canceled' });
    const during = new AbortController();
    const pending = stagePlan(taken, insert(taken), () => base, { signal: during.signal });
    during.abort();
    expect(await pending).toEqual({ status: 'canceled' });
  });

  it('refuses a candidate that fails to render', async () => {
    const taken = capture();
    layout.fail = true;
    try {
      expect(await stagePlan(taken, insert(taken), () => base)).toEqual({ status: 'refused',
        refusal: { code: 'coral.plan.preview-failed', message: 'The proposed diagram could not be drawn: layout exploded' } });
    } finally { layout.fail = false; }
  });

  it('closes a stage on discard', async () => {
    const taken = capture();
    const stage = staged(await stagePlan(taken, insert(taken), () => base));
    discardPlanStage(stage);
    expect(planStageIsOpen(stage)).toBe(false);
  });

  it('draws a diagram over 100 nodes only in a worker, which an abort terminates', async () => {
    const source = `@diagram flowchart\n${Array.from({ length: 101 }, (_, k) => `n${k} process\n`).join('')}`;
    const taken = capture(source);
    const current = () => ({ ...base, source });
    const add = () => plan(taken, { op: 'node.add', as: 'x', parent: null, type: 'process', label: 'Extra' });
    const log: string[] = [];
    const worker = (abort?: AbortController) => () => {
      const target = new EventTarget();
      return {
        postMessage: (request: PlanPreviewRequest) => {
          log.push('post');
          if (abort) abort.abort();
          else void runPlanPreviewTask(request).then((data) => target.dispatchEvent(new MessageEvent('message', { data })));
        },
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        terminate: () => log.push('terminate'),
      };
    };
    expect(staged(await stagePlan(taken, add(), current, { workerFactory: worker() })).preview).toContain('Extra');
    expect(log).toEqual(['post', 'terminate']);
    const abort = new AbortController();
    expect(await stagePlan(taken, add(), current, { workerFactory: worker(abort), signal: abort.signal })).toEqual({ status: 'canceled' });
    expect(log).toEqual(['post', 'terminate', 'post', 'terminate']);
    // Without a worker (as here, in jsdom) the main thread refuses the large diagram.
    expect(await stagePlan(taken, add(), current)).toMatchObject({ status: 'refused',
      refusal: { code: 'coral.plan.preview-failed', message: expect.stringMatching(/over 100 nodes/) } });
  });
});
