import { describe, expect, it } from 'vitest';
import { parseHeader028, pinHeaderEdition029, type HeaderManifest028 } from '../src/parser/header028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
const older: HeaderManifest028 = { '0.2.8': HEADER_MANIFEST_028['0.2.8']! };
const olderRuntime = { manifest: older, currentVersion: '0.2.8', trustedDigests };

const artwork = [
  '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">',
  '  <!-- // not a comment { } @coralVersion "0.2.8" -->',
  '@symbol nested {',
  '}',
  '  <path d="M0 0 L24 4 Z"/>',
  '</svg>',
  '"""',
];
const definition = ['@symbol shield {', '  name "Shield"', '  size 48 x 56', ...artwork, '}'];
const document = (lines: readonly string[], newline = '\n') => lines.join(newline) + newline;
const codes = (source: string, run = runtime) =>
  parseHeader028(source, run).diagnostics.map(({ code, range }) => [code, range.start.line, range.start.column]);

describe('Coral 0.2.9 edition manifest', () => {
  it('installs 0.2.9 with exactly the 0.2.8 profiles, catalogs and digests', () => {
    expect(HEADER_MANIFEST_028['0.2.9']).toEqual(HEADER_MANIFEST_028['0.2.8']);
    expect(Object.isFrozen(HEADER_MANIFEST_028['0.2.9'])).toBe(true);
  });

  it('keeps the default edition at 0.2.8 for unpinned documents', () => {
    expect(parseHeader028('@diagram flowchart\n', runtime).header?.effectiveCoralVersion).toBe('0.2.8');
    expect(parseHeader028('@diagram flowchart\n@coralVersion "0.2.9"\n', runtime)
      .header?.effectiveCoralVersion).toBe('0.2.9');
  });

  it('older readers refuse a 0.2.9 pin with header.version.unavailable only', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', '', ...definition, 'a service']);
    expect(codes(source, olderRuntime)).toEqual([['header.version.unavailable', 2, 0]]);
  });
});

