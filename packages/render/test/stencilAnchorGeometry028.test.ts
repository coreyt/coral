import { describe, expect, it } from 'vitest';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilAnchorPoint028, stencilRayPoint028 } from '../src/stencilAnchorGeometry028.js';
import { svgPathContour028 } from '../src/svgPathContour028.js';

const shape = (id: string) => shapeRegistry.get(id)!;

describe('0.2.8 generic stencil-anchor geometry', () => {
  it('keeps the eight rectangle anchors on the visible outline', () => {
    expect(stencilAnchorPoint028(shape('rectangle'), 'N')).toEqual({ x: 0.5, y: 0 });
    expect(stencilAnchorPoint028(shape('rectangle'), 'S')).toEqual({ x: 0.5, y: 1 });
    expect(stencilAnchorPoint028(shape('rectangle'), 'E')).toEqual({ x: 1, y: 0.5 });
    expect(stencilAnchorPoint028(shape('rectangle'), 'W')).toEqual({ x: 0, y: 0.5 });
    expect(stencilAnchorPoint028(shape('rectangle'), 'NE')).toEqual({ x: 1, y: 0 });
    expect(stencilAnchorPoint028(shape('rectangle'), 'SW')).toEqual({ x: 0, y: 1 });
  });

  it('places diagonal pins on diamond and ellipse contours, not bounding-box corners', () => {
    expect(stencilAnchorPoint028(shape('diamond'), 'NE')).toEqual({ x: 0.75, y: 0.25 });
    expect(stencilAnchorPoint028(shape('diamond'), 'SW')).toEqual({ x: 0.25, y: 0.75 });
    const point = stencilAnchorPoint028(shape('ellipse'), 'NE');
    expect(point.x).toBeCloseTo(0.5 + Math.SQRT1_2 / 2);
    expect(point.y).toBeCloseTo(0.5 - Math.SQRT1_2 / 2);
  });

  it('respects nonrectangular side intersections and view-box normalization', () => {
    expect(stencilAnchorPoint028(shape('triangle'), 'E')).toEqual({ x: 0.75, y: 0.5 });
    expect(stencilAnchorPoint028(shape('parallelogram'), 'N')).toEqual({ x: 0.5, y: 0 });
    const northwest = stencilAnchorPoint028(shape('parallelogram'), 'NW');
    expect(northwest.x).toBeCloseTo(1 / 7);
    expect(northwest.y).toBeCloseTo(1 / 7);
  });

  it('intersects a symbol-rounded rectangle corner on its quadratic visible outline', () => {
    const northeast = stencilAnchorPoint028(shape('rectangle'), 'NE', { cornerRadius: 8 });
    const rx = 8 / 100;
    const ry = 8 / 60;
    const curveParameter = Math.sqrt(northeast.y / ry);
    expect(northeast.x).toBeLessThan(1);
    expect(northeast.y).toBeGreaterThan(0);
    expect(northeast.x + northeast.y).toBeCloseTo(1);
    expect(northeast.x).toBeCloseTo(1 - rx * (1 - curveParameter) ** 2);
    const southwest = stencilAnchorPoint028(shape('rectangle'), 'SW', { cornerRadius: 8 });
    expect(southwest.x).toBeCloseTo(1 - northeast.x);
    expect(southwest.y).toBeCloseTo(1 - northeast.y);
    expect(stencilAnchorPoint028(shape('rectangle'), 'NE', { cornerRadius: 0 }))
      .toEqual({ x: 1, y: 0 });
  });

  it('snaps a layout-chosen free side offset to polygon, ellipse, and rounded contours', () => {
    const diamond = stencilRayPoint028(shape('diamond'), { x: 1, y: 0.25 });
    expect(diamond.x).toBeCloseTo(5 / 6);
    expect(diamond.y).toBeCloseTo(1 / 3);
    const ellipse = stencilRayPoint028(shape('ellipse'), { x: 1, y: 0.25 });
    expect(((ellipse.x - 0.5) / 0.5) ** 2 + ((ellipse.y - 0.5) / 0.5) ** 2).toBeCloseTo(1);
    const rounded = stencilRayPoint028(shape('rectangle'), { x: 1, y: 0.05 }, { cornerRadius: 8 });
    expect(rounded.x).toBeLessThan(1);
    expect(rounded.y).toBeGreaterThan(0);
    const rx = 8 / 100;
    const ry = 8 / 60;
    const curveParameter = Math.sqrt(rounded.y / ry);
    expect(rounded.x).toBeCloseTo(1 - rx * (1 - curveParameter) ** 2);
    expect(stencilRayPoint028(shape('rectangle'), { x: 1, y: 0.5 }, { cornerRadius: 8 }))
      .toEqual({ x: 1, y: 0.5 });
  });

  it('resolves every ordinary side offset around a rounded service without an invalid ray', () => {
    for (let step = 0; step <= 20; step += 1) {
      const along = step / 20;
      for (const toward of [{ x: along, y: 0 }, { x: along, y: 1 },
        { x: 0, y: along }, { x: 1, y: along }]) {
        const point = stencilRayPoint028(shape('rectangle'), toward, { cornerRadius: 8 });
        expect(point.x).toBeGreaterThanOrEqual(-1e-12);
        expect(point.x).toBeLessThanOrEqual(1 + 1e-12);
        expect(point.y).toBeGreaterThanOrEqual(-1e-12);
        expect(point.y).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('uses drawn path contours for complex stencils, including a curved document edge', () => {
    const document = stencilAnchorPoint028(shape('document'), 'SE');
    expect(document.x).toBeLessThan(1);
    expect(document.y).toBeGreaterThan(0.5);
    expect(stencilAnchorPoint028(shape('cylinder'), 'N').y).toBe(0);
  });

  it('rejects malformed shape path data instead of substituting a bounding box', () => {
    const malformed = { ...shape('document'), id: 'bad-path', path: 'M 0,0 X 100,100' };
    expect(() => stencilAnchorPoint028(malformed, 'NE'))
      .toThrow(/coral\.port\.anchor\.geometry-unsupported.*bad-path/);
  });

  it('keeps cached installed contours immutable and does not cache mutable draft shapes', () => {
    const installed = shape('document');
    const contour = svgPathContour028(installed);
    expect(Object.isFrozen(contour)).toBe(true);
    expect(Object.isFrozen(contour[0])).toBe(true);
    expect(Object.isFrozen(contour[0]!.start)).toBe(true);
    expect(Reflect.set(contour[0]!.start, 'x', 999)).toBe(false);
    expect(svgPathContour028(installed)).toBe(contour);
    const draft = { ...installed, id: 'draft-document', path: 'M 0,0 L 100,0 L 100,70 L 0,70 Z' };
    const before = svgPathContour028(draft);
    draft.path = 'M 0,0 L 50,0 L 50,70 L 0,70 Z';
    const after = svgPathContour028(draft);
    expect(after).not.toBe(before);
    expect(after).not.toEqual(before);
  });

  it('accounts for every installed simple outline', () => {
    for (const candidate of shapeRegistry.getAll()) {
      for (const anchor of ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'] as const) {
        if (candidate.type !== 'polygon' && candidate.type !== 'ellipse') continue;
        const point = stencilAnchorPoint028(candidate, anchor);
        expect(point.x, `${candidate.id}:${anchor}:x`).toBeGreaterThanOrEqual(-1e-12);
        expect(point.x, `${candidate.id}:${anchor}:x`).toBeLessThanOrEqual(1 + 1e-12);
        expect(point.y, `${candidate.id}:${anchor}:y`).toBeGreaterThanOrEqual(-1e-12);
        expect(point.y, `${candidate.id}:${anchor}:y`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('resolves all eight generic anchors on every installed stencil, including path and compound shapes', () => {
    for (const candidate of shapeRegistry.getAll()) {
      for (const anchor of ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'] as const) {
        const point = stencilAnchorPoint028(candidate, anchor);
        expect(Number.isFinite(point.x) && Number.isFinite(point.y), `${candidate.id}:${anchor}`).toBe(true);
        expect(point.x, `${candidate.id}:${anchor}:x`).toBeGreaterThanOrEqual(-0.25);
        expect(point.x, `${candidate.id}:${anchor}:x`).toBeLessThanOrEqual(1.25);
        expect(point.y, `${candidate.id}:${anchor}:y`).toBeGreaterThanOrEqual(-0.25);
        expect(point.y, `${candidate.id}:${anchor}:y`).toBeLessThanOrEqual(1.25);
      }
    }
    expect(stencilAnchorPoint028(shape('cloud'), 'W').x).toBeLessThan(0);
    const cloud = stencilAnchorPoint028(shape('cloud'), 'NE');
    expect(cloud.x).toBeLessThan(1);
    expect(cloud.y).toBeGreaterThan(0);
    expect(stencilAnchorPoint028(shape('actor'), 'E').x).toBeCloseTo(5 / 6);
    expect(stencilAnchorPoint028(shape('actor'), 'W').x).toBeCloseTo(1 / 6);
    expect(stencilAnchorPoint028(shape('actor'), 'W').y).toBeCloseTo(0.35);
    expect(stencilAnchorPoint028(shape('actor'), 'S').y).toBe(1);
  });
});
