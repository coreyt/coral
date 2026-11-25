import { describe, expect, it } from 'vitest';
import { parseHeader028, prepareHeaderForSave028, type HeaderManifest028 } from '../src/parser/header028.js';

const digest = (character: string) => `sha256-${character.repeat(64)}`;
const manifest: HeaderManifest028 = {
  '0.2.8': {
    flowchart: {
      profiles: [{ id: 'flowchart', version: '1.0.0' }, { id: 'flowchart', version: '2.0.0' }],
      catalogs: [
        { id: 'flowchart', version: '1.0.0', digest: digest('a') },
        { id: 'flowchart', version: '2.0.0', digest: digest('b') },
      ],
      compatible: [['1.0.0', '1.0.0'], ['2.0.0', '2.0.0']],
      defaults: ['1.0.0', '1.0.0'],
    },
    'uml-sequence': {
      profiles: [{ id: 'uml', kind: 'sequence', version: '1.0.0' }],
      catalogs: [{ id: 'uml-sequence', version: '1.0.0', digest: digest('c') }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    'uml-class': {
      profiles: [{ id: 'uml', kind: 'class', version: '1.0.0' }],
      catalogs: [{ id: 'uml-class', version: '1.0.0', digest: digest('d') }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
  },
  '0.2.9': {
    flowchart: {
      profiles: [{ id: 'flowchart', version: '2.0.0' }],
      catalogs: [{ id: 'flowchart', version: '2.0.0', digest: digest('b') }],
      compatible: [['2.0.0', '2.0.0']], defaults: ['2.0.0', '2.0.0'],
    },
  },
};
const trustedDigests = {
  'flowchart@1.0.0': digest('a'), 'flowchart@2.0.0': digest('b'),
  'uml-sequence@1.0.0': digest('c'), 'uml-class@1.0.0': digest('d'),
};
const runtime = { manifest, currentVersion: '0.2.8', trustedDigests } as const;

describe('Coral 0.2.8 source header — RED before implementation', () => {
  it('requires the diagram type but safely defaults every metadata field', () => {
    const source = '@diagram flowchart\nstart process\n';
    const parsed = parseHeader028(source, runtime);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.header).toMatchObject({ diagramType: 'flowchart',
      effectiveCoralVersion: '0.2.8', conformanceLevel: 'typical',
      profile: { id: 'flowchart', version: '1.0.0' },
      catalog: { id: 'flowchart', version: '1.0.0', digest: digest('a') },
      explicit: { coralVersion: false, profileVersion: false,
        catalogVersion: false, conformanceLevel: false },
    });
    expect(parsed.diagramTypeRange).toEqual({
      start: { line: 1, column: 9, offset: 9 },
      end: { line: 1, column: 18, offset: 18 },
    });
    expect(parsed.body.length).toBe(source.length);
    expect(parsed.body.slice(source.indexOf('start process'))).toBe('start process\n');
    for (const invalid of ['start process\n', '@diagram\nstart process\n']) {
      expect(parseHeader028(invalid, runtime).diagnostics.some((item) => item.code === 'header.diagram.required')).toBe(true);
    }
  });

  it('resolves distinct UML kinds and explicit overrides without changing omitted defaults', () => {
    const source = '// preface\n@diagram uml-sequence\n\n// header note\n@conformanceLevel strict\n' +
      '@catalogVersion "1.0.0"\n@profileVersion \'1.0.0\'\n@coralVersion "0.2.8"\nclient participant\n';
    const sequence = parseHeader028(source, runtime);
    expect(sequence.diagnostics).toEqual([]);
    expect(sequence.header?.profile).toEqual({ id: 'uml', kind: 'sequence', version: '1.0.0' });
    expect(sequence.header?.conformanceLevel).toBe('strict');
    expect(sequence.header?.explicit).toEqual({ coralVersion: true, profileVersion: true,
      catalogVersion: true, conformanceLevel: true });
    expect(parseHeader028('@diagram uml-class\n', runtime).header?.profile).toEqual(
      { id: 'uml', kind: 'class', version: '1.0.0' });
    expect(parseHeader028('@diagram flowchart\n@profileVersion "2.0.0"\n', runtime)
      .diagnostics.map((item) => item.code)).toContain('header.versions.incompatible');
    expect(parseHeader028('@diagram flowchart\n@catalogVersion "2.0.0"\n', runtime)
      .diagnostics.map((item) => item.code)).toContain('header.versions.incompatible');
    expect(parseHeader028('@diagram flowchart\n@profileVersion "2.0.0"\n@catalogVersion "2.0.0"\n', runtime)
      .header?.catalog.digest).toBe(digest('b'));
  });

  it('fails closed for missing snapshots, changed digests, unknown and duplicate directives', () => {
    const missingSnapshot = parseHeader028('@diagram flowchart\n',
      { ...runtime, trustedDigests: {} });
    expect(missingSnapshot.header).toBeUndefined();
    expect(missingSnapshot.diagnostics.map((item) => item.code))
      .toContain('header.catalog.snapshot-unavailable');
    expect(parseHeader028('@diagram flowchart\n@coralVersion "9.9.9"\n', runtime)
      .diagnostics.map((item) => item.code)).toContain('header.version.unavailable');
    expect(parseHeader028('@diagram flowchart\n@catalogVersion "9.9.9"\n', runtime)
      .diagnostics.map((item) => item.code)).toContain('header.catalog.unavailable');
    expect(parseHeader028('@diagram flowchart\n@notificationLevel debug\n', runtime)
      .diagnostics.map((item) => item.code)).toContain('header.directive.unknown');
    const duplicate = parseHeader028('@diagram flowchart\n@conformanceLevel strict\n@conformanceLevel typical\n', runtime);
    const diagnostic = duplicate.diagnostics.find((item) => item.code === 'header.directive.duplicate');
    expect(diagnostic?.range.start.line).toBe(3);
    expect(diagnostic?.range.start.column).toBe(0);
    expect(diagnostic?.related?.[0]?.range.start.line).toBe(2);
    expect(diagnostic?.related?.[0]?.range.start.column).toBe(0);
    const changed = structuredClone(manifest);
    changed['0.2.8']!.flowchart!.catalogs[0]!.digest = digest('e');
    expect(parseHeader028('@diagram flowchart\n', { manifest: changed,
      currentVersion: '0.2.8', trustedDigests: { 'flowchart@1.0.0': digest('a') } })
      .diagnostics.map((item) => item.code)).toContain('header.catalog.digest-mismatch');
    const unknown = parseHeader028('// intro\r\n  @diagram unavailable\r\n', runtime);
    expect(unknown.header).toBeUndefined();
    expect(unknown.diagramTypeRange).toEqual({
      start: { line: 2, column: 11, offset: 21 },
      end: { line: 2, column: 22, offset: 32 },
    });
  });

  it('reserves diagram brackets for keyed attributes, with no accepted keys yet', () => {
    const cases = [
      ['@diagram flowchart [direction: right]\n', 'header.attribute.unsupported'],
      ['@diagram flowchart [direction]\n', 'header.attribute.colon-required'],
      ['@diagram flowchart [direction: right, direction: left]\n', 'header.attribute.duplicate'],
      ['@diagram flowchart [direction: right,]\n', 'header.attribute.trailing-comma'],
      ['@diagram flowchart [,direction: right]\n', 'header.attribute.empty-item'],
      ['@diagram flowchart [direction: right,,mode: compact]\n', 'header.attribute.empty-item'],
      ['@diagram flowchart []\n', 'header.attribute.empty'],
      ['@diagram flowchart [direction: right, bare]\n', 'header.attribute.colon-required'],
      ['@diagram flowchart[direction: right]\n', 'header.diagram.syntax'],
      ['@diagram flowchart [direction: right] // comment\n', 'header.diagram.syntax'],
      ['@diagram flowchart [direction: "right, then down"]\n', 'header.attribute.unsupported'],
      ['@diagram flowchart [direction: "right, then down", mode: compact]\n', 'header.attribute.unsupported'],
      ['@diagram flowchart [direction: "unterminated]\n', 'header.attribute.value'],
    ];
    for (const [source, code] of cases) {
      const result = parseHeader028(source, runtime);
      expect(result.diagnostics.map((item) => item.code), source).toContain(code);
    }
  });

  it('keeps the diagram bracket distinct from edge type shorthand and diagnoses the exact source token', () => {
    const source = '// heading\r\n@diagram flowchart [flow]\r\na process\r\nb process\r\na -> b [flow]\r\n';
    const parsed = parseHeader028(source, runtime);
    const field = parsed.diagnostics.find((item) => item.code === 'header.attribute.colon-required');
    expect(field?.range).toEqual({
      start: { line: 2, column: 20, offset: source.indexOf('[flow]') + 1 },
      end: { line: 2, column: 24, offset: source.indexOf('[flow]') + 5 },
    });
    expect(parsed.body.length).toBe(source.length);
    expect(parsed.body.slice(source.indexOf('a -> b [flow]'))).toBe('a -> b [flow]\r\n');
  });

  it('pins the interpreted draft version on save and preserves exact existing bytes', () => {
    for (const newline of ['\n', '\r\n']) {
      const source = `// 🪸${newline}@diagram flowchart${newline}start process${newline}`;
      const parsed = parseHeader028(source, runtime);
      const prepared = prepareHeaderForSave028(source, parsed, {
        manifest, currentVersion: '0.2.9', trustedDigests,
      });
      expect(prepared.source).toBe(`// 🪸${newline}@diagram flowchart${newline}` +
        `@coralVersion "0.2.8"${newline}start process${newline}`);
      expect(prepared.edit?.at).toBe(source.indexOf('start process'));
      expect(prepared.edit?.insertedLength).toBe(`@coralVersion "0.2.8"${newline}`.length);
      expect(prepared.source.replace(`@coralVersion "0.2.8"${newline}`, '')).toBe(source);
      expect(parseHeader028(prepared.source, { manifest, currentVersion: '0.2.9', trustedDigests }).header)
        .toMatchObject({ effectiveCoralVersion: '0.2.8', profile: parsed.header?.profile,
          catalog: parsed.header?.catalog, conformanceLevel: parsed.header?.conformanceLevel });
      expect(prepareHeaderForSave028(prepared.source,
        parseHeader028(prepared.source, { manifest, currentVersion: '0.2.9', trustedDigests }),
        { manifest, currentVersion: '0.2.9', trustedDigests }).source).toBe(prepared.source);
    }
    const noFinalNewline = '@diagram flowchart';
    expect(prepareHeaderForSave028(noFinalNewline, parseHeader028(noFinalNewline, runtime), runtime).source)
      .toBe('@diagram flowchart\n@coralVersion "0.2.8"');
    expect(parseHeader028('@diagram flowchart\n', { manifest, currentVersion: '0.2.9', trustedDigests })
      .header?.profile.version).toBe('2.0.0');
  });

  it('never rewrites an explicit pin and refuses stale source or unresolved headers', () => {
    const explicit = '@diagram flowchart\n@coralVersion \'0.2.8\'\n@conformanceLevel none\n';
    const parsed = parseHeader028(explicit, runtime);
    expect(prepareHeaderForSave028(explicit, parsed, { manifest, currentVersion: '0.2.9', trustedDigests }))
      .toEqual({ source: explicit });
    expect(() => prepareHeaderForSave028(explicit + '\n', parsed, runtime)).toThrow(/changed Coral header/);
    const unresolved = '@diagram not-a-diagram\n';
    expect(() => prepareHeaderForSave028(unresolved, parseHeader028(unresolved, runtime), runtime))
      .toThrow(/invalid or changed Coral header/);
  });

  it('recovers body text and reports malformed, repeated, and late source directives', () => {
    const source = '@diagram flowchart\n// header comment\n@catalogVersion "1.0.0"\n' +
      'a process\n@diagram uml-sequence\nb process\n';
    const parsed = parseHeader028(source, runtime);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('header.directive.late');
    expect(parsed.body).toContain('a process\n@diagram uml-sequence\nb process\n');
    expect(parsed.header).toBeUndefined();
    expect(parseHeader028('a process\n@diagram flowchart\n', runtime).diagnostics
      .map((item) => item.code)).toContain('header.diagram.required');
    expect(parseHeader028('@diagram flowchart\n@conformanceLevel "strict"\n', runtime).diagnostics
      .map((item) => item.code)).toContain('header.level.invalid');
  });

  it('locates malformed header text while retaining independently parseable body', () => {
    const cases = [
      ['@diagram flowchart\n@coralVersion "0.2.8" extra\nstart process\n', 'header.directive.syntax'],
      ['@diagram flowchart\n@profileVersion "1.0.0\nstart process\n', 'header.version.quote'],
      ['@diagram flowchart\n@profileVersion "1\\q.0.0"\nstart process\n', 'header.version.quote'],
      ['@diagram flowchart\nstart process\n@conformanceLevel strict\n', 'header.directive.late'],
      ['@diagram flowchart\n@coralVersion "0.2.8" @conformanceLevel strict\nstart process\n', 'header.directive.syntax'],
    ];
    for (const [source, code] of cases) {
      const parsed = parseHeader028(source, runtime);
      expect(parsed.diagnostics.map((item) => item.code), source).toContain(code);
      expect(parsed.body).toContain('start process');
      expect(parsed.diagnostics.every((item) => item.range.start.offset >= 0));
    }
  });

  it.each([
    ['tab', '@profileVersion "1.\t0.0"', '\t', 'header.string.control'],
    ['C1 control', '@catalogVersion "1.0.\u00850"', '\u0085', 'header.string.control'],
    ['Unicode line separator', '@profileVersion "1.\u20280.0"', '\u2028', 'header.string.control'],
    ['Unicode paragraph separator', '@profileVersion "1.\u20290.0"', '\u2029', 'header.string.control'],
    ['isolated surrogate', '@coralVersion "0.2.\ud800"', '\ud800', 'header.string.invalid-scalar'],
    ['reserved attribute control', '@diagram flowchart [mode: "wide\u007flayout"]', '\u007f',
      'header.string.control'],
    ['reserved attribute line separator', '@diagram flowchart [mode: "wide\u2028layout"]', '\u2028',
      'header.string.control'],
  ])('locates a raw %s in a header quote without projecting a header', (_name, line, invalid, code) => {
    const source = line.startsWith('@diagram') ? `${line}\nstart process\n`
      : `@diagram flowchart\n${line}\nstart process\n`;
    const parsed = parseHeader028(source, runtime);
    const finding = parsed.diagnostics.find((item) => item.code === code);
    expect(finding, source).toBeDefined();
    expect(finding!.range.start.offset).toBe(source.indexOf(invalid));
    expect(finding!.range.end.offset).toBe(source.indexOf(invalid) + invalid.length);
    expect(parsed.header).toBeUndefined();
    expect(parsed.body.slice(source.indexOf('start process'))).toBe('start process\n');
  });

  it('keeps UTF-16 source positions stable around non-BMP comments and rejects Unicode pseudo-spacing', () => {
    const source = '// 🪸 intro\n@diagram flowchart\nstart process\n';
    const parsed = parseHeader028(source, runtime);
    expect(parsed.body.length).toBe(source.length);
    expect(parsed.body.indexOf('start process')).toBe(source.indexOf('start process'));
    const pinned = prepareHeaderForSave028(source, parsed, runtime);
    const oldStart = source.indexOf('start process');
    expect(pinned.source.indexOf('start process')).toBe(oldStart + pinned.edit!.insertedLength);
    expect(parseHeader028('@diagram\u00a0flowchart\n', runtime).diagnostics
      .map((item) => item.code)).toContain('header.diagram.required');
  });

  it('diagnoses invisible header separators at their exact UTF-16 token while allowing them inside quotes', () => {
    for (const source of [
      '@diagram\u00a0flowchart\n',
      '@diagram flowchart [mode:\u00a0compact]\n',
      '@diagram flowchart\n@conformanceLevel\u00a0strict\n',
      '@diagram flowchart [mode:\u{E0001}compact]\n',
    ]) {
      const result = parseHeader028(source, runtime);
      const spacing = result.diagnostics.filter((item) => item.code === 'header.spacing.invalid');
      expect(spacing, source).toHaveLength(1);
      const token = source.slice(spacing[0]!.range.start.offset, spacing[0]!.range.end.offset);
      expect(token, source).toMatch(/^(?:\u00a0|\u{E0001})$/u);
      expect(result.header).toBeUndefined();
    }
    const quoted = parseHeader028('@diagram flowchart [mode: "wide\u00a0layout"]\n', runtime);
    expect(quoted.diagnostics.map((item) => item.code)).not.toContain('header.spacing.invalid');
    expect(quoted.diagnostics.map((item) => item.code)).toContain('header.attribute.unsupported');
  });
});
