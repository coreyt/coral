import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayoutRequest, LayoutResult } from '@coral-viz/render/layout';

const { runEditorLayout } = vi.hoisted(() => ({ runEditorLayout: vi.fn() }));
vi.mock('../src/layoutWorkerClient', () => ({ runEditorLayout }));

import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

interface PendingLayout {
  request: LayoutRequest;
  signal?: AbortSignal;
  resolve: (result: LayoutResult) => void;
  reject: (reason: Error) => void;
}

const pending: PendingLayout[] = [];
let defer = false;

function resultFor(request: LayoutRequest, late = false): LayoutResult {
  const nodes: LayoutResult['nodes'] = [];
  const walk = (values: LayoutRequest['nodes'], parentId?: string, offset = { x: 0, y: 0 }) => {
    values.forEach((node, index) => {
      const position = late ? { x: 9999, y: 9999 } : node.position ?? { x: index * 100, y: index * 80 };
      const absolutePosition = { x: offset.x + position.x, y: offset.y + position.y };
      nodes.push({ id: node.id, ...(parentId ? { parentId } : {}), position, absolutePosition,
        width: node.width, height: node.height });
      walk(node.children ?? [], node.id, absolutePosition);
    });
  };
  walk(request.nodes);
  return { nodes, edges: [], width: 500, height: 500, effectiveOptions: {}, diagnostics: [] };
}

const replacement = {
  schemaVersion: '1.0.0' as const,
  metadata: { name: 'Replacement', created: '2026-09-10T00:00:00.000Z', modified: '2026-09-10T00:00:00.000Z' },
  content: { format: 'graph-ir' as const, graphIR: {
    version: '1.0.0' as const, id: 'replacement',
    nodes: [{ id: 'replacement', type: 'service', label: 'Replacement' }], edges: [],
  } },
  settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' as const } },
};

