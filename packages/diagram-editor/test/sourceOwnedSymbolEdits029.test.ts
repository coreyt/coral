import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  type SuccessorUserSymbol029 } from '@coral-viz/render';
import { editSourceOwnedPortFields029, editSourceOwnedSymbolDefinition029 } from '../src/sourceOwnedEdits028';

// Slice 60 C5 source-edit owners (c5-design.md "Source edits").

const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>';
const block = (lines: string[]) => ['@symbol probe {', ...lines, '  artwork svg """', ARTWORK, '"""', '}'];
const CANONICAL = ['  name "Probe"', '  tags "sensor"', '  size 60 x 40', '  outline ellipse',
  '  source "Drawn for tests"', '  license "CC0-1.0"', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  login port [direction: in, maxConnections: 2]', '  deep port [direction: out, anchor: core]'];
const document = (definition: string[], body = ['a -> g:login']) => ['@diagram architecture', '@coralVersion "0.2.9"',
  '// header comment', ...definition, '', 'g service [symbol: "local.probe"] // keep', 'a service', 'b service',
  'g:deep -> b', ...body, ''].join('\n');
const SOURCE = document(block(CANONICAL));

const probe = (source: string): SuccessorUserSymbol029 =>
  projectInstalledSourceToSuccessor028(source).graph!.userSymbols029!.find((item) => item.symbolId === 'local.probe')!;

describe('editSourceOwnedSymbolDefinition029', () => {
  it('reprints only the block, canonically, keeping artwork bytes and every byte outside it', () => {
    const edited = editSourceOwnedSymbolDefinition029(SOURCE, 'local.probe', { ...probe(SOURCE), name: 'Sensor',
      description: 'Reads values', label: 'right' });
    expect(edited).toBe(document(block(['  name "Sensor"', '  description "Reads values"', ...CANONICAL.slice(1, 3),
      '  label right', ...CANONICAL.slice(3)])));
    expect(probe(edited).artwork.text).toBe(probe(SOURCE).artwork.text);
  });

  it('keeps CRLF line endings throughout a CRLF document', () => {
    const crlf = SOURCE.replace(/\n/g, '\r\n');
    const edited = editSourceOwnedSymbolDefinition029(crlf, 'local.probe', { ...probe(crlf), name: 'Sensor' });
    expect(edited).toBe(document(block(['  name "Sensor"', ...CANONICAL.slice(1)])).replace(/\n/g, '\r\n'));
    expect(probe(edited).artwork.text).toBe(probe(crlf).artwork.text);
  });

  it('puts hand-ordered lines in the approved canonical order', () => {
    const hand = document(block([CANONICAL[2]!, CANONICAL[0]!, ...CANONICAL.slice(3), CANONICAL[1]!]));
    expect(editSourceOwnedSymbolDefinition029(hand, 'local.probe', { ...probe(hand), tags: ['sensor', 'iot'] }))
      .toBe(document(block([CANONICAL[0]!, '  tags "sensor" "iot"', ...CANONICAL.slice(2)])));
  });

  it('edits anchors and ports as numeric and keyed values', () => {
    const current = probe(SOURCE);
    const edited = editSourceOwnedSymbolDefinition029(SOURCE, 'local.probe', { ...current,
      anchors: [{ kind: 'interior', id: 'core', x: 0.4, y: 0.6, exit: 'S' },
        { kind: 'boundary', id: 'anchor1', side: 'N', at: 0.25 }],
      ports: [{ ...current.ports[0]!, label: 'Sign-in' }, current.ports[1]!,
        { id: 'aux', direction: 'inout', anchor: 'anchor1' }] });
    expect(edited).toContain('  anchor core [x: 0.4, y: 0.6, exit: S]\n  anchor anchor1 [side: N, at: 0.25]\n');
    expect(edited).toContain('  login port [direction: in, label: "Sign-in", maxConnections: 2]\n');
    expect(edited).toContain('  aux port [direction: inout, anchor: anchor1]\n');
  });

  it('refuses to drop a port that connectors name, listing them', () => {
    const current = probe(SOURCE);
    expect(() => editSourceOwnedSymbolDefinition029(SOURCE, 'local.probe', { ...current,
      ports: current.ports.filter((port) => port.id !== 'deep') }))
      .toThrow(/coral\.editor\.source-symbol\.port-used: .*g:deep -> b/);
  });

  it('refuses a removed anchor a port names, an anchor outside the outline and a limit below the count', () => {
    const current = probe(SOURCE);
    expect(() => editSourceOwnedSymbolDefinition029(SOURCE, 'local.probe', { ...current, anchors: [] }))
      .toThrow(/coral\.editor\.source-symbol\.invalid/);
    expect(() => editSourceOwnedSymbolDefinition029(SOURCE, 'local.probe', { ...current,
      anchors: [{ kind: 'interior', id: 'core', x: 0.02, y: 0.02, exit: 'E' }] }))
      .toThrow(/coral\.editor\.source-symbol\.invalid: .*core/);
    const twice = document(block(CANONICAL), ['a -> g:login', 'b -> g:login']);
    expect(() => editSourceOwnedSymbolDefinition029(twice, 'local.probe', { ...probe(twice),
      ports: [{ ...probe(twice).ports[0]!, maxConnections: 1 }, probe(twice).ports[1]!] }))
      .toThrow(/coral\.editor\.source-symbol\.invalid: .*login/);
  });

  it('refuses a block with comments and an undefined symbol', () => {
    const commented = document(block([...CANONICAL.slice(0, 2), '  // why this size', ...CANONICAL.slice(2)]));
    expect(() => editSourceOwnedSymbolDefinition029(commented, 'local.probe', { ...probe(commented), name: 'X' }))
      .toThrow(/coral\.editor\.source-symbol\.comment/);
    expect(() => editSourceOwnedSymbolDefinition029(SOURCE, 'local.other', { ...probe(SOURCE), name: 'X' }))
      .toThrow(/coral\.editor\.source-symbol/);
  });

  it('refuses any edit while an untouched port already exceeds its limit', () => {
    const over = document(block(CANONICAL.map((line) => line.replace('maxConnections: 2', 'maxConnections: 1'))),
      ['a -> g:login', 'b -> g:login']);
    expect(() => editSourceOwnedSymbolDefinition029(over, 'local.probe', { ...probe(over), name: 'X' }))
      .toThrow(/coral\.editor\.source-symbol\.invalid/);
  });
});

const PORTS = (edition: string, port: string, body = ['a -> vault:ingest']) => ['@diagram architecture',
  ...(edition ? [`@coralVersion "${edition}"`] : []), 'a service', 'b service', 'vault database {', `  ${port}`, '}',
  ...body, ''].join('\n');

describe('editSourceOwnedPortFields029', () => {
  it('adds, changes and removes the label and limit of a node-local port in canonical field order', () => {
    const source = PORTS('0.2.9', 'ingest port [anchor: W, direction: in]');
    const labelled = editSourceOwnedPortFields029(source, 'vault', 'ingest', { label: 'Writes' });
    expect(labelled).toBe(PORTS('0.2.9', 'ingest port [direction: in, anchor: W, label: "Writes"]'));
    const limited = editSourceOwnedPortFields029(labelled, 'vault', 'ingest', { label: 'Writes', maxConnections: 3 });
    expect(limited).toBe(PORTS('0.2.9', 'ingest port [direction: in, anchor: W, label: "Writes", maxConnections: 3]'));
    expect(editSourceOwnedPortFields029(limited, 'vault', 'ingest', {}))
      .toBe(PORTS('0.2.9', 'ingest port [direction: in, anchor: W]'));
  });

  it('pins edition 0.2.9 in the same edit when a 0.2.8 document gains a label or limit (Q-C5-1)', () => {
    const source = PORTS('', 'ingest port [direction: in]');
    const edited = editSourceOwnedPortFields029(source, 'vault', 'ingest', { maxConnections: 2 });
    expect(edited).toBe(PORTS('', 'ingest port [direction: in, maxConnections: 2]')
      .replace('@diagram architecture\n', '@diagram architecture\n@coralVersion "0.2.9"\n'));
    expect(editSourceOwnedPortFields029(source, 'vault', 'ingest', {})).toBe(source);
  });

  it('refuses a port not authored on the node, an invalid limit and a limit below the count', () => {
    const source = PORTS('0.2.9', 'ingest port [direction: in]', ['a -> vault:ingest', 'b -> vault:ingest']);
    expect(() => editSourceOwnedPortFields029(source, 'a', 'ingest', { label: 'X' }))
      .toThrow(/coral\.editor\.source-port\.not-authored/);
    expect(() => editSourceOwnedPortFields029(SOURCE, 'g', 'login', { label: 'X' }))
      .toThrow(/coral\.editor\.source-port\.not-authored/);
    for (const maxConnections of [0, 1.5]) expect(() => editSourceOwnedPortFields029(source, 'vault', 'ingest',
      { maxConnections })).toThrow(/coral\.editor\.source-port\.invalid/);
    expect(() => editSourceOwnedPortFields029(source, 'vault', 'ingest', { maxConnections: 1 }))
      .toThrow(/coral\.editor\.source-port\.invalid: .*ingest/);
    expect(parseInstalledDocument028(source).syntax.diagnostics).toEqual([]);
  });
});
