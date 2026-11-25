import { describe, expect, it } from 'vitest';
import { formatDocument028, HEADER_MANIFEST_028, parse, setCandidateLabel } from '../src/index.js';

const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
  trustedDigests: Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
    (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest]))) };

const source = [
  '// Keep authored choices',
  '@diagram architecture',
  '@conformanceLevel none',
  "api = service [symbol: 'arch-service'] as 'Authored \\'label\\'' {",
  '\taudit port [direction: out, anchor: auto]',
  '}',
  "store = database as 'Store'",
  "request = api:audit -> store:query [type: reads, style: solid] as 'Authored edge'",
  'worker service',
  'send = worker -> store',
  '',
].join('\r\n');

describe('L28-06.AC3 saved-source formatting and generated labels', () => {
  it('retains every authored field including anchor auto during explicit formatting', () => {
    const before = parse(source, runtime);
    expect(before.header.diagnostics).toEqual([]);
    expect(before.syntax.diagnostics).toEqual([]);
    const formatted = formatDocument028(source, runtime);
    expect(formatted).toBe(source.replace('\taudit port', '  audit port'));
    const after = parse(formatted, runtime);
    expect(after.header.diagnostics).toEqual([]);
    expect(after.syntax.diagnostics).toEqual([]);
    expect(after.graph).toEqual(before.graph);
    expect(after.syntax.statements.find((item) => item.kind === 'port')).toMatchObject({
      direction: { value: 'out' }, anchor: { value: 'auto' },
    });
    expect(formatDocument028(formatted, runtime)).toBe(formatted);
  });

  it('generates double-quoted node and edge labels without rewriting authored labels', () => {
    const nodeLabel = 'New "worker" \\ logs';
    const edgeLabel = 'Runs "nightly" \\ path';
    const node = parse(source, runtime).syntax.statements.find((item) =>
      item.kind === 'node' && item.id.value === 'worker')!;
    const withNodeLabel = setCandidateLabel(source, node, nodeLabel);
    const edge = parse(withNodeLabel, runtime).syntax.statements.find((item) =>
      item.kind === 'edge' && item.id?.value === 'send')!;
    const generated = setCandidateLabel(withNodeLabel, edge, edgeLabel);
    const expected = source.replace('worker service\r\n',
      `worker service as ${JSON.stringify(nodeLabel)}\r\n`).replace('send = worker -> store\r\n',
      `send = worker -> store as ${JSON.stringify(edgeLabel)}\r\n`);
    expect(generated).toBe(expected);
    expect(formatDocument028(generated, runtime)).toBe(expected.replace('\taudit port', '  audit port'));
    const parsed = parse(generated, runtime);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.nodes.find(({ id }) => id === 'worker')?.label).toBe(nodeLabel);
    expect(parsed.graph?.edges.find(({ id }) => id === 'send')?.label).toBe(edgeLabel);
  });

  it('preserves tabs after Unicode separators inside comment text', () => {
    const comment = '// keep\u2028\ttab\u2029\ttoo\r\tand CR';
    const input = '@diagram architecture\n\tapi service ' + comment + '\n';
    expect(parse(input, runtime).syntax.diagnostics).toEqual([]);
    expect(formatDocument028(input, runtime)).toBe(input.replace('\tapi', '  api'));
  });

  it('formats valid successor-only syntax without requiring a staging graph', () => {
    const input = '@diagram uml-sequence\na participant\nb participant\n' +
      'activation a {\n\ta -> b\n}\n';
    const parsed = parse(input, runtime);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph).toBeUndefined();
    expect(formatDocument028(input, runtime)).toBe(input.replace('\ta -> b', '  a -> b'));
  });

  it.each([
    ['unresolved header', 'api service\n'],
    ['invalid body', '@diagram architecture\napi service\napi -> missing\n'],
  ])('refuses formatting of %s without repairing the draft', (_reason, input) => {
    const original = input;
    expect(() => formatDocument028(input, runtime)).toThrow('coral.format028.source.invalid');
    expect(input).toBe(original);
  });
});
