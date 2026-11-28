import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMermaid } from '@coral-viz/language';
import { parse } from '@coral-viz/language/parser';
import { renderSvg, transpileAndVerifyMermaidToCoral } from '@coral-viz/render';
import { validateIR } from '@graph-ir/core';
import { planFileOpen, prepareDocumentReplacement } from '../src/useEditorController';
import { useEditorControllerWithProperties as useEditorController } from './fixtures/useEditorControllerWithProperties';

vi.mock('../src/transcriptArchive', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/transcriptArchive')>(),
  createIndexedDbTranscriptStore: () => ({
    get: async () => undefined, put: async () => {}, delete: async () => {}, clear: async () => {}, list: async () => [],
  }),
}));

const layout = vi.hoisted(() => vi.fn(async (graph: any) => ({
  children: (graph.children ?? []).map((child: any, index: number) => ({ ...child, x: index * 100, y: index * 80 })),
  edges: [],
})));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout(graph: unknown) { return layout(graph); }
  },
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const MERMAID = `sequenceDiagram
    actor User
    participant App
    User->>+App: sign in
    alt ok
        App-->>User: welcome
    else denied
        App-->>-User: sorry
    end`;
// U3 structured sequence editing is deferred to 0.2.10. Keep these operation
// checks on deliberate GraphIR interchange input, not the direct .mmd path.
const legacyGraph = parseMermaid(MERMAID).graph!;
const legacyFile = { name: 'sign-in.graphir.json', text: JSON.stringify(legacyGraph) };
const savedSequence = '@diagram uml-sequence\nclient participant\nserver participant\n' +
  'call = client -#> server as "load()"\nreply = server -.-> client as "result"\n';

async function openedController() {
  const hook = renderHook(() => useEditorController());
  await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
  let accepted = false;
  act(() => { accepted = hook.result.current.header.onOpenFile(legacyFile); });
  expect(accepted).toBe(true);
  await waitFor(() => expect(hook.result.current.sequence?.graph.interaction?.messageOrder).toEqual(['msg_1', 'msg_2', 'msg_3']));
  return hook;
}

async function openedSourceController() {
  const hook = renderHook(() => useEditorController());
  await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
  let accepted = false;
  act(() => { accepted = hook.result.current.header.onOpenFile({
    name: 'sequence.coral', text: savedSequence,
  }); });
  expect(accepted).toBe(true);
  await waitFor(() => expect(hook.result.current.sequence?.graph.interaction?.messageOrder)
    .toEqual(['call', 'reply']));
  return hook;
}

