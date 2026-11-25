import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  PORTABLE_FONTS,
  getPortableFont,
  embeddedFontCssFor,
  resolveDiagramFont,
  resolveFont,
} from '../src/text/fonts.js';
import {
  fontResolutionCacheSnapshotForTests,
  resetFontResolutionCacheForTests,
} from '../src/text/font-cache.js';
import * as publicRenderApi from '../src/index.js';
import { measureLine, measureText } from '../src/text/metrics.js';

const UNICODE_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
  'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,' +
  'U+2212,U+2215,U+FEFF,U+FFFD';

const ASSET_FIXTURES = {
  sans: {
    packageName: '@fontsource-variable/inter',
    sha400: '3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62',
    sha700: '3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62',
    bytes400: 48256,
    bytes700: 48256,
    metricSha: '9ef53d9bf61343960846249ad532e22ddd259419f04b49ea7bb4b63689893197',
    licenseSha: '3b0a5fca3d17942cde889069889dedbbbd075e9b599968c82a95f4d944e9b345',
  },
  serif: {
    packageName: '@fontsource-variable/source-serif-4',
    sha400: 'c1df4596be5029233ed2afbb8b2f6ea20784b3fb1aa5d6b5c6519ccd85eb3dfb',
    sha700: 'c1df4596be5029233ed2afbb8b2f6ea20784b3fb1aa5d6b5c6519ccd85eb3dfb',
    bytes400: 50824,
    bytes700: 50824,
    metricSha: 'cd8819a231667e2d31b221c7ef648f4cfe410b25e176b3798ba6594f5dc45134',
    licenseSha: '18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3',
  },
  mono: {
    packageName: '@fontsource-variable/jetbrains-mono',
    sha400: '18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e',
    sha700: '18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e',
    bytes400: 40404,
    bytes700: 40404,
    metricSha: 'cd13e5987fc38d667fd146d9955e3a7b9de1012af523071dedc6b1f2d054ef5d',
    licenseSha: '403581b69dac5cff4079205e01c6b467e56af449ecbd7247693ddb1baafa005b',
  },
  handwritten: {
    packageName: '@fontsource/comic-neue',
    sha400: 'b7753f30f8bd4925cf48a2ffe936c52ff1f16fe441f8c0245acf046296ac590f',
    sha700: '13e9f12e3a0239dcf740e1c7ff37be1cce9b87ead0ad9bce838da1202ac9f91c',
    bytes400: 19572,
    bytes700: 19244,
    metricSha: '139a057ab97b9f6e78bfa6e9a255ed83c2b5f774c847a3aec0d6192cbfc10d92',
    licenseSha: 'b726facc10345ba22b2e4531984186f2334f55540aacef3e7e1c785e19f581fd',
  },
} as const;

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    const numericKeys = entries.every(([key]) => /^\d+$/.test(key));
    return `{${entries.sort(([left], [right]) => numericKeys
      ? Number(left) - Number(right)
      : left.localeCompare(right))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

describe('R-033 portable font registry', () => {
  it('contains a real, distinct release face for every selectable profile', () => {
    expect(PORTABLE_FONTS.map((font) => font.id)).toEqual([
      'sans',
      'serif',
      'mono',
      'handwritten',
    ]);
    expect(new Set(PORTABLE_FONTS.map((font) => font.cssFamily)).size).toBe(4);
    expect(new Set(PORTABLE_FONTS.map((font) => font.data400)).size).toBe(4);
    for (const font of PORTABLE_FONTS) {
      expect(font.data400).toMatch(/^data:font\/woff2;base64,d09GMg/);
      expect(font.data700).toMatch(/^data:font\/woff2;base64,d09GMg/);
      expect(font.source.version).toBe('5.3.0');
      expect(font.source.sha256_400).toMatch(/^[a-f0-9]{64}$/);
      expect(font.source.sha256_700).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('ships the exact Caveat generator face and license with pinned metric and ink inputs', () => {
    const pins = JSON.parse(readFileSync(
      new URL('../../../scripts/font-assets.json', import.meta.url), 'utf8',
    ));
    const caveat = pins.bundledFonts.find((font: { id: string }) => font.id === 'caveat');
    const font = getPortableFont('caveat');
    const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url));
    const input = read(caveat.asset.file);
    expect(sha256(input)).toBe(caveat.asset.sha256);
    expect(input.byteLength).toBe(caveat.asset.bytes);
    expect(Buffer.from(font.data400.split(',')[1]!, 'base64')).toEqual(input);
    expect(font.data700).toBe(font.data400);
    expect(font.source.url400).toBe(caveat.asset.url);
    expect(font.source.url700).toBe(caveat.asset.url);
    expect(font.source.upstreamVersion).toBe(caveat.upstreamRevision);
    expect(sha256(read(caveat.license.file))).toBe(caveat.license.sha256);
    expect(sha256(read(caveat.license.generatorInput))).toBe(caveat.license.sha256);
    expect(read(caveat.license.file).toString()).toContain('SIL OPEN FONT LICENSE Version 1.1');
    for (const output of caveat.metrics.outputs) {
      expect(sha256(read(output.file)), output.file).toBe(output.sha256);
    }
  });

  it('matches independently pinned asset, metric, license, package, and range fixtures', () => {
    for (const font of PORTABLE_FONTS) {
      const fixture = ASSET_FIXTURES[font.id];
      const bytes400 = Buffer.from(font.data400.split(',')[1]!, 'base64');
      const bytes700 = Buffer.from(font.data700.split(',')[1]!, 'base64');
      expect({
        packageName: font.source.packageName,
        version: font.source.version,
        unicodeRange: font.source.unicodeRange,
        sha400: sha256(bytes400),
        sha700: sha256(bytes700),
        bytes400: bytes400.byteLength,
        bytes700: bytes700.byteLength,
        metricSha: sha256(canonicalJson({ 400: font.metrics[400], 700: font.metrics[700] })),
        licenseSha: sha256(readFileSync(new URL(`../${font.source.licensePath}`, import.meta.url))),
      }).toEqual({
        packageName: fixture.packageName,
        version: '5.3.0',
        unicodeRange: UNICODE_RANGE,
        sha400: fixture.sha400,
        sha700: fixture.sha700,
        bytes400: fixture.bytes400,
        bytes700: fixture.bytes700,
        metricSha: fixture.metricSha,
        licenseSha: fixture.licenseSha,
      });
      expect(font.source.metricsSha256).toBe(fixture.metricSha);
      expect(font.source.licenseSha256).toBe(fixture.licenseSha);
    }

    const pins = JSON.parse(readFileSync(
      new URL('../../../scripts/font-assets.json', import.meta.url),
      'utf8',
    ));
    expect(pins.fontsourceVersion).toBe('5.3.0');
    expect(pins.fontToolsVersion).toBe('4.59.1');
    expect(pins.unicodeRange).toBe(UNICODE_RANGE);
    expect(pins.fonts.map((font: { id: string; package: string }) => [font.id, font.package]))
      .toEqual(PORTABLE_FONTS.map((font) => [font.id, ASSET_FIXTURES[font.id].packageName]));
  });

  it.each([
    ['-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 'sans'],
    ['"Inter", "Helvetica Neue", Arial, sans-serif', 'sans'],
    ['"Georgia", "Times New Roman", serif', 'serif'],
    ['"JetBrains Mono", "Fira Code", Consolas, monospace', 'mono'],
    ['"Comic Neue", "Comic Sans MS", cursive', 'handwritten'],
  ] as const)('maps the historical family %s to %s', (family, id) => {
    const resolved = resolveFont({ family });
    expect(resolved.id).toBe(id);
    expect(resolved.requestedFamily).toBe(family);
    expect(resolved.usedFallback).toBe(false);
  });

  it('uses a reported deterministic fallback without replacing the requested family', () => {
    expect(resolveFont({ family: 'Papyrus, fantasy' })).toMatchObject({
      id: 'sans',
      requestedFamily: 'Papyrus, fantasy',
      usedFallback: true,
    });
  });

  it('preserves positive requested values and bounds only the effective weight', () => {
    expect(resolveFont({ family: 'serif', size: 48, lineHeight: 2.25, weight: 599 }))
      .toMatchObject({ id: 'serif', size: 48, lineHeight: 2.25, weight: 400 });
    expect(resolveFont({ family: 'serif', weight: 600 }).weight).toBe(700);
    expect(resolveFont({ family: 'serif', weight: 'bold' }).weight).toBe(700);
  });

  it('merges symbol id before semantic type without mutating requested settings', () => {
    const requested = {
      default: { family: 'sans-serif', size: 14, weight: 'normal' as const, lineHeight: 1.3 },
      symbolOverrides: {
        service: { size: 18 },
        'arch-service': { family: 'monospace', weight: 700 },
      },
    };
    const before = structuredClone(requested);

    expect(resolveDiagramFont(requested, 'arch-service', 'service')).toMatchObject({
      id: 'mono', size: 14, weight: 700,
    });
    expect(resolveDiagramFont(requested, 'missing', 'service')).toMatchObject({
      id: 'sans', size: 18, weight: 400,
    });
    expect(requested).toEqual(before);
  });

  it('ignores unusable symbol overrides and normalizes partial overrides against diagram defaults', () => {
    const requested = {
      default: { family: 'serif', size: 48, weight: 'bold' as const, lineHeight: 2 },
      symbolOverrides: {
        service: { size: 20 },
        unusable: { family: '', size: 0, weight: 'heavy', lineHeight: -1 },
        partial: { family: 'monospace', size: 0, lineHeight: Number.NaN },
      },
    };

    expect(resolveDiagramFont(requested, 'unusable', 'service')).toMatchObject({
      id: 'serif', size: 20, weight: 700, lineHeight: 2,
    });
    expect(resolveDiagramFont(requested, 'partial', 'service')).toMatchObject({
      id: 'mono', size: 48, weight: 700, lineHeight: 2,
    });
  });

  it('emits only requested face/weight pairs and disables browser shaping variance', () => {
    const css = embeddedFontCssFor([
      { id: 'serif', weight: 700 },
      { id: 'serif', weight: 700 },
      { id: 'mono', weight: 400 },
    ]);

    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-family:'Coral Source Serif 4'");
    expect(css).toContain("font-family:'Coral JetBrains Mono'");
    expect(css).toContain('font-weight:700');
    expect(css).toContain('font-weight:400');
    expect(css).not.toContain("font-family:'Coral Comic Neue'");
    expect(css).toContain('font-kerning:none');
    expect(css).toContain('font-optical-sizing:none');
  });
});

describe('R-033 bounded family-resolution cache', () => {
  beforeEach(() => resetFontResolutionCacheForTests());

  it('refreshes hits and evicts the least-recently-used exact key at 128 entries', () => {
    for (let index = 0; index < 128; index++) {
      resolveFont({ family: `Unknown family ${index}` });
    }
    expect(fontResolutionCacheSnapshotForTests()).toMatchObject({
      size: 128,
      hits: 0,
      misses: 128,
      evictions: 0,
    });

    resolveFont({ family: 'Unknown family 0' });
    resolveFont({ family: 'Unknown family 128' });
    const snapshot = fontResolutionCacheSnapshotForTests();
    expect(snapshot).toMatchObject({ size: 128, hits: 1, misses: 129, evictions: 1 });
    expect(snapshot.keys).toContain('Unknown family 0');
    expect(snapshot.keys).toContain('Unknown family 128');
    expect(snapshot.keys).not.toContain('Unknown family 1');
  });

  it('caches fallback decisions by the exact normalized requested family string', () => {
    expect(resolveFont({ family: 'Papyrus, fantasy' })).toMatchObject({
      id: 'sans', usedFallback: true,
    });
    expect(resolveFont({ family: 'Papyrus, fantasy' })).toMatchObject({
      id: 'sans', usedFallback: true,
    });
    expect(resolveFont({ family: '  Papyrus, fantasy  ' })).toMatchObject({
      id: 'sans', usedFallback: true,
    });

    expect(fontResolutionCacheSnapshotForTests()).toMatchObject({
      size: 2,
      hits: 1,
      misses: 2,
      keys: ['Papyrus, fantasy', '  Papyrus, fantasy  '],
    });
  });

  it('keeps size, weight, and line height out of the family decision', () => {
    const small = resolveFont({ family: 'serif', size: 10, weight: 400, lineHeight: 1 });
    const large = resolveFont({ family: 'serif', size: 30, weight: 700, lineHeight: 2 });

    expect(small).toMatchObject({ id: 'serif', size: 10, weight: 400, lineHeight: 1 });
    expect(large).toMatchObject({ id: 'serif', size: 30, weight: 700, lineHeight: 2 });
    expect(fontResolutionCacheSnapshotForTests()).toMatchObject({
      size: 1,
      hits: 1,
      misses: 1,
    });
  });

  it('keeps cache test controls outside the package root surface', () => {
    expect(publicRenderApi).not.toHaveProperty('resetFontResolutionCacheForTests');
    expect(publicRenderApi).not.toHaveProperty('fontResolutionCacheSnapshotForTests');
  });
});

describe('R-033 profile metrics', () => {
  it.each([
    ['sans', 400, 16, 64, 90, 16],
    ['sans', 700, 20, 68, 92, 16],
    ['serif', 400, 24, 68, 88, 12],
    ['serif', 700, 24, 68, 90, 14],
    ['mono', 400, 40, 40, 100, 18],
    ['mono', 700, 40, 40, 100, 18],
    ['handwritten', 400, 16, 56, 78, 16],
    ['handwritten', 700, 16, 56, 77, 14],
  ] as const)(
    'pins exact %s/%i narrow, wide, wrap, and fallback metrics',
    (id, weight, narrow, wide, wrapWidth, fallbackWidth) => {
      const font = PORTABLE_FONTS.find((candidate) => candidate.id === id)!;
      expect(measureLine('iiii', 16, font.cssFamily, weight)).toBe(narrow);
      expect(measureLine('WWWW', 16, font.cssFamily, weight)).toBe(wide);
      expect(measureText({
        text: 'Payment Processing Service',
        fontSize: 16,
        fontFamily: font.cssFamily,
        fontWeight: weight,
        maxWidth: 100,
      })).toEqual({
        width: wrapWidth,
        height: 69,
        lines: ['Payment', 'Processing', 'Service'],
      });
      expect(measureLine('注文', 14, font.cssFamily, weight)).toBe(fallbackWidth);
    },
  );

  it('uses family-specific advances and true monospace advances', () => {
    const sansNarrow = measureLine('iiii', 16, 'sans-serif', 400);
    const sansWide = measureLine('WWWW', 16, 'sans-serif', 400);
    const monoNarrow = measureLine('iiii', 16, 'monospace', 400);
    const monoWide = measureLine('WWWW', 16, 'monospace', 400);

    expect(sansNarrow).toBeLessThan(sansWide);
    expect(monoNarrow).toBe(monoWide);
    expect(measureLine('Coral', 16, 'serif', 400)).not.toBe(
      measureLine('Coral', 16, 'sans-serif', 400),
    );
  });

  it('uses the selected weight table and remains repeatable', () => {
    const regular = measureText({ text: 'Minimum', fontSize: 18, fontFamily: 'serif', fontWeight: 400 });
    const bold = measureText({ text: 'Minimum', fontSize: 18, fontFamily: 'serif', fontWeight: 700 });

    expect(bold.width).not.toBe(regular.width);
    expect(measureText({ text: 'Minimum', fontSize: 18, fontFamily: 'serif', fontWeight: 700 }))
      .toEqual(bold);
  });

  it('uses one deterministic missing-glyph fallback without claiming coverage', () => {
    const first = measureText({ text: '注文', fontSize: 14, fontFamily: 'serif' });
    const second = measureText({ text: '注文', fontSize: 14, fontFamily: 'serif' });
    expect(first).toEqual(second);
    expect(first.width).toBeGreaterThan(0);
  });
});
