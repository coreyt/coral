import { describe, expect, it } from 'vitest';
import { resolveShapePath } from '../src/scene.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilFitPoint028, stencilRayPoint028 } from '../src/stencilAnchorGeometry028.js';
import {
  artworkPlacement029, classifyUserOutlinePoint029, frameFitPoint029, isUserOutlineShape029,
  resolveUserAnchor029, userBoundaryAnchorPoint029, userCornerAnchorPoint029, userOutlineExitPoint029,
  userOutlineRegion029, userOutlineShape029, type UserOutline029,
} from '../src/userSymbolGeometry029.js';

const outline = (kind: UserOutline029['outline'], width = 48, height = 56): UserOutline029 =>
  ({ symbolId: 'local.shield', outline: kind, width, height });
const kinds = ['rectangle', 'rounded', 'ellipse', 'diamond'] as const;
const close = (actual: { x: number; y: number }, expected: { x: number; y: number }, tolerance = 1e-9) => {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
};

describe('synthetic user-symbol outlines', () => {
  it('generates the approved outline paths in frame units with an identity viewBox', () => {
    expect(userOutlineShape029(outline('rectangle'))).toMatchObject({ id: 'local.shield', type: 'polygon',
      viewBox: '0 0 48 56', path: 'M 0,0 L 48,0 L 48,56 L 0,56 Z', defaultSize: { width: 48, height: 56 } });
    expect(userOutlineShape029(outline('diamond'))).toMatchObject({ type: 'polygon',
      path: 'M 24,0 L 48,28 L 24,56 L 0,28 Z' });
    expect(userOutlineShape029(outline('ellipse'))).toMatchObject({ type: 'ellipse',
      path: 'M 24,0 A 24,28 0 1 1 24,56 A 24,28 0 1 1 24,0 Z' });
    expect(userOutlineShape029(outline('rounded'))).toMatchObject({ type: 'path',
      path: 'M 6,0 L 42,0 Q 48,0 48,6 L 48,50 Q 48,56 42,56 L 6,56 Q 0,56 0,50 L 0,6 Q 0,0 6,0 Z' });
  });

  it('emits exactly the quadratic corners resolveShapePath draws for a rounded rectangle', () => {
    for (const [width, height] of [[48, 56], [120, 30], [7, 7]] as const) {
      const radius = Math.min(width, height) / 8;
      const rectangle = { ...shapeRegistry.get('rectangle')!, viewBox: `0 0 ${width} ${height}` };
      expect(userOutlineShape029(outline('rounded', width, height)).path)
        .toBe(resolveShapePath(rectangle, { cornerRadius: radius }));
    }
  });

  it('memoizes frozen shapes by outline value and recognizes them by the local prefix', () => {
    const first = userOutlineShape029(outline('rounded'));
    expect(userOutlineShape029(outline('rounded'))).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(userOutlineShape029(outline('rounded', 48, 60))).not.toBe(first);
    expect(isUserOutlineShape029(first)).toBe(true);
    expect(shapeRegistry.getAll().some((shape) => isUserOutlineShape029(shape))).toBe(false);
    expect(shapeRegistry.get('local.shield')).toBeUndefined();
  });
});

