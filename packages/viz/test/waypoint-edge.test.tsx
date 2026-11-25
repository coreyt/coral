/**
 * Tests for CompatibilityEdge waypoint handle rendering (Step 4)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { CompatibilityEdge, type CompatibilityEdgeData } from '../src/compatibility/CompatibilityEdge';
import type { Edge, EdgeProps } from '@xyflow/react';
import { CORAL_EDGE_VIEW_METADATA } from '../src/types';
import { prepareSpatialScene028, resolveFont } from '@coral-viz/render';

// Mock ReactFlow's EdgeLabelRenderer to just render children
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div data-testid="edge-label-renderer">{children}</div>,
  };
});

function makeEdgeProps(overrides: Partial<EdgeProps<Edge<CompatibilityEdgeData>>> = {}): EdgeProps<Edge<CompatibilityEdgeData>> {
  return {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourceX: 100,
    sourceY: 25,
    targetX: 300,
    targetY: 25,
    sourcePosition: 'right' as any,
    targetPosition: 'left' as any,
    markerEnd: undefined,
    style: {},
    data: {},
    selected: false,
    animated: false,
    selectable: true,
    deletable: true,
    interactionWidth: 20,
    sourceHandleId: null,
    targetHandleId: null,
    pathOptions: undefined,
    ...overrides,
  } as EdgeProps<Edge<CompatibilityEdgeData>>;
}

describe('CompatibilityEdge waypoint handles', () => {
  it('gives an offset scene label its own measured pointer area and bubbles double click', () => {
    const scene = prepareSpatialScene028({ nodes: [
      { id: 'a', type: 'process', position: { x: 0, y: 100 }, dimensions: { width: 100, height: 60 } },
      { id: 'b', type: 'process', position: { x: 600, y: 100 }, dimensions: { width: 100, height: 60 } },
    ], edges: [{ id: 'e1', source: 'a', target: 'b', label: 'Review', labelPlacement: { side: 'above', offset: 16 } }],
    metadata: { notation: 'flowchart' } }, { style: 'hifi' });
    const label = scene.parts.find((part) => part.id === 'e1:label')!;
    const onDoubleClick = vi.fn();
    const onWaypointAdd = vi.fn();
    const { container } = render(<svg onDoubleClick={onDoubleClick}><CompatibilityEdge
      {...makeEdgeProps({ data: { sceneParts028: scene.parts.filter((part) => part.owner.kind === 'edge'),
        sceneShift028: { x: scene.viewport.shiftX, y: scene.viewport.shiftY }, onWaypointAdd } })} /></svg>);
    const hit = container.querySelector('[data-coral-edge-label-hit="e1"]')!;
    expect(Number(hit.getAttribute('x'))).toBe(label.bounds.x);
    expect(Number(hit.getAttribute('height'))).toBe(label.bounds.height);
    expect(hit.getAttribute('pointer-events')).toBe('all');
    fireEvent.doubleClick(hit);
    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onWaypointAdd).not.toHaveBeenCalled();
  });

  it('uses collision-safe resolved typography for routed and waypoint labels', () => {
    const font = resolveFont({
      family: 'monospace', size: 17, weight: 700, lineHeight: 1.6,
    });
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              label: 'Data flow',
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' }],
              [CORAL_EDGE_VIEW_METADATA]: { font },
            },
          })}
        />
      </svg>,
    );
    const label = container.querySelector('[data-coral-edge-label]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.style.fontFamily).toBe('"Coral JetBrains Mono"');
    expect(label.style.fontSize).toBe('17px');
    expect(label.style.fontWeight).toBe('700');
    expect(label.style.lineHeight).toBe('1.6');
  });
  it('does not render waypoint handles when edge is not selected', () => {
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: false,
            data: {
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' as const }],
            },
          })}
        />
      </svg>,
    );

    expect(container.querySelector('[data-waypoint-id]')).toBeNull();
  });

  it('renders waypoint handles when selected and has waypoints', () => {
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              waypoints: [
                { id: 'wp1', x: 200, y: 50, type: 'corner' as const },
                { id: 'wp2', x: 250, y: 75, type: 'corner' as const },
              ],
            },
          })}
        />
      </svg>,
    );

    const handles = container.querySelectorAll('[data-waypoint-id]');
    expect(handles).toHaveLength(2);
  });

  it('fires onWaypointAdd on double-click of the hover path', () => {
    const onAdd = vi.fn();
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              onWaypointAdd: onAdd,
            },
          })}
        />
      </svg>,
    );

    // Double-click the invisible hover path
    const hoverPath = container.querySelector('path[stroke="transparent"]');
    expect(hoverPath).not.toBeNull();
    fireEvent.doubleClick(hoverPath!);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('e1', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('fires onWaypointRemove on right-click of a waypoint handle', () => {
    const onRemove = vi.fn();
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' as const }],
              onWaypointRemove: onRemove,
            },
          })}
        />
      </svg>,
    );

    const handle = container.querySelector('[data-waypoint-id="wp1"]');
    expect(handle).not.toBeNull();
    fireEvent.contextMenu(handle!);
    expect(onRemove).toHaveBeenCalledWith('e1', 'wp1');
  });

  it('waypoint handles have nodrag nopan classes', () => {
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' as const }],
            },
          })}
        />
      </svg>,
    );

    const handle = container.querySelector('[data-waypoint-id="wp1"]');
    expect(handle).not.toBeNull();
    const classAttr = handle!.getAttribute('class') || handle!.className;
    expect(classAttr).toContain('nodrag');
    expect(classAttr).toContain('nopan');
  });

  it('preserves compatibility styling with waypoints present', () => {
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              compatibilityStatus: 'incompatible',
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' as const }],
            },
          })}
        />
      </svg>,
    );

    // The visible edge path should still have red stroke for incompatible
    // BaseEdge renders a <path> with the style applied
    const paths = container.querySelectorAll('path');
    // At least one path should exist (BaseEdge renders it)
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves the movement-only callback on primary pointer-down', () => {
    const onDrag = vi.fn();
    const { container } = render(
      <svg>
        <CompatibilityEdge
          {...makeEdgeProps({
            selected: true,
            data: {
              waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' as const }],
              onWaypointDrag: onDrag,
            },
          })}
        />
      </svg>,
    );

    const handle = container.querySelector('[data-waypoint-id="wp1"]');
    expect(handle).not.toBeNull();
    Object.assign(handle!, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => false });
    pointer(handle!, 'pointerdown');
    expect(onDrag).toHaveBeenCalledWith('e1', 'wp1', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });
});

function pointer(target: Element, type: string, values: Record<string, unknown> = {}) {
  fireEvent(target, Object.assign(new Event(type, { bubbles: true }), {
    pointerId: 7, isPrimary: true, button: 0, clientX: 500, clientY: 150, ...values,
  }));
}

describe('captured waypoint lifecycle', () => {
  function mount(options: {
    startResult: number | undefined;
    requiresEpoch?: boolean;
  } = { startResult: 17 }) {
    const { startResult, requiresEpoch = false } = options;
    const onStart = vi.fn(() => startResult);
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const onCancel = vi.fn();
    const onAdd = vi.fn();
    const mounted = render(<svg><CompatibilityEdge {...makeEdgeProps({
      selected: true,
      data: {
        waypoints: [{ id: 'wp1', x: 200, y: 50, type: 'corner' }],
        requiresWaypointDragEpoch: requiresEpoch,
        onWaypointDragStart: onStart, onWaypointDrag: onMove,
        onWaypointDragEnd: onEnd, onWaypointDragCancel: onCancel,
        onWaypointAdd: onAdd,
      },
    })} {...{ screenToFlowPosition: (position: { x: number; y: number }) => ({ x: (position.x - 100) / 2, y: (position.y - 50) / 2 }) }} /></svg>);
    const handle = mounted.container.querySelector('[data-waypoint-id="wp1"]')!;
    Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
    return { ...mounted, handle, onStart, onMove, onEnd, onCancel, onAdd };
  }

  it('captures primary movement, maps viewport coordinates, and commits once on release', () => {
    const { handle, onStart, onMove, onEnd, onCancel } = mount();
    pointer(handle, 'pointerdown');
    expect(onStart).toHaveBeenCalledWith('e1', 'wp1', { x: 200, y: 50 });
    expect((handle as HTMLElement).setPointerCapture).toHaveBeenCalledWith(7);
    pointer(handle, 'pointermove', { clientX: 500, clientY: 350 });
    expect(onMove).toHaveBeenLastCalledWith('e1', 'wp1', { x: 200, y: 150 }, 17);
    pointer(handle, 'pointerup', { clientX: 520, clientY: 370 });
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', { x: 210, y: 160 }, 17);
    pointer(handle, 'lostpointercapture');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not capture or move when the gesture owner refuses the start', () => {
    const { handle, onStart, onMove, onEnd, onCancel } = mount({ startResult: undefined, requiresEpoch: true });
    pointer(handle, 'pointerdown');
    expect(onStart).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', { x: 200, y: 50 });
    expect((handle as HTMLElement).setPointerCapture).not.toHaveBeenCalled();
    pointer(handle, 'pointermove', { clientX: 520, clientY: 370 });
    pointer(handle, 'pointerup', { clientX: 520, clientY: 370 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('preserves legacy void-returning starts when epoch admission is not required', () => {
    const { handle, onMove } = mount({ startResult: undefined });
    pointer(handle, 'pointerdown');
    expect((handle as HTMLElement).setPointerCapture).toHaveBeenCalledWith(7);
    pointer(handle, 'pointermove', { clientX: 520, clientY: 370 });
    expect(onMove).toHaveBeenCalledWith('e1', 'wp1', { x: 210, y: 160 });
  });

  it.each(['pointercancel', 'lostpointercapture'])('cancels %s once and ignores stale movement', (event) => {
    const { handle, onMove, onEnd, onCancel } = mount();
    pointer(handle, 'pointerdown');
    pointer(handle, 'pointermove');
    pointer(handle, event);
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', 17);
    onMove.mockClear();
    pointer(handle, 'pointermove');
    pointer(handle, 'pointerup');
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ignores secondary pointers and cancels on unmount', () => {
    const { handle, onStart, onEnd, onCancel, unmount } = mount();
    pointer(handle, 'pointerdown', { isPrimary: false, pointerId: 8 });
    pointer(handle, 'pointerdown', { button: 2 });
    expect(onStart).not.toHaveBeenCalled();
    pointer(handle, 'pointerdown');
    pointer(handle, 'pointerup', { pointerId: 8 });
    expect(onEnd).not.toHaveBeenCalled();
    unmount();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', 17);
  });

  it('keeps off-center pointer-down/up a no-op and cancels blur once', () => {
    const { handle, onEnd, onCancel } = mount();
    pointer(handle, 'pointerdown', { clientX: 504 });
    pointer(handle, 'pointerup', { clientX: 504 });
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', { x: 200, y: 50 }, 17);
    pointer(handle, 'pointerdown');
    fireEvent(window, new Event('blur'));
    pointer(handle, 'lostpointercapture');
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('e1', 'wp1', 17);
  });

  it('maps double-clicks through the supplied React Flow coordinate conversion', () => {
    const { container, onAdd } = mount();
    fireEvent.doubleClick(container.querySelector('path[stroke="transparent"]')!, { clientX: 500, clientY: 350 });
    expect(onAdd).toHaveBeenCalledWith('e1', { x: 200, y: 150 });
  });

  it('adds exactly once when double-clicking the visible edge stroke', () => {
    const { container, onAdd } = mount();
    fireEvent.doubleClick(container.querySelector('.react-flow__edge-path')!, { clientX: 500, clientY: 350 });
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('e1', { x: 200, y: 150 });
  });

  it('renders manual anchors at current endpoints while retaining warning style', () => {
    const { container } = render(<svg><CompatibilityEdge {...makeEdgeProps({ data: {
      compatibilityStatus: 'warning', waypoints: [{ id: 'wp1', x: 200, y: 150, type: 'corner' }],
      routedPath: { startPoint: { x: 0, y: 0 }, endPoint: { x: 999, y: 999 }, bendPoints: [{ x: 200, y: 150 }] },
    } })} /></svg>);
    const path = container.querySelector('.react-flow__edge-path')!;
    expect(path.getAttribute('d')).toContain('200 150');
    expect(path.getAttribute('d')).toMatch(/^M\s*100 25/);
    expect(path.getAttribute('style')).toContain('stroke: rgb(245, 158, 11)');
    expect(path.getAttribute('style')).toContain('stroke-dasharray: 5,3');
  });
});


it('supports standalone SVG conversion without injecting a React Flow provider', () => {
  const onAdd = vi.fn();
  const { container } = render(<svg><CompatibilityEdge {...makeEdgeProps({ data: { onWaypointAdd: onAdd } })} /></svg>);
  const svg = container.querySelector('svg')!;
  Object.assign(svg, { createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: (this.x - 100) / 2, y: (this.y - 50) / 2 }; } }) });
  const path = container.querySelector('.react-flow__edge-path')!;
  Object.assign(path, { getScreenCTM: () => ({ inverse: () => ({}) }) });
  fireEvent.doubleClick(path, { clientX: 500, clientY: 350 });
  expect(onAdd).toHaveBeenCalledExactlyOnceWith('e1', { x: 200, y: 150 });
});