describe('UML sequence import, GraphIR interchange, and saved source', () => {
  beforeEach(() => {
    window.localStorage.clear();
    layout.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('opens verified Mermaid sequences through the shared transpiler and retains lossy source', () => {
    const opened = planFileOpen({ name: 'simple.mmd',
      text: 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hi' });
    expect(opened.kind).toBe('open');
    if (opened.kind === 'open') {
      expect(opened.prepared.graph).toMatchObject({
        metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      });
      expect(opened.prepared.source).toContain('@diagram uml-sequence\n');
      expect(opened.prepared.source).toContain('msg_1 = A -#> B as "hi"');
    }
    const advanced = planFileOpen({ name: 'advanced.mmd', text: MERMAID });
    expect(advanced.kind).toBe('open');
    if (advanced.kind === 'open') expect(advanced.prepared.source).toBe(MERMAID);
    const numberedSource = 'sequenceDiagram\nautonumber\nA->>B: x';
    const numbered = planFileOpen({ name: 'numbered.mmd', text: numberedSource });
    expect(numbered.kind, JSON.stringify(numbered)).toBe('open');
    if (numbered.kind === 'open') {
      expect(numbered.textOpen?.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'mermaid.sequence.numbering.unsupported', severity: 'error' }),
      ]));
      expect(numbered.textOpen?.blockWith).toBeTruthy();
      expect(numbered.prepared.graph.nodes).toEqual([]);
      expect(numbered.prepared.graph.edges).toEqual([]);
    }
  });

  it('opens valid sequence GraphIR stored in non-canonical order (CR70-4)', () => {
    const opened = planFileOpen(legacyFile);
    if (opened.kind !== 'open') throw new Error('expected open');
    const permuted = structuredClone(opened.prepared.graph);
    permuted.nodes.reverse();
    permuted.edges.reverse();
    permuted.interaction!.participants.reverse();
    permuted.interaction!.messages.reverse();
    permuted.interaction!.notes = [
      { id: 'note-2', text: 'late', messageIds: ['msg_3'] },
      { id: 'note-1', text: 'top', participantIds: ['User'] },
    ];
    const reopened = planFileOpen({ name: 'sign-in.json', text: JSON.stringify(permuted) });
    expect(reopened.kind).toBe('open');
    if (reopened.kind === 'open') expect(reopened.prepared.graph.interaction?.notes?.map((note) => note.id)).toEqual(['note-1', 'note-2']);
  });

  it.each<[string, (graph: any) => void]>([
    ['an unlisted extra node', (graph) => { graph.nodes.push({ id: 'C', type: 'participant', label: 'C' }); }],
    ['a message kind that disagrees with its edge token', (graph) => { graph.interaction.messages[0].kind = 'return'; }],
  ])('blocks opening sequence GraphIR with %s instead of rewriting it (CR70-12)', (_name, mutate) => {
    const opened = planFileOpen(legacyFile);
    if (opened.kind !== 'open') throw new Error('expected open');
    const graph = structuredClone(opened.prepared.graph);
    mutate(graph);
    expect(planFileOpen({ name: 'bad.json', text: JSON.stringify(graph) })).toMatchObject({
      kind: 'blocked', reasons: [expect.objectContaining({ message: expect.stringContaining('coral.sequence.') })],
    });
  });

  it('opens a valid single-branch Mermaid alt through the shared transpiler', () => {
    const source = 'sequenceDiagram\nalt ok\nA->>B: hi\nend';
    const opened = planFileOpen({ name: 'alt.mmd', text: source });
    expect(opened.kind).toBe('open');
    if (opened.kind === 'open') {
      expect(opened.prepared.source).toContain('@diagram uml-sequence');
      expect(opened.prepared.source).toBe(transpileAndVerifyMermaidToCoral(source).coral);
      expect(opened.textOpen?.blockWith).toBeUndefined();
    }
  });

  it('keeps an opaque interaction when switching between non-sequence notations (CR70-10)', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const settings = result.current.inspector!.documentSettings;
    act(() => result.current.inspector!.onDocumentSettingsChange({ ...settings, notation: 'architecture' }));
    expect(result.current.sequence).toBeNull();
  });

  it('opens an unsupported Mermaid sequence as exact, unverified text', async () => {
    const { result } = await openedController();
    const source = 'sequenceDiagram\nA->>B: x\npar p\nA->>B: y\nend';
    let accepted = false;
    act(() => { accepted = result.current.header.onOpenFile({ name: 'bad.mmd', text: source }); });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors).toContainEqual(expect.objectContaining({
      code: 'coral.foreign.projection.unverified', severity: 'error',
    }));
    const saved = result.current.header.onSave();
    expect(saved.content).toMatchObject({ format: 'dsl', text: source });
    act(() => { accepted = result.current.header.onOpenFile({
      name: 'bad.coral.json', text: JSON.stringify(saved),
    }); });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
  });

  it('edits through one-transaction operations with visible refusal, undo/redo, save/reopen, and SVG export', async () => {
    const { result } = await openedController();
    expect(result.current.editor.dsl).toContain('User -> App as msg_1 [sync, label: "sign in"]');
    expect(layout).not.toHaveBeenCalledWith(expect.objectContaining({
      children: expect.arrayContaining([expect.objectContaining({ id: 'App' })]),
    }));

    let outcome: ReturnType<NonNullable<typeof result.current.sequence>['onOperation']> | undefined;
    act(() => { outcome = result.current.sequence!.onOperation({ type: 'addMessage', after: 'msg_2', label: 'retry' }); });
    expect(outcome).toMatchObject({ ok: true });
    await waitFor(() => expect(result.current.editor.dsl).toContain('label: "retry"'));
    const edited = result.current.sequence!.graph;
    expect(edited.interaction?.fragments?.[0].operands[0].messageIds).toHaveLength(2);
    expect(parse(result.current.editor.dsl).graph).toEqual(edited);

    const beforeRefusal = result.current.editor.dsl;
    act(() => { outcome = result.current.sequence!.onOperation({ type: 'deleteParticipant', id: 'App' }); });
    expect(outcome).toMatchObject({ ok: false, error: expect.stringContaining('still referenced') });
    expect(result.current.sequence!.error).toContain('still referenced');
    expect(result.current.editor.dsl).toBe(beforeRefusal);

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('retry'));
    expect(result.current.sequence!.graph.interaction?.messageOrder).toEqual(['msg_1', 'msg_2', 'msg_3']);
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toContain('retry'));

    const saved = result.current.header.onSave();
    expect(saved.content.graphIR).not.toHaveProperty('labelBounds028');
    const validation = validateIR(saved.content.graphIR);
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    const reopened = prepareDocumentReplacement(saved);
    expect(reopened.graph.interaction).toEqual(result.current.sequence!.graph.interaction);
    const svg = renderSvg(reopened.graph);
    expect(svg.match(/data-coral-sequence-message=/g)).toHaveLength(4);
  });

  it('selects sequence elements and adds participants from the palette path', async () => {
    const { result } = await openedController();
    act(() => result.current.sequence!.onSelect({ kind: 'participant', id: 'App' }));
    expect(result.current.sequence!.selected).toEqual({ kind: 'participant', id: 'App' });
    act(() => { result.current.sequence!.onOperation({ type: 'addParticipant', kind: 'participant' }); });
    await waitFor(() => expect(result.current.sequence!.graph.interaction?.participantOrder).toEqual(['User', 'App', 'participant']));
    expect(result.current.editor.dsl).toMatch(/^participant "Participant"/m);
    expect(result.current.sequence!.selected).toEqual({ kind: 'participant', id: 'participant' });
  });

  it('keeps structured sequence operations gated while a saved source edit updates meaning (TR94-F6)', async () => {
    const { result } = await openedSourceController();
    expect(result.current.sequence!.mutationsDisabled).toBe(true);
    const typed = `${savedSequence}bye = server -> client as "bye"\n`;
    act(() => result.current.editor.onDslChange(typed));
    expect(result.current.sequence!.mutationsDisabled).toBe(true);
    let outcome: ReturnType<NonNullable<typeof result.current.sequence>['onOperation']> | undefined;
    act(() => { outcome = result.current.sequence!.onOperation({ type: 'addParticipant', kind: 'participant' }); });
    expect(outcome).toMatchObject({ ok: false });
    expect(result.current.editor.dsl).toBe(typed);
    await waitFor(() => expect(result.current.sequence!.graph.interaction?.messageOrder.at(-1)).toBe('bye'));
    expect(result.current.sequence!.mutationsDisabled).toBe(true);
  });

  it('saves malformed sequence source verbatim while conformance is withheld (CR94-F12)', async () => {
    const { result } = await openedSourceController();
    const malformed = `${savedSequence}choice = alt "only" {\n  client -> server\n}\n`;
    act(() => result.current.editor.onDslChange(malformed));
    expect(result.current.editor.dsl).toBe(malformed);
    await waitFor(() => expect(result.current.editor.parseErrors.some(
      (finding) => finding.code === 'coral.sequence.fragment.operands')).toBe(true));
    const saved = result.current.header.onSave();
    expect(saved.content).toMatchObject({ format: 'dsl', text: malformed });
  });

  it('follows saved Coral sequence edits without generic layout', async () => {
    const { result } = await openedSourceController();
    layout.mockClear();
    const typed = `${savedSequence}bye = server -> client as "bye"\n`;
    act(() => result.current.editor.onDslChange(typed));
    await waitFor(() => expect(result.current.sequence!.graph.interaction?.messageOrder.at(-1)).toBe('bye'));
    expect(result.current.editor.dsl).toBe(typed);
    expect(layout).not.toHaveBeenCalled();
  });

  it('refuses to leave sequence notation while participants exist', async () => {
    const { result } = await openedController();
    const settings = result.current.inspector!.documentSettings;
    act(() => result.current.inspector!.onDocumentSettingsChange({ ...settings, notation: 'flowchart' }));
    expect(result.current.sequence?.graph.metadata?.notation).toBe('uml-sequence');
    expect(result.current.sequence?.error).toContain('sequence');
  });
});
