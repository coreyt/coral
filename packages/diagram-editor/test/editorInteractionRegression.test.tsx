import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorController } from '../src/useEditorController';
import { DEFAULT_WORKSPACE_PREFERENCES, WORKSPACE_PREFERENCES_KEY } from '../src/workspacePreferences';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({ matches: false, media: query,
  onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false })) as typeof window.matchMedia;

describe('published editor interaction regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('opens Properties only on request and keeps selection current while it is closed', async () => {
    localStorage.setItem(WORKSPACE_PREFERENCES_KEY,
      JSON.stringify({ ...DEFAULT_WORKSPACE_PREFERENCES, inspectorOpen: true }));
    const hook = renderHook(() => useEditorController());
    try {
      await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
      expect(hook.result.current.inspector).toBeNull();
      const node = hook.result.current.canvas.nodes[0];
      const edge = hook.result.current.canvas.edges[0];
      for (const selection of [{ nodes: [node], edges: [] }, { nodes: [], edges: [edge] },
        { nodes: [node], edges: [edge] }]) {
        act(() => hook.result.current.canvas.onSelectionChange(selection));
        expect(hook.result.current.inspector).toBeNull();
      }
      act(() => hook.result.current.header.onToggleInspector());
      expect(hook.result.current.inspector?.selectionSummary.kind).toBe('mixed');
      act(() => hook.result.current.canvas.onSelectionChange({ nodes: [node], edges: [] }));
      expect(hook.result.current.inspector?.selectedNode?.id).toBe(node.id);
      act(() => hook.result.current.header.onToggleInspector());
      act(() => hook.result.current.canvas.onSelectionChange({ nodes: [], edges: [edge] }));
      expect(hook.result.current.inspector).toBeNull();
    } finally { hook.unmount(); }
  });

  it('saves a first drag position through undo, redo and reopening without opening Properties', async () => {
    const source = '// Preserve this comment.\n@diagram architecture\napi service as "API"\n' +
      'store database as "Store"\nrequest = api -> store\n';
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'drag.coral', text: source }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      const before = hook.result.current.canvas.nodes.find(node => node.id === 'api')!.position;
      const expected = { x: before.x + 60, y: before.y + 40 };
      const moved = source.replace('as "API"', `as "API" @ (${expected.x}, ${expected.y})`);
      act(() => hook.result.current.canvas.onSourceNodeDrag(['api'], { x: 60, y: 40 }));
      await waitFor(() => expect(hook.result.current.editor.dsl).toBe(moved));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      expect(hook.result.current.canvas.nodes.find(node => node.id === 'api')!.position).toEqual(expected);
      expect(hook.result.current.inspector).toBeNull();
      act(() => hook.result.current.canvas.onUndo());
      await waitFor(() => expect(hook.result.current.editor.dsl).toBe(source));
      act(() => hook.result.current.canvas.onRedo());
      await waitFor(() => expect(hook.result.current.editor.dsl).toBe(moved));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      const saved = hook.result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: moved });
      act(() => hook.result.current.header.onOpenFile({ name: 'reopened.coral.json', text: JSON.stringify(saved) }));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      expect(hook.result.current.editor.dsl).toBe(moved);
      expect(hook.result.current.canvas.nodes.find(node => node.id === 'api')!.position).toEqual(expected);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.inspector).toBeNull();
    } finally { hook.unmount(); }
  });
});