describe('outline regions and exits', () => {
  it('classifies inside, on and outside points with the region functions', () => {
    for (const kind of kinds) {
      expect(classifyUserOutlinePoint029(outline(kind), { x: 0.5, y: 0.5 })).toBe('inside');
      expect(classifyUserOutlinePoint029(outline(kind), { x: 0.5, y: 0 })).toBe('on');
      expect(classifyUserOutlinePoint029(outline(kind), { x: 0.5, y: -0.01 })).toBe('outside');
    }
    expect(classifyUserOutlinePoint029(outline('diamond'), { x: 0.1, y: 0.1 })).toBe('outside');
    expect(classifyUserOutlinePoint029(outline('ellipse'), { x: 0.05, y: 0.05 })).toBe('outside');
    expect(classifyUserOutlinePoint029(outline('rectangle'), { x: 0, y: 0 })).toBe('on');
    // Rounded corner: r = 6, rx = 0.125, ry = 6/56.
    expect(classifyUserOutlinePoint029(outline('rounded'), { x: 0.01, y: 0.01 })).toBe('outside');
    expect(classifyUserOutlinePoint029(outline('rounded'), { x: 0.1, y: 0.1 })).toBe('inside');
  });

  it('puts the rounded corner curve on the zero set of the region function', () => {
    const shape = outline('rounded');
    const r = 6;
    for (let step = 0; step <= 16; step += 1) {
      const t = step / 16;
      const point = { x: (r * t * t) / 48, y: (r * (1 - t) ** 2) / 56 };
      expect(Math.abs(userOutlineRegion029(shape, point))).toBeLessThanOrEqual(1e-12);
    }
  });

  it('computes the exit table for each outline and side', () => {
    const point = { x: 0.3, y: 0.6 };
    close(userOutlineExitPoint029(outline('rectangle'), 'N', point), { x: 0.3, y: 0 });
    close(userOutlineExitPoint029(outline('rectangle'), 'E', point), { x: 1, y: 0.6 });
    close(userOutlineExitPoint029(outline('diamond'), 'N', point), { x: 0.3, y: 0.2 });
    close(userOutlineExitPoint029(outline('diamond'), 'S', point), { x: 0.3, y: 0.8 });
    close(userOutlineExitPoint029(outline('diamond'), 'E', point), { x: 0.9, y: 0.6 });
    close(userOutlineExitPoint029(outline('diamond'), 'W', point), { x: 0.1, y: 0.6 });
    close(userOutlineExitPoint029(outline('ellipse'), 'N', point), { x: 0.3, y: 0.5 - Math.sqrt(0.21) });
    close(userOutlineExitPoint029(outline('ellipse'), 'W', point), { x: 0.5 - Math.sqrt(0.24), y: 0.6 });
    // Rounded north exit inside the corner column: v = ry * (1 - sqrt(u / rx))^2.
    const rx = 6 / 48; const ry = 6 / 56;
    close(userOutlineExitPoint029(outline('rounded'), 'N', { x: 0.05, y: 0.5 }),
      { x: 0.05, y: ry * (1 - Math.sqrt(0.05 / rx)) ** 2 });
    close(userOutlineExitPoint029(outline('rounded'), 'E', { x: 0.5, y: 0.98 }),
      { x: 1 - rx * (1 - Math.sqrt(0.02 / ry)) ** 2, y: 0.98 });
    close(userOutlineExitPoint029(outline('rounded'), 'S', point), { x: 0.3, y: 1 });
  });

  it('lands every exit on the outline, leaving the region beyond it', () => {
    for (const kind of kinds) for (const side of ['N', 'E', 'S', 'W'] as const)
      for (const point of [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.7 }, { x: 0.93, y: 0.4 }, { x: 0.45, y: 0.04 }]) {
        if (classifyUserOutlinePoint029(outline(kind), point) !== 'inside') continue;
        const exit = userOutlineExitPoint029(outline(kind), side, point);
        expect(Math.abs(userOutlineRegion029(outline(kind), exit))).toBeLessThanOrEqual(1e-9);
        const step = { N: { x: 0, y: -1e-6 }, S: { x: 0, y: 1e-6 }, E: { x: 1e-6, y: 0 }, W: { x: -1e-6, y: 0 } }[side];
        expect(userOutlineRegion029(outline(kind), { x: exit.x + step.x, y: exit.y + step.y })).toBeGreaterThan(0);
      }
  });
});

