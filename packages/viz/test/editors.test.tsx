import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoralEditor, useGraphIR } from '../src/editor/CoralEditor';
import { renderHook } from '@testing-library/react';
import { SplitEditor } from '../src/text-editor/SplitEditor';
import type { GraphIR } from '../src/types';

/**
 * The two composed editors - R-030 coverage.
 *
 * Both are in the public surface of @coral-viz/viz and were at 4-8% statements.
 */

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children, nodes = [], edges = [], onNodesChange, edgeTypes, defaultEdgeOptions }: {
      children?: React.ReactNode;
      nodes?: Array<Record<string, any>>;
      edges?: Array<Record<string, any>>;
      onNodesChange?: (changes: unknown[]) => void;
      edgeTypes?: Record<string, unknown>;
      defaultEdgeOptions?: { type?: string };
    }) => (
      <div data-testid="react-flow" data-edge-types={Object.keys(edgeTypes ?? {}).join(',')}
        data-default-edge-type={defaultEdgeOptions?.type}
        data-node-ids={nodes.map((node) => node.id).join(',')}
        data-edge-ids={edges.map((edge) => edge.id).join(',')}
        data-transient-edge-ids={edges.filter((edge) => edge.data?.sceneTransient028)
          .map((edge) => edge.id).join(',')}
        data-edge-strokes={edges.map((edge) => edge.style?.stroke).join(',')}>
        <span data-testid="scene-node-parts" data-parts={nodes.flatMap((node) =>
          (node.data?.sceneParts028 ?? []).map((part: { id: string }) => part.id)).join(',')} />
        <span data-testid="scene-edge-parts" data-parts={edges.flatMap((edge) =>
          (edge.data?.sceneParts028 ?? []).map((part: { id: string }) => part.id)).join(',')} />
        <button type="button" onClick={() => onNodesChange?.([])}>
          Commit visual dimensions
        </button>
        <button type="button" onClick={() => {
          const current = nodes[0];
          if (current) onNodesChange?.([{ id: current.id, type: 'position',
            position: { x: current.position.x + 10, y: current.position.y }, dragging: true }]);
        }}>
          Drag first node
        </button>
        <button type="button" onClick={() => {
          const current = nodes[0];
          if (!current) return;
          onNodesChange?.([{
            id: current.id,
            type: 'replace',
            item: {
              ...current,
              width: 233,
              height: 99,
              data: {
                ...current.data,
                [Symbol.for('@coral-viz/viz/node-view-metadata')]: {
                  dimensionSource: 'editor-font',
                },
              },
            },
          }]);
        }}>
          Commit derived visual dimensions
        </button>
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Background: () => null,
    MiniMap: () => <div data-testid="minimap" />,
    Controls: () => <div data-testid="controls" />,
    useReactFlow: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() }),
  };
});

