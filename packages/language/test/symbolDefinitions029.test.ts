import { describe, expect, it } from 'vitest';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';
import { parseHeader028 } from '../src/parser/header028.js';
import { parseSymbolDefinitions029 } from '../src/parser/symbolDefinitions029.js';

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
const HEAD = '@diagram architecture\n@coralVersion "0.2.9"\n';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
  '  <path d="M12 0 L24 4 Z" fill="#2f6f4f"/> <!-- // { } @symbol -->\n</svg>\n';
const block = (...lines: string[]) =>
  ['@symbol shield {', ...lines, '  artwork svg """', SVG + '"""', '}'].join('\n') + '\n';
const minimal = (...lines: string[]) => block('  name "Shield"', '  size 48 x 56', ...lines);
const parse = (definitions: string, body = 'gate service [symbol: "local.shield"]\n') => {
  const source = HEAD + definitions + body;
  const header = parseHeader028(source, runtime);
  return { source, header, ...parseSymbolDefinitions029(source, header.definitionRegions ?? []) };
};
const codes = (definitions: string) =>
  parse(definitions).diagnostics.map(({ code, line, column }) => [code, line, column]);

describe('Edition 0.2.9 symbol definitions parser', () => {
  it('parses the approved example into a UserSymbolDefinition with raw artwork text', () => {
    const result = parse(block(
      '  name "Shield"',
      '  description "Security boundary or policy enforcement point"',
      '  tags "security" "auth"',
      '  size 48 x 56',
      '  label below',
      '  outline rounded',
      '  source "Drawn in-house"',
      '  license "CC0-1.0"',
      '  anchor crest [side: N, at: 0.5]',
      '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
      '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]',
      '  token port [direction: out, anchor: E, label: "Token"]',
      '  audit port [direction: out, anchor: keyhole]',
    ));
    expect(result.diagnostics).toEqual([]);
    const [definition] = result.definitions;
    const contentStart = result.source.indexOf('<svg');
    expect(definition).toEqual({
      id: 'shield', symbolId: 'local.shield', name: 'Shield',
      description: 'Security boundary or policy enforcement point', tags: ['security', 'auth'],
      size: { width: 48, height: 56 }, label: 'below', outline: 'rounded', tint: 'none',
      source: 'Drawn in-house', license: 'CC0-1.0',
      anchors: [
        { kind: 'boundary', id: 'crest', side: 'N', at: 0.5 },
        { kind: 'interior', id: 'keyhole', x: 0.5, y: 0.55, exit: 'S' },
      ],
      ports: [
        { id: 'login', direction: 'in', anchor: 'W', label: 'Sign-in', maxConnections: 1 },
        { id: 'token', direction: 'out', anchor: 'E', label: 'Token' },
        { id: 'audit', direction: 'out', anchor: 'keyhole' },
      ],
      artwork: { format: 'svg', text: SVG, content: { start: contentStart, end: contentStart + SVG.length } },
      range: result.header.definitionRegions![0]!.range,
    });
  });

  it('applies the approved defaults and keeps authored definition order', () => {
    const result = parse(minimal() + block('  name "Second"', '  size 1 x 2.5e1').replace('shield', 'key'));
    expect(result.diagnostics).toEqual([]);
    expect(result.definitions.map(({ id, label, outline, tint, tags, anchors, ports, size }) =>
      ({ id, label, outline, tint, tags, anchors, ports, size }))).toEqual([
      { id: 'shield', label: 'below', outline: 'rectangle', tint: 'none', tags: [], anchors: [], ports: [],
        size: { width: 48, height: 56 } },
      { id: 'key', label: 'below', outline: 'rectangle', tint: 'none', tags: [], anchors: [], ports: [],
        size: { width: 1, height: 25 } },
    ]);
  });

  it('accepts comments, blank lines and every closed word', () => {
    for (const [label, outline, tint] of [['above', 'ellipse', 'stroke'], ['center', 'diamond', 'none'],
      ['left', 'rectangle', 'none'], ['right', 'rounded', 'stroke']]) {
      const result = parse(minimal('', '  // comment', `  label ${label} // trailing`, `  outline ${outline}`,
        `  tint ${tint}`));
      expect(result.diagnostics).toEqual([]);
      expect(result.definitions[0]).toMatchObject({ label, outline, tint });
    }
  });

  it('reports each missing required line once at the opening line', () => {
    expect(codes('@symbol shield {\n  description "x"\n}\n')).toEqual([
      ['coral.symbol.local.field.required', 3, 0],
      ['coral.symbol.local.field.required', 3, 0],
      ['coral.symbol.local.field.required', 3, 0],
    ]);
    expect(parse('@symbol shield {\n}\n').diagnostics.map(({ message }) => message)).toEqual([
      'Symbol shield requires a name line.', 'Symbol shield requires a size line.',
      'Symbol shield requires an artwork block.',
    ]);
    expect(parse('@symbol shield {\n}\n').definitions).toEqual([]);
  });

  it('reports a repeated single-use line with the first as related', () => {
    const result = parse(minimal('  name "Again"', '  tint none', '  tint stroke'));
    expect(result.diagnostics.map(({ code, line, column }) => [code, line, column])).toEqual([
      ['coral.symbol.local.field.duplicate', 6, 2],
      ['coral.symbol.local.field.duplicate', 8, 2],
    ]);
    expect(result.diagnostics[0]!.related?.[0]?.position.line).toBe(4);
    const twoArtworks = parse(block('  name "Shield"', '  size 1 x 1', '  artwork svg """', '<svg/>', '"""'));
    expect(twoArtworks.diagnostics.map(({ code, line }) => [code, line]))
      .toEqual([['coral.symbol.local.field.duplicate', 9]]);
  });

  it.each([
    ['  size 48', 2], ['  size 48 x', 2], ['  size 0 x 4', 7], ['  size -1 x 4', 7], ['  size 4 by 4', 2],
    ['  size 4 x 4 x 4', 2], ['  size "4" x 4', 7], ['  size 48x56', 2],
    ['  label under', 8], ['  label', 2], ['  label below below', 2],
    ['  outline circle', 10], ['  tint fill', 7],
    ['  tags', 2], ['  tags security', 7], ['  tags ""', 7], ['  tags "a" "a"', 11],
    ['  name Shield', 7], ['  description', 2], ['  source "a" "b"', 2], ['  license 3', 10],
  ])('reports %j with coral.symbol.local.field.invalid', (line, column) => {
    const keyword = line.trim().split(' ')[0];
    const result = parse(block(line, ...keyword === 'name' ? [] : ['  name "Shield"'],
      ...keyword === 'size' ? [] : ['  size 48 x 56']));
    expect(result.diagnostics.map(({ code, line: at, column: col }) => [code, at, col]))
      .toEqual([['coral.symbol.local.field.invalid', 4, column]]);
    expect(result.definitions).toEqual([]);
  });

  it('reports an artwork format other than svg as coral.symbol.local.field.invalid', () => {
    const result = parse('@symbol shield {\n  name "S"\n  size 1 x 1\n  artwork png """\nx\n"""\n}\n');
    expect(result.diagnostics.map(({ code, line, column }) => [code, line, column])).toEqual([
      ['coral.symbol.local.field.invalid', 6, 10],
    ]);
  });

  it('skips raw content after an artwork opener with trailing text and reports only the opener', () => {
    const result = parse('@symbol shield {\n  name "S"\n  size 1 x 1\n  artwork svg """ // note\n' +
      '<svg a="1" b=\'2\'> \u00a0 #$ "unclosed\n"""\n}\n');
    expect(result.header.diagnostics).toEqual([]);
    expect(result.header.definitionRegions?.[0]?.rawBlocks).toHaveLength(1);
    expect(result.diagnostics.map(({ code, line, column }) => [code, line, column]))
      .toEqual([['coral.symbol.local.field.invalid', 6, 2]]);
    expect(result.definitions).toEqual([]);
  });

  it('reports unrecognized lines with coral.symbol.local.field.unknown', () => {
    expect(codes(minimal('  shape "box"', '  a -> b', '  variant x', '  {'))).toEqual([
      ['coral.symbol.local.field.unknown', 6, 2], ['coral.symbol.local.field.unknown', 7, 2],
      ['coral.symbol.local.field.unknown', 8, 2], ['coral.symbol.local.field.unknown', 9, 2],
    ]);
  });

  it('reports duplicate and generic anchor IDs', () => {
    expect(codes(minimal('  anchor crest [side: N, at: 0.5]', '  anchor crest [x: 0.1, y: 0.1, exit: W]')))
      .toEqual([['coral.symbol.local.anchor.duplicate', 7, 9]]);
    for (const generic of ['auto', 'side', 'corner', 'N', 'SW', 'up', 'left'])
      expect(codes(minimal(`  anchor ${generic} [side: N, at: 0.5]`)))
        .toEqual([['coral.symbol.local.anchor.invalid', 6, 9]]);
  });

  it.each([
    '[side: N, at: 1.5]', '[side: N, at: -0.1]', '[side: NE, at: 0.5]', '[side: N]', '[at: 0.5]',
    '[x: 1.1, y: 0.5, exit: S]', '[x: 0.5, y: -1, exit: S]', '[x: 0.5, y: 0.5]', '[x: 0.5, exit: S]',
    '[x: 0.5, y: 0.5, exit: up]', '[side: N, at: 0.5, exit: S]', '[side: N, at: 0.5, at: 0.4]',
    '[side: N, at: "0.5"]', '[side: N, at: 0.5', '[]', '[side: N, at: 0.5] extra', '[colour: red]',
  ])('reports anchor %s with coral.symbol.local.anchor.invalid', (fields) => {
    const result = parse(minimal(`  anchor crest ${fields}`));
    expect(result.diagnostics.map(({ code, line }) => [code, line]))
      .toEqual([['coral.symbol.local.anchor.invalid', 6]]);
    expect(result.definitions).toEqual([]);
  });

  it('accepts boundary and interior anchors at the 0..1 limits', () => {
    const result = parse(minimal('  anchor a [side: W, at: 0]', '  anchor b [side: E, at: 1]',
      '  anchor c [exit: N, y: 0, x: 1]'));
    expect(result.diagnostics).toEqual([]);
    expect(result.definitions[0]!.anchors).toEqual([
      { kind: 'boundary', id: 'a', side: 'W', at: 0 }, { kind: 'boundary', id: 'b', side: 'E', at: 1 },
      { kind: 'interior', id: 'c', x: 1, y: 0, exit: 'N' },
    ]);
  });

  it('parses symbol ports with the shared port grammar and diagnostics', () => {
    expect(codes(minimal('  p port [direction: in, label: Bare]', '  q port [direction: out, maxConnections: 0]',
      '  r port [direction: sideways]', '  s port [direction: in]', '  s port [direction: out]'))).toEqual([
      ['coral.syntax.port.label.invalid', 6, 32],
      ['coral.syntax.port.max-connections.invalid', 7, 42],
      ['coral.syntax.port.direction.invalid', 8, 21],
      ['coral.identity.port.duplicate', 10, 2],
    ]);
  });

  it('reports a second definition with the same ID as coral.symbol.local.duplicate', () => {
    const result = parse(minimal() + minimal());
    expect(result.diagnostics.map(({ code, line, column }) => [code, line, column]))
      .toEqual([['coral.symbol.local.duplicate', 12, 8]]);
    expect(result.diagnostics[0]!.related?.[0]?.position).toMatchObject({ line: 3, column: 8 });
    expect(result.definitions).toHaveLength(1);
  });

  it('passes raw artwork bytes, unread, to an admission hook', () => {
    const seen: string[] = [];
    const source = HEAD + minimal() + 'gate service\n';
    const header = parseHeader028(source, runtime);
    const result = parseSymbolDefinitions029(source, header.definitionRegions!, {
      admitArtwork: (artwork) => {
        seen.push(artwork.text);
        return [{ severity: 'error', code: 'coral.artwork.svg.parse', message: 'stub',
          position: artwork.open.start, line: artwork.open.start.line, column: artwork.open.start.column,
          offset: artwork.open.start.offset }];
      },
    });
    expect(seen).toEqual([SVG]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['coral.artwork.svg.parse']);
    expect(result.definitions).toEqual([]);
  });
});