describe('anchors on user outlines', () => {
  it('projects boundary anchors along the side normal to the first outline point', () => {
    close(userBoundaryAnchorPoint029(outline('ellipse'), 'N', 0.5), { x: 0.5, y: 0 });
    close(userBoundaryAnchorPoint029(outline('ellipse'), 'N', 0), { x: 0, y: 0.5 });
    close(userBoundaryAnchorPoint029(outline('ellipse'), 'N', 0.2), { x: 0.2, y: 0.5 - Math.sqrt(0.16) });
    close(userBoundaryAnchorPoint029(outline('diamond'), 'W', 0.25), { x: 0.25, y: 0.25 });
    close(userBoundaryAnchorPoint029(outline('rounded'), 'N', 0), { x: 0, y: 6 / 56 });
    close(userBoundaryAnchorPoint029(outline('rectangle'), 'S', 0.7), { x: 0.7, y: 1 });
  });

  it('resolves generic corners where the centre-to-corner segment meets the outline', () => {
    close(userCornerAnchorPoint029(outline('rectangle'), 'NE'), { x: 1, y: 0 });
    close(userCornerAnchorPoint029(outline('diamond'), 'SW'), { x: 0.25, y: 0.75 });
    close(userCornerAnchorPoint029(outline('ellipse'), 'NW'),
      { x: 0.5 - 0.5 / Math.SQRT2, y: 0.5 - 0.5 / Math.SQRT2 });
    const rx = 6 / 48; const ry = 6 / 56;
    const t = Math.sqrt(rx) / (Math.sqrt(rx) + Math.sqrt(ry));
    close(userCornerAnchorPoint029(outline('rounded'), 'NE'), { x: 1 - rx * (1 - t) ** 2, y: ry * t * t });
    close(userCornerAnchorPoint029(outline('rounded'), 'SE'), { x: 1 - rx * (1 - t) ** 2, y: 1 - ry * t * t });
  });

  it('attaches interior anchors where the exit ray leaves the outline', () => {
    expect(resolveUserAnchor029(outline('rounded'), { kind: 'interior', id: 'keyhole', x: 0.5, y: 0.55, exit: 'S' }))
      .toEqual({ ok: true, anchor: { id: 'keyhole', kind: 'interior', side: 'S',
        attachment: { x: 0.5, y: 1 }, interior: { x: 0.5, y: 0.55 } } });
    expect(resolveUserAnchor029(outline('ellipse'), { kind: 'boundary', id: 'crest', side: 'N', at: 0.5 }))
      .toEqual({ ok: true, anchor: { id: 'crest', kind: 'boundary', side: 'N', attachment: { x: 0.5, y: 0 } } });
  });

  it('accepts on-outline interior anchors only with a strictly outward exit', () => {
    const anchor = (x: number, y: number, exit: 'N' | 'E' | 'S' | 'W') =>
      ({ kind: 'interior' as const, id: 'a', x, y, exit });
    // Valid: a vertex, a side point and a curve point, each with an outward exit; empty escape.
    expect(resolveUserAnchor029(outline('rectangle'), anchor(0, 0, 'N')))
      .toEqual({ ok: true, anchor: { id: 'a', kind: 'interior', side: 'N', attachment: { x: 0, y: 0 } } });
    expect(resolveUserAnchor029(outline('diamond'), anchor(0, 0.5, 'N')).ok).toBe(true);
    expect(resolveUserAnchor029(outline('diamond'), anchor(0.5, 0, 'E')).ok).toBe(true);
    expect(resolveUserAnchor029(outline('ellipse'), anchor(0.5, 0, 'N')).ok).toBe(true);
    expect(resolveUserAnchor029(outline('rounded'), anchor(0.5, 0, 'N')).ok).toBe(true);
    // Tangent exits run along the boundary.
    expect(resolveUserAnchor029(outline('rectangle'), anchor(0, 0.5, 'N'))).toEqual({ ok: false, reason: 'exit' });
    expect(resolveUserAnchor029(outline('ellipse'), anchor(0.5, 0, 'E'))).toEqual({ ok: false, reason: 'exit' });
    expect(resolveUserAnchor029(outline('rounded'), anchor(0, 6 / 56, 'N'))).toEqual({ ok: false, reason: 'exit' });
    expect(resolveUserAnchor029(outline('rounded'), anchor(0, 0.5, 'S'))).toEqual({ ok: false, reason: 'exit' });
    // Inward exits.
    expect(resolveUserAnchor029(outline('rectangle'), anchor(0.5, 0, 'S'))).toEqual({ ok: false, reason: 'exit' });
    expect(resolveUserAnchor029(outline('diamond'), anchor(0.5, 1, 'N'))).toEqual({ ok: false, reason: 'exit' });
    // Outside.
    expect(resolveUserAnchor029(outline('diamond'), anchor(0.05, 0.05, 'N'))).toEqual({ ok: false, reason: 'outside' });
    expect(resolveUserAnchor029(outline('rounded'), anchor(0, 0, 'N'))).toEqual({ ok: false, reason: 'outside' });
  });
});

