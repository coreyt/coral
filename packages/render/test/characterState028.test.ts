import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028, prepareInstalledDocumentForSave028,
  renderInstalledCharacterPreview028 } from '../src/index.js';
import { CHARACTER_GLYPH_ROLES_028 } from '../src/characterGlyphRoles028.js';
import { renderUmlStateCharacters028 } from '../src/characterState028.js';

const fixture = readFileSync(new URL('./fixtures/character-gallery/uml-state.coral', import.meta.url), 'utf8');
const incomplete = readFileSync(new URL('./fixtures/character-gallery/uml-state-incomplete.coral', import.meta.url), 'utf8');
const monoTrue = { profile: 'monotrue-v1' as const, selected: true as const, face: 'Regular' as const,
  fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
  validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) };

describe('0.2.8 bounded UML-state character edition', () => {
  it('binds the selected initial marker to the exact MonoTrue candidate requirement', () => {
    expect(CHARACTER_GLYPH_ROLES_028['mark.circle.filled']).toMatchObject({
      character: '●', bindingId: 'mt:state.initial@1', candidateId: 'mark.circle.filled', codepoint: 'U+25CF',
    });
  });

  it('projects complete source into exact directed Graph IR 3 and returns that graph', async () => {
    const parsed = parseInstalledDocument028(fixture);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph).toMatchObject({ version: '3.0.0', metadata: { notation: 'uml-state' },
      nodes: [{ id: 'start', type: 'initial' }, { id: 'Idle', type: 'state' },
        { id: 'Running', type: 'state' }, { id: 'finish', type: 'final' }],
      edges: [{ id: 'begin', source: 'start', target: 'Idle', type: 'transition', label: 'begin' },
        { id: 'run', source: 'Idle', target: 'Running', type: 'transition', label: 'run' },
        { id: 'end', source: 'Running', target: 'finish', type: 'transition', label: 'end' }] });
    expect(parsed.graph).not.toHaveProperty('profile');
    const saved = prepareInstalledDocumentForSave028(fixture, parsed);
    expect(parseInstalledDocument028(saved.source).graph).toEqual(parsed.graph);
    const result = await renderInstalledCharacterPreview028(fixture, { columns: 120 });
    expect(result.graph).toEqual(parsed.graph);
    expect(result.charset).toBe('ASCII');
    for (const value of ['[Idle]', '[Running]', 'begin', 'run', 'end', 'start', 'finish']) {
      expect(result.text).toContain(value);
    }
    expect(result.text).toMatch(/#####.*>.*\[Idle\].*>.*\[Running\].*>/);
    expect(result.text).toMatch(/#####-+>/);
    expect(result.text).toContain('###');
    expect(result.text).toMatch(/\(.*###.*\)/);
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    const asciiGolden = readFileSync(new URL('./fixtures/character-gallery/uml-state.expected-ascii.txt', import.meta.url), 'utf8');
    expect(`CHAR-PREVIEW/1 uml-state ASCII\nPICTURE\n${picture}\n`).toBe(asciiGolden);
    expect(picture.split('\n').every((row) => row === row.trimEnd())).toBe(true);
    expect(await renderInstalledCharacterPreview028(fixture, { columns: 120 })).toEqual(result);
  });

  it('draws a compound filled initial and outlined final circle in controlled MonoTrue', async () => {
    const result = await renderInstalledCharacterPreview028(fixture,
      { columns: 120, target: 'controlled-display', monoTrue });
    expect(result.charset).toBe('MonoTrue-v1');
    expect(result.text).toContain('●');
    expect(result.text).toContain('●●●●●');
    const arrow = CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.w'].character;
    expect(result.text).toMatch(new RegExp(`●●●●●─+${arrow}`));
    expect(result.text).toMatch(/\(.*●●●.*\)/);
    expect(result.text).toContain(arrow);
    expect(result.diagnostics.some((item) => item.code === 'character.glyph.approximation')).toBe(false);
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    const monoGolden = readFileSync(new URL('./fixtures/character-gallery/uml-state.expected-monotrue.txt', import.meta.url), 'utf8');
    expect(`CHAR-PREVIEW/1 uml-state MonoTrue-v1\nPICTURE\n${picture}\n`).toBe(monoGolden);
  });

  it('falls back to whole-diagram printable ASCII for a wrong font capability', async () => {
    const result = await renderInstalledCharacterPreview028(fixture, { columns: 120,
      target: 'controlled-display', monoTrue: { ...monoTrue, face: 'Bold' } });
    expect(result.charset).toBe('ASCII');
    expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('honors 40/80/120 column bounds or refuses width explicitly', async () => {
    const small = '@diagram uml-state\ns initial\na state\nf final\nx = s -> a\ny = a -> f\n';
    for (const columns of [40, 80, 120] as const) {
      const result = await renderInstalledCharacterPreview028(small, { columns });
      expect(result.text.split('\n').every((row) => row.length <= columns)).toBe(true);
    }
    await expect(renderInstalledCharacterPreview028(fixture.replaceAll('Running', 'LongRunningStateName'), { columns: 40 }))
      .rejects.toMatchObject({ code: 'character.width.unsupported' });
  });

  it('refuses incomplete and normalized-away source semantics', async () => {
    for (const source of [incomplete,
      fixture.replace('Idle state', 'Idle state {\n  p port [direction: out]\n}'),
      fixture.replace('Idle state', 'Idle state [conformanceException: "some-symbol"]'),
      fixture.replace('start -> Idle', 'start -- Idle'),
      fixture.replace('start -> Idle', 'start.p -> Idle')]) {
      await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
        .rejects.toMatchObject({ code: expect.stringMatching(/^character\./) });
    }
  });

  it('refuses disconnected, invalid initial fanout and extra Graph IR meaning', () => {
    const graph = parseInstalledDocument028(fixture).graph!;
    expect(() => renderUmlStateCharacters028({ ...graph, edges: graph.edges.slice(1) }, 120, 'ASCII'))
      .toThrowError(expect.objectContaining({ code: 'character.state.graph' }));
    expect(() => renderUmlStateCharacters028({ ...graph, constraints: [] }, 120, 'ASCII'))
      .toThrowError(expect.objectContaining({ code: 'character.field.unsupported' }));
    expect(() => renderUmlStateCharacters028({ ...graph,
      edges: [...graph.edges, { ...graph.edges[0]!, id: 'branch', target: 'Running' }] }, 120, 'ASCII'))
      .toThrowError(expect.objectContaining({ code: 'character.state.graph' }));
  });

  it('locates state size refusals at the offending collection', () => {
    const graph = parseInstalledDocument028(fixture).graph!;
    expect(() => renderUmlStateCharacters028({ ...graph, nodes: graph.nodes.slice(0, 2) }, 120, 'ASCII'))
      .toThrowError(expect.objectContaining({ code: 'character.state.size', diagnostics: [
        expect.objectContaining({ path: 'nodes' }),
      ] }));
    expect(() => renderUmlStateCharacters028({ ...graph, edges: graph.edges.slice(0, 1) }, 120, 'ASCII'))
      .toThrowError(expect.objectContaining({ code: 'character.state.size', diagnostics: [
        expect.objectContaining({ path: 'edges' }),
      ] }));
  });
});
