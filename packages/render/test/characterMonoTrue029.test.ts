import { describe, expect, it } from 'vitest';
import { renderInstalledCharacterPreview028 } from '../src/characterPreview028.js';
import { CHARACTER_GLYPH_ROLES_028 as roles } from '../src/characterGlyphRoles028.js';
import { finalizeCharacterPreview028 } from '../src/characterRouted028.js';

const faceHash = '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89';
const capability = () => ({ profile: 'monotrue-v1' as const, selected: true as const,
  face: 'Regular' as const, fontSha256: faceHash, validatedRoles: Object.keys(roles) });
const options = () => ({ columns: 120 as const, target: 'controlled-display' as const, monoTrue: capability() });
const picture = (text: string) => text.split('PICTURE\n')[1]!.split(/\n(?:GRAPH|NODES|EDGES)\n/)[0]!;
const sequence = '@diagram uml-sequence\nA participant\nB participant\na = A -> B\nb = B -#> A\nc = B -.-> A\n';
const glyph = (role: string) => (roles as Record<string, {character: string}>)[role]?.character;

describe('MonoTrue 0.2.0 Diagram Set integration', () => {
  it('uses route glyphs for asynchronous and filled synchronous heads, preserving lifeline tees', async () => {
    const result = await renderInstalledCharacterPreview028(sequence, options());
    expect(result.charset).toBe('MonoTrue-v1');
    const drawing = picture(result.text);
    expect(drawing).toContain(`${glyph('endpoint.arrow_open.w')}┤`);
    expect(drawing).toContain(`├${glyph('endpoint.triangle_filled.e')}`);
    expect(drawing).toContain(`├${glyph('endpoint.arrow_open.e')}`);
    expect(drawing).not.toContain('##');
    expect(result.diagnostics).toEqual([]);
  });

  it('uses authored class markers at the correct ends with wall contact', async () => {
    for (const [connector, role, target] of [
      ['A --#<> B [composition]', 'endpoint.diamond_filled.w', true],
      ['A -- B [composition, firstEnd: filledDiamond]', 'endpoint.diamond_filled.e', false],
      ['A --|> B [inheritance]', 'endpoint.triangle_open.w', true],
      ['A -- B [inheritance, firstEnd: triangle]', 'endpoint.triangle_open.e', false],
      ['A -> B [inheritance]', 'endpoint.arrow_open.w', true],
    ] as const) {
      const result = await renderInstalledCharacterPreview028(`@diagram uml-class\nA class\nB class\nm = ${connector}\n`, options());
      expect(result.charset).toBe('MonoTrue-v1');
      expect(picture(result.text)).toContain(target ? `${glyph(role)}┤` : `├${glyph(role)}`);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('uses a tee at the state box reached by a diagram arrow', async () => {
    const result = await renderInstalledCharacterPreview028('@diagram uml-state\ni initial\nA state\nf final\na = i -> A\nb = A -> f\n', options());
    expect(result.charset).toBe('MonoTrue-v1');
    expect(picture(result.text)).toContain(`${glyph('endpoint.arrow_open.w')}┤[A]`);
  });

  it('falls back as a whole picture for old hashes, missing roles and unknown faces', async () => {
    const ascii = await renderInstalledCharacterPreview028(sequence, { columns: 120 });
    const variants = [
      { ...capability(), fontSha256: '198d835ca603864991128d9492d0570451ab8285b71bd04e75975bc1072e5aef' },
      { ...capability(), validatedRoles: Object.keys(roles).filter(role => role !== 'endpoint.triangle_filled.e') },
      { ...capability(), validatedRoles: Object.keys(roles).filter(role => role !== 'stroke.single.tee_w') },
      { ...capability(), face: 'Unknown' as 'Regular' },
    ];
    for (const monoTrue of variants) {
      const result = await renderInstalledCharacterPreview028(sequence, { ...options(), monoTrue });
      expect(result.text).toBe(ascii.text);
      expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
    }
    expect((await renderInstalledCharacterPreview028(sequence, { ...options(), target: 'copy-export' })).text).toBe(ascii.text);
  });

  it('permits only generated PUA in controlled previews and rejects unknown PUA', () => {
    for (const character of ['\uE000', '\u{F0000}', '\u{100000}']) {
      expect(() => finalizeCharacterPreview028([character], 120, 'MonoTrue-v1', []))
        .toThrowError(expect.objectContaining({ code: 'character.charset.invalid' }));
    }
    expect(() => finalizeCharacterPreview028(['\uE14E'], 120, 'ASCII', []))
      .toThrowError(expect.objectContaining({ code: 'character.charset.invalid' }));
    expect(() => finalizeCharacterPreview028(['\uE14E'], 120, 'MonoTrue-v1', [])).not.toThrow();
  });
});
