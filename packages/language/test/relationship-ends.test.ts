import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';
import type { GraphIR, RelationshipEnd } from '../src/types.js';

function sourceWith(field: 'sourceEnd' | 'targetEnd', value: unknown, style?: Record<string, unknown>): string {
  const data = { [field]: value, ...(style ? { style } : {}) };
  return `service "A" as a\nservice "B" as b\na -> b data ${JSON.stringify(data)}`;
}

function graphWith(sourceEnd: RelationshipEnd): GraphIR {
  return {
    version: '3.0.0', id: 'g',
    nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }],
    edges: [{ id: 'a-b', source: 'a', target: 'b', sourceEnd }],
  };
}

describe('relationship-end Coral projection', () => {
  it.each<RelationshipEnd>([
    {},
    { role: 'owner' },
    { multiplicity: { lower: 0, upper: '*' } },
    { navigability: 'non-navigable' },
    { marker: { kind: 'triangle', fill: 'open' } },
    {
      role: 'orders', multiplicity: { lower: 1, upper: '*' }, navigability: 'navigable',
      marker: { kind: 'one-or-many', fill: 'unspecified' },
    },
  ])('parses, prints, and reparses a valid end %#', (end) => {
    const parsed = parse(print(graphWith(end)));
    expect(parsed.success, parsed.errors.map((error) => error.message).join('\n')).toBe(true);
    expect(parsed.graph?.edges[0].sourceEnd).toEqual(end);

    const first = printWithDiagnostics(parsed.graph!);
    expect(first.diagnostics).toEqual([]);
    const reparsed = parse(first.text);
    expect(reparsed.graph?.edges[0].sourceEnd).toEqual(end);
    expect(print(reparsed.graph!)).toBe(first.text);
  });

  it.each([
    ['not object', 'x', 'sourceEnd must be an object'],
    ['unknown field', { label: 'x' }, 'sourceEnd.label is not a relationship-end field'],
    ['empty role', { role: '' }, 'sourceEnd.role must be a non-empty string'],
    ['missing multiplicity bound', { multiplicity: { lower: 1 } }, 'sourceEnd.multiplicity requires lower and upper'],
    ['negative lower', { multiplicity: { lower: -1, upper: 1 } }, 'sourceEnd.multiplicity.lower must be a non-negative integer'],
    ['fractional lower', { multiplicity: { lower: 0.5, upper: 1 } }, 'sourceEnd.multiplicity.lower must be a non-negative integer'],
    ['bad upper', { multiplicity: { lower: 0, upper: 'many' } }, 'sourceEnd.multiplicity.upper must be a non-negative integer or "*"'],
    ['reversed bounds', { multiplicity: { lower: 2, upper: 1 } }, 'sourceEnd.multiplicity.upper must not be less than lower'],
    ['bad navigability', { navigability: 'both' }, 'sourceEnd.navigability must be navigable, non-navigable, or unspecified'],
    ['missing marker field', { marker: { kind: 'arrow' } }, 'sourceEnd.marker requires kind and fill'],
    ['unknown marker kind', { marker: { kind: 'dot', fill: 'open' } }, 'sourceEnd.marker.kind is not a GraphIR endpoint marker'],
    ['unknown marker fill', { marker: { kind: 'arrow', fill: 'solid' } }, 'sourceEnd.marker.fill must be open, filled, or unspecified'],
    ['restricted marker fill', { marker: { kind: 'crow-foot', fill: 'filled' } }, 'sourceEnd.marker.fill must be unspecified for crow-foot'],
    [
      'contradictory cardinality marker',
      { multiplicity: { lower: 0, upper: '*' }, marker: { kind: 'one', fill: 'unspecified' } },
      'sourceEnd.marker one contradicts multiplicity 0..*',
    ],
  ])('rejects %s without retaining a partial end', (_name, end, message) => {
    const result = parse(sourceWith('sourceEnd', end));
    const diagnostic = result.diagnostics.find((item) => item.code === 'coral.edge.end.invalid');
    expect(result.success).toBe(false);
    expect(result.graph?.edges[0].sourceEnd).toBeUndefined();
    expect(diagnostic?.message).toContain(message);
    expect(diagnostic?.range?.start.column).toBe(sourceWith('sourceEnd', end).split('\n')[2].indexOf('"sourceEnd"'));
  });

  it('accepts the schema integer domain beyond Number.MAX_SAFE_INTEGER in whole-end data only (FIX-1 D52-2)', () => {
    const largeInteger = Number.MAX_SAFE_INTEGER + 1;
    const result = parse(`service "A" as a\nservice "B" as b\na -> b data {"sourceEnd":{"multiplicity":{"lower":${largeInteger},"upper":"*"}}}`);
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.graph?.edges[0].sourceEnd?.multiplicity?.lower).toBe(largeInteger);
    const compact = parse(`service "A" as a\nservice "B" as b\na (${largeInteger}..*) -> b`);
    expect(compact.diagnostics.map((item) => item.code)).toEqual(['coral.edge.end.invalid']);
    expect(compact.diagnostics[0].message).toContain(String(Number.MAX_SAFE_INTEGER));
  });

  it('rejects legacy style arrows and keeps a same-side full end alone (L1, R-063 AC-5)', () => {
    const source = [
      'service "A" as a', 'service "B" as b',
      'a ("owner") -> b data {"style":{"sourceArrow":"diamond","targetArrow":"arrow"}}',
    ].join('\n');
    const result = parse(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((item) => [item.code, item.severity, source.slice(item.range!.start.offset, item.range!.end.offset)]))
      .toEqual([
        ['coral.edge.legacy-arrow.unsupported', 'error', '"sourceArrow"'],
        ['coral.edge.legacy-arrow.unsupported', 'error', '"targetArrow"'],
      ]);
    expect(result.diagnostics[0].message).toContain(`Coral Language 1.2.0`);
    expect(result.diagnostics[0].message).toContain('(diamond) immediately after the source reference');
    expect(result.diagnostics[1].message).toContain('(arrow) immediately after the target reference');
    expect(result.graph?.edges[0].sourceEnd).toEqual({ role: 'owner' });
    expect(result.graph?.edges[0].targetEnd).toBeUndefined();
    expect(result.graph?.edges[0].style).toBeUndefined();
  });

  it('prints an expressible end only compactly', () => {
    const result = parse('service "A" as a\nservice "B" as b\na (diamond) -> b');
    const text = print(result.graph!);
    expect(text).toContain('a (diamond) -> b');
    expect(text).not.toContain('Arrow');
    expect(print(parse(text).graph!)).toBe(text);
  });

  it('never prints a programmatic style arrow and reports it as loss', () => {
    const graph: GraphIR = {
      version: '3.0.0', id: 'g',
      nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }],
      edges: [{ id: 'e', source: 'a', target: 'b', style: { routing: 'orthogonal', sourceArrow: 'arrow' } as never }],
    };
    const result = printWithDiagnostics(graph);
    expect(result.text).not.toContain('Arrow');
    expect(result.text).toContain('"style":{"routing":"orthogonal"}');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.edge.style.source-arrow.dropped');
    expect(parse(result.text).success).toBe(true);
  });

  it('drops invalid programmatic ends with the established diagnostic', () => {
    const result = printWithDiagnostics(graphWith({ role: '' }));
    expect(result.text).not.toContain('sourceEnd');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.edge.source-end.dropped');
  });

  it.each([
    ['extra end key', { marker: { kind: 'arrow', fill: 'unspecified' }, extra: true }],
    ['extra marker key', { marker: { kind: 'arrow', fill: 'unspecified', extra: true } }],
  ])('never normalizes a legacy-shaped end with an invalid %s', (_name, invalid) => {
    const result = printWithDiagnostics(graphWith(invalid as unknown as RelationshipEnd));
    expect(result.text).not.toContain('sourceArrow');
    expect(result.text).not.toContain('sourceEnd');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.edge.source-end.dropped');
  });

  it('never normalizes a non-JSON legacy-shaped end', () => {
    const marker = { fill: 'unspecified' } as Record<string, unknown>;
    Object.defineProperty(marker, 'kind', { enumerable: true, get: () => 'arrow' });
    const result = printWithDiagnostics(graphWith({ marker } as unknown as RelationshipEnd));
    expect(result.text).not.toContain('sourceArrow');
    expect(result.text).not.toContain('sourceEnd');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.edge.source-end.dropped');
  });
});
