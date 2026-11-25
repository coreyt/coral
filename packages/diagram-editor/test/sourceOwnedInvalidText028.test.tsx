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

describe('source-owned 0.2.8 malformed text lifetime', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it.each([
    ['unknown keyed end', 'a -> b [firstEnd: inventedMark]\n',
      'coral.syntax.connector.end-unknown'],
    ['raw control in style recipe', 'a -> b [style: "dotted,\tred"]\n',
      'coral.syntax.string.control'],
    ['raw control in quoted header', '@profileVersion "1.\t0.0"\n',
      'header.string.control'],
    ['retired kind-first declaration', 'service "Old" as oldApi\n',
      'coral.syntax.legacy-node.unsupported'],
    ['message before participant creation', 'early = client -> worker\n',
      'coral.sequence.message.outside-participant-lifetime',
      '@diagram uml-sequence\nclient participant\nworker participant\n' +
        'spawn = client -.-> worker [create]\nlater = client -> worker\n'],
  ])('saves, reopens, and undoes %s without exporting stale meaning', async (
    _name, invalidEdge, code, sequenceSource,
  ) => {
    const valid = sequenceSource ?? '@diagram architecture\na service\nb service\na -> b\n';
    const invalid = sequenceSource ? valid.replace('spawn =', `${invalidEdge}spawn =`)
      : invalidEdge.startsWith('@profileVersion')
      ? valid.replace('@diagram architecture\n', `@diagram architecture\n${invalidEdge}`)
      : valid.replace('a -> b\n', invalidEdge);
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid-source');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => { result.current.header.onOpenFile({ name: 'source.coral', text: valid }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(valid));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.editor.onDslChange(invalid));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(invalid));
      const diagnosticOffset = code === 'coral.sequence.message.outside-participant-lifetime'
        ? invalid.indexOf('worker', invalid.indexOf('early ='))
        : invalid.indexOf(code.endsWith('string.control') ? '\t'
          : code === 'coral.syntax.legacy-node.unsupported' ? 'service "Old"' : 'inventedMark');
      expect(result.current.editor.parseErrors).toContainEqual(expect.objectContaining({
        code, range: expect.objectContaining({ start: expect.objectContaining({
          offset: diagnosticOffset,
        }) }),
      }));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      const priorExports = createObjectUrl.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(createObjectUrl.mock.calls).toHaveLength(priorExports);
      expect(result.current.rasterExportError).toMatch(/source-export\.(stale|invalid)/);

      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(valid));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(invalid));

      const priorConfirmations = vi.mocked(window.confirm).mock.calls.length;
      const saved = result.current.header.onSave();
      expect(window.confirm).toHaveBeenCalledTimes(priorConfirmations);
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
      act(() => result.current.header.onOpenFile({
        name: 'source.coral.json', text: JSON.stringify(saved),
      }));
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(invalid));
      expect(result.current.header.onSave().content).toEqual({
        format: 'dsl', dslType: 'coral', text: invalid,
      });
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  });

  it('saves an unverified port-role draft exactly while refusing GraphIR export', async () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'link = api:out -- store:query\n';
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unverified-source');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const priorExports = createObjectUrl.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(createObjectUrl).toHaveBeenCalledTimes(priorExports);
      expect(result.current.rasterExportError).toContain(
        'coral.editor.source-export.unverified: PORT_DIRECTION_RULE_UNVERIFIED');

      const priorConfirmations = vi.mocked(window.confirm).mock.calls.length;
      const saved = result.current.header.onSave();
      expect(window.confirm).toHaveBeenCalledTimes(priorConfirmations);
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      act(() => result.current.header.onOpenFile({ name: 'ports.coral.json', text: JSON.stringify(saved) }));
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      expect(result.current.header.onSave().content).toEqual(saved.content);
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
      hook.unmount();
    }
  });
});