describe('Header scanner owns @symbol definition regions', () => {
  it('masks whole regions, skips raw content and returns exact spans', () => {
    const lines = ['@diagram architecture', '@coralVersion "0.2.9"', '', ...definition, '', 'a service'];
    const source = document(lines);
    const parsed = parseHeader028(source, runtime);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.header?.effectiveCoralVersion).toBe('0.2.9');
    expect(parsed.body.length).toBe(source.length);
    expect(parsed.body.trim()).toBe('a service');
    const start = source.indexOf('@symbol shield');
    const closeLine = 3 + definition.length;
    const end = source.lastIndexOf('\n}\n') + 2;
    expect(parsed.definitionRegions).toEqual([{
      id: 'shield', late: false,
      range: { start: { line: 4, column: 0, offset: start },
        end: { line: closeLine, column: 1, offset: end } },
      open: { start: { line: 4, column: 0, offset: start },
        end: { line: 4, column: 16, offset: start + 16 } },
      close: { start: { line: closeLine, column: 0, offset: end - 1 },
        end: { line: closeLine, column: 1, offset: end } },
      rawBlocks: [{
        open: { start: { line: 7, column: 2, offset: source.indexOf('artwork svg') },
          end: { line: 7, column: 17, offset: source.indexOf('artwork svg') + 15 } },
        content: { start: source.indexOf('<svg'), end: source.indexOf('\n"""\n') + 1 },
        close: { start: { line: 14, column: 0, offset: source.indexOf('\n"""\n') + 1 },
          end: { line: 14, column: 3, offset: source.indexOf('\n"""\n') + 4 } },
      }],
    }]);
  });

  it('keeps CRLF regions exact and closes raw content on a """ line before CR', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', ...definition, 'a service'], '\r\n');
    const parsed = parseHeader028(source, runtime);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.body.replace(/[ \r\n]/g, '')).toBe('aservice');
    const raw = parsed.definitionRegions![0]!.rawBlocks[0]!;
    expect(source.slice(raw.content.start, raw.content.end))
      .toBe(artwork.slice(1, -1).join('\r\n') + '\r\n');
  });

  it('admits several definitions in authored order with trivia between them', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', ...definition, '// note', '',
      '@symbol key {', '  name "Key"', '}', 'a service']);
    const parsed = parseHeader028(source, runtime);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.definitionRegions?.map(({ id }) => id)).toEqual(['shield', 'key']);
  });

  it('reports a directive after a definition as header.directive.late', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', ...definition,
      '@conformanceLevel strict', 'a service']);
    expect(codes(source)).toEqual([['header.directive.late', 3 + definition.length, 0]]);
  });

  it('reports @symbol after the first body statement as coral.symbol.local.late and still masks it', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', 'a service', ...definition]);
    const parsed = parseHeader028(source, runtime);
    expect(codes(source)).toEqual([['coral.symbol.local.late', 4, 0]]);
    expect(parsed.diagnostics[0]!.range.end.column).toBe('@symbol'.length);
    expect(parsed.definitionRegions?.[0]?.late).toBe(true);
    expect(parsed.body.trim()).toBe('a service');
  });

  it('reports a late block in an edition 0.2.8 document only as coral.symbol.local.edition and masks it', () => {
    for (const pin of [[], ['@coralVersion "0.2.8"']]) {
      const source = document(['@diagram architecture', ...pin, 'a service', ...definition]);
      const parsed = parseHeader028(source, runtime);
      expect(codes(source)).toEqual([['coral.symbol.local.edition', 3 + pin.length, 0]]);
      expect(parsed.body.trim()).toBe('a service');
    }
  });

  it('reports an unclosed raw block once at its opening line and masks the rest of the document', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', '@symbol shield {',
      '  name "Shield"', '  artwork svg """', '<svg/>', '}', 'a service', 'a -> b']);
    const parsed = parseHeader028(source, runtime);
    expect(codes(source)).toEqual([['coral.symbol.local.artwork.unclosed', 5, 2]]);
    expect(parsed.body.trim()).toBe('');
    expect(parsed.definitionRegions?.[0]?.rawBlocks[0]?.close).toBeUndefined();
    expect(parsed.definitionRegions?.[0]?.close).toBeUndefined();
  });

  it('reports an edition 0.2.8 definition as coral.symbol.local.edition, not an unknown directive', () => {
    for (const pin of [[], ['@coralVersion "0.2.8"']]) {
      const source = document(['@diagram architecture', ...pin, ...definition, 'a service']);
      const parsed = parseHeader028(source, runtime);
      expect(codes(source)).toEqual([['coral.symbol.local.edition', 2 + pin.length, 0]]);
      expect(parsed.header).toBeUndefined();
      expect(parsed.body.trim()).toBe('a service');
    }
  });

  it('reports a malformed opening line as coral.symbol.local.syntax on that line', () => {
    const head = ['@diagram architecture', '@coralVersion "0.2.9"'];
    for (const opening of ['@symbol 9x {', '@symbol {', '  @symbol shield', '@symbol', '@symbol a b {'])
      expect(codes(document([...head, opening, '  name "X"', '}', 'a service'])), opening)
        .toEqual([['coral.symbol.local.syntax', 3, opening.indexOf('@')]]);
    const parsed = parseHeader028(document([...head, '  @symbol shield  ', 'a service']), runtime);
    expect(parsed.diagnostics[0]!.range.end.column).toBe('  @symbol shield'.length);
    expect(parsed.body.trim()).toBe('a service');
  });

  it('consumes a region whose @symbol is followed by non-ASCII whitespace and reports it as malformed', () => {
    const source = document(['@diagram architecture', '@coralVersion "0.2.9"', '@symbol\u00a0shield {',
      '  name "Shield"', '  artwork svg """', '<svg "x"/>', '"""', '}', 'a service']);
    const parsed = parseHeader028(source, runtime);
    expect(codes(source)).toEqual([['header.spacing.invalid', 3, 7], ['coral.symbol.local.syntax', 3, 0]]);
    expect(parsed.body.trim()).toBe('a service');
    expect(codes(document(['@diagram architecture', '@symbolic x'])))
      .toEqual([['header.directive.unknown', 2, 0]]);
  });

  it('reports a region without a closing brace once as coral.symbol.local.unclosed and masks to the end', () => {
    const unclosed = document(['@diagram architecture', '@coralVersion "0.2.9"', '@symbol shield {',
      '  name "Shield"', 'a service']);
    const parsed = parseHeader028(unclosed, runtime);
    expect(codes(unclosed)).toEqual([['coral.symbol.local.unclosed', 3, 0]]);
    expect(parsed.diagnostics[0]!.range.end.column).toBe('@symbol shield {'.length);
    expect(parsed.body.trim()).toBe('');
    expect(codes(document(['@diagram architecture', '@coralVersion "0.2.9"', '@symbol 9x {', '  name "X"'])))
      .toEqual([['coral.symbol.local.syntax', 3, 0], ['coral.symbol.local.unclosed', 3, 0]]);
  });

  it('leaves documents without definitions byte-identical in body and result shape', () => {
    const source = '@diagram flowchart\n@coralVersion "0.2.8"\na process\n';
    const parsed = parseHeader028(source, runtime);
    expect(parsed).not.toHaveProperty('definitionRegions');
    expect(parsed.body).toBe(' '.repeat(18) + '\n' + ' '.repeat(21) + '\na process\n');
  });
});

describe('Header edition pin edit', () => {
  it('never mistakes raw artwork for the header pin', () => {
    const source = document(['@diagram architecture', '@symbol shield {', '  name "S"', '  size 1 x 1',
      '  artwork svg """', '@coralVersion "0.2.8"', '"""', '}', 'a service']);
    const pinned = pinHeaderEdition029(source, runtime);
    expect(pinned.source).toBe(source.replace('@diagram architecture\n',
      '@diagram architecture\n@coralVersion "0.2.9"\n'));
    expect(pinned.edit).toEqual({ start: 22, end: 22, text: '@coralVersion "0.2.9"\n' });
    expect(parseHeader028(pinned.source, runtime).diagnostics).toEqual([]);
  });

  it('refuses downgrades, unknown editions and unrelated header failures', () => {
    expect(() => pinHeaderEdition029('@diagram architecture\n@coralVersion "0.2.9"\n', runtime, '0.2.8'))
      .toThrow();
    expect(() => pinHeaderEdition029('@diagram architecture\n', olderRuntime)).toThrow();
    expect(() => pinHeaderEdition029('@diagram architecture\n@conformanceLevel loud\n', runtime)).toThrow();
  });
});
