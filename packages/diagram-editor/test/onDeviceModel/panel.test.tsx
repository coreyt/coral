import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inputCapMessage } from '../../src/onDeviceModel/eligibility';
import OnDevicePanel, { MESSAGES, type OnDeviceHost } from '../../src/onDeviceModel/ui/OnDevicePanel';
import OnDevicePreference from '../../src/onDeviceModel/ui/OnDevicePreference';
import { UNCLEAR_QUESTION } from '../../src/onDeviceModel/contract';
import { useEditorControllerWithProperties as useEditorController } from '../fixtures/useEditorControllerWithProperties';
import { fakeModel, nodeHandle } from './fakeModel';
import { describeChanges, describeLayoutWarnings } from '../../src/onDeviceModel/ui/changes';
import { canvasGeometry, canvasRects } from '../../src/llm/plan/canvasMeasure';
import { createBlankDocument } from '../../src/blankDocument';
import type { PlanStage } from '../../src/llm/plan/stage';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({ matches: false, media: query,
  onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false })) as typeof window.matchMedia;

type Controller = ReturnType<typeof useEditorController>;
let controller: Controller;
let fake: ReturnType<typeof fakeModel>;
/** Lets a test change what the panel sees of the editor. */
let wrapHost: ((host: OnDeviceHost) => OnDeviceHost) | null = null;

/** The editor controller with the on-device Preferences section and AI tab, as AppView hosts them. */
const live = () => (wrapHost ? wrapHost(controller.onDevice.host) : controller.onDevice.host);
const host: OnDeviceHost = {
  setWorking: working => live().setWorking(working),
  plan: {
    capture: requestId => live().plan.capture(requestId),
    stage: (...args) => live().plan.stage(...args),
    apply: stage => live().plan.apply(stage),
    discard: stage => live().plan.discard(stage),
    isCurrent: capture => live().plan.isCurrent(capture),
  },
};

function Harness() {
  controller = useEditorController();
  return (
    <>
      <OnDevicePreference enabled={controller.onDevice.enabled} onEnabledChange={controller.onDevice.onEnabledChange} model={fake.model} />
      <OnDevicePanel host={host} model={fake.model} />
    </>
  );
}

const SOURCE = '@diagram flowchart\n// Keep this comment.\nstart terminal as "Start"\nreview process as "Review request"\n' +
  'toReview = start -> review\n';
const NESTED = '@diagram flowchart\na group as "Team A" {\n  r process as "Review"\n}\nb group as "Team B" {\n  r process as "Review"\n}\n';

async function settle() {
  await waitFor(() => expect(controller.canvas.isLoading).toBe(false));
  await waitFor(() => expect(controller.canvas.updateStatus).toBeNull());
}
async function open(text = SOURCE) {
  render(<Harness />);
  act(() => controller.header.onOpenFile({ name: 'flow.coral', text }));
  await waitFor(() => expect(controller.editor.dsl).toBe(text));
  await waitFor(() => expect(controller.canvas.nodes.length).toBeGreaterThan(0));
  await settle();
}
/** Open Coral source under document layout settings, as a saved document. */
async function openWithLayout(text: string, layout: Record<string, unknown>) {
  render(<Harness />);
  act(() => controller.header.onOpenFile({ name: 'flow.coral.json', text: JSON.stringify({ ...createBlankDocument(),
    content: { format: 'dsl', dslType: 'coral', text }, settings: { notation: 'flowchart', layout } }) }));
  await waitFor(() => expect(controller.editor.dsl).toBe(text));
  await waitFor(() => expect(controller.canvas.nodes.length).toBeGreaterThan(0));
  await settle();
}
const RIGHT = { algorithm: 'layered', direction: 'RIGHT', spacing: { nodeNode: 50, layerSpacing: 70 } } as const;
const status = () => screen.getByTestId('on-device-status').textContent;
const requestField = () => screen.getByLabelText('Request') as HTMLTextAreaElement;
async function ask(text: string) {
  const runs = fake.calls.length;
  fireEvent.change(requestField(), { target: { value: text } });
  fireEvent.keyDown(requestField(), { key: 'Enter' });
  await waitFor(() => expect(fake.calls).toHaveLength(runs + 1));
}
async function reply(text: string) {
  await act(async () => { fake.reply(text); });
}
const history = () => ({ text: controller.editor.dsl, undo: controller.canvas.undoCount, redo: controller.canvas.redoCount });

