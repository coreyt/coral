import { describe, expect, it } from 'vitest';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilAnchorPoint028 } from '../src/stencilAnchorGeometry028.js';
import { svgPathContour028 } from '../src/svgPathContour028.js';
import { inkRoutePath028, routeCornerRadii028, visualContour028,
  visualDashPattern028, visualOverdraw028 } from '../src/visualStyle028.js';
import { stencilPathPrimitives028 } from '../src/drawingPrimitives028.js';
import { renderSvg } from '../src/svg/serialize.js';

describe('approved 0.2.8 vector contours', () => {
  it.each(['rectangle', 'diamond', 'ellipse', 'stadium'])('%s keeps compass contacts while using distinct lowfi ink', (id) => {
    const installed = shapeRegistry.get(id)!;
    const contour = visualContour028(id, 'lowfi');
    expect(contour).not.toBe(installed.path);
    const sampled = svgPathContour028({ ...installed, path: contour });
    const contacts = id === 'stadium' ? ['N', 'S', 'E', 'W'] as const
      : ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'] as const;
    for (const anchor of contacts) {
      const point = stencilAnchorPoint028(installed, anchor);
      const distance = Math.min(...sampled.flatMap((segment) => [segment.start, segment.end]).map((sample) =>
        Math.hypot(sample.x - point.x, sample.y - point.y)));
      expect(distance, `${id} ${anchor}`).toBeLessThan(0.00001);
    }
    expect(visualContour028(id, 'hifi')).toBe(installed.path);
  });

  it('draws short corner overdraw on boxes and all four diamond vertices', () => {
    expect(visualOverdraw028('rectangle', 'lowfi')).toHaveLength(8);
    expect(visualOverdraw028('diamond', 'lowfi')).toHaveLength(4);
    expect(visualOverdraw028('diamond', 'hifi')).toEqual([]);
    expect(visualOverdraw028('rectangle', 'lowfi')[0]).toBe('M-5 0 L5 0');
    expect(visualOverdraw028('rectangle', 'lowfi', { cornerRadius: 8 })).toEqual([]);
  });

  it.each(['parallelogram', 'document', 'subroutine'])('%s has a resizable lowfi contour', (id) => {
    const installed = shapeRegistry.get(id)!;
    const contour = visualContour028(id, 'lowfi');
    expect(contour).not.toBe(installed.path);
    expect(svgPathContour028({ ...installed, path: contour }).length).toBeGreaterThan(0);
    expect(visualContour028(id, 'hifi')).toBe(installed.path);
  });

  it('gives SVG and canvas one inspectable stencil primitive set', () => {
    const paint = { ownerId: 'decision-1', shapeId: 'diamond', style: 'lowfi' as const,
      fill: '#fff', stroke: '#363430', strokeWidth: 2.3, scale: 1.5 };
    const parts = stencilPathPrimitives028(paint);
    expect(parts.map((part) => part.id)).toEqual([
      'decision-1:outline', 'decision-1:corners',
    ]);
    expect(parts[1]?.d).toBe(visualOverdraw028('diamond', 'lowfi').join(' '));
    expect(parts[0]).toMatchObject({ role: 'outline', d: visualContour028('diamond', 'lowfi'),
      ownerId: 'decision-1', strokeWidth: 2.3 / 1.5 });
    expect(stencilPathPrimitives028({ ...paint, style: 'hifi' })).toHaveLength(1);
    expect(() => stencilPathPrimitives028({ ...paint, scale: 0 })).toThrow(/invalid scale/);
  });

  it('serializes the same stable part IDs used by the canvas projection', () => {
    const svg = renderSvg({ nodes: [{ id: 'decision-1', type: 'decision',
      symbol: 'flowchart-decision', label: 'Ready?', position: { x: 0, y: 0 },
      dimensions: { width: 180, height: 100 } }], edges: [], metadata: { notation: 'flowchart' } },
    { style: 'lowfi' });
    expect(svg).toContain('data-coral-part-id="decision-1:outline"');
    expect(svg).toContain('data-coral-part-id="decision-1:corners"');
  });

  it('varies lowfi dashes without changing semantic line style', () => {
    const first = visualDashPattern028('return-1', 'lowfi', 'dashed');
    expect(first).toBe(visualDashPattern028('return-1', 'lowfi', 'dashed'));
    expect(first?.split(' ').map(Number).filter((_, index) => index % 2 === 0))
      .not.toEqual([6, 6, 6]);
    expect(visualDashPattern028('return-1', 'hifi', 'dashed')).toBe('6 4');
    expect(visualDashPattern028('return-1', 'lowfi', 'solid')).toBeUndefined();
  });

  it('softens only safe orthogonal elbows while preserving route contacts', () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }];
    const radii = routeCornerRadii028(points, []);
    expect(radii).toEqual([0, 6, 0]);
    expect(inkRoutePath028(points, 'hifi', radii))
      .toBe('M0 0 L0 34 Q0 40 6 40 L40 40');
    expect(inkRoutePath028(points, 'hifi')).toBe('M0 0 L0 40 L40 40');
    expect(routeCornerRadii028(points, [{ x: -1, y: 34, width: 10, height: 10 }]))
      .toEqual([0, 0, 0]);
    expect(routeCornerRadii028([{ x: 0, y: 0 }, { x: 20, y: 20 },
      { x: 40, y: 20 }], [])).toEqual([0, 0, 0]);
  });
});
