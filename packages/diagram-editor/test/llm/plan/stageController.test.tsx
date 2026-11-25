import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validatePlanResponse, type PlanResponse } from '../../../src/llm/plan/decode';
import type { PlanCapture } from '../../../src/llm/plan/snapshot';
import { planStageIsOpen, type PlanStage, type PlanStageResult } from '../../../src/llm/plan/stage';
import { useEditorController, type PlanApplyResult } from '../../../src/useEditorController';

const faults = vi.hoisted(() => ({ canvasLayout: false, previewLayout: false, abortAfterPreview: null as AbortController | null }));
// The canvas places nodes through the editor's incremental layout; the preview draws through the shared SVG layout.
vi.mock('../../../src/hooks/diagramUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/hooks/diagramUtils')>();
  return { ...actual, resolveIncrementalEditorPositions: (...args: Parameters<typeof actual.resolveIncrementalEditorPositions>) =>
    faults.canvasLayout ? Promise.reject(new Error('canvas layout exploded')) : actual.resolveIncrementalEditorPositions(...args) };
});
vi.mock('@coral-viz/render/svg-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/render/svg-layout')>();
  return { ...actual, layoutGraphForSvg: async (...args: Parameters<typeof actual.layoutGraphForSvg>) => {
    if (faults.previewLayout) throw new Error('preview layout exploded');
    const laidOut = await actual.layoutGraphForSvg(...args);
    faults.abortAfterPreview?.abort();
    return laidOut;
  } };
});

if (!window.matchMedia) window.matchMedia = ((query: string) => ({ matches: false, media: query,
  onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false })) as typeof window.matchMedia;

type Hook = ReturnType<typeof renderHook<ReturnType<typeof useEditorController>, unknown>>;
const SOURCE = '@diagram flowchart\n// Keep this comment.\nstart terminal as "Start"\nreview process as "Review request"\n' +
  'toReview = start -> review\n';

