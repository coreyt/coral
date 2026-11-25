import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { getEndpointGlyph029, wallTeeGlyph029 } from '../src/characterEndpoint029.js';
import { renderClassPicture028 } from '../src/characterClassPicture028.js';
import { CHARACTER_GLYPH_ROLES_028 as glyph } from '../src/characterGlyphRoles028.js';
import { renderRoutedCharacters028 } from '../src/characterRouted028.js';
import { computeElkLayout } from '../src/layout/engine.js';
import type { LayoutResult } from '../src/layout/types.js';

vi.mock('../src/layout/engine.js', () => ({ computeElkLayout: vi.fn() }));

const layout = vi.mocked(computeElkLayout);
type Direction = readonly [dx: number, dy: number, name: string];
type Family = 'arrow_open' | 'triangle_open' | 'diamond_filled';
const directions: readonly Direction[] = [
  [1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north'],
];
const families: readonly Family[] = ['arrow_open', 'triangle_open', 'diamond_filled'];

const nodes = [
  { id: 'source', sections: [['source']] },
  { id: 'target', sections: [['target']] },
];

function mockedLayout(dx: number, dy: number): LayoutResult {
  // Boxes are 10 by 3 cells for these captions. The route starts and ends
  // just outside them; renderClassPicture028 snaps both contacts to a wall.
  const horizontal = dx !== 0;
  const source = horizontal
    ? { x: dx > 0 ? 0 : 24, y: 4, width: 10, height: 3 }
    : { x: 8, y: dy > 0 ? 0 : 14, width: 10, height: 3 };
  const target = horizontal
    ? { x: dx > 0 ? 24 : 0, y: 4, width: 10, height: 3 }
    : { x: 8, y: dy > 0 ? 14 : 0, width: 10, height: 3 };
  const sourcePoint = horizontal
    ? { x: dx > 0 ? source.x + source.width : source.x - 1, y: source.y + 1 }
    : { x: source.x + 4, y: dy > 0 ? source.y + source.height : source.y - 1 };
  const targetPoint = horizontal
    ? { x: dx > 0 ? target.x - 1 : target.x + target.width, y: target.y + 1 }
    : { x: target.x + 4, y: dy > 0 ? target.y - 1 : target.y + target.height };
  return {
    nodes: [
      { id: 'source', position: source, absolutePosition: source, width: source.width, height: source.height },
      { id: 'target', position: target, absolutePosition: target, width: target.width, height: target.height },
    ],
    edges: [{ id: 'edge', sections: [{ startPoint: sourcePoint, bendPoints: [], endPoint: targetPoint }] }],
    width: 34, height: 16, effectiveOptions: {}, diagnostics: [],
  };
}

function cell(lines: string[], x: number, y: number): string {
  return lines[y]?.[x] ?? ' ';
}

function find(lines: string[], character: string): { x: number; y: number } {
  for (const [y, line] of lines.entries()) {
    const x = line.indexOf(character);
    if (x >= 0) return { x, y };
  }
  throw new Error(`Expected picture to contain ${JSON.stringify(character)}.`);
}

function routedGraph(includeBlocker = true): GraphIR {
  return {
    version: '3.0.0', id: 'collision', metadata: { notation: 'block' },
    nodes: [
      { id: 'source', type: 'block', label: 'source' },
      ...(includeBlocker ? [{ id: 'blocker', type: 'block', label: 'blocker' }] : []),
      { id: 'target', type: 'block', label: 'target' },
    ],
    edges: [{ id: 'edge', source: 'source', target: 'target', type: 'flow' }],
  } as GraphIR;
}

type Rect = { x: number; y: number; width: number; height: number };
const eastSource = { x: 0, y: 4, width: 18, height: 3 };
const eastTarget = { x: 30, y: 4, width: 18, height: 3 };
function routedLayout(points: Array<{ x: number; y: number }>, options: {
  source?: Rect; target?: Rect; blocker?: Rect;
} = {}): LayoutResult {
  const source = options.source ?? eastSource;
  const target = options.target ?? eastTarget;
  const nodes = [
    { id: 'source', position: source, absolutePosition: source, width: source.width, height: source.height },
    ...(options.blocker ? [{ id: 'blocker', position: options.blocker, absolutePosition: options.blocker,
      width: options.blocker.width, height: options.blocker.height }] : []),
    { id: 'target', position: target, absolutePosition: target, width: target.width, height: target.height },
  ];
  return { nodes, edges: [{ id: 'edge', sections: [{
    startPoint: points[0]!, bendPoints: points.slice(1, -1), endPoint: points.at(-1)!,
  }] }], width: 48, height: 7, effectiveOptions: {}, diagnostics: [] };
}

function routedPicture(text: string): string[] {
  return text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!.split('\n');
}

function boxOrigin(lines: string[], id: string): { x: number; y: number } {
  const label = `[${id}] ${id}`;
  for (const [y, row] of lines.entries()) {
    const x = row.indexOf(label);
    if (x >= 0) return { x: x - 2, y: y - 1 };
  }
  throw new Error(`Expected ${label} in the routed picture.`);
}

describe('MonoTrue Diagram Set endpoint cells', () => {
  beforeEach(() => layout.mockReset());

  it('maps a shaft direction into the opposite, box-facing endpoint port', () => {
    for (const family of families) for (const [dx, dy, name] of directions) {
      const port = dx > 0 ? 'w' : dx < 0 ? 'e' : dy > 0 ? 'n' : 's';
      expect(getEndpointGlyph029(family, dx, dy), `${family} entering from ${name}`).toBe(
        glyph[`endpoint.${family}.${port}`].character,
      );
    }
    expect(() => getEndpointGlyph029('arrow_open', 1, 1)).toThrow(/cardinal unit/);
    expect(() => wallTeeGlyph029(0, 0)).toThrow(/cardinal unit/);
  });

  it.each(families.flatMap((family) => directions.map(([dx, dy, name]) => [family, dx, dy, name] as const)))('keeps %s source and target marks adjacent to the correctly oriented wall tee from the %s',
    async (family, dx, dy, name) => {
      layout.mockResolvedValue(mockedLayout(dx, dy));
      const { picture, diagnostics } = await renderClassPicture028(nodes, [{
        id: 'edge', source: 'source', target: 'target', type: 'association',
        sourceMarker: family === 'diamond_filled' ? 'diamond/filled'
          : family === 'triangle_open' ? 'triangle/open' : 'arrow/open',
        targetMarker: family === 'diamond_filled' ? 'diamond/filled'
          : family === 'triangle_open' ? 'triangle/open' : 'arrow/open',
      }], 80, 'MonoTrue-v1');
      const lines = picture.split('\n');
      const sourceMarker = getEndpointGlyph029(family, -dx, -dy);
      const targetMarker = getEndpointGlyph029(family, dx, dy);
      const source = find(lines, sourceMarker);
      const target = find(lines, targetMarker);

      // The source marker is outside the source box, then the shaft continues.
      expect(cell(lines, source.x - dx, source.y - dy), `source wall from ${name}`).toBe(wallTeeGlyph029(dx, dy));
      // The target marker is outside the target box and points into its wall.
      expect(cell(lines, target.x + dx, target.y + dy), `target wall from ${name}`).toBe(wallTeeGlyph029(-dx, -dy));
      expect(Math.abs(source.x - target.x) + Math.abs(source.y - target.y)).toBeGreaterThan(2);
      expect(diagnostics).toEqual([]);

      // A controlled MonoTrue picture uses one PUA endpoint cell per marker,
      // never the legacy compound ASCII heads.
      const pua = [...picture].filter((character) => {
        const point = character.codePointAt(0)!;
        return point >= 0xe000 && point <= 0xf8ff;
      });
      expect(pua).toEqual(expect.arrayContaining([sourceMarker, targetMarker]));
      expect(picture).not.toMatch(/[<>#]/);
    });

  it('refuses an ordinary route when an unrelated contour occupies its outside MonoTrue marker cell', async () => {
    // target's left wall is x=30; its outside marker cell is x=29, where the
    // blocker deliberately has a vertical wall. Only the actual target wall
    // may be replaced by a tee.
    layout.mockResolvedValue(routedLayout([{ x: 17, y: 5 }, { x: 30, y: 5 }], {
      blocker: { x: 29, y: 4, width: 18, height: 3 },
    }));
    await expect(renderRoutedCharacters028(routedGraph(), 80, 'MonoTrue-v1')).rejects.toMatchObject({
      code: 'character.edge.route.unplaced', diagnostics: [expect.objectContaining({ path: 'edges.edge' })],
    });
  });

  it('refuses a target wall whose final straight segment is one cell after a bend', async () => {
    // Without the terminal-clearance guard, the endpoint marker would replace
    // the bend at (29,5) and silently lose the vertical connection.
    layout.mockResolvedValue(routedLayout([
      { x: 17, y: 5 }, { x: 22, y: 5 }, { x: 22, y: 3 },
      { x: 29, y: 3 }, { x: 29, y: 5 }, { x: 30, y: 5 },
    ]));
    await expect(renderRoutedCharacters028(routedGraph(false), 80, 'MonoTrue-v1')).rejects.toMatchObject({
      code: 'character.edge.route.unplaced', diagnostics: [expect.objectContaining({ path: 'edges.edge' })],
    });
  });

  it.each([
    ['east', 1, 0, eastSource, eastTarget, [{ x: 18, y: 5 }, { x: 30, y: 5 }]],
    ['west', -1, 0, { x: 30, y: 4, width: 18, height: 3 }, { x: 0, y: 4, width: 18, height: 3 }, [{ x: 29, y: 5 }, { x: 17, y: 5 }]],
    ['south', 0, 1, { x: 15, y: 0, width: 18, height: 3 }, { x: 15, y: 12, width: 18, height: 3 }, [{ x: 24, y: 3 }, { x: 24, y: 12 }]],
    ['north', 0, -1, { x: 15, y: 12, width: 18, height: 3 }, { x: 15, y: 0, width: 18, height: 3 }, [{ x: 24, y: 11 }, { x: 24, y: 2 }]],
  ] as const)('extends a one-cell %s source gap back to its own outward wall', async (_name, dx, dy, source, target, points) => {
    layout.mockResolvedValue(routedLayout(points, { source, target }));
    const result = await renderRoutedCharacters028(routedGraph(false), 80, 'MonoTrue-v1');
    const lines = routedPicture(result.text);
    const origin = boxOrigin(lines, 'source');
    const wall = { x: origin.x + (dx > 0 ? 17 : dx < 0 ? 0 : 9), y: origin.y + (dy > 0 ? 2 : dy < 0 ? 0 : 1) };
    expect(cell(lines, wall.x, wall.y)).toBe(wallTeeGlyph029(dx, dy));
    expect(cell(lines, wall.x + dx, wall.y + dy)).toBe(dx ? glyph['stroke.single.h'].character : glyph['stroke.single.v'].character);
  });

  it('does not extend a larger gap, a foreign wall, or a tangential first segment', async () => {
    layout.mockResolvedValue(routedLayout([{ x: 19, y: 5 }, { x: 30, y: 5 }]));
    let lines = routedPicture((await renderRoutedCharacters028(routedGraph(false), 80, 'MonoTrue-v1')).text);
    let source = boxOrigin(lines, 'source');
    expect(cell(lines, source.x + 17, source.y + 1)).toBe(glyph['stroke.single.v'].character);

    layout.mockResolvedValue(routedLayout([{ x: 29, y: 5 }, { x: 50, y: 5 }], {
      target: { x: 50, y: 4, width: 18, height: 3 }, blocker: { x: 8, y: 4, width: 21, height: 3 },
    }));
    lines = routedPicture((await renderRoutedCharacters028(routedGraph(), 80, 'MonoTrue-v1')).text);
    const foreign = boxOrigin(lines, 'blocker');
    expect(cell(lines, foreign.x + 20, foreign.y + 1)).toBe(glyph['stroke.single.v'].character);

    layout.mockResolvedValue(routedLayout([{ x: 18, y: 5 }, { x: 18, y: 11 }, { x: 30, y: 11 }], {
      target: { x: 30, y: 10, width: 18, height: 3 },
    }));
    lines = routedPicture((await renderRoutedCharacters028(routedGraph(false), 80, 'MonoTrue-v1')).text);
    source = boxOrigin(lines, 'source');
    expect(cell(lines, source.x + 17, source.y + 1)).toBe(glyph['stroke.single.v'].character);
  });
});
