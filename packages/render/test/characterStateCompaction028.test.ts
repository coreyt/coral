import { describe, expect, it } from 'vitest';
import { compactStateVerticalRuns, placeEdgeLabel } from '../src/characterRouted028.js';

const ascii = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', right: '>' };

describe('UML state shaft compaction', () => {
  it('keeps a separating row when removing it would join unrelated paths', () => {
    const rows = ['|+ ', '|  ', '|| '].map((row) => [...row]);
    expect(compactStateVerticalRuns(rows, ascii).map((row) => row.join(''))).toEqual(['|+ ', '|  ', '|| ']);
  });

  it('removes a redundant shaft row when no new contact is introduced', () => {
    const rows = ['|  ', '|  ', '|  '].map((row) => [...row]);
    expect(compactStateVerticalRuns(rows, ascii).map((row) => row.join(''))).toEqual(['|  ', '|  ']);
  });

  it('checks retained neighbors after an earlier shaft row is removed', () => {
    const rows = ['|+ ', '|  ', '|  ', '|| '].map((row) => [...row]);
    expect(compactStateVerticalRuns(rows, ascii).map((row) => row.join(''))).toEqual(['|+ ', '|  ', '|| ']);
  });

  it('keeps a gap between unrelated arrowheads and vertical arrows', () => {
    for (const rows of [['v|', ' |', '^|'], ['||', ' |', 'v|']]) {
      expect(compactStateVerticalRuns(rows.map((row) => [...row]), ascii)
        .map((row) => row.join(''))).toEqual(rows);
    }
  });

  it('keeps a blank row between captions sharing one vertical lane', () => {
    const rows = ['abc|', '   |', 'def|'].map((row) => [...row]);
    expect(compactStateVerticalRuns(rows, ascii).map((row) => row.join(''))).toEqual(['abc|', '   |', 'def|']);
  });

  it('keeps a blank row between punctuation-only captions recorded by placement', () => {
    const rows = ['!!!|', '   |', '???|'].map((row) => [...row]);
    expect(compactStateVerticalRuns(rows, ascii, new Set([rows[0], rows[2]]))
      .map((row) => row.join(''))).toEqual(['!!!|', '   |', '???|']);
  });

  it('places overlapping state captions at least one row apart', () => {
    const grid = Array.from({ length: 8 }, () => Array<string>(12).fill(' '));
    for (const row of grid) for (let x = 8; x < 12; x++) row[x] = '#';
    for (const [offset, char] of [...'old!'].entries()) grid[3]![2 + offset] = char;
    const occupied = new Set([...Array(4)].map((_, offset) => `3:${2 + offset}`));
    expect(placeEdgeLabel(grid, [{ x: 7, y: 0 }, { x: 7, y: 7 }], 'next', [], 'uml-state', occupied))
      .toBe(true);
    expect(grid[1]!.join('')).toContain('next');
    expect(grid[2]!.join('')).not.toContain('next');
    expect(grid[4]!.join('')).not.toContain('next');
  });
});