async function settle(hook: Hook) {
  await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
  await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
}
async function open(hook: Hook, text = SOURCE) {
  act(() => hook.result.current.header.onOpenFile({ name: 'flow.coral', text }));
  await waitFor(() => expect(hook.result.current.editor.dsl).toBe(text));
  await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
  await settle(hook);
}
async function type(hook: Hook, text: string, endSession = true) {
  act(() => {
    hook.result.current.editor.onDslChange(text);
    if (endSession) hook.result.current.editor.onEditSessionEnd();
  });
  await waitFor(() => expect(hook.result.current.editor.editorAnalysis.source).toBe(text));
  await settle(hook);
}
const state = (hook: Hook) => {
  const { editor, canvas } = hook.result.current;
  return { text: editor.dsl, nodes: canvas.nodes.map(({ id, position }) => ({ id, position: { ...position } })),
    edges: canvas.edges.map(({ id }) => id), undo: canvas.undoCount, redo: canvas.redoCount };
};
function capture(hook: Hook): PlanCapture {
  const result = hook.result.current.plan.capture('request');
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
const relabel = (taken: PlanCapture) => plan(taken, { op: 'entity.label.set', target: { existing: 'n2' }, value: 'Check' });
async function stage(hook: Hook, taken: PlanCapture, response: PlanResponse, signal?: AbortSignal): Promise<PlanStageResult> {
  let result: PlanStageResult | undefined;
  await act(async () => { result = await hook.result.current.plan.stage(taken, response, signal); });
  return result!;
}
const staged = (result: PlanStageResult): PlanStage => {
  if (result.status !== 'staged') throw new Error(JSON.stringify(result));
  return result.stage;
};
/** A fresh stage from the current document. */
async function propose(hook: Hook, build = insert) {
  const taken = capture(hook);
  return staged(await stage(hook, taken, build(taken)));
}
/** Apply resolves after the canvas publishes, so it is awaited outside act. */
async function apply(hook: Hook, proposal: PlanStage): Promise<PlanApplyResult> {
  let result: PlanApplyResult | undefined;
  act(() => { void hook.result.current.plan.apply(proposal).then((value) => { result = value; }); });
  await waitFor(() => expect(result).toBeDefined());
  return result!;
}
const stale = { ok: false, refusal: { code: 'coral.plan.stale' } };

/** The plan's changes without the positions written to keep the canvas (H3), after checking each is listed as kept. */
function withoutKept(proposal: PlanStage) {
  const kept = proposal.changes.filter(item => item.change === 'changed' && item.fields?.every(field => field.field === 'position'));
  expect(kept.map(item => item.id).sort()).toEqual([...proposal.anchored].sort());
  return proposal.changes.filter(item => !kept.includes(item));
}

describe('staged AI plan commit through the editor', () => {
  let hook: Hook;
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    hook = renderHook(() => useEditorController());
  });
  afterEach(() => {
    Object.assign(faults, { canvasLayout: false, previewLayout: false, abortAfterPreview: null });
    hook.unmount();
  });

  it('previews detached, applies once the canvas publishes, and undoes and redoes exactly', async () => {
    await open(hook);
    const before = state(hook);
    const proposal = await propose(hook);
    // Every AI edit writes the canvas place of nodes a fresh layout would move (H3); each is listed as kept.
    expect(withoutKept(proposal)).toHaveLength(4);
    expect(proposal.removed.relations).toEqual(['toReview']);
    expect(state(hook)).toEqual(before);

    expect(await apply(hook, proposal)).toEqual({ ok: true });
    // Apply resolves only after the canvas has published the new source.
    expect(hook.result.current.canvas.isLoading).toBe(false);
    expect(hook.result.current.canvas.updateStatus).toBeNull();
    const after = state(hook);
    expect(after.text).toBe(proposal.source);
    expect(after.text).toContain('// Keep this comment.\n');
    expect(after.nodes).toHaveLength(3);
    expect(after.edges.sort()).toEqual(['edge-1', 'edge-2']);
    expect(after.undo).toBe(before.undo + 1);
    expect(await apply(hook, proposal)).toMatchObject({ ok: false, refusal: { code: 'coral.plan.closed' } });

    act(() => hook.result.current.canvas.onUndo());
    await waitFor(() => expect(hook.result.current.editor.dsl).toBe(SOURCE));
    await settle(hook);
    expect(state(hook)).toEqual({ ...before, redo: before.redo + 1 });
    act(() => hook.result.current.canvas.onRedo());
    await waitFor(() => expect(hook.result.current.editor.dsl).toBe(proposal.source));
    await settle(hook);
    expect(state(hook)).toEqual(after);
  });

  it('applies during an open typing session as its own Undo entry', async () => {
    await open(hook);
    const typed = SOURCE.replace('"Start"', '"Begin"');
    await type(hook, typed, false);
    const afterTyping = state(hook);
    expect(await apply(hook, await propose(hook, relabel))).toEqual({ ok: true });
    expect(state(hook).undo).toBe(afterTyping.undo + 1);
    act(() => hook.result.current.canvas.onUndo());
    await waitFor(() => expect(hook.result.current.editor.dsl).toBe(typed));
  });

  it('refuses proposals overtaken by edits during the request or the preview', async () => {
    await open(hook);
    const edited = SOURCE.replace('"Start"', '"Begin"');

    // Late response: the document changed while the request was out.
    const early = capture(hook);
    await type(hook, edited);
    expect(await stage(hook, early, insert(early))).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.stale' } });

    // Edits during the preview: source text, a canvas label edit, and Undo then Redo
    // (identical text, but a new edit revision). Each edit stands.
    const overtake: [string, () => Promise<void>][] = [
      ['source', () => type(hook, SOURCE)],
      ['label', async () => { act(() => { hook.result.current.canvas.onEdgeLabelEdit('toReview', 'go'); }); await settle(hook); }],
      ['history', async () => {
        const text = hook.result.current.editor.dsl;
        act(() => hook.result.current.canvas.onUndo());
        await waitFor(() => expect(hook.result.current.editor.dsl).not.toBe(text));
        act(() => hook.result.current.canvas.onRedo());
        await waitFor(() => expect(hook.result.current.editor.dsl).toBe(text));
        await settle(hook);
      }],
    ];
    for (const [, edit] of overtake) {
      const proposal = await propose(hook);
      await edit();
      const current = state(hook);
      expect(await apply(hook, proposal)).toMatchObject(stale);
      expect(planStageIsOpen(proposal)).toBe(false);
      expect(state(hook)).toEqual(current);
    }
  });

  it('refuses a proposal overtaken by a node move during the preview', async () => {
    const positioned = '@diagram flowchart\nstart terminal as "Start" @ (0, 0)\nreview process as "Review request" @ (0, 200)\n' +
      'toReview = start -> review\n';
    await open(hook, positioned);
    const proposal = await propose(hook);
    act(() => hook.result.current.canvas.onSourceNodeDrag(['start'], { x: 40, y: 0 }));
    await waitFor(() => expect(hook.result.current.editor.dsl).toContain('@ (40, 0)'));
    await settle(hook);
    const moved = state(hook);
    expect(await apply(hook, proposal)).toMatchObject(stale);
    expect(state(hook)).toEqual(moved);
  });

  it('keeps a stage open while busy; applying one of two stages makes the other stale', async () => {
    await open(hook);
    const first = await propose(hook);
    const second = await propose(hook, relabel);
    const results: PlanApplyResult[] = [];
    act(() => {
      void hook.result.current.plan.apply(first).then((value) => { results[1] = value; });
      // The first commit is still publishing: the editor is busy, not changed under the second.
      void hook.result.current.plan.apply(second).then((value) => { results[0] = value; });
    });
    await waitFor(() => expect(results[1]).toBeDefined());
    expect(results).toEqual([{ ok: false, refusal: expect.objectContaining({ code: 'coral.plan.busy' }) }, { ok: true }]);
    expect(planStageIsOpen(second)).toBe(true);
    await settle(hook);
    const applied = state(hook);
    expect(await apply(hook, second)).toMatchObject(stale);
    expect(state(hook)).toEqual(applied);
  });

  it('undoes an applied proposal the canvas cannot lay out, leaving no history', async () => {
    await open(hook);
    const before = state(hook);
    const proposal = await propose(hook);
    faults.canvasLayout = true;
    const result = await apply(hook, proposal);
    faults.canvasLayout = false;
    expect(result).toMatchObject({ ok: false, refusal: { code: 'coral.plan.apply-failed' } });
    await settle(hook);
    expect(state(hook)).toEqual(before);
    // The base is editable again: no lock or blocked publication survives the failed commit.
    await waitFor(() => expect(hook.result.current.plan.capture('again')).toMatchObject({ ok: true }));
    expect(hook.result.current.sourceErrorsLocked).toBe(false);
    expect(hook.result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: SOURCE });
  });

  it('keeps a renumbered edge selected, drops a removed one, and Undo restores the prior selection', async () => {
    const text = '@diagram flowchart\na process\nb process\nc process\nd process\na -> b\nc -> d\n';
    act(() => hook.result.current.header.onOpenFile({ name: 'renumber.coral', text }));
    await waitFor(() => expect(hook.result.current.canvas.edges.map(({ id }) => id)).toEqual(['edge-1', 'edge-2']));
    await settle(hook);
    act(() => {
      const edge = hook.result.current.canvas.edges.find(({ id }) => id === 'edge-2')!;
      hook.result.current.canvas.onEdgesChange([{ type: 'select', id: 'edge-2', selected: true }]);
      hook.result.current.canvas.onSelectionChange({ nodes: [], edges: [{ ...edge, selected: true }] });
    });
    await waitFor(() => expect(hook.result.current.inspector?.selectedEdge?.id).toBe('edge-2'));
    const taken = capture(hook);
    const proposal = staged(await stage(hook, taken, plan(taken, { op: 'edge.remove', target: { existing: 'e1' } })));
    expect(proposal.renumbered).toEqual({ 'edge-2': 'edge-1' });
    // The change list compares the same connectors: only a -> b is removed.
    expect(withoutKept(proposal)).toEqual([{ change: 'removed', kind: 'relation', id: 'edge-1', first: 'a', second: 'b' }]);
    expect(proposal.source.replace(/ @ \([^)]*\)/g, '')).toBe(text.replace('a -> b\n', ''));
    expect(await apply(hook, proposal)).toEqual({ ok: true });
    expect(hook.result.current.editor.dsl).toBe(proposal.source);
    // c -> d is now edge-1 and stays selected, in the canvas and the inspector.
    expect(hook.result.current.canvas.edges.map(({ id, source, selected }) => ({ id, source, selected: Boolean(selected) })))
      .toEqual([{ id: 'edge-1', source: 'c', selected: true }]);
    expect(hook.result.current.inspector?.selectedEdge?.id).toBe('edge-1');

    act(() => hook.result.current.canvas.onUndo());
    await waitFor(() => expect(hook.result.current.editor.dsl).toBe(text));
    expect(hook.result.current.canvas.edges.find(({ id }) => id === 'edge-2')?.selected).toBe(true);
    await waitFor(() => expect(hook.result.current.inspector?.selectedEdge?.id).toBe('edge-2'));

    // Selecting the removed connector instead: Apply clears its selection.
    act(() => hook.result.current.canvas.onRedo());
    await waitFor(() => expect(hook.result.current.editor.dsl).toBe(proposal.source));
  });

  it('creates no history entry for no-change, refused, failed, discarded or canceled proposals', async () => {
    await open(hook);
    const before = state(hook);
    const taken = capture(hook);
    expect(await stage(hook, taken, plan(taken, { op: 'entity.label.set', target: { existing: 'n1' }, value: 'Start' })))
      .toEqual({ status: 'no-change' });
    expect(await stage(hook, taken, plan(taken, { op: 'node.remove', target: { existing: 'n1' } })))
      .toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.dependency' } });
    faults.previewLayout = true;
    expect(await stage(hook, taken, insert(taken))).toMatchObject({ status: 'refused', refusal: { code: 'coral.plan.preview-failed' } });
    faults.previewLayout = false;
    const discarded = staged(await stage(hook, taken, insert(taken)));
    hook.result.current.plan.discard(discarded);
    expect(await apply(hook, discarded)).toMatchObject({ ok: false, refusal: { code: 'coral.plan.closed' } });
    const during = new AbortController();
    let canceled: PlanStageResult[] = [];
    await act(async () => {
      const pending = hook.result.current.plan.stage(taken, insert(taken), during.signal);
      during.abort();
      canceled = [await pending];
    });
    faults.abortAfterPreview = new AbortController();
    canceled.push(await stage(hook, taken, insert(taken), faults.abortAfterPreview.signal));
    expect(canceled).toEqual([{ status: 'canceled' }, { status: 'canceled' }]);
    expect(state(hook)).toEqual(before);
  });
});
