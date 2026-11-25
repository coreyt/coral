import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
    removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const recursiveSource = '@diagram uml-sequence\nclient participant\nserver participant\nworker participant\n' +
  'team = participants worker, server [label: "Operations"]\n' +
  'spawn = client -.-> worker [create]\n' +
  'phase = region "Review" {\n  choice = alt "approved" {\n' +
  '    work = activation worker {\n      call = worker -> server as "check"\n' +
  '      note "Recorded" on call\n    }\n  } else "retry" {\n' +
  '    reply = server -> worker as "retry"\n  }\n}\n' +
  'close = worker -> server [destroy]\n';

describe('Slice30 editor portable recursive behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('keeps the combined recursive fixture through editor open, save/reopen, and candidate export', async () => {
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'slice30-recursive.coral', text: recursiveSource }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(recursiveSource));
    expect(result.current.editor.parseErrors).toEqual([]);
    await waitFor(() => expect(result.current.canvas.nodes.map(({ id }) => id))
      .toEqual(['client', 'server', 'worker']));
    await waitFor(() => expect(result.current.canvas.edges.map(({ id }) => id))
      .toEqual(['spawn', 'call', 'reply', 'close']));

    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: recursiveSource });
    act(() => { result.current.header.onOpenFile({ name: 'slice30-recursive.coral.json', text: JSON.stringify(saved) }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(recursiveSource));

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:slice30-recursive');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (createObjectUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.interaction.items).toEqual([
        { kind: 'message', id: 'spawn' }, { kind: 'region', id: 'phase' },
        { kind: 'message', id: 'close' },
      ]);
      expect(exported.interaction.fragments).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'choice', kind: 'alt' }),
      ]));
      expect(exported.interaction.regions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'phase', label: 'Review' }),
      ]));
      expect(exported.interaction.activations).toEqual([{ id: 'work', participantId: 'worker' }]);
      expect(exported.interaction.groups).toEqual([{ id: 'team', label: 'Operations', participantIds: ['worker', 'server'] }]);
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  });
});
