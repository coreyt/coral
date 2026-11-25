import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTER_GLYPH_ROLES_028 } from '../src/characterGlyphRoles028.js';
import { createCharacterDebugView028, renderInstalledCharacterPreview028 } from '../src/index.js';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures/character-gallery', `${name}.coral`), 'utf8');

describe('character preview debug view', () => {
  it('adds zero-based rulers without changing any diagram cell', () => {
    const result = createCharacterDebugView028(' A,\n"B\n');
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.grid).toBe('    000\n    012\n  0  A,\n  1 "B \n');
    expect(result.csv).toBe('row,column,character,code_point\n'
      + '0,0," ",U+0020\n0,1,A,U+0041\n0,2,",",U+002C\n'
      + '1,0,"""",U+0022\n1,1,B,U+0042\n1,2," ",U+0020\n');
  });

  it('keeps digit alignment across both column and row boundaries', () => {
    const result = createCharacterDebugView028(`${'x'.repeat(121)}\n${'y'.repeat(121)}\n`);
    const lines = result.grid.trimEnd().split('\n');
    expect(lines.slice(0, 3).map((line) => line.slice(0, 4))).toEqual(['    ', '    ', '    ']);
    expect(lines.slice(0, 3).map((line) => line[4 + 120])).toEqual(['1', '2', '0']);
    expect(lines[3]).toBe(`  0 ${'x'.repeat(121)}`);
    expect(result.csv).toContain('1,120,y,U+0079\n');
    const manyRows = createCharacterDebugView028(Array.from({ length: 101 }, () => 'x').join('\n'));
    expect(manyRows.grid).toContain('\n   99 x\n  100 x\n');
  });

  it('identifies each Unicode glyph and every padded space from source-derived output', async () => {
    const preview = await renderInstalledCharacterPreview028(fixture('uml-class'), { columns: 120 });
    const view = createCharacterDebugView028(preview.text);
    const sourceRows = preview.text.slice(0, -1).split('\n');
    const columnDigits = Math.max(2, String(Math.max(0, view.width - 1)).length);
    const gridRows = view.grid.slice(0, -1).split('\n').slice(columnDigits);
    const prefix = String(sourceRows.length - 1).length + 2;
    expect(view.height).toBe(preview.height);
    expect(view.width).toBe(Math.max(...sourceRows.map((line) => [...line].length)));
    for (let row = 0; row < sourceRows.length; row++) {
      expect(gridRows[row]!.slice(prefix + 1)).toBe(sourceRows[row]!.padEnd(view.width, ' '));
    }
    expect(view.csv.split('\n').length - 2).toBe(view.width * view.height);
  });

  it('works on source-derived MonoTrue Unicode box drawing and ASCII', async () => {
    const ascii = await renderInstalledCharacterPreview028(fixture('flowchart'), { columns: 80 });
    const unicode = await renderInstalledCharacterPreview028(fixture('flowchart'), {
      columns: 80, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      },
    });
    expect(createCharacterDebugView028(ascii.text).csv).toContain('U+002B');
    expect(unicode.charset).toBe('MonoTrue-v1');
    const view = createCharacterDebugView028(unicode.text);
    expect(view.csv).toContain('U+250C');
    expect(view.grid).toContain('┌');
    const endpoint = CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.n'];
    expect(unicode.text).toContain(endpoint.character);
    expect(view.csv).toContain(endpoint.codepoint);
    expect(view.grid).toContain(endpoint.character);
  });

  it.each(['中', 'e\u0301', '\t', '\u001b[31m'])('refuses ambiguous or non-cell input %j', (text) => {
    expect(() => createCharacterDebugView028(text)).toThrow(/single-cell|control/i);
  });
});