describe('editor layout ownership superseders', () => {
  beforeEach(() => {
    pending.length = 0;
    defer = false;
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    runEditorLayout.mockReset().mockImplementation((request: LayoutRequest, options: { signal?: AbortSignal }) => {
      if (!defer) return Promise.resolve(resultFor(request));
      return new Promise((resolve, reject) => pending.push({ request, signal: options.signal, resolve, reject }));
    });
  });

  const cases: Array<{
    name: string;
    setup?: () => void;
    supersede: (view: ReturnType<typeof useEditorController>, unmount: () => void) => void;
  }> = [
    { name: 'edit', supersede: (view) => view.editor.onDslChange('service "newer"') },
    { name: 'newer layout', supersede: (view) => { void view.canvas.onReflow(); } },
    { name: 'load', supersede: (view) => view.header.onLoad(replacement) },
    {
      name: 'recovery replacement',
      setup: () => window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
        timestamp: Date.now(), documentName: 'Recovered', dslType: 'mermaid',
        dsl: 'graph TD\nR[Recovered]', notation: 'flowchart', nodePositions: {}, document: replacement,
      })),
      supersede: (view) => view.recovery.onRecover(),
    },
    { name: 'notation change', supersede: (view) => view.commandPalette.commands.find((item) => item.id === 'notation-arch')!.action() },
    { name: 'unmount', supersede: (_view, unmount) => unmount() },
  ];

  it.each(cases)('aborts and rejects a late result when superseded by $name', async ({ setup, supersede }) => {
    setup?.();
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    defer = true;
    act(() => { void hook.result.current.canvas.onReflow(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    const old = pending[0];
    defer = false;
    act(() => supersede(hook.result.current, hook.unmount));
    expect(old.signal?.aborted).toBe(true);
    await act(async () => {
      old.resolve(resultFor(old.request, true));
      await Promise.resolve();
    });
    if (setup === undefined || !old.signal) {
      expect(hook.result.current?.canvas.nodes.some((node) => node.position.x === 9999)).not.toBe(true);
    }
    if (old.signal && !old.signal.aborted) hook.unmount();
  });

  it.each(['format', 'undo', 'redo'] as const)('refuses the non-actionable authored Coral %s while Reflow owns the layout', async (action) => {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    const before = {
      dsl: hook.result.current.editor.dsl,
      type: hook.result.current.editor.dslType,
      undo: hook.result.current.canvas.undoCount,
      redo: hook.result.current.canvas.redoCount,
    };
    expect(before).toMatchObject({ type: 'coral', undo: 0, redo: 0 });
    defer = true;
    act(() => { void hook.result.current.canvas.onReflow(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    const old = pending[0]!;
    act(() => {
      if (action === 'format') hook.result.current.editor.onDslTypeChange('coral');
      else if (action === 'undo') hook.result.current.canvas.onUndo();
      else hook.result.current.canvas.onRedo();
    });
    expect(old.signal?.aborted).toBe(false);
    expect({
      dsl: hook.result.current.editor.dsl,
      type: hook.result.current.editor.dslType,
      undo: hook.result.current.canvas.undoCount,
      redo: hook.result.current.canvas.redoCount,
    }).toEqual(before);
    expect(hook.result.current.guidanceAnnouncement).toContain('Edit this 0.2.8 diagram in Coral source');
    defer = false;
    await act(async () => { old.resolve(resultFor(old.request)); });
    hook.unmount();
  });

  it.each(['undo', 'redo'] as const)('aborts a delayed Reflow for an actionable authored Coral %s', async (action) => {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    const original = hook.result.current.editor.dsl;
    const edited = `${original}\nadded process as "Added"\n`;
    act(() => hook.result.current.editor.onDslChange(edited));
    await waitFor(() => expect(hook.result.current.editor.editorAnalysis.source).toBe(edited));
    await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
    expect(hook.result.current.canvas.undoCount).toBeGreaterThan(0);
    if (action === 'redo') {
      act(() => hook.result.current.canvas.onUndo());
      await waitFor(() => expect(hook.result.current.editor.dsl).toBe(original));
      expect(hook.result.current.canvas.redoCount).toBeGreaterThan(0);
    }

    defer = true;
    act(() => { void hook.result.current.canvas.onReflow(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    const old = pending[0]!;
    defer = false;
    act(() => action === 'undo' ? hook.result.current.canvas.onUndo() : hook.result.current.canvas.onRedo());
    expect(old.signal?.aborted).toBe(true);
    expect(hook.result.current.editor.dsl).toBe(action === 'undo' ? original : edited);
    await act(async () => { old.resolve(resultFor(old.request, true)); });
    expect(hook.result.current.canvas.nodes.some((node) => node.position.x === 9999)).toBe(false);
    hook.unmount();
  });

  it.each(['style', 'theme'] as const)('retries a late reflow after a %s change at the same source revision', async (setting) => {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    defer = true;
    act(() => { void hook.result.current.canvas.onReflow(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    const old = pending[0]!;
    const sourceRevision = hook.result.current.canvas.scene028?.revision;
    act(() => setting === 'style' ? hook.result.current.canvas.onRenderStyle028Change('hifi')
      : hook.result.current.preferences.onUserPreferencesChange({ theme: 'dark' }));
    expect(hook.result.current.canvas.scene028?.revision).not.toBe(sourceRevision);
    await act(async () => { old.resolve(resultFor(old.request, true)); });
    await waitFor(() => expect(pending).toHaveLength(2));
    const fresh = pending[1]!;
    await act(async () => { fresh.resolve(resultFor(fresh.request)); });
    if (setting === 'style') expect(hook.result.current.canvas.renderStyle028).toBe('hifi');
    else expect(hook.result.current.themeName).toBe('dark');
    expect(hook.result.current.canvas.nodes.some((node) => node.position.x === 9999)).toBe(false);
    hook.unmount();
  });

  it.each(['style', 'theme'] as const)('does not publish an error from an obsolete %s layout', async (setting) => {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    defer = true;
    act(() => { void hook.result.current.canvas.onReflow(); });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => setting === 'style' ? hook.result.current.canvas.onRenderStyle028Change('hifi')
      : hook.result.current.preferences.onUserPreferencesChange({ theme: 'dark' }));
    await act(async () => { pending[0]!.reject(new Error('old font layout failed')); });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[1]!.resolve(resultFor(pending[1]!.request)); });
    if (setting === 'style') expect(hook.result.current.canvas.renderStyle028).toBe('hifi');
    else expect(hook.result.current.themeName).toBe('dark');
    expect(hook.result.current.editor.parseErrors.some((error) =>
      error.message.includes('Reflow failed; existing geometry was retained.'))).toBe(false);
    hook.unmount();
  });
});