describe('Unclosed definition regions', () => {
  it('never yield a definition, so unclosed raw text cannot become artwork', () => {
    for (const definitions of [
      '@symbol shield {\n  name "S"\n  size 1 x 1\n  artwork svg """\n<svg/>\n}\n',
      '@symbol shield {\n  name "S"\n  size 1 x 1\n  artwork svg """\n<svg/>\n"""\n',
    ]) {
      const result = parse(definitions);
      expect(result.header.diagnostics.length).toBe(1);
      expect(result.diagnostics).toEqual([]);
      expect(result.definitions).toEqual([]);
    }
  });
});

describe('Document reader with symbol definitions', () => {
  it('returns definitions, keeps the body parse, and withholds the GraphIR 3 staging graph', () => {
    const source = HEAD + '\n' + minimal() + '\ngate service [symbol: "local.shield"] as "Auth gateway"\n';
    const document = parseDocument028(source, runtime);
    expect(document.header.diagnostics).toEqual([]);
    expect(document.syntax.diagnostics).toEqual([]);
    expect(document.definitions?.map(({ symbolId }) => symbolId)).toEqual(['local.shield']);
    expect(document.syntax.graph.nodes.map(({ id, symbol }) => [id, symbol]))
      .toEqual([['gate', 'local.shield']]);
    expect(document.graph).toBeUndefined();
  });

  it('merges definition diagnostics ahead of body diagnostics', () => {
    const document = parseDocument028(HEAD + minimal('  colour red') + 'a service\na -> missing\n', runtime);
    expect(document.syntax.diagnostics.map(({ code }) => code))
      .toEqual(['coral.symbol.local.field.unknown', 'coral.reference.target.unresolved']);
  });

  it('does not interpret definitions in a document whose edition refuses them', () => {
    for (const pin of ['', '@coralVersion "0.2.8"\n']) {
      const document = parseDocument028('@diagram architecture\n' + pin +
        '@symbol s {\n  size 1 x 1\n  artwork svg """\n<svg/>\n"""\n}\na service\n', runtime);
      expect(document.header.diagnostics.map(({ code }) => code)).toEqual(['coral.symbol.local.edition']);
      expect(document.syntax.diagnostics).toEqual([]);
      expect(document).not.toHaveProperty('definitions');
      const wellFormed = parseDocument028('@diagram architecture\n' + pin + minimal() + 'a service\n', runtime);
      expect(wellFormed).not.toHaveProperty('definitions');
    }
  });

  it('does not interpret a late definition', () => {
    const document = parseDocument028(HEAD + 'a service\n' + minimal('  colour red'), runtime);
    expect(document.header.diagnostics.map(({ code }) => code)).toEqual(['coral.symbol.local.late']);
    expect(document.syntax.diagnostics).toEqual([]);
    expect(document.definitions).toEqual([]);
  });

  it('leaves documents without definitions unchanged in result shape', () => {
    const document = parseDocument028('@diagram flowchart\na process\n', runtime);
    expect(document).not.toHaveProperty('definitions');
  });
});
