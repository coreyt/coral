import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, parseInstalledDocument028, SVG_ARTWORK_CODES_029 } from '../src/index.js';

// Artwork admission in Coral source: the shared installed reader admits every
// artwork block, each failure is one located diagnostic (profile §13.2), and
// no consumer in this repository reads definitions without admission.

const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
  '  <path d="M 12 0 L 24 4 Z" fill="#2f6f4f" stroke="none" stroke-width="1" opacity="1"/>\n</svg>\n';
const document = (artwork: string, fields = '  name "Shield"\n  size 24 x 28\n') =>
  '@diagram architecture\n@coralVersion "0.2.9"\n\n@symbol shield {\n' + fields + '  artwork svg """\n' + artwork + '"""\n}\n' +
  'gate service\n';
const root = new URL('../../', import.meta.url);

describe('artwork admission in the installed source reader', () => {
  it('admits canonical artwork, lists it by definition ID and keeps it canonical (SA-5)', () => {
    const parsed = parseInstalledDocument028(document(ARTWORK));
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.definitions?.map((definition) => definition.id)).toEqual(['shield']);
    const artwork = parsed.artwork?.get('shield');
    expect(artwork?.inputIsCanonical).toBe(true);
    expect(artwork?.canonicalText).toBe(ARTWORK);
    expect([...parsed.artwork!.keys()]).toEqual(['shield']);
  });

  it('admits CR LF artwork without a finding, but not as canonical text', () => {
    const parsed = parseInstalledDocument028(document(ARTWORK).replace(/\n/g, '\r\n'));
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.artwork?.get('shield')?.inputIsCanonical).toBe(false);
    expect(parsed.artwork?.get('shield')?.canonicalText).toBe(ARTWORK);
  });

  it('reports each refusal as a located coral.artwork.svg.* diagnostic and withholds the definition', () => {
    const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
      '  <path d="M0 0H1" onclick="x"/>\n  <g class="a" tabindex="0"/>\n</svg>\n';
    const source = document(artwork);
    const parsed = parseInstalledDocument028(source);
    expect(parsed.definitions).toEqual([]);
    expect(parsed.artwork?.size).toBe(0);
    const diagnostics = parsed.syntax.diagnostics;
    expect(diagnostics.map((item) => item.code)).toEqual(Array(3).fill('coral.artwork.svg.attribute.unsupported'));
    expect(diagnostics[0]).toMatchObject({ severity: 'error', position: { line: 9, column: 19, offset: source.indexOf('onclick') } });
    expect(diagnostics[0]!.range?.end.offset).toBe(source.indexOf('onclick') + 'onclick="x"'.length);
    expect(diagnostics[1]!.position).toMatchObject({ line: 10, column: 5 });
    expect(diagnostics[2]!.position).toMatchObject({ line: 10, column: 15 });
    expect(diagnostics[0]!.message).toBe('Symbol shield artwork: <path> attribute "onclick" is not admitted');
  });

  // Author decision 2026-10-30: at most 64 failures per block, then one diagnostic
  // that reuses the first suppressed failure's code and counts the rest (profile §13.2).
  const flooded = (count: number, tail = '') => document('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
    `  <path d="M0 0H1"${Array.from({ length: count }, (_, index) => ` q${index}=""`).join('')}/>${tail}\n</svg>\n`);
  it('reports every failure of a block with at most 64', () => {
    const diagnostics = parseInstalledDocument028(flooded(64)).syntax.diagnostics;
    expect(diagnostics).toHaveLength(64);
    expect(diagnostics.every((item) => /attribute "q\d+" is not admitted$/.test(item.message))).toBe(true);
  });

  it('reports the first 64 failures and one diagnostic counting the suppressed rest', () => {
    const source = flooded(64, '<script/>');
    const diagnostics = parseInstalledDocument028(source).syntax.diagnostics;
    expect(diagnostics).toHaveLength(65);
    expect(diagnostics[63]!.message).toContain('"q63"');
    expect(diagnostics[64]).toMatchObject({ severity: 'error', code: 'coral.artwork.svg.element.unsupported',
      message: 'Symbol shield artwork: 1 further artwork failure suppressed',
      position: { offset: source.indexOf('<script/>') } });
  });

  it('bounds a large flood to 65 diagnostics', () => {
    const diagnostics = parseInstalledDocument028(flooded(10_000)).syntax.diagnostics;
    expect(diagnostics).toHaveLength(65);
    expect(diagnostics[64]).toMatchObject({ code: 'coral.artwork.svg.attribute.unsupported',
      message: 'Symbol shield artwork: 9936 further artwork failures suppressed' });
  });

  it('locates ingress and budget refusals at the artwork opening', () => {
    const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + '<path d="M0 0H1"/>'.repeat(1_024) + '</svg>\n';
    const source = document(artwork);
    const [diagnostic] = parseInstalledDocument028(source).syntax.diagnostics;
    expect(diagnostic).toMatchObject({ code: 'coral.artwork.svg.budget.exceeded', position: { line: 7, column: 2 } });
    expect(diagnostic!.message).toContain('elements 1025 > 1024');
  });

  it('drops admitted artwork of a definition withheld for another finding', () => {
    const parsed = parseInstalledDocument028(document(ARTWORK, '  size 24 x 28\n'));
    expect(parsed.syntax.diagnostics.map((item) => item.code)).toEqual(['coral.symbol.local.field.required']);
    expect(parsed.definitions).toEqual([]);
    expect(parsed.artwork?.size).toBe(0);
  });

  it('caches admission by artwork text', () => {
    const text = ARTWORK.replace('24 28', '24 29');
    expect(admitSvgArtwork029(text)).toBe(admitSvgArtwork029(`${text}`));
  });

  it('owns exactly the approved admission codes in the diagnostics catalog', () => {
    const catalog = JSON.parse(readFileSync(new URL('language/spec/diagnostics.json', root), 'utf8')) as
      { consumerCodes: { code: string; phase: string; owner: string }[] };
    const admission = catalog.consumerCodes.filter((item) => item.phase === 'admission');
    expect(admission.map((item) => item.code)).toEqual([...SVG_ARTWORK_CODES_029]);
    for (const item of admission) expect(item.owner).toBe('packages/render/src/artwork/svgArtworkSource029.ts');
  });

  it('leaves no consumer outside the language package reading definitions without admission', () => {
    const offenders: string[] = [];
    const visit = (directory: URL) => {
      for (const entry of readdirSync(directory)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const url = new URL(entry, directory);
        if (statSync(url).isDirectory()) visit(new URL(`${entry}/`, directory));
        else if (/\.(?:ts|tsx|mts)$/.test(entry)) {
          const text = readFileSync(url, 'utf8');
          const rootImports = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@coral-viz\/language'/g)].map((match) => match[1]!);
          if (rootImports.some((names) => /(?:^|[\s,])parse(?:\s+as\s+\w+)?\s*(?:,|$)/.test(names))) offenders.push(`${url.pathname} imports parse`);
          for (const call of text.matchAll(/parseDocument028\(([^;]*?)\);/gs)) {
            if (!call[1]!.includes('admitArtwork')) offenders.push(`${url.pathname} calls parseDocument028 without admitArtwork`);
          }
        }
      }
    };
    for (const pkg of readdirSync(root)) {
      if (pkg === 'language') continue;
      const src = new URL(`${pkg}/src/`, root);
      try { if (statSync(src).isDirectory()) visit(src); } catch { /* no src */ }
    }
    expect(offenders).toEqual([]);
  });
});
