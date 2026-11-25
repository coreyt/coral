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

describe('source-owned manual Reflow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('offers full spatial layout without changing exact source or source history', async () => {
    const source = '@diagram architecture\n// Keep this comment\na service as "API"\n' +
      'b database as "Store"\nlink = a -> b [reads]\n';
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    try {
      act(() => { result.current.header.onOpenFile({ name: 'reflow.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());

      const beforeHistory = result.current.canvas.undoCount;
      expect(result.current.commandPalette.commands.find((item) => item.id === 'reflow')?.disabled)
        .toBe(false);
      expect(result.current.canvas.reflowDisabled).toBe(false);
      act(() => result.current.canvas.onReflow());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
      expect(result.current.canvas.nodes).toHaveLength(2);
      expect(result.current.canvas.edges).toHaveLength(1);
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.undoCount).toBe(beforeHistory);
      expect(result.current.header.onSave().content)
        .toEqual({ format: 'dsl', dslType: 'coral', text: source });
    } finally {
      hook.unmount();
    }
  });

  it('does not offer generic Reflow for a sequence timeline', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'call = client -> server\n';
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    try {
      act(() => { result.current.header.onOpenFile({ name: 'sequence.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.commandPalette.commands.find((item) => item.id === 'reflow')?.disabled)
        .toBe(true);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      expect(result.current.header.onSave().content)
        .toEqual({ format: 'dsl', dslType: 'coral', text: source });
    } finally {
      hook.unmount();
    }
  });

  it('keeps malformed spatial source saveable while disabling Reflow', async () => {
    const source = '@diagram architecture\napi service\napi -> missing\n';
    const hook = renderHook(() => useEditorController());
    const { result } = hook;
    try {
      act(() => { result.current.header.onOpenFile({ name: 'invalid.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.editor.parseErrors.some((item) =>
        item.severity === 'error')).toBe(true));
      expect(result.current.commandPalette.commands.find((item) => item.id === 'reflow')?.disabled)
        .toBe(true);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      expect(result.current.header.onSave().content)
        .toEqual({ format: 'dsl', dslType: 'coral', text: source });
    } finally {
      hook.unmount();
    }
  });
});
