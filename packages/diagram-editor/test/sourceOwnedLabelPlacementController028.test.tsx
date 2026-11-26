import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorControllerWithProperties as useEditorController } from './fixtures/useEditorControllerWithProperties';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({ matches: false, media: query,
  onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false })) as typeof window.matchMedia;

const source = '@diagram architecture\n// Keep this comment.\n' +
  "api service as 'API' label below offset 12 @ (120, 80) pinned\n" +
  'store database @ (500, 80) pinned\n';

async function open(hook: ReturnType<typeof renderHook<ReturnType<typeof useEditorController>, unknown>>, text = source) {
  act(() => hook.result.current.header.onOpenFile({ name: 'labels.coral', text }));
  await waitFor(() => expect(hook.result.current.editor.dsl).toBe(text));
  await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
  await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
  act(() => {
    hook.result.current.canvas.onNodesChange([{ type: 'select', id: 'api', selected: true }]);
    hook.result.current.canvas.onSelectionChange({ nodes: hook.result.current.canvas.nodes.filter((node) => node.id === 'api'), edges: [] });
  });
}

const snapshot = (controller: ReturnType<typeof useEditorController>) => ({
  text: controller.editor.dsl,
  nodes: controller.canvas.nodes.map(({ id, position }) => ({ id, position })),
  edges: controller.canvas.edges,
  undo: controller.canvas.undoCount,
  redo: controller.canvas.redoCount,
  busy: controller.canvas.updateStatus,
});

describe('atomic source-owned node label placement transaction', () => {
  beforeEach(() => { window.localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('publishes exact text and geometry synchronously with Properties agreement, history and reopen', async () => {
    const hook = renderHook(() => useEditorController());
    try {
      await open(hook);
      const before = snapshot(hook.result.current);
      const basis = hook.result.current.canvas.nodeLabelPlacementRevision;
      act(() => expect(hook.result.current.canvas.onNodeLabelPlacementEdit('api', { side: 'right', offset: 20 }, basis)).toBe(true));
      const edited = source.replace('label below offset 12', 'label right offset 20');
      expect(hook.result.current.editor.dsl).toBe(edited);
      expect(hook.result.current.canvas.isLoading).toBe(false);
      expect(hook.result.current.canvas.updateStatus).toBeNull();
      expect(hook.result.current.canvas.nodes.map(({ id, position }) => ({ id, position }))).toEqual(before.nodes);
      expect(hook.result.current.inspector?.nodeLabelPlacement).toEqual({ side: 'right', offset: 20 });
      expect(hook.result.current.canvas.undoCount).toBe(before.undo + 1);
      act(() => hook.result.current.canvas.onUndo());
      expect(hook.result.current.editor.dsl).toBe(source);
      act(() => hook.result.current.canvas.onRedo());
      expect(hook.result.current.editor.dsl).toBe(edited);
      const saved = hook.result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
      act(() => hook.result.current.header.onOpenFile({ name: 'saved.coral.json', text: JSON.stringify(saved) }));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.editor.dsl).toBe(edited);
    } finally { hook.unmount(); }
  });

  it('retains the accepted semantic-port waypoint route after placement admission', async () => {
    const text = '@diagram architecture\n' +
      'api service as "API" label below offset 12 @ (120, 80) pinned {\n' +
      ' outbound port [direction: out, anchor: E]\n}\n' +
      'store database @ (500, 80) pinned\nrequest = api:outbound -> store\n' +
      'route edge request {\n bend = waypoint relative to port api:outbound offset (20, 0)\n}\n';
    const hook = renderHook(() => useEditorController());
    try {
      await open(hook, text);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      const routes = hook.result.current.canvas.scene028!.parts.filter((part) => part.owner.kind === 'edge');
      const basis = hook.result.current.canvas.nodeLabelPlacementRevision;
      act(() => expect(hook.result.current.canvas.onNodeLabelPlacementEdit('api', { side: 'above', offset: 20 }, basis)).toBe(true));
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.canvas.scene028!.parts.filter((part) => part.owner.kind === 'edge')).toEqual(routes);
    } finally { hook.unmount(); }
  });

  it.each(['stale', 'wrong selection', 'collision', 'no-op'] as const)('keeps accepted source/history/geometry for %s', async (mode) => {
    const text = mode === 'collision' ? source + 'obstacle service @ (220, 80) pinned\n' : source;
    const hook = renderHook(() => useEditorController());
    try {
      await open(hook, text);
      const before = snapshot(hook.result.current);
      const basis = hook.result.current.canvas.nodeLabelPlacementRevision;
      act(() => {
        const accepted = hook.result.current.canvas.onNodeLabelPlacementEdit(
          mode === 'wrong selection' ? 'store' : 'api',
          mode === 'no-op' ? { side: 'below', offset: 12 } : { side: 'right', offset: 10 },
          mode === 'stale' ? `${basis}:old` : basis);
        expect(accepted).toBe(mode === 'no-op');
      });
      expect(snapshot(hook.result.current)).toEqual(before);
    } finally { hook.unmount(); }
  });
});
