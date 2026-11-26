// Future 0.2.10 cancellation internals with a mocked hook; not 0.2.9 AI availability evidence.
import { EXPECTED_RELEASE_VERSION } from '../src/guidanceContent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const llm = vi.hoisted(() => ({
  abortActive: vi.fn(),
  submit: vi.fn().mockResolvedValue(undefined),
  askAboutDiagnostic: vi.fn(),
  isGenerating: false,
  onGenerated: null as null | ((dsl: string, format: 'coral' | 'mermaid', graph?: any, revision?: number) => Promise<unknown>),
}));

vi.mock('../src/hooks/useLlmChat', () => ({
  useLlmChat: (options: any) => {
    llm.onGenerated = options.onDslGenerated;
    return ({
    chatEntries: [], isGenerating: llm.isGenerating, hasApiKey: true,
    turnCount: 0,
    providers: [], apiKey: 'test-key', setApiKey: vi.fn(),
    submit: llm.submit, askAboutDiagnostic: llm.askAboutDiagnostic,
    confirmAction: vi.fn(), cancelAction: vi.fn(), clearChat: vi.fn(),
    abortActive: llm.abortActive,
    });
  },
}));

vi.mock('../src/AppView', () => ({
  AppView: ({ controller }: any) => <div>
    <output data-testid="reflowing">{String(controller.canvas.isReflowing)}</output>
    <output data-testid="node-count">{controller.canvas.nodes.length}</output>
    <button onClick={() => controller.header.onOpenFile({
      name: 'requests.mmd', text: 'flowchart TD\na[A] --> b[B]',
    })}>Load Mermaid</button>
    <button onClick={() => controller.editor.onPromptSubmit('first')}>Submit prompt</button>
    <button onClick={() => controller.editor.onAskAboutDiagnostic({
      edgeId: 'edge', severity: 'warning', sourceLabel: 'A', targetLabel: 'B', message: 'warning',
    })}>Ask diagnostic</button>
    <button onClick={() => controller.editor.onDslChange('flowchart TD\nchanged[Changed]')}>Edit document</button>
  </div>,
}));
vi.mock('../src/components/CanvasPane', () => ({ CanvasPane: () => <div /> }));
vi.mock('../src/components/InspectorPane', () => ({ InspectorPane: () => <div /> }));
vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout(graph: any) {
      const place = (container: any): any => {
        const children = container.children ?? [];
        const strideX = Math.max(1000, ...children.map((node: any) => (Number(node.width) || 0) + 80));
        const strideY = Math.max(1000, ...children.map((node: any) => (Number(node.height) || 0) + 80));
        return { ...container, children: children.map((node: any, index: number) => ({
          ...place(node), x: node.x ?? index * strideX, y: node.y ?? index * strideY,
        })) };
      };
      return Promise.resolve(place(graph));
    }
  },
}));

import App from '../src/App';
import { useEditorControllerWithProperties as useEditorController } from './fixtures/useEditorControllerWithProperties';

