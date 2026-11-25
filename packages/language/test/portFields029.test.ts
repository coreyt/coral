import { describe, expect, it } from 'vitest';
import { parseCandidate028 } from '../src/parser/candidate028.js';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
const codes = (source: string, edition?: string) =>
  parseCandidate028(source, edition ? { edition } : {}).diagnostics
    .map(({ code, line, column }) => [code, line, column]);

describe('Edition 0.2.9 port label and maxConnections fields', () => {
  it('admits optional label and maxConnections on any port line', () => {
    const parsed = parseCandidate028('vault database {\n' +
      '  ingest port [direction: in, anchor: W, label: "Writes", maxConnections: 2]\n' +
      "  audit port [maxConnections: 1, label: 'Audit \"log\"', direction: out]\n" +
      '  plain port [direction: inout]\n}', { edition: '0.2.9' });
    expect(parsed.diagnostics).toEqual([]);
    const ports = parsed.statements.filter((item) => item.kind === 'port');
    expect(ports.map((port) => port.kind === 'port' && [port.id.value, port.direction.value,
      port.anchor?.value, port.label?.value, port.maxConnections?.raw])).toEqual([
      ['ingest', 'in', 'W', 'Writes', '2'],
      ['audit', 'out', undefined, 'Audit "log"', '1'],
      ['plain', 'inout', undefined, undefined, undefined],
    ]);
  });

  it('reports an unquoted label with coral.syntax.port.label.invalid', () => {
    expect(codes('a service {\n  p port [direction: in, label: Writes]\n}', '0.2.9'))
      .toEqual([['coral.syntax.port.label.invalid', 2, 32]]);
    expect(codes('a service {\n  p port [direction: in, label: 3]\n}', '0.2.9'))
      .toEqual([['coral.syntax.port.label.invalid', 2, 32]]);
  });

  it.each(['0', '-1', '1.5', '1e3', '"2"', 'many', '9007199254740993'])(
    'reports maxConnections %s with coral.syntax.port.max-connections.invalid', (value) => {
      expect(codes(`a service {\n  p port [direction: in, maxConnections: ${value}]\n}`, '0.2.9'))
        .toEqual([['coral.syntax.port.max-connections.invalid', 2, 41]]);
    });

  it.each([
    ['label: ]', 'coral.syntax.port.label.invalid'],
    ['label: , direction: in]', 'coral.syntax.port.label.invalid'],
    ['label:', 'coral.syntax.port.label.invalid'],
    ['maxConnections: ]', 'coral.syntax.port.max-connections.invalid'],
    ['maxConnections:', 'coral.syntax.port.max-connections.invalid'],
  ])('reports a missing value in %s with %s', (fields, code) => {
    expect(codes(`a service {\n  p port [direction: in, ${fields}\n}`, '0.2.9'))
      .toEqual([[code, 2, 25]]);
  });

  it('reports a repeated label or maxConnections with its own duplicate code and the first as related', () => {
    const parsed = parseCandidate028('a service {\n' +
      '  p port [direction: in, label: "A", label: "B", maxConnections: 1, maxConnections: 2]\n}',
    { edition: '0.2.9' });
    expect(parsed.diagnostics.map(({ code, line, column }) => [code, line, column])).toEqual([
      ['coral.syntax.port.label.duplicate', 2, 37],
      ['coral.syntax.port.max-connections.duplicate', 2, 68],
    ]);
    expect(parsed.diagnostics.map(({ related }) => related?.[0]?.position.column)).toEqual([25, 49]);
    expect(codes('a service {\n  p port [direction: in, label: "A", label: B]\n}', '0.2.9'))
      .toEqual([['coral.syntax.port.label.duplicate', 2, 37]]);
  });

  it('keeps edition 0.2.8 port diagnostics byte-identical', () => {
    for (const source of [
      'a service {\n  p port [direction: in, label: "Writes"]\n}',
      'a service {\n  p port [direction: in, maxConnections: 1]\n}',
      'a service {\n  p port [direction: in, label: Writes]\n}',
    ]) {
      expect(parseCandidate028(source, { edition: '0.2.8' })).toEqual(parseCandidate028(source));
      expect(codes(source).length).toBeGreaterThan(0);
    }
  });

  it('threads the effective edition from the header into the body parser', () => {
    const body = 'vault database {\n  ingest port [direction: in, label: "Writes", maxConnections: 1]\n}\n';
    const pinned = parseDocument028(`@diagram architecture\n@coralVersion "0.2.9"\n${body}`, runtime);
    expect([...pinned.header.diagnostics, ...pinned.syntax.diagnostics]).toEqual([]);
    const unpinned = parseDocument028(`@diagram architecture\n${body}`, runtime);
    expect(unpinned.syntax.diagnostics.map(({ code }) => code)).toEqual(['coral.syntax.port.field.invalid']);
  });

  it('withholds the GraphIR 3 staging graph when a port carries a label or limit', () => {
    const document = parseDocument028('@diagram architecture\n@coralVersion "0.2.9"\n' +
      'vault database {\n  ingest port [direction: in, label: "Writes"]\n}\n', runtime);
    expect(document.header.header).toBeDefined();
    expect(document.syntax.diagnostics).toEqual([]);
    expect(document.graph).toBeUndefined();
    const plain = parseDocument028('@diagram architecture\n@coralVersion "0.2.9"\n' +
      'vault database {\n  ingest port [direction: in]\n}\n', runtime);
    expect(plain.graph).toBeDefined();
  });
});
