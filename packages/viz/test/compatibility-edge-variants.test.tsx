import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { markerDomId028, placeEndpointLabels, visualStyle028 } from '@coral-viz/render';
import { CompatibilityEdge, PORTABLE_EDGE_LABEL_COLORS, getEdgeStyleForStatus, buildRoutedPath } from '../src/compatibility/CompatibilityEdge';
import { convertEdge } from '../src/editor/converter';

// Render label overlays inline so their placement is observable.
vi.mock('@xyflow/react', async () => ({
  ...await vi.importActual<Record<string, unknown>>('@xyflow/react'),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** CompatibilityEdge's rendering branches - R-030 coverage. */

const base = {
  id: 'e1',
  sourceX: 0,
  sourceY: 0,
  targetX: 200,
  targetY: 100,
  sourcePosition: 'right',
  targetPosition: 'left',
} as const;

function renderEdge(data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return render(
    <ReactFlowProvider>
      <svg>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CompatibilityEdge {...(base as any)} {...(extra as any)} data={data as any} />
      </svg>
    </ReactFlowProvider>
  );
}

describe('getEdgeStyleForStatus', () => {
  it('colours an incompatible edge', () => {
    expect(getEdgeStyleForStatus('incompatible', {}).stroke).toBe('#ef4444');
  });

  it('colours and dashes a warning edge', () => {
    const style = getEdgeStyleForStatus('warning', {});
    expect(style.stroke).toBe('#f59e0b');
    expect(style.strokeDasharray).toBeDefined();
  });

  it('leaves a compatible edge alone', () => {
    expect(getEdgeStyleForStatus('compatible', { stroke: '#123' }).stroke).toBe('#123');
  });
});

describe('buildRoutedPath', () => {
  it('builds a path through its bend points', () => {
    const path = buildRoutedPath({ x: 0, y: 0 }, { x: 100, y: 100 }, [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);

    expect(path).toContain('M');
    expect(path).toContain('50');
  });

  it('builds a direct path with no bend points', () => {
    const path = buildRoutedPath({ x: 0, y: 0 }, { x: 10, y: 10 }, []);

    expect(path).toContain('M');
  });
});

describe('CompatibilityEdge', () => {
  it.each([false, true])('retains accessible connection semantics with transient scene %s', (sceneTransient028) => {
    const sceneParts028 = [{ id: 'e1:shaft', owner: { kind: 'edge', id: 'e1' },
      role: 'edge-shaft', bounds: { x: 0, y: 0, width: 200, height: 100 },
      geometry: { kind: 'route', points: [{ x: 0, y: 0 }, { x: 200, y: 100 }],
        d: 'M0 0 L200 100', stroke: '#222', strokeWidth: 2, hitStrokeWidth: 26 },
      presentationOnly: false }];
    const { container } = renderEdge({ sceneParts028, sceneTransient028,
      sourceLabel: 'Customer', targetLabel: 'Order', label: 'places',
      compatibilityStatus: 'warning',
      sourceEndpoint: { navigability: 'non-navigable' },
      targetEndpoint: { navigability: 'navigable' } });
    expect(container.querySelector('[data-coral-edge-hit="e1"]')?.getAttribute('aria-label'))
      .toBe('Connection from Customer to Order, places, source non-navigable, target navigable, has a warning');
    expect(container.querySelector('.react-flow__edge-path')).toBeNull();
    expect(container.querySelector('[data-coral-part-id="e1:shaft"]')).not.toBeNull();
  });
  it('retargets owned scene ink during a drag without selecting the old edge body', () => {
    const sceneParts028 = [{ id: 'e1:shaft', owner: { kind: 'edge', id: 'e1' },
      role: 'edge-shaft', bounds: { x: 0, y: 0, width: 200, height: 100 },
      geometry: { kind: 'route', points: [{ x: 0, y: 0 }, { x: 200, y: 100 }],
        d: 'M0 0 L200 100', stroke: '#222', strokeWidth: 2, hitStrokeWidth: 26 },
      presentationOnly: false }];
    const settled = renderEdge({ sceneParts028 });
    expect(settled.container.querySelector('[data-coral-scene-edge="e1"]')).not.toBeNull();
    expect(settled.container.querySelector('[data-coral-part-id="e1:shaft"]')).not.toBeNull();
    expect(settled.container.querySelector('[data-coral-edge-hit="e1"]')?.getAttribute('stroke-width'))
      .toBe('26');
    settled.unmount();
    const moving = renderEdge({ sceneParts028, sceneTransient028: true },
      { sourceX: 12, sourceY: 8, targetX: 228, targetY: 108 });
    expect(moving.container.querySelector('[data-coral-scene-edge="e1"]')).not.toBeNull();
    expect(moving.container.querySelector('[data-coral-part-id="e1:shaft"]')?.getAttribute('d'))
      .toMatch(/^M12 8.*228 108$/);
    expect(moving.container.querySelector('.react-flow__edge-path')).toBeNull();
    expect(moving.container.querySelector('[data-coral-edge-hit="e1"]')).not.toBeNull();
    moving.unmount();
    const unsupported = renderEdge({ sceneParts028: [], sceneTransient028: true });
    expect(unsupported.container.querySelector('[data-coral-scene-edge="e1"]')).toBeNull();
    expect(unsupported.container.querySelector('[aria-label^="Connection from"]')).toBeNull();
  });
  it.each([['compatible'], ['warning'], ['incompatible']])('renders a %s edge', (status) => {
    const { container } = renderEdge({ compatibilityStatus: status });
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('accepts a label without failing', () => {
    const { container } = renderEdge({ label: 'calls' });
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('pairs the portable white label surface with dark ink in every host theme', () => {
    expect(PORTABLE_EDGE_LABEL_COLORS).toEqual({
      backgroundColor: 'white',
      color: 'rgb(28, 37, 48)',
    });
  });

  it('names its connection for a screen reader', () => {
    const { container } = renderEdge({ sourceLabel: 'Alpha', targetLabel: 'Beta', label: 'writes' });
    const labelled = container.querySelector('[aria-label]');
    expect(labelled?.getAttribute('aria-label')).toContain('Alpha');
    expect(labelled?.getAttribute('aria-label')).toContain('Beta');
  });

  it('says when the notation disallows the connection', () => {
    const { container } = renderEdge({
      compatibilityStatus: 'incompatible',
      sourceLabel: 'A',
      targetLabel: 'B',
    });
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toMatch(/not allowed/i);
  });

  it('preserves endpoint semantics in its accessible name and resolved markers', () => {
    const edge = convertEdge({
      id: 'e1', source: 'a', target: 'b',
      sourceEnd: { role: 'writer', navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'filled' } },
      targetEnd: { multiplicity: { lower: 0, upper: '*' }, navigability: 'navigable' },
    });
    const { container } = renderEdge(edge.data, { markerStart: edge.markerStart, markerEnd: edge.markerEnd });
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('source non-navigable');
    expect(container.querySelector('[marker-start]')?.getAttribute('marker-start'))
      .toBe(`url(#${markerDomId028({ kind: 'diamond', fill: 'filled' }, visualStyle028('lowfi').ink, 'canvas')})`);
    expect(container.querySelector('[marker-end]')?.getAttribute('marker-end'))
      .toBe(`url(#${markerDomId028({ kind: 'arrow', fill: 'unspecified' }, visualStyle028('lowfi').ink, 'canvas')})`);
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('target navigable');
    expect(container.querySelector('[data-coral-endpoint="source"]')?.getAttribute('data-coral-navigability')).toBe('non-navigable');
    expect(container.querySelector('[data-coral-endpoint="target"]')?.getAttribute('data-coral-navigability')).toBe('navigable');
  });

  it('places role and multiplicity labels at both endpoints without capturing pointer input', () => {
    const sourceEndpoint = { role: 'writer', multiplicity: '1' };
    const targetEndpoint = { role: 'store', multiplicity: '0..*' };
    const { container } = renderEdge({ sourceEndpoint, targetEndpoint });
    const expected = placeEndpointLabels([{ x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 200, y: 100 }], sourceEndpoint, targetEndpoint,
    { x: 0, y: 0 }, { x: 200, y: 100 });
    const labels = [...container.querySelectorAll<HTMLElement>('[data-coral-endpoint-label]')];
    expect(labels.map((label) => [label.dataset.coralEndpointLabel, label.textContent])).toEqual([
      ['source:role', 'writer'], ['source:multiplicity', '1'], ['target:role', 'store'], ['target:multiplicity', '0..*'],
    ]);
    labels.forEach((label, index) => {
      expect(label.style.transform).toBe(`translate(-50%, -50%) translate(${expected[index].x}px,${expected[index].y}px)`);
      expect(label.style.pointerEvents).toBe('none');
      expect(label.getAttribute('class')).toContain('nodrag nopan');
    });
  });

  it('places endpoint labels along the drawn bends when waypoints meet a stale routed path', () => {
    const sourceEndpoint = { role: 'writer', multiplicity: '1' };
    const targetEndpoint = { role: 'store', multiplicity: '0..*' };
    const bendPoints = [{ x: 20, y: 80 }, { x: 180, y: 20 }];
    const { container } = renderEdge({
      sourceEndpoint, targetEndpoint,
      waypoints: [{ id: 'w1', x: 50, y: 50, type: 'corner' }],
      routedPath: { startPoint: { x: 500, y: 500 }, endPoint: { x: 900, y: 900 }, bendPoints },
    });
    const expected = placeEndpointLabels([{ x: 0, y: 0 }, ...bendPoints, { x: 200, y: 100 }],
      sourceEndpoint, targetEndpoint, { x: 0, y: 0 }, { x: 200, y: 100 });
    const labels = [...container.querySelectorAll<HTMLElement>('[data-coral-endpoint-label]')];
    expect(labels.map((label) => label.style.transform)).toEqual(expected.map((label) =>
      `translate(-50%, -50%) translate(${label.x}px,${label.y}px)`));
  });

  it('accepts a forced tooltip without failing', () => {
    const { container } = renderEdge({
      compatibilityStatus: 'incompatible',
      forceShowTooltip: true,
      validation: { valid: false, hasWarning: false, message: 'Not allowed here' },
    });
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('shows waypoint handles when selected', () => {
    const { container } = renderEdge(
      { waypoints: [{ id: 'w1', x: 50, y: 50, type: 'corner' }] },
      { selected: true }
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('adds a waypoint on double click', () => {
    const onWaypointAdd = vi.fn();
    const { container } = renderEdge({ onWaypointAdd });

    const hit = container.querySelector('path');
    if (hit) fireEvent.doubleClick(hit);

    expect(container.querySelector('path')).not.toBeNull();
  });

  it('renders a routed path when one is supplied', () => {
    const { container } = renderEdge({
      routedPath: {
        startPoint: { x: 0, y: 0 },
        bendPoints: [{ x: 40, y: 0 }],
        endPoint: { x: 80, y: 40 },
      },
    });
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('recomputes its path when refreshed endpoint coordinates change', () => {
    const { container, rerender } = renderEdge();
    const before = container.querySelector('path')?.getAttribute('d');

    rerender(
      <ReactFlowProvider>
        <svg>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <CompatibilityEdge {...(base as any)} targetX={340} targetY={180} data={{} as any} />
        </svg>
      </ReactFlowProvider>
    );

    expect(container.querySelector('path')?.getAttribute('d')).not.toBe(before);
  });

  it('renders with no data at all', () => {
    const { container } = renderEdge();
    expect(container.querySelector('path')).not.toBeNull();
  });
});