describe('on-device request, clarification and review', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fake = fakeModel();
  });
  afterEach(() => { vi.restoreAllMocks(); wrapHost = null; });

  it('locks editing while the model works, stages detached, applies once, and undoes and redoes', async () => {
    await open();
    const before = history();
    await ask('Remove the arrow and rename Review request to Check');
    expect(fake.calls[0][1]).toEqual({ role: 'user', content: 'Remove the arrow and rename Review request to Check' });
    expect(controller.editor.isDslReadOnly).toBe(true);
    await reply(`delete e1\nlabel ${nodeHandle(fake.snapshot(), 'review')} "Check"`);
    const heading = await screen.findByRole('heading', { name: 'Review the proposed change' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(controller.editor.isDslReadOnly).toBe(false);
    expect(status()).toMatch(/^Review ready: 2 changes: 1 removed, 1 changed(; \d+ kept in place)?\.$/);
    expect(screen.getByText('Your request: Remove the arrow and rename Review request to Check')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Proposed changes' }).textContent).toContain('Removed arrow from "Start" to "Review request"');
    expect(screen.getByRole('img', { name: 'Preview of the diagram after the change' })).toBeTruthy();
    expect(history()).toEqual(before);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(status()).toBe(MESSAGES.applied));
    await waitFor(() => expect(document.activeElement).toBe(requestField()));
    // Without the arrow a fresh layout would move both nodes, so their canvas places are written (H3).
    expect(controller.editor.dsl.replace(/ @ \([^)]*\)/g, '')).toBe('@diagram flowchart\n// Keep this comment.\nstart terminal as "Start"\nreview process as "Check"\n');
    expect(controller.canvas.undoCount).toBe(before.undo + 1);
    act(() => { fireEvent.keyDown(document, { key: 'z', ctrlKey: true }); });
    await waitFor(() => expect(controller.editor.dsl).toBe(SOURCE));
    act(() => { fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true }); });
    await waitFor(() => expect(controller.editor.dsl).toContain('"Check"'));
  });

  it('discards a candidate and stops a running request without changing source or history', async () => {
    await open();
    const before = history();
    await ask('Remove the arrow');
    await reply('delete e1');
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(status()).toBe(MESSAGES.discarded);
    await waitFor(() => expect(document.activeElement).toBe(requestField()));
    expect(history()).toEqual(before);

    await ask('Remove the arrow again');
    expect(controller.editor.isDslReadOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(fake.model.stop).toHaveBeenCalled();
    expect(status()).toBe(MESSAGES.stopped);
    await waitFor(() => expect(controller.editor.isDslReadOnly).toBe(false));
    expect(history()).toEqual(before);
  });

  it('resolves a duplicate label inside nested groups to the intended node', async () => {
    await open(NESTED);
    await ask('Rename Review in Team B to Approve');
    const teamB = nodeHandle(fake.snapshot(), 'b');
    await reply(`label ${nodeHandle(fake.snapshot(), 'r', teamB)} "Approve"`);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(controller.editor.dsl).toBe(NESTED.replace('  r process as "Review"\n}\n', 'XX').replace(
      'b group as "Team B" {\n  r process as "Review"\n}\n', 'b group as "Team B" {\n  r process as "Approve"\n}\n').replace('XX',
      '  r process as "Review"\n}\n')));
  });

  it('previews and applies a spatial verb measured with the canvas layout, listing every node it moves', async () => {
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\nc process as "C"\na -> b\n';
    await openWithLayout(source, RIGHT);
    const before = history();
    await ask('Put C to the right of A');
    await reply(`place ${nodeHandle(fake.snapshot(), 'c')} right-of ${nodeHandle(fake.snapshot(), 'a')} normal`);
    await screen.findByRole('heading', { name: 'Review the proposed change' });
    const lines = screen.getByRole('list', { name: 'Proposed changes' }).textContent!;
    expect(lines).toContain('Changed process "C": moved');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(status()).toBe(MESSAGES.applied));
    expect(controller.editor.dsl).toMatch(/\nc process as "C" @ \(-?[\d.]+, -?[\d.]+\)\n/);
    // On the canvas layout, C lands on B, so B moves clear and is listed; A is untouched.
    expect(controller.editor.dsl).toMatch(/\nb process as "B" @ \(-?[\d.]+, -?[\d.]+\)\n/);
    expect(lines).toMatch(/Changed process "B": moved \d+ units to make room/);
    expect(controller.editor.dsl).toContain('\na process as "A"\n');
    expect(controller.canvas.undoCount).toBe(before.undo + 1);
    act(() => { fireEvent.keyDown(document, { key: 'z', ctrlKey: true }); });
    await waitFor(() => expect(controller.editor.dsl).toBe(source));
  });

  it('measures a candidate exactly as the canvas lays it out (parity)', async () => {
    // Fable's probe: in RIGHT with spacing 50/70, the shared SVG layout put a at y=124 and b at y=68;
    // the canvas puts both at y=94. The measurement must give the canvas's rectangles.
    const source = '@diagram flowchart\na process as "A"\nb process as "B"\nc process as "C"\na -> b\n';
    await openWithLayout(source, RIGHT);
    const settings = controller.inspector!.documentSettings;
    expect(settings.layout).toMatchObject(RIGHT);
    const canvas = canvasRects(controller.canvas.nodes.map(node => ({ id: node.id, position: node.position,
      ...(node.parentId ? { parentId: node.parentId } : {}), width: node.width, height: node.height })));
    const measured = await canvasGeometry(() => ({ notation: 'flowchart', layout: settings.layout,
      font: settings.font, renderStyle028: settings.renderStyle028 ?? 'lowfi' }))({} as never, source);
    expect([...measured]).toEqual([...canvas]);
    expect(canvas.get('a')!.y).toBe(94);
    expect(canvas.get('b')!.y).toBe(94);
  });

  it('words moved, anchored and route-warning lines for the review', () => {
    const graph = { id: 'g', version: '1', nodes: [{ id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' }], edges: [] };
    const stage = { graph, capture: { graph }, moved: [{ id: 'a', from: { x: 0, y: 0 }, to: { x: 0, y: 96.4 }, distance: 96.4 }], anchored: ['b'],
      changes: ['a', 'b'].map(id => ({ change: 'changed', kind: 'node', id, type: 'process', fields: [{ field: 'position', after: { x: 0, y: 0 } }] })),
      layoutDiagnostics: [{ code: 'layout.route.degraded', severity: 'warning', message: 'Connector "edge-1" (a → b) shares a corridor with a parallel connector' },
        { code: 'layout.route.retried', severity: 'warning', message: 'Connector "edge-2" was laid out again with 1.5× spacing' },
        { code: 'layout.constraint.overlap-forced', severity: 'warning', message: 'Authored exact or pinned geometry forces overlap between "a" and "b"' },
        { code: 'layout.engine.failed', severity: 'error', message: 'never staged' }] } as unknown as Parameters<typeof describeChanges>[0] & PlanStage;
    expect(describeChanges(stage)).toEqual(['Changed process "A": moved 96 units to make room', 'Changed process "B": kept in place']);
    expect(describeLayoutWarnings(stage)).toEqual(['Connector "edge-1" (a → b) shares a corridor with a parallel connector',
      'Connector "edge-2" was laid out again with 1.5× spacing', 'Authored exact or pinned geometry forces overlap between "a" and "b"']);
  });

  it('continues after one clarification, unlocks editing while it waits, and ends on a second question', async () => {
    await open(NESTED);
    await ask('Rename Review to Approve');
    const snapshot = fake.snapshot();
    const [a, b] = [nodeHandle(snapshot, 'r', nodeHandle(snapshot, 'a')), nodeHandle(snapshot, 'r', nodeHandle(snapshot, 'b'))];
    await reply(`ask ambiguous ${a} | ${b}`);
    expect(status()).toMatch(/^Question: Which do you mean/);
    expect(controller.editor.isDslReadOnly).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '"Review" inside "Team B"' }));
    await waitFor(() => expect(fake.model.run).toHaveBeenCalledTimes(2));
    expect(fake.calls[1].slice(3)).toEqual([{ role: 'assistant', content: `ask ambiguous ${a} | ${b}` },
      { role: 'user', content: '"Review" inside "Team B"' }]);
    expect(fake.calls[1].slice(0, 3)).toEqual(fake.calls[0]);
    await reply('ask unclear');
    expect(status()).toBe(MESSAGES.secondQuestion);
    expect(controller.editor.dsl).toBe(NESTED);
  });

  it('asks an unclear question and ends a stale exchange when the diagram changed while it waited', async () => {
    await open();
    await ask('Change it');
    await reply('ask unclear');
    expect(status()).toBe(`Question: ${UNCLEAR_QUESTION}`);
    act(() => { controller.editor.onDslChange(SOURCE.replace('"Start"', '"Begin"')); controller.editor.onEditSessionEnd(); });
    await settle();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Rename Start to Go' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(status()).toBe(MESSAGES.staleQuestion);
    expect(fake.model.run).toHaveBeenCalledTimes(1);
  });

  it('reports refusals, unusable replies, no-change and failures in plain words', async () => {
    await open();
    const before = history();
    const cases: [string | Parameters<typeof fake.settle>[0], string][] = [
      ['ask missing-context n1', MESSAGES.missingContext],
      ['delete e1 please', MESSAGES.unusable],
      ['no-change already-satisfied', 'That is already the case.'],
      [{ status: 'error', code: 'input-cap', message: inputCapMessage(2300, 2048) }, inputCapMessage(2300, 2048)],
      [{ status: 'worker-lost' }, MESSAGES.lost],
      [{ status: 'timeout', phase: 'working' }, MESSAGES.timeout],
      ['delete n1', 'The plan cannot be applied:'],
    ];
    for (const [outcome, message] of cases) {
      await ask('Do something');
      await act(async () => { if (typeof outcome === 'string') fake.reply(outcome); else fake.settle(outcome); });
      await waitFor(() => expect(status()).toContain(message));
      expect(history()).toEqual(before);
    }
  });

  it('refuses an ineligible document before the model runs', async () => {
    await open('@diagram flowchart\np process as "Pay"\nq process\np:out -> q\n');
    fireEvent.change(requestField(), { target: { value: 'Rename Pay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(status()).toMatch(/out port of "Pay"/));
    expect(fake.model.run).not.toHaveBeenCalled();
  });

  it('leaving the page during review drops the candidate and keeps the document', async () => {
    await open();
    await ask('Rename Review request');
    await reply(`label ${nodeHandle(fake.snapshot(), 'review')} "Unsaved candidate"`);
    await screen.findByRole('heading', { name: 'Review the proposed change' });
    const text = controller.editor.dsl;
    act(() => controller.onDevice.onEnabledChange(false));
    const { unmount } = render(<div />);
    unmount();
    expect(controller.editor.dsl).toBe(text);
    expect(Object.values(window.localStorage).some(value => value.includes('Unsaved candidate'))).toBe(false);
  });
});

describe('on-device exchange robustness', () => {
  beforeEach(() => { window.localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true); fake = fakeModel(); });
  afterEach(() => { vi.restoreAllMocks(); wrapHost = null; });

  it('keeps the review when Apply finds the editor busy, and ends cleanly when Apply throws', async () => {
    await open();
    await ask('Remove the arrow');
    await reply('delete e1');
    await screen.findByRole('heading', { name: 'Review the proposed change' });
    wrapHost = host => ({ ...host, plan: { ...host.plan, apply: async () => ({ ok: false, refusal: { code: 'coral.plan.busy', message: 'busy' } }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(status()).toBe(MESSAGES.busyApply));
    expect(screen.getByRole('heading', { name: 'Review the proposed change' })).toBeTruthy();
    wrapHost = host => ({ ...host, plan: { ...host.plan, apply: () => Promise.reject(new Error('boom')) } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(status()).toBe(MESSAGES.failed));
    expect(controller.editor.dsl).toBe(SOURCE);
    expect(controller.editor.isDslReadOnly).toBe(false);
  });

  it('ends cleanly when the model throws, and sends only once on a double Enter', async () => {
    await open();
    fake.model.run.mockImplementationOnce(() => Promise.reject(new Error('worker exploded')));
    fireEvent.change(requestField(), { target: { value: 'Remove the arrow' } });
    fireEvent.keyDown(requestField(), { key: 'Enter' });
    fireEvent.keyDown(requestField(), { key: 'Enter' });
    await waitFor(() => expect(status()).toBe(MESSAGES.failed));
    expect(fake.model.run).toHaveBeenCalledTimes(1);
    expect(controller.editor.isDslReadOnly).toBe(false);
  });

  it('stops while the preview is prepared and drops the late stage', async () => {
    await open();
    let finish: (() => void) | null = null;
    const discard = vi.fn();
    wrapHost = host => ({ ...host, plan: { ...host.plan, discard, stage: async (...args) => {
      await new Promise<void>(resolve => { finish = resolve; });
      return host.plan.stage(args[0], args[1]);
    } } });
    await ask('Remove the arrow');
    await reply('delete e1');
    await waitFor(() => expect(status()).toBe('Preparing the preview.'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(status()).toBe(MESSAGES.stopped);
    await act(async () => { finish!(); });
    await waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Review the proposed change' })).toBeNull();
    expect(controller.editor.dsl).toBe(SOURCE);
  });

  it('focuses the answer field on a question and Stop after an answer', async () => {
    await open(NESTED);
    await ask('Rename Review to Approve');
    const snapshot = fake.snapshot();
    const [a, b] = [nodeHandle(snapshot, 'r', nodeHandle(snapshot, 'a')), nodeHandle(snapshot, 'r', nodeHandle(snapshot, 'b'))];
    await reply(`ask ambiguous ${a} | ${b}`);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Your answer')));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((screen.getByLabelText('Request') as HTMLTextAreaElement).readOnly).toBe(false);
    await ask('Rename Review to Approve');
    // A new request shuffles handles afresh.
    const again = fake.snapshot();
    await reply(`ask ambiguous ${nodeHandle(again, 'r', nodeHandle(again, 'a'))} | ${nodeHandle(again, 'r', nodeHandle(again, 'b'))}`);
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '"Review" inside "Team A"' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' })));
  });
});

describe('on-device keyboard journey from enable to Undo', () => {
  /** jsdom has no native key activation: focus the control, then activate it as Enter or Space would. */
  const press = (element: HTMLElement) => {
    element.focus();
    expect(document.activeElement).toBe(element);
    fireEvent.click(element);
  };

  it('enables, downloads, asks, reviews, applies and undoes from the keyboard', async () => {
    fake = fakeModel('none');
    await open();
    press(screen.getByRole('checkbox', { name: 'On-device editing model (experimental)' }));
    const download = await screen.findByRole('button', { name: 'Download' });
    // Focus starts on the facts, not on Download.
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/^Coral downloads the model/));
    expect(fake.model.download).not.toHaveBeenCalled();
    press(download);
    await screen.findByText(/Downloaded and verified/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'On-device editing model (experimental)' })));
    requestField().focus();
    await ask('Remove the arrow');
    await reply('delete e1');
    const heading = await screen.findByRole('heading', { name: 'Review the proposed change' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    press(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(document.activeElement).toBe(requestField()));
    expect(controller.editor.dsl).not.toContain('toReview');
    // Text fields keep their own Undo; leaving the field (Tab) gives Ctrl+Z to the diagram.
    requestField().blur();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(controller.editor.dsl).toBe(SOURCE));
  });
});