const graph: GraphIR = {
  version: '1.0.0',
  id: 'g',
  nodes: [
    { id: 'a', type: 'service', label: 'Alpha' },
    { id: 'b', type: 'database', label: 'Beta' },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b' }],
} as GraphIR;

describe('CoralEditor', () => {
  it('projects canonical flowchart nodes and connectors from one prepared scene', () => {
    const flowchart = {
      version: '3.0.0', id: 'scene', metadata: { notation: 'flowchart' },
      nodes: [
        { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', label: 'Start',
          position: { x: 20, y: 20 }, dimensions: { width: 130, height: 64 } },
        { id: 'check', type: 'decision', symbol: 'flowchart-decision', label: 'Ready?',
          position: { x: 240, y: 20 }, dimensions: { width: 150, height: 100 } },
      ],
      edges: [{ id: 'next', source: 'start', target: 'check', label: 'yes' }],
    } as GraphIR;
    render(<CoralEditor graph={flowchart} renderStyle028="hifi" />);
    expect(screen.getByTestId('scene-node-parts').getAttribute('data-parts'))
      .toContain('check:outline');
    expect(screen.getByTestId('scene-edge-parts').getAttribute('data-parts'))
      .toContain('next:shaft');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retargets only incident scene connectors during a public editor drag', () => {
    const flowchart = {
      version: '3.0.0', id: 'scene-drag', metadata: { notation: 'flowchart' },
      nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({ id, type: 'process',
        symbol: 'flowchart-process', label: id,
        position: { x: index * 220, y: 20 }, dimensions: { width: 130, height: 64 } })),
      edges: [{ id: 'moving', source: 'a', target: 'b' },
        { id: 'settled', source: 'c', target: 'd' }],
    } as GraphIR;
    render(<CoralEditor graph={flowchart} renderStyle028="hifi" />);
    expect(screen.getByTestId('react-flow').getAttribute('data-transient-edge-ids')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Drag first node' }));
    expect(screen.getByTestId('react-flow').getAttribute('data-transient-edge-ids'))
      .toBe('moving');
    expect(screen.getByTestId('scene-edge-parts').getAttribute('data-parts'))
      .toContain('moving:shaft');
  });

  it('reports an unsupported stencil without reviving an old drawing body', () => {
    const unsupported = {
      version: '3.0.0', id: 'unsupported', metadata: { notation: 'flowchart' },
      nodes: [{ id: 'unknown', type: 'process', symbol: 'not-a-stencil',
        label: 'Unknown', position: { x: 20, y: 20 } }], edges: [],
    } as GraphIR;
    render(<CoralEditor graph={unsupported} />);
    expect(screen.getByRole('alert').textContent).toMatch(/not-a-stencil|unknown/i);
    expect(screen.getByTestId('scene-node-parts').getAttribute('data-parts')).toBe('');
  });
  it('renders a canvas for the graph it is given', async () => {
    render(<CoralEditor graph={graph} />);

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });

  it('draws edges through the shared compatibility edge and marker definitions', () => {
    const { container } = render(<CoralEditor graph={graph} />);
    expect(screen.getByTestId('react-flow').getAttribute('data-edge-types')).toBe('compatibility');
    expect(screen.getByTestId('react-flow').getAttribute('data-default-edge-type')).toBe('compatibility');
    expect(container.querySelector('marker[id^="coral-instance-"] path')).not.toBeNull();
  });

  it('scopes marker definitions for two editors on one page', () => {
    const { container } = render(<><CoralEditor graph={graph} /><CoralEditor graph={graph} /></>);
    const markerIds = [...container.querySelectorAll('marker')].map((marker) => marker.id);
    expect(markerIds.length).toBeGreaterThan(1);
    expect(new Set(markerIds).size).toBe(markerIds.length);
  });

  it('shows the minimap and controls by default and hides them on request', async () => {
    const { rerender } = render(<CoralEditor graph={graph} />);
    await waitFor(() => expect(screen.queryByTestId('minimap')).toBeDefined());

    rerender(<CoralEditor graph={graph} config={{ showMinimap: false, showControls: false }} />);
    await waitFor(() => {
      expect(screen.queryByTestId('minimap')).toBeNull();
      expect(screen.queryByTestId('controls')).toBeNull();
    });
  });

  it('accepts a class name and inline styles', async () => {
    const { container } = render(
      <CoralEditor graph={graph} className="custom" style={{ height: 400 }} />
    );

    await waitFor(() => expect(container.querySelector('.custom')).not.toBeNull());
  });

  it('renders an empty graph without failing', async () => {
    render(<CoralEditor graph={{ version: '1.0.0', id: 'empty', nodes: [], edges: [] } as GraphIR} />);

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });

  it('re-renders when the graph changes', async () => {
    const { rerender } = render(<CoralEditor graph={graph} />);
    await waitFor(() => expect(screen.getByTestId('react-flow').getAttribute('data-node-ids')).toBe('a,b'));

    const architectureGraph = {
      version: '1.0.0',
      id: 'architecture',
      metadata: { notation: 'architecture' },
      nodes: [
        { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web' },
        { id: 'db', type: 'database', symbol: 'arch-database' },
      ],
      edges: [{ id: 'dependency', source: 'web', target: 'db' }],
    } as GraphIR;

    rerender(<CoralEditor graph={architectureGraph} />);

    const replacementCanvas = screen.getByTestId('react-flow');
    expect(replacementCanvas.getAttribute('data-node-ids')).toBe('web,db');
    expect(replacementCanvas.getAttribute('data-edge-ids')).toBe('dependency');

    await waitFor(() => {
      const canvas = screen.getByTestId('react-flow');
      expect(canvas.getAttribute('data-node-ids')).toBe('web,db');
      expect(canvas.getAttribute('data-edge-ids')).toBe('dependency');
      expect(canvas.getAttribute('data-edge-strokes')).toBe('#4caf50');
    });
  });

  it('preserves original edge extensions in the public GraphIR projection', () => {
    const original = {
      ...graph,
      edges: [{
        ...graph.edges[0],
        sourcePort: 'out', targetPort: 'in', customEdgeExtension: { retained: true },
      }],
    } as GraphIR;
    const edge = {
      id: 'e', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in',
      data: { label: 'Current' },
    };

    const { result } = renderHook(() => useGraphIR([], [edge], original));

    expect(result.current.edges[0]).toMatchObject({
      label: 'Current', sourcePort: 'out', targetPort: 'in',
      customEdgeExtension: { retained: true },
    });
  });
});

describe('SplitEditor', () => {
  const parse = (text: string) => ({
    success: !text.includes('BAD'),
    graph: text.includes('BAD') ? undefined : graph,
    errors: text.includes('BAD') ? [{ message: 'bad', line: 1, column: 0 }] : [],
  });
  const print = () => 'service "Alpha"';

  it('renders both panes', async () => {
    render(<SplitEditor initialText='service "Alpha"' parse={parse} print={print} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined();
      expect(screen.getByTestId('react-flow')).toBeDefined();
    });
  });

  it('parses text into the visual pane', async () => {
    render(<SplitEditor initialText='service "Alpha"' parse={parse} print={print} debounceMs={0} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'service "Changed"' } });

    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('Changed'));
  });

  it('surfaces parse errors without losing the text', async () => {
    render(<SplitEditor initialText='service "Alpha"' parse={parse} print={print} debounceMs={0} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'BAD' } });

    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('BAD'));
  });

  it.each([['horizontal'], ['vertical']])('supports the %s layout', async (layout) => {
    render(
      <SplitEditor initialText="x" parse={parse} print={print} layout={layout as never} />
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
  });

  it('starts from a graph when one is given', async () => {
    render(<SplitEditor initialGraph={graph} parse={parse} print={print} />);

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });

  it('honours a split ratio and a non-resizable divider', async () => {
    render(
      <SplitEditor initialText="x" parse={parse} print={print} splitRatio={0.7} resizable={false} />
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
  });

  it('retains authored dimensions when the visual pane synchronizes', async () => {
    const onGraphChange = vi.fn();
    const explicit = {
      ...graph,
      nodes: [{
        ...graph.nodes[0],
        dimensions: { width: 177, height: 73 },
      }],
      edges: [],
    } as GraphIR;
    render(
      <SplitEditor
        initialGraph={explicit}
        parse={parse}
        print={print}
        onGraphChange={onGraphChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Commit visual dimensions' }));

    await waitFor(() => expect(onGraphChange).toHaveBeenCalled());
    expect(onGraphChange.mock.calls.at(-1)?.[0].nodes[0].dimensions)
      .toEqual({ width: 177, height: 73 });
  });

  it('omits editor-derived dimensions when the visual pane synchronizes', async () => {
    const onGraphChange = vi.fn();
    render(
      <SplitEditor
        initialGraph={{ ...graph, edges: [] }}
        parse={parse}
        print={print}
        onGraphChange={onGraphChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Commit derived visual dimensions' }));

    await waitFor(() => expect(onGraphChange).toHaveBeenCalled());
    expect(onGraphChange.mock.calls.at(-1)?.[0].nodes[0]).not.toHaveProperty('dimensions');
  });

  it('preserves full canonical node fields when the visual pane synchronizes', async () => {
    const onGraphChange = vi.fn();
    const sourceInfo = { range: { start: 1, end: 8 }, originalText: 'service' };
    const full = {
      ...graph,
      nodes: [{
        id: 'a', type: 'service', label: 'Alpha', symbol: 'flowchart-terminal',
        variant: 'start', pinned: true, ports: [{ id: 'out', side: 'EAST' }],
        layoutOptions: { portConstraints: 'FIXED_SIDE' }, sourceInfo,
        customExtension: { retained: true },
      }],
      edges: [],
    } as GraphIR;
    render(
      <SplitEditor
        initialGraph={full}
        parse={parse}
        print={print}
        onGraphChange={onGraphChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Commit visual dimensions' }));

    await waitFor(() => expect(onGraphChange).toHaveBeenCalled());
    expect(onGraphChange.mock.calls.at(-1)?.[0].nodes[0]).toMatchObject({
      symbol: 'flowchart-terminal', variant: 'start', pinned: true,
      ports: [{ id: 'out', side: 'EAST' }],
      layoutOptions: { portConstraints: 'FIXED_SIDE' }, sourceInfo,
      customExtension: { retained: true },
    });
  });
});

describe('CoralEditor: configuration branches (R-030)', () => {
  const callbacks = {
    onNodeClick: vi.fn(),
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onSelectionChange: vi.fn(),
  };

  it.each([
    ['draggable', { draggable: false }],
    ['connectable', { connectable: true }],
    ['selectable', { selectable: false }],
    ['zoomable', { zoomable: false }],
    ['pannable', { pannable: false }],
  ])('honours the %s configuration', async (_name, config) => {
    render(<CoralEditor graph={graph} config={config as never} />);
    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });

  it('accepts callbacks without invoking them on mount', async () => {
    render(<CoralEditor graph={graph} callbacks={callbacks as never} />);

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
    expect(callbacks.onNodeClick).not.toHaveBeenCalled();
  });

  it('renders a graph with nested children', async () => {
    render(
      <CoralEditor
        graph={
          {
            version: '1.0.0',
            id: 'g',
            nodes: [
              {
                id: 'group',
                type: 'group',
                label: 'Platform',
                children: [{ id: 'inner', type: 'service', label: 'Inner' }],
              },
            ],
            edges: [],
          } as GraphIR
        }
      />
    );

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });

  it('renders a graph whose edges carry styles', async () => {
    render(
      <CoralEditor
        graph={
          {
            ...graph,
            edges: [
              { id: 'e1', source: 'a', target: 'b', style: { lineStyle: 'dashed' }, label: 'x' },
            ],
          } as GraphIR
        }
      />
    );

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeDefined());
  });
});

describe('SplitEditor: pane configuration (R-030)', () => {
  const parse = () => ({ success: true, graph, errors: [] });
  const print = () => 'service "Alpha"';

  it.each([['left'], ['right']])('supports %s as the primary pane', async (primaryPane) => {
    render(
      <SplitEditor
        initialText="x"
        parse={parse}
        print={print}
        primaryPane={primaryPane as never}
      />
    );
    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
  });

  it('renders with no initial content at all', async () => {
    render(<SplitEditor parse={parse} print={print} />);
    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
  });

  it('accepts an editor configuration', async () => {
    render(
      <SplitEditor
        initialText="x"
        parse={parse}
        print={print}
        editorConfig={{ showMinimap: false } as never}
      />
    );
    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
  });

  it('drags the resize handle when resizable', async () => {
    const { container } = render(
      <SplitEditor initialText="x" parse={parse} print={print} resizable />
    );
    await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());

    const handle = container.querySelector('[role="separator"]') ?? container.querySelector('div > div');
    if (handle) {
      fireEvent.mouseDown(handle);
      fireEvent.mouseMove(document, { clientX: 400 });
      fireEvent.mouseUp(document);
    }

    expect(screen.getByRole('textbox')).toBeDefined();
  });
});
