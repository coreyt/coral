import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('source-owned recursive sequence transaction', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('keeps a region timeline through edit, history, export, save and reopen', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'phase = region "Review" {\n  call = a -> b\n}\n';
    const edited = source.replace('"Review"', '"Approved"');
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'region.coral', text: source }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors).toEqual([]);
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    act(() => result.current.editor.onDslChange(edited));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(edited));
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    act(() => { result.current.header.onOpenFile({
      name: 'region.coral.json', text: JSON.stringify(saved),
    }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:region');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (createObjectUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.interaction.items).toEqual([{ kind: 'region', id: 'phase' }]);
      expect(exported.interaction.regions).toEqual([{
        id: 'phase', label: 'Approved', items: [{ kind: 'message', id: 'call' }],
      }]);
      const malformed = edited.replace('}\n', '');
      act(() => result.current.editor.onDslChange(malformed));
      await waitFor(() => expect(result.current.editor.dsl).toBe(malformed));
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl',
        dslType: 'coral', text: malformed });
      const priorExports = createObjectUrl.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(createObjectUrl).toHaveBeenCalledTimes(priorExports);
      expect(result.current.rasterExportError).toMatch(/source-export\.(stale|invalid)/);
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  });

  it('renders, exports, saves and reopens participant-group source exactly', async () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'team = participants worker, api [label: "Operations"]\napi -> worker';
    const edited = source.replace('Operations', 'Support');
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'group.coral', text: source }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors).toEqual([]);
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
    expect(result.current.canvas.edges).toHaveLength(1);
    act(() => result.current.editor.onDslChange(edited));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(edited));
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    act(() => { result.current.header.onOpenFile({ name: 'group.coral.json',
      text: JSON.stringify(saved) }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    expect(result.current.editor.parseErrors).toEqual([]);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:group');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (createObjectUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.interaction.participantOrder).toEqual(['api', 'worker']);
      expect(exported.interaction.groups).toEqual([{ id: 'team', label: 'Support',
        participantIds: ['worker', 'api'] }]);
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
    }
    hook.unmount();
  });

  it('saves, reopens, edits, undoes, redoes, and exports par plus activation meaning', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'parallel = par {\n  work = activation a {\n    call = a -> b\n  }\n' +
      '} and "reply" {\n  b -> a\n}\n';
    const edited = source.replace('"reply"', '"later"');
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    let accepted = false;
    act(() => { accepted = result.current.header.onOpenFile({ name: 'parallel.coral', text: source }); });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors).toEqual([]);
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
    expect(result.current.canvas.edges).toHaveLength(2);

    const firstUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sequence-first');
    const firstRevoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const firstClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
    expect(result.current.rasterExportError).toBeNull();
    expect(firstUrl).toHaveBeenCalledOnce();

    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    act(() => { result.current.header.onOpenFile({
      name: 'parallel.coral.json', text: JSON.stringify(saved),
    }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
    expect(result.current.rasterExportError).toBeNull();

    act(() => result.current.editor.onDslChange(edited));
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(edited));
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
    expect(result.current.rasterExportError).toBeNull();
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));

    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (firstUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.interaction.fragments[0]).toMatchObject({ id: 'parallel', kind: 'par',
        operands: [{ items: [{ kind: 'activation-start', id: 'work' },
          { kind: 'message', id: 'call' }, { kind: 'activation-end', id: 'work' }] },
        { guard: { text: 'later' } }] });
      expect(exported.interaction.activations).toEqual([{ id: 'work', participantId: 'a' }]);

      const invalid = edited + 'a -> missing\n';
      act(() => result.current.editor.onDslChange(invalid));
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      const priorExports = firstUrl.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(firstUrl.mock.calls).toHaveLength(priorExports);
      expect(result.current.rasterExportError).toMatch(/source-export\.(stale|invalid)/);
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl',
        dslType: 'coral', text: invalid });
    } finally {
      firstUrl.mockRestore();
      firstRevoke.mockRestore();
      firstClick.mockRestore();
      hook.unmount();
    }
  });

  it('saves, reopens and exports a destruction with its terminal scene', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]\n';
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'destruction.coral', text: source }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors).toEqual([]);
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
    expect(result.current.canvas.edges).toHaveLength(1);
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    act(() => { result.current.header.onOpenFile({
      name: 'destruction.coral.json', text: JSON.stringify(saved),
    }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:destruction');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (createObjectUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.interaction.participants).toContainEqual({
        id: 'server', nodeId: 'server', destroyedByMessageId: 'close',
      });
      expect(exported.interaction.messages).toContainEqual(expect.objectContaining({
        id: 'close', kind: 'destroy', receiverParticipantId: 'server',
      }));
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  });

  it.each([
    ['incomplete alt', '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b\n}\n'],
    ['pre-creation note', '@diagram uml-sequence\nclient participant\n' +
      'note "Ready" on worker\nspawn = client -.-> worker [create]\n'],
  ])('saves and reopens %s as exact source despite its finding', async (_name, source) => {
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    let accepted = false;
    act(() => { accepted = result.current.header.onOpenFile({ name: 'draft.coral', text: source }); });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    expect(result.current.editor.parseErrors.length).toBeGreaterThan(0);
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    act(() => { result.current.header.onOpenFile({
      name: 'draft.coral.json', text: JSON.stringify(saved),
    }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    hook.unmount();
  });
});
