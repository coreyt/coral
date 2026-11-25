/**
 * CanvasPane Tests
 *
 * Behavioral tests for the extracted CanvasPane component.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { CanvasPane, type CanvasPaneProps } from '../../src/components/CanvasPane';

const testViewport = vi.hoisted(() => ({ x: 0, y: 0, zoom: 1 }));

const capturedNodeClass = vi.hoisted(() => vi.fn());
const capturedEdges = vi.hoisted(() => vi.fn());
const capturedDeleteKeyCode = vi.hoisted(() => vi.fn());
const endpointMarkerDefinitions = vi.hoisted(() => vi.fn((_props: { edges: unknown[] }) => null));
const sceneMarkerDefinitions = vi.hoisted(() => vi.fn((_props: { scene: unknown }) => null));
const capturedFlowProps = vi.hoisted(() => vi.fn());

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children, nodes = [], edges = [], deleteKeyCode, ...flowProps }: any) => <div data-testid="react-flow"
      data-node-positions={nodes.map((node: any) => `${node.id}:${node.position.x},${node.position.y}`).join(';')}
      onPointerDownCapture={(event) => {
      capturedNodeClass((event.target as Element).closest('.react-flow__node')?.classList.contains('nokey'));
    }}>{capturedDeleteKeyCode(deleteKeyCode)}{capturedFlowProps(flowProps)}{capturedEdges(edges)}{nodes.map((node: any) => <div key={node.id} className={`react-flow__node ${node.className ?? ''}`} data-id={node.id} tabIndex={0} data-testid="test-node">Node</div>)}{edges.map((edge: any) => <div key={edge.id} className="react-flow__edge" data-id={edge.id} tabIndex={0}>Edge</div>)}{children}</div>,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Background: () => null,
    MiniMap: () => <div data-testid="minimap" />,
    useReactFlow: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() }),
    useViewport: () => testViewport,
  };
});

vi.mock('@coral-viz/viz', async (importOriginal) => ({
  useAxisConstrain: (await importOriginal<typeof import('@coral-viz/viz')>()).useAxisConstrain,
  SymbolNode: () => null,
  CompatibilityEdge: () => null,
  EndpointMarkerDefinitions: endpointMarkerDefinitions,
  SpatialSceneMarkerDefs028: sceneMarkerDefinitions,
  SpatialSceneArtworkDefs029: () => null,
  EditProvider: ({ children }: any) => <div>{children}</div>,
}));

const defaultTheme: Record<string, string> = {
  canvasBg: '#1e1e1e',
  canvasText: '#666666',
  canvasStatusBg: '#252526',
  canvasStatusText: '#888888',
  gridColor: '#333333',
  miniMapBg: '#1e1e1e',
  miniMapBorder: '#333333',
  miniMapMask: 'rgba(0,0,0,0.5)',
  floatingToolbarBg: '#2d2d2d',
  floatingToolbarShadow: 'rgba(0,0,0,0.3)',
  controlBgHover: '#3a3a3a',
  controlText: '#cccccc',
  controlBorder: '#444444',
};

function defaultProps(overrides: Partial<CanvasPaneProps> = {}): CanvasPaneProps {
  return {
    nodes: [],
    edges: [],
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onLabelEdit: vi.fn(),
    onReflow: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    isReflowing: false,
    isLoading: false,
    showMinimap: true,
    showControls: true,
    notation: 'flowchart',
    theme: defaultTheme,
    ...overrides,
  };
}

describe('CanvasPane', () => {
  it('forwards a large-scene keyboard position when no pointer drag occurred', () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({ id: `n${index}`,
      type: 'symbol', position: { x: index * 120, y: 0 }, data: { label: `Node ${index}` } })) as any[];
    const scene028 = { parts: [], nodes: nodes.map((node) => ({ node: { id: node.id },
      x: node.position.x, y: 0, width: 120, height: 60 })),
    viewport: { shiftX: 0, shiftY: 0 }, fontFaces: [] } as unknown as
      NonNullable<CanvasPaneProps['scene028']>;
    const onNodesChange = vi.fn();
    render(<CanvasPane {...defaultProps({ nodes, scene028, onNodesChange })} />);
    const movement = [{ id: 'n0', type: 'position', position: { x: 5, y: 0 }, dragging: false }];
    act(() => capturedFlowProps.mock.lastCall![0].onNodesChange(movement));
    expect(onNodesChange).toHaveBeenCalledExactlyOnceWith(movement);
  });

  for (const terminal of ['stop', 'change'] as const) it.each(['horizontal', 'vertical', 'release'] as const)(
    `constrains buffered source drag (%s) through ${terminal} terminal event once`, (axis) => {
      const nodes = [{ id: 'api', type: 'symbol', position: { x: 100, y: 200 },
        selected: true, data: { label: 'API' } }] as any[];
      const scene028 = { parts: [], nodes: [{ node: { id: 'api' }, x: 100, y: 200,
        width: 120, height: 60 }], viewport: { shiftX: 0, shiftY: 0 }, fontFaces: [] } as unknown as
        NonNullable<CanvasPaneProps['scene028']>;
      const onSourceNodeDrag = vi.fn();
      const onNodesChange = vi.fn();
      render(<CanvasPane {...defaultProps({ nodes, scene028, sourceNodeDragEnabled: true,
        onSourceNodeDrag, onNodesChange })} />);
      const raw = axis === 'vertical' ? { x: 118, y: 280 } : { x: 180, y: 218 };
      const locked = axis === 'vertical' ? { x: 100, y: 280 } : { x: 180, y: 200 };
      try {
        fireEvent.keyDown(window, { key: 'Shift' });
        act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStart());
        act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
          { id: 'api', type: 'position', position: raw, dragging: true },
        ]));
        expect(screen.getByTestId('react-flow').getAttribute('data-node-positions'))
          .toBe(`api:${locked.x},${locked.y}`);
        if (axis === 'release') fireEvent.keyUp(window, { key: 'Shift' });
        const final = axis === 'release' ? { x: 195, y: 230 } : raw;
        // XYFlow may use either terminal callback; a duplicate must be quiet.
        const stop = () => act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStop(null,
          { id: 'api', position: final }));
        const change = () => act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
          { id: 'api', type: 'position', position: final, dragging: false },
        ]));
        if (terminal === 'stop') { stop(); change(); } else { change(); stop(); }
        const expected = axis === 'release' ? final : locked;
        expect(onSourceNodeDrag).toHaveBeenCalledExactlyOnceWith(['api'],
          { x: expected.x - 100, y: expected.y - 200 });
        expect(onNodesChange).not.toHaveBeenCalled();
      } finally { fireEvent.keyUp(window, { key: 'Shift' }); }
    });

  it('edits a Coral connector label from a canvas double click', () => {
    const edge = { id: 'read', source: 'api', target: 'store', label: 'Reads' } as any;
    const onEdgeLabelEdit = vi.fn(() => true);
    render(<CanvasPane {...defaultProps({ edges: [edge], edgeLabelEditable: true,
      onEdgeLabelEdit, mutationsDisabled: true })} />);
    act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick', { clientX: 100, clientY: 120 }), edge));
    const input = screen.getByRole('textbox', { name: 'Connector label for read' });
    expect((input as HTMLInputElement).value).toBe('Reads');
    fireEvent.change(input, { target: { value: 'Reads orders' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdgeLabelEdit).toHaveBeenCalledExactlyOnceWith('read', 'Reads orders');
    expect(screen.queryByRole('textbox', { name: 'Connector label for read' })).toBeNull();
  });

  it('removes an authored connector label without committing an explicit empty label', () => {
    const edge = { id: 'read', source: 'api', target: 'store', label: '' } as any;
    const onEdgeLabelEdit = vi.fn(() => true);
    const onEdgeLabelRemove = vi.fn(() => true);
    render(<CanvasPane {...defaultProps({ edges: [edge], edgeLabelEditable: true,
      onEdgeLabelEdit, onEdgeLabelRemove })} />);
    act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick'), edge));
    fireEvent.click(screen.getByRole('button', { name: 'Remove connector label' }));
    expect(onEdgeLabelRemove).toHaveBeenCalledExactlyOnceWith('read');
    expect(onEdgeLabelEdit).not.toHaveBeenCalled();
  });

  it('does not offer or commit a stale connector-label edit', () => {
    const edge = { id: 'read', source: 'api', target: 'store', label: 'Reads' } as any;
    const onEdgeLabelEdit = vi.fn(() => true);
    const onEdgeLabelRemove = vi.fn(() => true);
    const props = defaultProps({ edges: [edge], edgeLabelEditable: true,
      edgeLabelSourceRevision: 'source-a', onEdgeLabelEdit, onEdgeLabelRemove });
    const { rerender } = render(<CanvasPane {...props} />);
    act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick'), edge));
    expect(screen.getByRole('textbox', { name: 'Connector label for read' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove connector label' })).toBeDefined();
    rerender(<CanvasPane {...props} edges={[{ ...edge, label: 'Changed elsewhere' }]} />);
    expect(screen.queryByRole('textbox', { name: 'Connector label for read' })).toBeNull();
    expect(onEdgeLabelEdit).not.toHaveBeenCalled();
    expect(onEdgeLabelRemove).not.toHaveBeenCalled();
    rerender(<CanvasPane {...props} />);
    act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick'), edge));
    expect(screen.getByRole('textbox', { name: 'Connector label for read' })).toBeDefined();
    rerender(<CanvasPane {...props} edgeLabelSourceRevision="source-b" />);
    expect(screen.queryByRole('textbox', { name: 'Connector label for read' })).toBeNull();
    expect(onEdgeLabelEdit).not.toHaveBeenCalled();
    expect(onEdgeLabelRemove).not.toHaveBeenCalled();
    rerender(<CanvasPane {...props} edgeLabelEditable={false} />);
    act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick'), edge));
    expect(screen.queryByRole('textbox', { name: 'Connector label for read' })).toBeNull();
  });

  it('cancels a canvas connector-label edit with Escape and allows a later edit', () => {
    const edge = { id: 'read', source: 'api', target: 'store', label: 'Reads' } as any;
    const onEdgeLabelEdit = vi.fn(() => true);
    render(<CanvasPane {...defaultProps({ edges: [edge], edgeLabelEditable: true,
      onEdgeLabelEdit })} />);
    const open = () => act(() => capturedFlowProps.mock.lastCall![0].onEdgeDoubleClick(
      new MouseEvent('dblclick'), edge));
    open();
    const first = screen.getByRole('textbox', { name: 'Connector label for read' });
    fireEvent.change(first, { target: { value: 'Discard' } });
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(onEdgeLabelEdit).not.toHaveBeenCalled();
    open();
    const second = screen.getByRole('textbox', { name: 'Connector label for read' });
    fireEvent.change(second, { target: { value: 'Keep' } });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onEdgeLabelEdit).toHaveBeenCalledExactlyOnceWith('read', 'Keep');
  });

  it('retargets only incident connectors during a buffered scene drag', () => {
    capturedFlowProps.mockClear();
    capturedEdges.mockClear();
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `n${index}`, type: 'symbol', position: { x: index * 120, y: 0 },
      data: { label: `Node ${index}` },
      ...(index === 4 ? { parentId: 'n0' } : {}),
    })) as any[];
    const edges = [
      { id: 'moved', source: 'n0', target: 'n1' },
      { id: 'child', source: 'n4', target: 'n5' },
      { id: 'settled', source: 'n2', target: 'n3' },
    ] as any[];
    const scene028 = { parts: [], nodes: nodes.map((node) => ({ node: { id: node.id },
      x: node.position.x, y: 0, width: 120, height: 60 })),
    viewport: { shiftX: 0, shiftY: 0 }, fontFaces: [] } as unknown as
      NonNullable<CanvasPaneProps['scene028']>;
    const props = defaultProps({ nodes, edges, scene028 });
    const { rerender } = render(<CanvasPane {...props} />);
    const settledBefore = capturedEdges.mock.lastCall![0].find((edge: any) => edge.id === 'settled');
    act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStart());
    act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
      { id: 'n0', type: 'position', position: { x: 24, y: 12 }, dragging: true },
    ]));
    const projected = capturedEdges.mock.lastCall![0] as any[];
    expect(projected.find((edge) => edge.id === 'moved')?.data.sceneTransient028).toBe(true);
    expect(projected.find((edge) => edge.id === 'child')?.data.sceneTransient028).toBe(true);
    expect(projected.find((edge) => edge.id === 'settled')?.data.sceneTransient028).toBe(false);
    expect(projected.find((edge) => edge.id === 'settled')).toBe(settledBefore);
    act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
      { id: 'n0', type: 'position', position: { x: 48, y: 24 }, dragging: true },
    ]));
    const next = capturedEdges.mock.lastCall![0] as any[];
    expect(next.find((edge) => edge.id === 'settled')).toBe(settledBefore);
    expect(next.find((edge) => edge.id === 'moved')).toBe(projected.find((edge) => edge.id === 'moved'));
    expect(screen.getByTestId('react-flow').getAttribute('data-node-positions')).toContain('n0:48,24');
    const replacement = { id: 'settled:shaft', owner: { kind: 'edge', id: 'settled' } };
    rerender(<CanvasPane {...props} edges={edges.map((edge) => edge.id === 'settled'
      ? { ...edge, data: { label: 'Updated' } } : edge)}
    scene028={{ ...scene028, parts: [replacement] as unknown as typeof scene028.parts,
      viewport: { ...scene028.viewport, shiftX: 8, shiftY: 9 } }} />);
    const refreshed = capturedEdges.mock.lastCall![0].find((edge: any) => edge.id === 'settled');
    expect(refreshed).not.toBe(settledBefore);
    expect(refreshed.data).toMatchObject({ label: 'Updated', sceneParts028: [replacement],
      sceneShift028: { x: 8, y: 9 }, sceneTransient028: false });
  });

  it('cancels a buffered large-scene drag on window blur', () => {
    capturedFlowProps.mockClear();
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `n${index}`, type: 'symbol', position: { x: index * 120, y: 0 },
      data: { label: `Node ${index}` },
    })) as any[];
    const scene028 = { parts: [], nodes: nodes.map((node) => ({ node: { id: node.id },
      x: node.position.x, y: 0, width: 120, height: 60 })),
      viewport: { shiftX: 0, shiftY: 0 }, fontFaces: [] } as unknown as
      NonNullable<CanvasPaneProps['scene028']>;
    const onNodesChange = vi.fn();
    render(<CanvasPane {...defaultProps({ nodes, scene028, onNodesChange })} />);
    act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStart());
    act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
      { id: 'n0', type: 'position', position: { x: 24, y: 12 }, dragging: true },
    ]));
    expect(screen.getByTestId('react-flow').getAttribute('data-node-positions'))
      .toMatch(/^n0:24,12;/);
    fireEvent(window, new Event('blur'));
    expect(screen.getByTestId('react-flow').getAttribute('data-node-positions'))
      .toMatch(/^n0:0,0;/);
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('buffers a scene node drag locally and commits its final position once', () => {
    capturedFlowProps.mockClear();
    const onNodesChange = vi.fn();
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `n${index + 1}`, type: 'symbol', position: { x: index * 120, y: 0 },
      data: { label: `Node ${index + 1}` },
    })) as any[];
    const scene028 = { parts: [], nodes: nodes.map((node) => ({ node: { id: node.id },
      x: node.position.x, y: 0, width: 120, height: 60 })), viewport: { shiftX: 0, shiftY: 0 },
      fontFaces: [] } as unknown as NonNullable<CanvasPaneProps['scene028']>;
    const { rerender } = render(<CanvasPane {...defaultProps({ nodes,
      scene028, onNodesChange })} />);
    act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStart());
    act(() => capturedFlowProps.mock.lastCall![0].onNodesChange([
      { id: 'n1', type: 'position', position: { x: 24, y: 12 }, dragging: true },
    ]));
    expect(onNodesChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('react-flow').getAttribute('data-node-positions'))
      .toMatch(/^n1:24,12;/);
    expect(screen.getByLabelText('Diagram editor').getAttribute('data-coral-scene-transient')).toBe('true');
    act(() => capturedFlowProps.mock.lastCall![0].onNodeDragStop(null,
      { id: 'n1', position: { x: 24, y: 12 } }));
    expect(onNodesChange).toHaveBeenCalledTimes(1);
    expect(onNodesChange).toHaveBeenCalledWith([{ id: 'n1', type: 'position',
      position: { x: 24, y: 12 }, dragging: false }]);
    rerender(<CanvasPane {...defaultProps({ nodes: [{ ...nodes[0],
      position: { x: 24, y: 12 } }], scene028, onNodesChange })} />);
    expect(screen.getByLabelText('Diagram editor').getAttribute('data-coral-scene-transient')).toBe('false');
  });
  it('shows empty state overlay when no nodes', () => {
    render(<CanvasPane {...defaultProps({ nodes: [] })} />);

    const emptyState = screen.getByTestId('empty-state');
    expect(emptyState).toBeDefined();
    expect(emptyState.textContent).toContain('No diagram to display');
    expect(emptyState.textContent).toContain('Edit the DSL to add nodes');
  });

  it('shows the current zoom between zoom-out and zoom-in controls', () => {
    const nodes = [
      { id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'n2', type: 'symbol', position: { x: 100, y: 0 }, data: { label: 'B' } },
      { id: 'n3', type: 'symbol', position: { x: 200, y: 0 }, data: { label: 'C' } },
    ] as any[];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ] as any[];

    render(<CanvasPane {...defaultProps({ nodes, edges, notation: 'bpmn' })} />);

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas controls' });
    expect(screen.getByLabelText('Current zoom').textContent).toBe('100%');
    expect([...toolbar.children].slice(0, 3).map((element) => element.getAttribute('aria-label')))
      .toEqual(['Zoom out', 'Current zoom', 'Zoom in']);
  });

  it('defines endpoint markers from the current scene without using the old marker body', () => {
    endpointMarkerDefinitions.mockClear();
    sceneMarkerDefinitions.mockClear();
    const edges = [{ id: 'e1', source: 'n1', target: 'n2', markerEnd: 'url(#coral-marker-x)' }] as any[];
    const scene028 = { parts: [], nodes: [], viewport: { shiftX: 0, shiftY: 0 },
      fontFaces: [] } as unknown as NonNullable<CanvasPaneProps['scene028']>;
    render(<CanvasPane {...defaultProps({ edges, scene028 })} />);
    expect(sceneMarkerDefinitions.mock.lastCall?.[0]).toMatchObject({ scene: scene028,
      namespace: expect.any(String) });
    expect(endpointMarkerDefinitions).not.toHaveBeenCalled();
    expect(edges[0].data).toBeUndefined();
  });

  it('calls onReflow when reflow button is clicked', () => {
    const onReflow = vi.fn();
    // Need at least one node so the reflow button is enabled (disabled when nodes.length === 0)
    const nodes = [
      { id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } },
    ] as any[];

    render(<CanvasPane {...defaultProps({ onReflow, nodes })} />);

    const reflowButton = screen.getByLabelText('Reflow layout');
    fireEvent.click(reflowButton);

    expect(onReflow).toHaveBeenCalledOnce();
  });

  it('shows a structured source-update status without making it a live announcement', () => {
    const onUndo = vi.fn();
    const reason = 'Updating source. Canvas editing is temporarily unavailable.';
    const nodes = [{ id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } }] as any[];
    // The controller always pairs a source-pending status with the mutation lock.
    render(<CanvasPane {...defaultProps({
      nodes,
      canUndo: true,
      undoCount: 1,
      onUndo,
      mutationsDisabled: true,
      mutationDisabledReason: reason,
      statusText: 'Parsed: 1 node',
      updateStatus: { kind: 'source-pending', message: reason },
    })} />);

    const overlay = screen.getByTestId('visible-update-status');
    expect(overlay.textContent).toBe(reason);
    // The overlay is display-only; the canvas live region is the only announcer.
    expect(overlay.getAttribute('role')).toBeNull();
    expect(overlay.getAttribute('aria-live')).toBeNull();
    // It does not block selection or pan beneath it (design §8.3, CR94-F7).
    expect(overlay.style.pointerEvents).toBe('none');
    expect(screen.getByTestId('canvas-status').textContent).toBe('Parsed: 1 node');
    expect((screen.getByLabelText('Reflow layout') as HTMLButtonElement).disabled).toBe(true);
    const undo = screen.getByLabelText('Undo (1 available)') as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(undo.title).toBe(reason);
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('locks authored canvas controls but keeps view controls while mutations are disabled (TR94-F6)', () => {
    const reason = 'Updating diagram. Editing is temporarily unavailable.';
    const reflowReason = 'Finish the current diagram update before Reflow.';
    const nodes = [{ id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } }] as any[];
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onReflow = vi.fn();
    const { rerender } = render(<CanvasPane {...defaultProps({
      nodes, canUndo: true, canRedo: true, undoCount: 2, redoCount: 1, onUndo, onRedo, onReflow,
      mutationsDisabled: true, mutationDisabledReason: reason, reflowDisabledReason: reflowReason,
    })} />);
    // Reflow carries its own copy under any owner (design §12, CR94-F2).
    for (const [name, title] of [
      ['Undo (2 available)', reason], ['Redo (1 available)', reason], ['Reflow layout', reflowReason],
    ] as const) {
      const control = screen.getByLabelText(name) as HTMLButtonElement;
      expect({ name, disabled: control.disabled, title: control.title }).toEqual({ name, disabled: true, title });
      fireEvent.click(control);
    }
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    expect(onReflow).not.toHaveBeenCalled();
    for (const name of ['Zoom out', 'Zoom in', 'Fit diagram to view']) {
      expect({ name, disabled: (screen.getByLabelText(name) as HTMLButtonElement).disabled }).toEqual({ name, disabled: false });
    }
    expect(capturedFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
      nodesDraggable: false, nodesConnectable: false, edgesReconnectable: false, elementsSelectable: true,
    }));

    rerender(<CanvasPane {...defaultProps({
      nodes, mutationsDisabled: true, sourceConnectionsEnabled: true,
    })} />);
    expect(capturedFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
      nodesDraggable: false, nodesConnectable: true, edgesReconnectable: false, elementsSelectable: true,
    }));

    rerender(<CanvasPane {...defaultProps({
      nodes, canUndo: true, canRedo: true, undoCount: 2, redoCount: 1, onUndo, onRedo, onReflow,
      mutationsDisabled: false, mutationDisabledReason: undefined,
    })} />);
    for (const name of ['Undo (2 available)', 'Redo (1 available)', 'Reflow layout']) {
      expect({ name, disabled: (screen.getByLabelText(name) as HTMLButtonElement).disabled }).toEqual({ name, disabled: false });
    }
    expect(capturedFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
      nodesDraggable: true, nodesConnectable: true, edgesReconnectable: true, elementsSelectable: true,
    }));
  });

  it('keeps source-owned history available while structural canvas gestures remain locked', () => {
    const nodes = [{ id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } }] as any[];
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<CanvasPane {...defaultProps({ nodes, mutationsDisabled: true,
      historyDisabled: false, canUndo: true, canRedo: true, undoCount: 1, redoCount: 1,
      onUndo, onRedo })} />);
    expect((screen.getByLabelText('Reflow layout') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Undo (1 available)'));
    fireEvent.click(screen.getByLabelText('Redo (1 available)'));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('titles Reflow with its refusal only while Reflow is unavailable (CR94-F2)', () => {
    const reflowReason = 'Finish the current diagram update before Reflow.';
    const nodes = [{ id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } }] as any[];
    const reflow = () => screen.getByLabelText('Reflow layout') as HTMLButtonElement;
    // A passive owner disables Reflow alone.
    const { rerender } = render(<CanvasPane {...defaultProps({
      nodes, reflowDisabled: true, reflowDisabledReason: reflowReason,
    })} />);
    expect({ disabled: reflow().disabled, title: reflow().title }).toEqual({ disabled: true, title: reflowReason });
    // An empty canvas is not an update refusal.
    rerender(<CanvasPane {...defaultProps({ nodes: [] })} />);
    expect({ disabled: reflow().disabled, title: reflow().title })
      .toEqual({ disabled: true, title: 'Reflow Layout (Ctrl+Shift+L)' });
    rerender(<CanvasPane {...defaultProps({ nodes })} />);
    expect({ disabled: reflow().disabled, title: reflow().title })
      .toEqual({ disabled: false, title: 'Reflow Layout (Ctrl+Shift+L)' });
  });

  it('keys the update overlay on structured status rather than status-text wording (DR94-F4)', () => {
    const nodes = [{ id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } }] as any[];
    const { rerender } = render(<CanvasPane {...defaultProps({
      nodes, statusText: 'Updating labels is complete', updateStatus: null,
    })} />);
    expect(screen.queryByTestId('visible-update-status')).toBeNull();

    rerender(<CanvasPane {...defaultProps({
      nodes,
      statusText: 'Updating diagram. Editing is temporarily unavailable.',
      updateStatus: { kind: 'structural-layout', message: 'Updating diagram. Editing is temporarily unavailable.' },
    })} />);
    expect(screen.getByTestId('visible-update-status').textContent)
      .toBe('Updating diagram. Editing is temporarily unavailable.');
    expect(screen.getByTestId('canvas-status').textContent)
      .toBe('Updating diagram. Editing is temporarily unavailable.');
  });

  it('applies minimap and controls preferences independently', () => {
    const nodes = [
      { id: 'n1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'A' } },
    ] as any[];
    const { rerender } = render(<CanvasPane {...defaultProps({
      nodes,
      showMinimap: false,
      showControls: true,
    })} />);

    expect(screen.queryByTestId('minimap')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Canvas controls' })).toBeDefined();

    rerender(<CanvasPane {...defaultProps({
      nodes,
      showMinimap: true,
      showControls: false,
    })} />);

    expect(screen.getByTestId('minimap')).toBeDefined();
    expect(screen.queryByRole('toolbar', { name: 'Canvas controls' })).toBeNull();
  });

  it('keeps canvas commands active while visual controls are hidden', () => {
    const onDeleteSelection = vi.fn();
    render(<CanvasPane {...defaultProps({
      nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: {} }],
      onDeleteSelection,
      showControls: false,
    })} />);

    expect(screen.queryByRole('toolbar', { name: 'Canvas controls' })).toBeNull();
    fireEvent.keyDown(screen.getByTestId('test-node'), { key: 'Delete' });
    expect(onDeleteSelection).toHaveBeenCalledOnce();
  });
});


describe('Shift capture routing', () => {
  it('marks only Shift primary node capture and removes its marker before keyboard input', async () => {
    render(<CanvasPane {...defaultProps({ nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: {} }] })} />);
    const node = screen.getByTestId('test-node');
    const pointer = (options = {}) => Object.assign(new Event('pointerdown', { bubbles: true }), {
      shiftKey: true, isPrimary: true, button: 0, ...options,
    });
    fireEvent(node, pointer());
    expect(capturedNodeClass).toHaveBeenLastCalledWith(true);
    await Promise.resolve();
    expect(node.classList.contains('nokey')).toBe(false);
    for (const options of [{ shiftKey: false }, { isPrimary: false }, { button: 2 }]) {
      fireEvent(node, pointer(options));
      expect(capturedNodeClass).toHaveBeenLastCalledWith(false);
    }
    node.classList.add('nokey');
    fireEvent(node, pointer());
    await Promise.resolve();
    expect(node.classList.contains('nokey')).toBe(true);
  });
});


it('identifies arrow dispatch from a focusable node descendant but excludes editable controls', () => {
  const onNodeKeyboardMove = vi.fn();
  render(<CanvasPane {...defaultProps({ onNodeKeyboardMove, nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: {} }] })} />);
  const node = screen.getByTestId('test-node');
  const child = document.createElement('span');
  child.tabIndex = 0;
  node.append(child);
  fireEvent.keyDown(child, { key: 'ArrowRight', shiftKey: true });
  expect(onNodeKeyboardMove).toHaveBeenCalledWith('ArrowRight', true, expect.any(KeyboardEvent));
  onNodeKeyboardMove.mockClear();
  for (const tag of ['input', 'textarea', 'select']) {
    const control = document.createElement(tag);
    node.append(control);
    fireEvent.keyDown(control, { key: 'ArrowRight' });
  }
  child.setAttribute('contenteditable', 'true');
  fireEvent.keyDown(child, { key: 'ArrowDown' });
  fireEvent.keyDown(node, { key: 'Enter' });
  expect(onNodeKeyboardMove).not.toHaveBeenCalled();
});

it('owns Delete and Backspace without intercepting native editors', () => {
  const onDeleteSelection = vi.fn();
  render(<CanvasPane {...defaultProps({
    onDeleteSelection,
    nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: {} }],
  })} />);
  const node = screen.getByTestId('test-node');
  const deletion = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
  node.dispatchEvent(deletion);
  expect(deletion.defaultPrevented).toBe(true);
  expect(onDeleteSelection).toHaveBeenCalledOnce();
  expect(capturedDeleteKeyCode).toHaveBeenLastCalledWith(null);

  const input = document.createElement('input');
  node.append(input);
  const nativeBackspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
  input.dispatchEvent(nativeBackspace);
  expect(nativeBackspace.defaultPrevented).toBe(false);
  expect(onDeleteSelection).toHaveBeenCalledOnce();
});

it('clears the full keyboard selection on Escape without intercepting a text editor', () => {
  const onNodesChange = vi.fn();
  const onEdgesChange = vi.fn();
  render(<CanvasPane {...defaultProps({
    nodes: [
      { id: 'first', position: { x: 0, y: 0 }, data: {}, selected: true },
      { id: 'second', position: { x: 40, y: 0 }, data: {}, selected: true },
    ],
    edges: [{ id: 'link', source: 'first', target: 'second', selected: true }],
    onNodesChange, onEdgesChange,
  })} />);
  const focused = screen.getAllByTestId('test-node')[1];
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  focused.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(onNodesChange).toHaveBeenCalledWith([
    { id: 'first', type: 'select', selected: false },
    { id: 'second', type: 'select', selected: false },
  ]);
  expect(onEdgesChange).toHaveBeenCalledWith([{ id: 'link', type: 'select', selected: false }]);

  const input = document.createElement('input');
  focused.append(input);
  const textEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  input.dispatchEvent(textEscape);
  expect(textEscape.defaultPrevented).toBe(false);
  expect(onNodesChange).toHaveBeenCalledOnce();
  expect(onEdgesChange).toHaveBeenCalledOnce();
});

it('focuses a created connection when React Flow publishes its element after the request', async () => {
  const request = { token: 1, kind: 'edge' as const, id: 'late' };
  const props = defaultProps({ focusRequest: request });
  const { rerender } = render(<CanvasPane {...props} />);
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
  rerender(<CanvasPane {...props} edges={[{ id: 'late', source: 'a', target: 'b' }]} />);
  await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-id')).toBe('late'));
});

it('cancels an unfulfilled focus request when its source action is superseded', async () => {
  const props = defaultProps({ focusRequest: { token: 1, kind: 'edge', id: 'stale' } });
  const { rerender } = render(<CanvasPane {...props} />);
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
  rerender(<CanvasPane {...props} focusRequest={null}
    edges={[{ id: 'stale', source: 'a', target: 'b' }]} />);
  expect(document.activeElement?.getAttribute('data-id')).not.toBe('stale');
});

it('fulfills tokenized focus requests by exact node and edge data IDs', async () => {
  const nodes = [{ id: 'node[1]', position: { x: 0, y: 0 }, data: {} }] as any[];
  const edges = [{ id: 'edge"1', source: 'node[1]', target: 'node[1]' }] as any[];
  const { rerender } = render(<CanvasPane {...defaultProps({
    nodes, edges, focusRequest: { token: 1, kind: 'node', id: 'node[1]' },
  })} />);
  await vi.waitFor(() => expect((document.activeElement as HTMLElement).dataset.id).toBe('node[1]'));

  rerender(<CanvasPane {...defaultProps({
    nodes, edges, focusRequest: { token: 2, kind: 'edge', id: 'edge"1' },
  })} />);
  await vi.waitFor(() => expect((document.activeElement as HTMLElement).dataset.id).toBe('edge"1'));
});


describe('node label offset handle admission', () => {
  const fixture = (owner = 'team.api') => {
    const node = { id: owner, position: { x: 300, y: 200 }, selected: true,
      data: { label: 'API', canonical: { id: owner, type: 'service', label: 'API', labelPlacement: { side: 'below', offset: 12 } } } };
    const scene = { nodes: [{ node: { id: owner }, x: 300, y: 200, width: 120, height: 60 }],
      viewport: { shiftX: 50, shiftY: 100 }, fontFaces: [],
      parts: [{ id: `${owner}:label:1`, owner: { kind: 'node', id: owner }, role: 'node-label',
        bounds: { x: 380, y: 450, width: 80, height: 20 } }] } as unknown as NonNullable<CanvasPaneProps['scene028']>;
    return { node, scene };
  };
  const pointer = (element: HTMLElement, type: string, pointerId: number, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    fireEvent(element, event);
  };

  it('converts zoomed nested world coordinates and ignores unrelated pointers', () => {
    Object.assign(testViewport, { x: 20, y: 30, zoom: 2 });
    const { node, scene } = fixture();
    const commit = vi.fn(() => true);
    try {
      render(<CanvasPane {...defaultProps({ nodes: [node], scene028: scene, nodeLabelPlacementEditable: true,
        nodeLabelPlacementRevision: 'basis', onNodeLabelPlacementEdit: commit })} />);
      const handle = screen.getByRole('button', { name: 'Move label for team.api' });
      handle.setPointerCapture = vi.fn();
      expect(handle.style.left).toBe('760px');
      expect(handle.style.top).toBe('750px');
      pointer(handle, 'pointerdown', 1, 760, 750);
      pointer(handle, 'pointerup', 2, 760, 790);
      expect(commit).not.toHaveBeenCalled();
      pointer(handle, 'pointerup', 1, 760, 790);
      expect(commit).toHaveBeenCalledExactlyOnceWith('team.api', { side: 'below', offset: 32 }, 'basis');
    } finally { Object.assign(testViewport, { x: 0, y: 0, zoom: 1 }); }
  });

  it.each(['pan', 'zoom', 'side', 'basis', 'selection'] as const)('cancels a captured gesture after %s changes', (change) => {
    Object.assign(testViewport, { x: 0, y: 0, zoom: 1 });
    const { node, scene } = fixture();
    const commit = vi.fn(() => true);
    const props = defaultProps({ nodes: [node], scene028: scene, nodeLabelPlacementEditable: true,
      nodeLabelPlacementRevision: 'basis', onNodeLabelPlacementEdit: commit });
    const { rerender } = render(<CanvasPane {...props} />);
    const handle = screen.getByRole('button', { name: 'Move label for team.api' });
    handle.setPointerCapture = vi.fn();
    pointer(handle, 'pointerdown', 1, 10, 10);
    if (change === 'pan') testViewport.x = 20;
    if (change === 'zoom') testViewport.zoom = 2;
    const next = change === 'selection' ? fixture('other.api') : { node, scene };
    if (change === 'side') next.node.data.canonical.labelPlacement = { side: 'right', offset: 12 };
    rerender(<CanvasPane {...props} nodes={[next.node]} scene028={next.scene}
      nodeLabelPlacementRevision={change === 'basis' ? 'new-basis' : 'basis'} />);
    const current = screen.getByRole('button', { name: `Move label for ${next.node.id}` });
    pointer(current, 'pointerup', 1, 10, 40);
    expect(commit).not.toHaveBeenCalled();
    Object.assign(testViewport, { x: 0, y: 0, zoom: 1 });
  });
});