describe('App LLM cancellation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llm.isGenerating = false;
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('hands prompt and diagnostic supersession to the hook but aborts on document edits', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('reflowing').textContent).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Load Mermaid' }));
    await waitFor(() => expect(screen.getByTestId('node-count').textContent).toBe('2'));
    await waitFor(() => expect(screen.getByTestId('reflowing').textContent).toBe('false'));
    llm.abortActive.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Submit prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask diagnostic' }));
    await waitFor(() => expect(llm.submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(llm.askAboutDiagnostic).toHaveBeenCalledTimes(1));
    expect(llm.abortActive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    expect(llm.abortActive).toHaveBeenCalledTimes(1);
  });

  // S93-WI-10/11 / R-054 AC-1: starting a request neither invalidates the AI
  // revision nor cancels layout; a Reflow that completes during generation
  // still makes the candidate stale; other rejections carry their reason.
  async function loadedController() {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => hook.result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: { name: 'Requests', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'requests',
        nodes: [{ id: 'a', type: 'service', label: 'A' }, { id: 'b', type: 'service', label: 'B' }],
        edges: [{ id: 'ab', source: 'a', target: 'b' }],
      } },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }));
    await waitFor(() => expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(hook.result.current.canvas.isReflowing).toBe(false));
    return hook;
  }

  it('starts prompt and diagnostic requests without advancing the AI revision', async () => {
    const { result } = await loadedController();
    await act(async () => { await result.current.editor.onPromptSubmit('first'); });
    await act(async () => { await result.current.editor.onPromptSubmit('repeat'); });
    act(() => result.current.editor.onAskAboutDiagnostic({
      edgeId: 'ab', severity: 'warning', sourceLabel: 'A', targetLabel: 'B', message: 'warning',
    }));
    const revisions = [
      ...llm.submit.mock.calls.map((call: any[]) => call[1].revision),
      ...llm.askAboutDiagnostic.mock.calls.map((call: any[]) => call[1].revision),
    ];
    expect(revisions).toHaveLength(3);
    expect(new Set(revisions).size).toBe(1);
    expect(typeof revisions[0]).toBe('number');
  });

  it('treats a candidate as stale when a user Reflow completes during generation', async () => {
    const { result } = await loadedController();
    act(() => result.current.canvas.onReflow());
    expect(result.current.canvas.isReflowing).toBe(true);
    await act(async () => { await result.current.editor.onPromptSubmit('rename'); });
    const revision = llm.submit.mock.calls.at(-1)![1].revision;
    await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
    let outcome: unknown;
    await act(async () => { outcome = await llm.onGenerated?.('@diagram architecture\na service as "A"\nb service as "B"', 'coral', undefined, revision); });
    expect(outcome).toBe(false);
  });

  it('ignores Ask Diagnostic while a request is active, leaving the panel unchanged', async () => {
    const { result } = await loadedController();
    llm.isGenerating = true;
    // The tab change re-renders the controller with the active request.
    act(() => result.current.editor.onBottomPanelTabChange('diagnostics'));
    act(() => result.current.editor.onAskAboutDiagnostic({
      edgeId: 'ab', severity: 'warning', sourceLabel: 'A', targetLabel: 'B', message: 'warning',
    }));
    expect(llm.askAboutDiagnostic).not.toHaveBeenCalled();
    expect(result.current.editor.bottomPanelTab).toBe('diagnostics');
  });

  // Found by the Slice 92 pairwise supplement (PS-01/PS-03): the candidate's
  // @diagram header is the notation authority, as for typed source (R-063 AC-4).
  it('applies the notation named by an accepted candidate header', async () => {
    const { result } = await loadedController();
    await act(async () => { await result.current.editor.onPromptSubmit('switch notation'); });
    const revision = llm.submit.mock.calls.at(-1)![1].revision;
    let outcome: unknown;
    await act(async () => {
      outcome = await llm.onGenerated?.(
        '@diagram architecture\na service as "A"\nb service as "B"\nab = a -> b',
        'coral', undefined, revision);
    });
    expect(outcome).toBe(true);
    await waitFor(() => expect(result.current.canvas.notation).toBe('architecture'));
    expect(result.current.header.onSave().settings.notation).toBe('architecture');
    expect(result.current.editor.dsl).toMatch(/^@diagram architecture/);
  });

  it('rejects a generated candidate with an unsafe port as a source error', async () => {
    const { result } = await loadedController();
    await act(async () => { await result.current.editor.onPromptSubmit('connect'); });
    const revision = llm.submit.mock.calls.at(-1)![1].revision;
    let outcome: unknown;
    await act(async () => {
      outcome = await llm.onGenerated?.('@diagram architecture\na service as "A"\nb service as "B"\nab = a:nope -> b', 'coral', undefined, revision);
    });
    expect(outcome).toMatchObject({ applied: false, reason: 'source-errors' });
    expect((outcome as { message: string }).message).toContain('missing source port nope on a');
  });

  it('reports generated source errors as a reasoned rejection, not staleness', async () => {
    const { result } = await loadedController();
    await act(async () => { await result.current.editor.onPromptSubmit('break it'); });
    const revision = llm.submit.mock.calls.at(-1)![1].revision;
    let outcome: unknown;
    await act(async () => { outcome = await llm.onGenerated?.('@diagram architecture\na service as "Unclosed', 'coral', undefined, revision); });
    expect(outcome).toMatchObject({ applied: false, reason: 'source-errors' });
  });

  it('captures immediate inspector edits in LLM undo and clears that history on document load', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Waypoint source',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '1.0.0', id: 'waypoint-source',
          nodes: [
            { id: 'source', type: 'service', label: 'Source' },
            { id: 'target', type: 'service', label: 'Target' },
          ],
          edges: [{ id: 'source-target', source: 'source', target: 'target' }],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
      edgeRouting: {
        'source-target': {
          isPinned: true,
          bendPoints: [],
          waypoints: [{ id: 'opaque-history-point', x: 17.25, y: 42.75, type: 'consumer-curve' }],
        },
      },
    }));
    await waitFor(() => expect(result.current.canvas.nodes[0].id).toBe('source'));
    const nodeId = result.current.canvas.nodes[0].id;

    act(() => result.current.inspector?.onPropertyChange({
      nodeId,
      field: 'description',
      oldValue: undefined,
      newValue: 'latest inspector description',
    }));
    await act(async () => {
      await llm.onGenerated?.('@diagram architecture\ngenerated service as "Generated"', 'coral', {
        version: '3.0.0', id: 'generated',
        nodes: [{ id: 'generated', type: 'service', label: 'Generated' }],
        edges: [],
      });
    });
    act(() => result.current.canvas.onUndo());
    await waitFor(() => {
      expect(result.current.canvas.nodes[0].data.description).toBe('latest inspector description');
      expect(result.current.canvas.edges[0].data?.waypoints).toEqual([
        { id: 'opaque-history-point', x: 17.25, y: 42.75, type: 'consumer-curve' },
      ]);
    });

    await act(async () => {
      await llm.onGenerated?.('@diagram architecture\ngenerated service as "Generated again"', 'coral', {
        version: '3.0.0', id: 'generated-again',
        nodes: [{ id: 'generated-again', type: 'service', label: 'Generated again' }],
        edges: [],
      });
    });
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Replacement',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '1.0.0', id: 'replacement',
          nodes: [{ id: 'replacement', type: 'service', label: 'Replacement' }],
          edges: [],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }));
    expect(result.current.canvas.canUndo).toBe(false);
    act(() => result.current.canvas.onUndo());
    expect(result.current.canvas.nodes[0].id).toBe('replacement');
  });
});
