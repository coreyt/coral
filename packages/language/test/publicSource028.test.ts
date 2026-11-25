import { describe, expect, it } from 'vitest';
import { HEADER_MANIFEST_028, parse } from '../src/index.js';

const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
  trustedDigests: Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
    (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest]))) };

describe('public Coral source reader', () => {
  it('reads a saved ID-first document without changing authored bytes', () => {
    const source = '@diagram architecture\r\n// Keep this comment\r\napi service as \'API\'\r\n' +
      'db database\r\napi -> db [reads]\r\n';
    const result = parse(source, runtime);

    expect(result.header.source).toBe(source);
    expect(result.header.diagnostics).toEqual([]);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.header.header?.diagramType).toBe('architecture');
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['api', 'db']);
    expect(result.graph?.edges).toHaveLength(1);
  });

  it('keeps malformed saved source as text without semantic projection', () => {
    const source = '@diagram architecture\napi service\napi -> missing\n';
    const result = parse(source, runtime);

    expect(result.header.source).toBe(source);
    expect(result.syntax.diagnostics.map((item) => item.code))
      .toContain('coral.reference.target.unresolved');
    expect(result.graph).toBeUndefined();
  });
});


describe('data-engineering relation spelling', () => {
  it.each([
    ['data-engineering', 'batchFlow', 'batch-flow'],
    ['architecture', 'batchFlow', 'batchFlow'],
    ['data-engineering', 'batchflow', 'batchflow'],
    ['data-engineering', 'customFlow', 'customFlow'],
  ])('projects %s [%s] as %s without changing authored tokens', (profile, token, expected) => {
    const source = `@diagram ${profile}\na node\nb node\nmove = a -> b [${token}]\n`;
    const result = parse(source, runtime);
    expect(result.header.source).toBe(source);
    expect(result.header.diagnostics).toEqual([]);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.graph?.edges[0].type).toBe(expected);
    expect(result.syntax.statements.find((item) => item.kind === 'edge'))
      .toMatchObject({ edgeType: { value: token } });
  });

  it('locates a malformed hyphenated bare relation and withholds semantic projection', () => {
    const source = '@diagram data-engineering\na node\nb node\na -> b [batch-flow]\n';
    const result = parse(source, runtime);
    expect(result.header.source).toBe(source);
    expect(result.syntax.diagnostics.map(({ code }) => code)).toEqual([
      'coral.syntax.bracket.comma-required', 'coral.syntax.bracket.unknown-positional',
    ]);
    const hyphenOffset = source.indexOf('batch-flow') + 'batch'.length;
    expect(result.syntax.diagnostics.map(({ range }) => range)).toEqual([
      { start: { line: 4, column: 13, offset: hyphenOffset },
        end: { line: 4, column: 14, offset: hyphenOffset + 1 } },
      { start: { line: 4, column: 14, offset: hyphenOffset + 1 },
        end: { line: 4, column: 18, offset: hyphenOffset + 5 } },
    ]);
    expect(result.syntax.diagnostics.map(({ range }) =>
      source.slice(range!.start.offset, range!.end.offset))).toEqual(['-', 'flow']);
    expect(result.graph).toBeUndefined();
  });
});
