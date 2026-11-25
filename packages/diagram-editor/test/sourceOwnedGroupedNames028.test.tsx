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

describe('source-owned grouped edge and arrangement transaction', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('retains qualified identity through edit, history, save/reopen, export, and stale refusal', async () => {
    const source = '@diagram architecture\nsales group {\n  a service\n  b service\n' +
      '  route = a -> b\n  lane = arrange row: a, b\n}\n' +
      'ops group {\n  a service\n  b service\n' +
      '  route = a -> b\n  lane = arrange column: a, b\n}\n';
    const edited = source.replace('  route = a -> b\n', '  route = a -> b as "Sales route"\n');
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grouped-source');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => { result.current.header.onOpenFile({ name: 'grouped.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.edges.map(({ id }) => id))
        .toEqual(['sales.route', 'ops.route']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => {
        expect(result.current.inspector?.onEdgeLabelEdit('sales.route', 'Sales route')).toBe(true);
      });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());

      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
      act(() => { result.current.header.onOpenFile({
        name: 'grouped.coral.json', text: JSON.stringify(saved),
      }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(edited));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      const exported = JSON.parse(await (createObjectUrl.mock.calls.at(-1)![0] as Blob).text());
      expect(exported.edges.map(({ id }: { id: string }) => id))
        .toEqual(['sales.route', 'ops.route']);
      expect(exported.constraints.map(({ id }: { id: string }) => id))
        .toEqual(['sales.lane', 'ops.lane']);

      const invalid = edited + 'missing -> sales.a\n';
      act(() => result.current.editor.onDslChange(invalid));
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(invalid));
      await waitFor(() => expect(result.current.editor.parseErrors).toContainEqual(
        expect.objectContaining({ code: 'coral.reference.source.unresolved' })));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      const exportCount = createObjectUrl.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(createObjectUrl.mock.calls).toHaveLength(exportCount);
      expect(result.current.rasterExportError).toMatch(/source-export\.(stale|invalid)/);
      let malformedSave!: ReturnType<typeof result.current.header.onSave>;
      act(() => { malformedSave = result.current.header.onSave(); });
      expect(malformedSave.content).toEqual({
        format: 'dsl', dslType: 'coral', text: invalid,
      });
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  }, 15000);
});