describe('frame resolver and artwork placement', () => {
  it('maps user-outline points by the identity and delegates every other shape', () => {
    const shape = userOutlineShape029(outline('ellipse'));
    expect(frameFitPoint029(shape, { x: 0.25, y: 0.75 }, 48, 56)).toEqual({ x: 0.25, y: 0.75 });
    expect(frameFitPoint029(shape, { x: 0.25, y: 0.75 }, 50, 56)).toEqual({ x: 0.25, y: 0.75 });
    const database = shapeRegistry.get('cylinder') ?? shapeRegistry.get('ellipse')!;
    expect(frameFitPoint029(database, { x: 0.25, y: 0.75 }, 200, 60))
      .toEqual(stencilFitPoint028(database, { x: 0.25, y: 0.75 }, 200, 60));
  });

  it('maps the artwork viewBox into the frame as xMidYMid meet', () => {
    // Taller artwork in a square frame: letterboxed left and right.
    expect(artworkPlacement029({ minX: 0, minY: 0, width: 24, height: 48 }, { x: 10, y: 20, width: 48, height: 48 }))
      .toEqual({ scale: 1, translateX: 22, translateY: 20 });
    // Wider artwork with an origin: letterboxed top and bottom.
    expect(artworkPlacement029({ minX: -10, minY: 5, width: 100, height: 50 }, { x: 0, y: 0, width: 50, height: 50 }))
      .toEqual({ scale: 0.5, translateX: 5, translateY: 10 });
  });
});

describe('sampled versus analytic rounded corners (Slice 20 tolerance)', () => {
  it('keeps layout-chosen contour contacts within sqrt(2) r / 4096 of the exact curve', () => {
    for (const [width, height] of [[48, 48], [160, 40], [40, 160]] as const) {
      const shape = outline('rounded', width, height);
      const r = Math.min(width, height) / 8;
      const stencil = userOutlineShape029(shape);
      const bound = (Math.SQRT2 * r) / 4096 + 1e-9;
      for (let index = 0; index <= 64; index += 1) {
        const angle = (index / 64) * 2 * Math.PI;
        const toward = { x: 0.5 + Math.cos(angle), y: 0.5 + Math.sin(angle) };
        const sampled = stencilRayPoint028(stencil, toward);
        const point = { x: sampled.x * width, y: sampled.y * height };
        // Distance in frame units to the exact outline: corners by dense curve search, edges exactly.
        let best = Math.min(Math.abs(point.y), Math.abs(point.y - height), Math.abs(point.x), Math.abs(point.x - width));
        for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [width, 0, -1, 1], [width, height, -1, -1], [0, height, 1, -1]] as const) {
          if (Math.abs(point.x - cx) > r + 1e-9 || Math.abs(point.y - cy) > r + 1e-9) continue;
          best = Number.POSITIVE_INFINITY;
          for (let step = 0; step <= 20000; step += 1) {
            const t = step / 20000;
            const curve = { x: cx + sx * r * t * t, y: cy + sy * r * (1 - t) ** 2 };
            best = Math.min(best, Math.hypot(curve.x - point.x, curve.y - point.y));
          }
        }
        expect(best).toBeLessThanOrEqual(bound);
      }
    }
  });
});
