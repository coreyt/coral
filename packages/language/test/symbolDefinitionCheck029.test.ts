import { describe, expect, it } from 'vitest';
import { parseDiagnostic } from '../src/diagnostics.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';
import { parseHeader028 } from '../src/parser/header028.js';
import { parseSymbolDefinitions029, type SymbolDefinitionCheckLines029,
  type UserSymbolDefinition } from '../src/parser/symbolDefinitions029.js';

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
const source = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol shield {', '  name "Shield"',
  '  size 48 x 56', '  anchor crest [side: N, at: 0.5]', '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
  '  audit port [direction: out, anchor: keyhole]', '  plain port [direction: in]',
  '  token port [direction: out, anchor: E]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28"/>', '"""', '}', 'gate service', ''].join('\n');
const regions = () => parseHeader028(source, runtime).definitionRegions ?? [];

describe('Edition 0.2.9 definition check hook', () => {
  it('hands each accepted definition and its anchor and port-anchor ranges to the hook', () => {
    const seen: Array<{ definition: Omit<UserSymbolDefinition, 'range'>; lines: SymbolDefinitionCheckLines029 }> = [];
    const result = parseSymbolDefinitions029(source, regions(), {
      checkDefinition: (definition, lines) => { seen.push({ definition, lines }); return []; } });
    expect(result.diagnostics).toEqual([]);
    expect(result.definitions).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.definition.symbolId).toBe('local.shield');
    expect('range' in seen[0]!.definition).toBe(false);
    const { anchors, portAnchors } = seen[0]!.lines;
    expect([...anchors.keys()]).toEqual(['crest', 'keyhole']);
    expect(anchors.get('keyhole')).toMatchObject({ start: { line: 7, column: 9 }, end: { line: 7, column: 16 } });
    expect([...portAnchors.keys()]).toEqual(['audit', 'token']);
    expect(portAnchors.get('audit')).toMatchObject({ start: { line: 8, column: 38 }, end: { line: 8, column: 45 } });
  });

  it('withholds a definition when the hook reports a finding', () => {
    const result = parseSymbolDefinitions029(source, regions(), {
      checkDefinition: (_definition, lines) => {
        const range = lines.anchors.get('keyhole')!;
        return [parseDiagnostic({ severity: 'error', code: 'coral.symbol.local.anchor.invalid',
          message: 'Interior anchor keyhole lies outside the outline.', position: range.start, range })];
      } });
    expect(result.definitions).toEqual([]);
    expect(result.diagnostics.map((item) => [item.code, item.line, item.column]))
      .toEqual([['coral.symbol.local.anchor.invalid', 7, 9]]);
  });

  it('does not call the hook for a definition that already has a finding', () => {
    let calls = 0;
    const broken = source.replace('  size 48 x 56\n', '');
    parseSymbolDefinitions029(broken, parseHeader028(broken, runtime).definitionRegions ?? [], {
      checkDefinition: () => { calls += 1; return []; } });
    expect(calls).toBe(0);
  });
});
