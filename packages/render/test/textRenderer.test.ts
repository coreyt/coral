import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderText, renderTextGraph } from '../src/textRenderer/index.js';
import { CHARACTER_GLYPH_ROLES_028, FONT_SHA_BY_FACE_029 } from '../src/characterGlyphRoles028.js';

const source = '@diagram flowchart\na process as "Alpha"\nb process as "Béta"\na -> b';
const chain = '@diagram flowchart\n' + Array.from({ length: 36 }, (_, i) => `n${i} process as "Node ${i}"`).join('\n') +
  '\n' + Array.from({ length: 35 }, (_, i) => `n${i} -> n${i+1} as "step ${i}"`).join('\n') + '\nn35 -> n0';

describe('document invariants', () => {
  it.each(['letter', 'a4'] as const)('AC-1/2/3 bounds and paired portals on %s', async page => {
    const config = { page, eol: 'crlf' } as const;
    const result = await renderText(chain, config);
    expect(result.text).toBe((await renderText(chain, config)).text);
    expect(result.pages.join('\f\r\n')).toBe(result.text);
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.continuationLinks.length).toBeGreaterThanOrEqual(result.pageCount);
    for (const p of result.pages) {
      expect(p.split('\r\n').length).toBeLessThanOrEqual(page === 'letter' ? 55 : 60);
      for (const line of p.split('\r\n')) {
        expect(line).toMatch(/^[ -~]*$/); expect(line).not.toMatch(/ $/);
        expect(line.length).toBeLessThanOrEqual(72);
      }
    }
    for (const { key, fromPage, toPage } of result.continuationLinks) {
      const back = fromPage > toPage;
      expect(result.pages[fromPage-1].split(`[-> p.${toPage}:${key}${back ? ' ^' : ''}]`)).toHaveLength(2);
      expect(result.pages[toPage-1].split(`[${back ? 'v ' : ''}p.${fromPage}:${key} ->]`)).toHaveLength(2);
    }
    expect((await renderText(source)).text).toContain('B\\u{E9}ta');
  });
  it('AC-5 preserves relative ordering and reports lossy geometry', async () => {
    const graph = (y: number) => ({ version: '3.0.0' as const, id: 'g', metadata: { notation: 'architecture' },
      nodes: [{ id: 'a', type: 'service', label: 'Alpha', position: { x: 0, y } },
        { id: 'b', type: 'service', label: 'Beta', position: { x: 5, y: 2 } }], edges: [] });
    expect((await renderTextGraph(graph(1))).text).toMatch(/Alpha[\s\S]+Beta/);
    expect((await renderTextGraph(graph(3))).text).toMatch(/Beta[\s\S]+Alpha/);
    await expect(renderTextGraph(graph(3), { strict: true })).rejects.toHaveProperty('code', 'text.geometry.ignored');
  });
  it('AC-5 renders authored geometry, RGB and symbol artwork with located notices', async () => {
    const ordered = (y: number) => '@diagram architecture\n@coralVersion "0.2.14"\n' +
      `a service [style: "fill: #eef6ff"] as "Alpha" @ (0, ${y})\nb service as "Beta" @ (1, 3)`;
    expect((await renderText(ordered(4))).text).toMatch(/Beta[\s\S]+Alpha/);
    const styled = await renderText(ordered(2));
    expect(styled.text).toMatch(/Alpha[\s\S]+Beta/);
    expect(styled.diagnostics).toContainEqual(expect.objectContaining({ code: 'text.style.ignored', path: 'a' }));
    await expect(renderText(ordered(4), { strict: true })).rejects.toHaveProperty('code', 'text.style.ignored');
    const source = readFileSync(new URL('../../diagram-editor/src/example-sources/user-symbol.coral', import.meta.url), 'utf8');
    const symbol = await renderText(source);
    expect(symbol.text).toContain('Gateway');
    expect(symbol.text).not.toContain('<svg');
    await expect(renderText(source, { strict: true })).rejects.toHaveProperty('code', 'text.artwork.ignored');
  });
  it('AC-6 disambiguates duplicate labels and budgets a custom prefix', async () => {
    const text = source.replace('Béta', 'Alpha');
    const result = await renderText(text, { profile: 'comment', columns: 32, commentPrefix: 'REM ' });
    expect(result.text).toContain('[a] Alpha');
    expect(result.text).toContain('[b] Alpha');
    expect(result.text.split('\n').every(line => line.startsWith('REM ') && line.length <= 32)).toBe(true);
  });
  it.each(['block-c', 'html'] as const)('AC-6 neutralizes %s body and budgets prefix', async commentStyle => {
    const r = await renderText(source.replace('Alpha', 'A */ -->'), { profile: 'comment', commentStyle, columns: 32 });
    const body = r.text.split('\n').slice(1,-1).join('\n');
    expect(body).not.toContain(commentStyle === 'block-c' ? '*/' : '-->');
    expect(r.width).toBeLessThanOrEqual(32); expect(r.charset).toBe('utf8-box');
    expect(r.diagnostics.map(d => d.code)).toContain('text.comment.delimiter');
  });
  it('AC-7 preserves long labels and refuses impossible prefixes', async () => {
    const word = '0123456789'.repeat(20);
    const { text } = await renderText(source.replace('Alpha', word), { pageWidth: 40 });
    expect(text.replaceAll('\n', '')).toContain(word);
    await expect(renderText(source, { profile: 'comment', columns: 32, commentPrefix: 'x'.repeat(32) }))
      .rejects.toHaveProperty('code', 'text.width.unfit');
  });
  it('AC-8 verifies the selected Regular font and glyph set atomically', async () => {
    const monoTrue = { profile: 'monotrue-v1', selected: true, face: 'Regular', fontSha256: FONT_SHA_BY_FACE_029.Regular,
      validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) } as const;
    const opts = { charset: 'monotrue-v1', monoTrue } as const;
    expect((await renderText(source, opts)).text).toContain(CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.n'].character);
    for (const cap of [undefined, { ...monoTrue, face: 'Bold' as const }, { ...monoTrue, fontSha256: '' }, { ...monoTrue, validatedRoles: [] }]) {
      const actual = await renderText(source, { ...opts, monoTrue: cap });
      expect(actual.charset).toBe('ascii'); expect(actual.text).toBe((await renderText(source)).text);
    }
  });
});
