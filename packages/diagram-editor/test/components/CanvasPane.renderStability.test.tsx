import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasPane, type CanvasPaneProps } from '../../src/components/CanvasPane';

const observed = vi.hoisted(() => ({ flow: vi.fn(), edge: vi.fn() }));

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return { ...actual, ReactFlow: (props: Parameters<typeof actual.ReactFlow>[0]) => {
    observed.flow(props);
    return <actual.ReactFlow {...props} />;
  }, Background: () => null, MiniMap: () => null };
});

vi.mock('@coral-viz/viz', async (importOriginal) => {
  const { useAxisConstrain } = await importOriginal<typeof import('@coral-viz/viz')>();
  const { memo } = await import('react');
  const { Handle, Position } = await import('@xyflow/react');
  return {
    useAxisConstrain,
    SymbolNode: () => <div><Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} /></div>,
    CompatibilityEdge: memo((props: { id: string; sourceX: number; sourceY: number;
      targetX: number; targetY: number }) => {
      observed.edge(props);
      return <path data-testid={`edge-${props.id}`}
        d={`M${props.sourceX},${props.sourceY} L${props.targetX},${props.targetY}`} />;
    }),
    SpatialSceneMarkerDefs028: () => null,
    SpatialSceneArtworkDefs029: () => null,
    EditProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('CanvasPane actual React Flow update boundary', () => {
  it('does not redraw a nonincident edge during buffered node motion and still commits the moved node', async () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `n${index}`, type: 'symbol', position: { x: index * 120, y: 0 },
      width: 100, height: 60, measured: { width: 100, height: 60 },
      handles: [
        { type: 'source' as const, position: 'right' as const, x: 100, y: 30, width: 1, height: 1 },
        { type: 'target' as const, position: 'left' as const, x: 0, y: 30, width: 1, height: 1 },
      ],
      data: { label: `Node ${index}` },
    }));
    const onNodesChange = vi.fn();
    const props: CanvasPaneProps = {
      nodes: nodes as CanvasPaneProps['nodes'],
      edges: [{ id: 'incident', source: 'n0', target: 'n1', type: 'compatibility' },
        { id: 'settled', source: 'n2', target: 'n3', type: 'compatibility' }],
      scene028: { parts: [], nodes: nodes.map((node) => ({ node: { id: node.id },
        x: node.position.x, y: 0, width: 100, height: 60 })),
      viewport: { shiftX: 0, shiftY: 0 }, fontFaces: [] } as unknown as
        NonNullable<CanvasPaneProps['scene028']>,
      onNodesChange, onEdgesChange: vi.fn(), onSelectionChange: vi.fn(),
      onLabelEdit: vi.fn(), onReflow: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      canUndo: false, canRedo: false, undoCount: 0, redoCount: 0,
      isReflowing: false, isLoading: false, showMinimap: false, showControls: false,
      renderStyle028: 'lowfi', onRenderStyle028Change: vi.fn(), notation: 'flowchart',
      theme: {},
    };
    const count = (id: string) => observed.edge.mock.calls.filter(([p]) => p.id === id).length;
    render(<CanvasPane {...props} />);
    await waitFor(() => expect(count('settled')).toBeGreaterThan(0));
    act(() => observed.flow.mock.lastCall![0].onNodeDragStart());
    act(() => observed.flow.mock.lastCall![0].onNodesChange([
      { id: 'n0', type: 'position', position: { x: 24, y: 12 }, dragging: true },
    ]));
    const settled = count('settled');
    const incident = count('incident');
    const beforeX = observed.edge.mock.calls.filter(([p]) => p.id === 'incident').at(-1)![0].sourceX;
    act(() => observed.flow.mock.lastCall![0].onNodesChange([
      { id: 'n0', type: 'position', position: { x: 48, y: 24 }, dragging: true },
    ]));
    expect(count('incident')).toBeGreaterThan(incident);
    expect(observed.edge.mock.calls.filter(([p]) => p.id === 'incident').at(-1)![0].sourceX)
      .toBe(beforeX + 24);
    expect(count('settled')).toBe(settled);
    expect(onNodesChange).not.toHaveBeenCalled();
    act(() => observed.flow.mock.lastCall![0].onNodeDragStop(null,
      { id: 'n0', position: { x: 48, y: 24 } }));
    expect(onNodesChange).toHaveBeenCalledExactlyOnceWith([
      { id: 'n0', type: 'position', position: { x: 48, y: 24 }, dragging: false },
    ]);
  });
});
