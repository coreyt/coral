import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { layoutFailure028 } = vi.hoisted(() => ({ layoutFailure028: {
  style: null as 'lowfi' | 'hifi' | null,
  pending: [] as Array<{ reject: (error: Error) => void }>,
} }));
vi.mock('../src/hooks/diagramUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/diagramUtils')>();
  return { ...actual, layoutNodes: (...args: Parameters<typeof actual.layoutNodes>) => {
    if (args[11] === layoutFailure028.style) {
      return new Promise<Awaited<ReturnType<typeof actual.layoutNodes>>>((_resolve, reject) =>
        layoutFailure028.pending.push({ reject }));
    }
    return actual.layoutNodes(...args);
  } };
});
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({ matches: false, media: query,
  onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false })) as typeof window.matchMedia;
const source = '@diagram architecture\n' +
  'layout [algorithm: layered, direction: RIGHT, edgeRouting: POLYLINE, nodeNode: 40, layerSpacing: 60]\n' +
  'api service as "API" @ (120, 100) pinned\nstore database as "Store" @ (500, 100) pinned\n' +
  'request = api -> store as "Request"\n' +
  'constraint caption: label node api above edge request [preferred, gap: 8]\n';

describe('source-owned typed spatial publication', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    layoutFailure028.style = null;
    layoutFailure028.pending.length = 0;
  });
  it.each([
    ['BPMN branch', '../../browser/test/fixtures/acceptance028/bpmn-branch.coral', 6],
    ['AI/ML model caption', '../src/example-sources/aiml.coral', 4],
  ] as const)('publishes %s through the actual editor measurement and scene adapters', async (_name, file, count) => {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'geometry.coral', text }));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.editor.parseErrors.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(hook.result.current.canvas.nodes).toHaveLength(count);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.canvas.scene028).toBeDefined();
      expect(hook.result.current.editor.dsl).toBe(text);
    } finally { hook.unmount(); }
  });
  it('does not impose view-default routing style on an exact authored route', async () => {
    const text = '@diagram architecture\napi service @ (20, 20) pinned\nstore database @ (500, 20) pinned\n' +
      'request = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:out offset (20, 20)\n}\n';
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'authored-route.coral', text }));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.editor.parseErrors.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.canvas.edges).toHaveLength(1);
      expect(hook.result.current.editor.dsl).toBe(text);
    } finally { hook.unmount(); }
  });
  it('publishes the AI/ML example when typed over an existing flowchart', async () => {
    const file = '../src/example-sources/aiml.coral';
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const hook = renderHook(() => useEditorController());
    try {
      await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      act(() => hook.result.current.editor.onDslChange(text));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      expect(hook.result.current.editor.parseErrors.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(hook.result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['dataset', 'training', 'model', 'inference']);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.editor.dsl).toBe(text);
    } finally { hook.unmount(); }
  });
  it('publishes located rejected hints and preferences with exact source and unchanged history after Reflow', async () => {
    const text = '@diagram architecture\na service @ (0, 0) pinned\nb service @ (200, 0) pinned\n' +
      'e = a ------> b\norder = arrange row: a, b\nconstraint soft: node a above node b [preferred]\n';
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'rejected-hints.coral', text }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      const history = hook.result.current.canvas.undoCount;
      for (const reflow of [false, true]) {
        if (reflow) {
          act(() => hook.result.current.canvas.onReflow());
          await waitFor(() => expect(hook.result.current.canvas.isReflowing).toBe(false));
        }
        expect(hook.result.current.editor.parseErrors).toContainEqual(expect.objectContaining({
          code: 'layout.proximity.rejected', severity: 'warning', line: 4,
          range: expect.objectContaining({ start: expect.objectContaining({ line: 4 }) }),
        }));
        expect(hook.result.current.editor.parseErrors).toContainEqual(expect.objectContaining({
          code: 'layout.constraint.preferred-rejected', severity: 'warning', line: 6,
        }));
        expect(hook.result.current.canvas.sceneError028).toBeUndefined();
        expect(hook.result.current.editor.dsl).toBe(text);
        expect(hook.result.current.canvas.undoCount).toBe(history);
      }
    } finally { hook.unmount(); }
  });
  it('executes typed source controls, renews style measurements, and preserves exact source/history across Reflow', async () => {
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'typed-spatial.coral', text: source }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.editor.dsl).toBe(source);
      const history = hook.result.current.canvas.undoCount;
      const positions = hook.result.current.canvas.nodes.map(({ id, position }) => ({ id, position }));
      for (const style of ['hifi', 'lowfi'] as const) {
        act(() => hook.result.current.canvas.onRenderStyle028Change(style));
        await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
        await waitFor(() => expect(hook.result.current.canvas.sceneError028).toBeUndefined());
        expect(hook.result.current.canvas.scene028).toBeDefined();
        expect(hook.result.current.editor.dsl).toBe(source);
        expect(hook.result.current.canvas.undoCount).toBe(history);
        expect(hook.result.current.canvas.nodes.map(({ id, position }) => ({ id, position }))).toEqual(positions);
      }
      act(() => hook.result.current.canvas.onReflow());
      await waitFor(() => expect(hook.result.current.canvas.isReflowing).toBe(false));
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.editor.dsl).toBe(source);
      expect(hook.result.current.canvas.undoCount).toBe(history);
      let saved!: ReturnType<typeof hook.result.current.header.onSave>;
      act(() => { saved = hook.result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    } finally { hook.unmount(); }
  });
  it('recovers a rejected style by revalidating the accepted source in its prior style', async () => {
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'typed-spatial.coral', text: source }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      const history = hook.result.current.canvas.undoCount;
      const positions = hook.result.current.canvas.nodes.map(({ id, position }) => ({ id, position }));
      layoutFailure028.style = 'hifi';
      act(() => hook.result.current.canvas.onRenderStyle028Change('hifi'));
      await waitFor(() => expect(layoutFailure028.pending).toHaveLength(1));
      await act(async () => { layoutFailure028.pending[0]!.reject(new Error('rejected hifi measurement')); });
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.editor.parseErrors.some((error) => error.message.includes('rejected hifi measurement'))).toBe(true);
      act(() => hook.result.current.canvas.onRenderStyle028Change('lowfi'));
      await waitFor(() => expect(hook.result.current.editor.parseErrors.some((error) =>
        error.message.includes('rejected hifi measurement'))).toBe(false));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.canvas.scene028).toBeDefined();
      expect(hook.result.current.editor.dsl).toBe(source);
      expect(hook.result.current.canvas.undoCount).toBe(history);
      expect(hook.result.current.canvas.nodes.map(({ id, position }) => ({ id, position }))).toEqual(positions);
    } finally { hook.unmount(); }
  });

  it('discards a late failure measured in an obsolete style and publishes the newer context', async () => {
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'typed-spatial.coral', text: source }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      const history = hook.result.current.canvas.undoCount;
      layoutFailure028.style = 'hifi';
      act(() => hook.result.current.canvas.onRenderStyle028Change('hifi'));
      await waitFor(() => expect(layoutFailure028.pending).toHaveLength(1));
      act(() => hook.result.current.canvas.onRenderStyle028Change('lowfi'));
      await act(async () => { layoutFailure028.pending[0]!.reject(new Error('obsolete hifi measurement')); });
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(hook.result.current.canvas.renderStyle028).toBe('lowfi');
      expect(hook.result.current.editor.parseErrors.some((error) => error.message.includes('obsolete hifi measurement'))).toBe(false);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      expect(hook.result.current.canvas.scene028).toBeDefined();
      expect(hook.result.current.editor.dsl).toBe(source);
      expect(hook.result.current.canvas.undoCount).toBe(history);
    } finally { hook.unmount(); }
  });

  it('claims the style renewal owner in the style action itself, once', async () => {
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'typed-spatial.coral', text: source }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
      const history = hook.result.current.canvas.undoCount;
      layoutFailure028.style = 'hifi';
      // Reflow in the same task, before any effect runs, must meet the owner.
      act(() => {
        hook.result.current.canvas.onRenderStyle028Change('hifi');
        void hook.result.current.canvas.onReflow();
      });
      expect(hook.result.current.guidanceAnnouncement).toBe('Finish the current diagram update before Reflow.');
      expect(hook.result.current.canvas.isReflowing).toBe(false);
      expect(hook.result.current.canvas.reflowDisabledReason).toBe('Finish the current diagram update before Reflow.');
      await waitFor(() => expect(layoutFailure028.pending).toHaveLength(1));
      await act(async () => { layoutFailure028.pending[0]!.reject(new Error('held hifi measurement')); });
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      expect(layoutFailure028.pending).toHaveLength(1);
      expect(hook.result.current.canvas.reflowDisabledReason).toBeUndefined();
      expect(hook.result.current.editor.dsl).toBe(source);
      expect(hook.result.current.canvas.undoCount).toBe(history);
    } finally { hook.unmount(); }
  });

  it('retains exact authored unpinned coordinates through source-owned Reflow', async () => {
    const text = '@diagram architecture\n' +
      'api service as "API" @ (123, 234)\n' +
      'store database as "Store" @ (654, 345) pinned\nrequest = api -> store\n';
    const hook = renderHook(() => useEditorController());
    try {
      act(() => hook.result.current.header.onOpenFile({ name: 'exact-positions.coral', text }));
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      const history = hook.result.current.canvas.undoCount;
      act(() => hook.result.current.canvas.onReflow());
      await waitFor(() => expect(hook.result.current.canvas.isReflowing).toBe(false));
      expect(hook.result.current.canvas.nodes.find((node) => node.id === 'api')?.position).toEqual({ x: 123, y: 234 });
      expect(hook.result.current.canvas.nodes.find((node) => node.id === 'store')?.position).toEqual({ x: 654, y: 345 });
      expect(hook.result.current.editor.dsl).toBe(text);
      expect(hook.result.current.canvas.undoCount).toBe(history);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
    } finally { hook.unmount(); }
  });

});
