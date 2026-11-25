import { describe, expect, it } from 'vitest';
import { parseDiagnostic, print } from '../src/index.js';
import { parse } from '../src/parser/index.js';
import type { RelationshipEnd } from '../src/index.js';

const prefix = 'service "A" as a\nservice "B" as b\n';
describe('Slice 52 compact ends and related locations', () => {
  it.each(['sourceEnd', 'targetEnd'] as const)('round-trips data-only %s with quoted clause text and Unicode separators', field => {
    for (const role of ['x via y', 'x\u2028y', 'x\u2029y', 'x \\" } via [ data y']) {
      for (const withRoute of [false, true]) {
        const graph = parse(prefix + 'a -> b').graph!;
        const end = { role, navigability: 'unspecified' as const };
        graph.edges[0][field] = end;
        if (withRoute) graph.edges[0].routeIntent = { waypoints: [{ id: 'point', placement: { kind: 'absolute', position: { x: 1, y: 2 } } }] };
        const text = print(graph);
        const result = parse(text);
        expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
        expect(result.graph!.edges[0][field]).toEqual(end);
        expect(result.graph).toEqual(graph);
        expect(print(result.graph!)).toBe(text);
      }
    }
  });
  it('keeps a positioned malformed data error and a separately bounded route', () => {
    const source = prefix + 'a -> b data {"sourceEnd": } via waypoint p relative to missing offset (0, 0)';
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.data.unparsed', 'coral.route.anchor.invalid']);
    expect(source.slice(result.diagnostics[0].range!.start.offset, result.diagnostics[0].range!.end.offset)).toBe('{"sourceEnd": }');
    expect(source.slice(result.diagnostics[1].range!.start.offset, result.diagnostics[1].range!.end.offset)).toBe('missing');
  });
  const markerPairs = [
    ...['arrow', 'triangle', 'diamond', 'circle'].flatMap(kind => ['unspecified', 'open', 'filled'].map(fill => ({ kind, fill }))),
    ...['none', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many'].map(kind => ({ kind, fill: 'unspecified' })),
  ] as NonNullable<RelationshipEnd['marker']>[];
  it.each(markerPairs)('round-trips exactly marker $kind/$fill without inference', marker => {
    const token = marker.kind + (marker.fill === 'open' ? '-' : marker.fill === 'filled' ? '+' : '');
    const parsed = parse(prefix + `a (${token}) -> b (${token})`);
    expect(parsed.success).toBe(true);
    expect(parsed.graph!.edges[0].sourceEnd).toEqual({ marker });
    expect(parsed.graph!.edges[0].targetEnd).toEqual({ marker });
    expect(parse(print(parsed.graph!)).graph!.edges[0]).toEqual(parsed.graph!.edges[0]);
  });
  it('preserves whole-end data for explicit unspecified navigability', () => {
    const end = { navigability: 'unspecified' as const, role: 'owner', multiplicity: { lower: 1, upper: 1 }, marker: { kind: 'one', fill: 'unspecified' } };
    const result = parse(prefix + `a (0..*) -> b data ${JSON.stringify({ targetEnd: end })}`);
    expect(result.success).toBe(true);
    expect(result.graph!.edges[0].targetEnd).toEqual(end);
    expect(parse(print(result.graph!)).graph!.edges[0].targetEnd).toEqual(end);
  });
  it.each([['nav', 'navigable'], ['nonav', 'non-navigable']] as const)('spells %s navigability compactly and round-trips it (FIX-1 D52-1)', (token, navigability) => {
    const result = parse(prefix + `a (1 "owner" one ${token}) -> b (${token})`);
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.graph!.edges[0].sourceEnd).toEqual({ multiplicity: { lower: 1, upper: 1 }, role: 'owner', marker: { kind: 'one', fill: 'unspecified' }, navigability });
    expect(result.graph!.edges[0].targetEnd).toEqual({ navigability });
    const text = print(result.graph!);
    expect(text).toContain(`a (1 "owner" one ${token}) -> b (${token})`);
    expect(parse(text).graph!.edges[0]).toEqual(result.graph!.edges[0]);
  });
  it.each([['navigable', 'nav'], ['non-navigable', 'nonav']] as const)('rejects compact-expressible %s data and names the compact form', (navigability, token) => {
    const end = { navigability, role: 'owner', multiplicity: { lower: 1, upper: 1 }, marker: { kind: 'one', fill: 'unspecified' } };
    const result = parse(prefix + `a (0..*) -> b data ${JSON.stringify({ targetEnd: end })}`);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.compact.required']);
    expect(result.diagnostics[0].message).toContain(`write (1 "owner" one ${token}) immediately after the target reference`);
    expect(result.graph!.edges[0].targetEnd).toBeUndefined();
  });
  it('prints navigability-bearing ends compactly from GraphIR', () => {
    const graph = parse(prefix + 'a -> b').graph!;
    graph.edges[0].sourceEnd = { navigability: 'non-navigable' };
    graph.edges[0].targetEnd = { role: 'items', navigability: 'navigable', marker: { kind: 'arrow', fill: 'open' } };
    const text = print(graph);
    expect(text).toContain('a (nonav) -> b ("items" arrow- nav)');
    expect(text).not.toContain(' data ');
    expect(parse(text).graph).toEqual(graph);
  });
  // Exact code and slice for each rejected end (Slice 52 test review T52-8).
  const invalid = 'coral.edge.end.invalid';
  it.each([
    ['()', [[invalid, '()']]],
    ['(*)', [[invalid, '*']]],
    ['(bareRole)', [[invalid, 'bareRole']]],
    ['(1, 2)', [[invalid, '1,'], ['coral.edge.field.duplicate', '1,']]],
    ['(bar+)', [[invalid, 'bar+']]],
    ['(-1)', [[invalid, '-1']]],
    ['(0.1)', [[invalid, '0.1']]],
    ['(2..1)', [[invalid, '(2..1)']]],
    ['(1e999)', [[invalid, '1e999']]],
    ['("")', [[invalid, '("")']]],
    ['(0..* one)', [[invalid, '(0..* one)']]],
    ['(nav+)', [[invalid, 'nav+']]],
    ['(navigable)', [[invalid, 'navigable']]],
  ] as const)('rejects %s and continues another edge', (end, expected) => {
    const source = prefix + `a ${end} -> b\na -> b (triangle-)`;
    const result = parse(source);
    expect(result.diagnostics.map(d => [d.code, source.slice(d.range!.start.offset, d.range!.end.offset)])).toEqual(expected);
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
    expect(result.graph!.edges[1].targetEnd).toEqual({ marker: { kind: 'triangle', fill: 'open' } });
  });
  it('preserves roles containing every delimiter and quoted references touching ends', () => {
    const role = 'owner ) -> data [, " \\ 😀';
    const result = parse(prefix + `"a"(${JSON.stringify(role)}) -> "b"(9007199254740991)`);
    expect(result.success).toBe(true);
    expect(result.graph!.edges[0].sourceEnd).toEqual({ role });
    expect(result.graph!.edges[0].targetEnd).toEqual({ multiplicity: { lower: Number.MAX_SAFE_INTEGER, upper: Number.MAX_SAFE_INTEGER } });
    expect(parse(print(result.graph!)).graph!.edges[0]).toEqual(result.graph!.edges[0]);
  });
  it('round-trips JSON control escapes and Unicode escapes in roles', () => {
    const role = 'owner\b\f\u0000é';
    const result = parse(prefix + `a (${JSON.stringify(role)}) -> b ("\\u0061")`);
    expect(result.graph!.edges[0].sourceEnd).toEqual({ role });
    expect(result.graph!.edges[0].targetEnd).toEqual({ role: 'a' });
    expect(parse(print(result.graph!)).graph!.edges[0]).toEqual(result.graph!.edges[0]);
  });
  it('keeps invalid-first reservation and separate whole-end/part groups', () => {
    const result = parse(prefix + 'a (-1) (1 2) -> b data {"sourceEnd":{"navigability":"navigable"}}');
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
    // FIX-1 D52-6: the bad bound is ranged at its part, after the whole-end group's primary.
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.field.duplicate', 'coral.edge.end.invalid', 'coral.edge.field.duplicate']);
    expect(result.diagnostics[0].related).toHaveLength(2);
  });
  it('does not hide an invalid repeated part behind a valid first part', () => {
    const result = parse(prefix + 'a (1 -1 "owner" "") -> b');
    expect(result.diagnostics.filter(d => d.code === 'coral.edge.end.invalid')).toHaveLength(2);
    expect(result.diagnostics.filter(d => d.code === 'coral.edge.field.duplicate')).toHaveLength(2);
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
  });
  it('keeps duplicate JSON object instances and unrelated same-code fields separate', () => {
    const result = parse('service "A" as a {\n x: [{"a":1,"a":2},{"a":3,"a":4}]\n}\n' +
      'a -> a [label: "x", label: "y", description: "x", description: "y"]');
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every(d => d.related?.length === 1)).toBe(true);
  });
  it('groups a three-times repeated JSON key with exact slices in source order (T52-4)', () => {
    const source = 'service "A" as a {\n x: {"k":1,"k":2,"k":3}\n}';
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.json.key.duplicate']);
    const [diagnostic] = result.diagnostics;
    const occurrences = [...source.matchAll(/"k"/g)].map(match => match.index);
    expect(occurrences).toHaveLength(3);
    const locations = [diagnostic, ...diagnostic.related!];
    expect(locations.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['"k"', '"k"', '"k"']);
    expect(locations.map(d => d.range!.start.offset)).toEqual(occurrences);
    expect(diagnostic.related!.map(d => d.position.offset)).toEqual(occurrences.slice(1));
  });
  it('preserves existing Coral string escaping in endpoint references', () => {
    const result = parse('service "A\\q" as "id\\q"\n"id\\q" -> "id\\q"');
    expect(result.success).toBe(true);
    expect(result.graph!.edges).toHaveLength(1);
  });
  it.each([
    ['a (diamond+ "owner" 1) -> b', '(diamond+ "owner" 1)', '(1 "owner" diamond+)'],
    ['a -> b (nav 0..*)', '(nav 0..*)', '(0..* nav)'],
    ['a ("owner" 1) -> b', '("owner" 1)', '(1 "owner")'],
    ['a -> b (nonav arrow- "x")', '(nonav arrow- "x")', '("x" arrow- nonav)'],
    // Adjacent-pair inversions after an in-order first part (Slice 52 test review T52-1).
    ['a (1 nav "x") -> b', '(1 nav "x")', '(1 "x" nav)'],
    ['a (1 diamond "x") -> b', '(1 diamond "x")', '(1 "x" diamond)'],
  ])('rejects out-of-order parts in %s and names the full canonical rewrite (FIX-1 D52-2)', (line, annotation, canonical) => {
    const source = prefix + line;
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.order.invalid']);
    const [diagnostic] = result.diagnostics;
    expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe(annotation);
    expect(diagnostic.message).toContain(`write ${canonical}`);
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
    expect(result.graph!.edges[0].targetEnd).toBeUndefined();
  });
  it('accepts exactly the canonical order among every permutation of 2-4 recognized parts (T52-1)', () => {
    const canonical = ['1', '"x"', 'diamond', 'nav'];
    const permutations = (items: string[]): string[][] => items.length <= 1 ? [items]
      : items.flatMap((item, index) => permutations(items.filter((_, other) => other !== index)).map(rest => [item, ...rest]));
    let accepted = 0;
    let rejected = 0;
    for (let mask = 1; mask < 1 << canonical.length; mask++) {
      const subset = canonical.filter((_, index) => mask & (1 << index));
      if (subset.length < 2) continue;
      for (const order of permutations(subset)) {
        const annotation = `(${order.join(' ')})`;
        const result = parse(prefix + `a ${annotation} -> b`);
        if (order.join(' ') === subset.join(' ')) {
          accepted++;
          expect(result.success, `${annotation}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
          expect(result.graph!.edges[0].sourceEnd, annotation).toBeDefined();
        } else {
          rejected++;
          expect(result.diagnostics.map(d => d.code), annotation).toEqual(['coral.edge.end.order.invalid']);
          expect(result.diagnostics[0].message, annotation).toContain(`write (${subset.join(' ')})`);
          expect(result.graph!.edges[0].sourceEnd, annotation).toBeUndefined();
        }
      }
    }
    // 11 subsets of size 2-4; 6*2 + 4*6 + 1*24 = 60 orders, 11 canonical.
    expect([accepted, rejected]).toEqual([11, 49]);
  });
  it('treats whitespace inside an annotation as layout and prints it canonically', () => {
    const result = parse(prefix + 'a( 1  "owner"\tdiamond+ nav )->b(\t0..* )');
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(print(result.graph!)).toContain('a (1 "owner" diamond+ nav) -> b (0..*)');
  });
  it.each([
    ['1.0', '1.0', 'write 1'],
    ['1e0', '1e0', 'write 1'],
    ['01', '01', 'write 1'],
    ['+1', '+1', 'write 1'],
    ['1..1', '1..1', 'write 1'],
    ['0..01', '0..01', 'write 0..1'],
    ['1.0..*', '1.0..*', 'write 1..*'],
    ['1E+0..2', '1E+0..2', 'write 1..2'],
    ['-1', '-1', 'nonnegative'],
    ['0.5', '0.5', 'plain nonnegative integer digits'],
    ['1e400', '1e400', '9007199254740991'],
    ['0..1e400', '0..1e400', '9007199254740991'],
    ['9007199254740992', '9007199254740992', '9007199254740991'],
  ])('rejects noncanonical multiplicity %s at the part with a bound message (FIX-1 D52-2/D52-6)', (token, slice, text) => {
    const source = prefix + `a ("owner" arrow) -> b\na (${token} "owner") -> b`;
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.invalid']);
    const [diagnostic] = result.diagnostics;
    expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe(slice);
    expect(diagnostic.message).toContain(text);
    expect(diagnostic.message).not.toContain('must be an object');
    expect(result.graph!.edges[1].sourceEnd).toBeUndefined();
  });
  it('prints plain digits and keeps ends beyond the compact bound domain in data (FIX-1 D52-2)', () => {
    const graph = parse(prefix + 'a -> b').graph!;
    graph.edges[0].sourceEnd = { multiplicity: { lower: Number.MAX_SAFE_INTEGER, upper: '*' } };
    graph.edges[0].targetEnd = { multiplicity: { lower: 1e21, upper: 1e21 }, role: 'many' };
    const text = print(graph);
    expect(text).toContain('a (9007199254740991..*) -> b data {"targetEnd":');
    expect(text).not.toMatch(/\(1e\+?21/);
    const reparsed = parse(text);
    expect(reparsed.success, JSON.stringify(reparsed.diagnostics)).toBe(true);
    expect(reparsed.graph).toEqual(graph);
  });
  it('groups three repeated parts with exact slices and stores no end (R52-1)', () => {
    const source = prefix + 'a (1 2 3) -> b';
    const result = parse(source);
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic.code).toBe('coral.edge.field.duplicate');
    expect([diagnostic, ...diagnostic.related!].map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['1', '2', '3']);
    // An end with any error is rejected whole; no recovery end is assembled.
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
  });
  // R52-1: an invalid or repeated part no longer hides an order error.
  it('reports a malformed bound and the order error with a canonical-token rewrite', () => {
    const source = prefix + 'a (diamond 1..1) -> b';
    const result = parse(source);
    // Diagnostics sort by position: the whole annotation precedes its parts.
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.order.invalid', 'coral.edge.end.invalid']);
    expect(source.slice(result.diagnostics[0].range!.start.offset, result.diagnostics[0].range!.end.offset)).toBe('(diamond 1..1)');
    expect(source.slice(result.diagnostics[1].range!.start.offset, result.diagnostics[1].range!.end.offset)).toBe('1..1');
    expect(result.diagnostics[0].message).toContain('write (1 diamond)');
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
  });
  it('reports a repeated part and the order error from first occurrences', () => {
    const result = parse(prefix + 'a (nav 1 nav) -> b');
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.order.invalid', 'coral.edge.field.duplicate']);
    expect(result.diagnostics[0].message).toContain('write (1 nav)');
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
    // (nav 1) and (nav 1 nav) now recover identically.
    expect(parse(prefix + 'a (nav 1) -> b').graph!.edges[0].sourceEnd).toBeUndefined();
  });
  it('reports the order error without a rewrite when an unknown part exists', () => {
    const result = parse(prefix + 'a (nav bogus 1) -> b');
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.order.invalid', 'coral.edge.end.invalid']);
    expect(result.diagnostics[0].message).toContain('multiplicity, role, marker, navigability');
    expect(result.diagnostics[0].message).not.toContain('; write');
    expect(result.graph!.edges[0].sourceEnd).toBeUndefined();
  });
  it('reports the order error without a rewrite when a bound has no canonical token', () => {
    const result = parse(prefix + 'a (diamond -1) -> b');
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.order.invalid', 'coral.edge.end.invalid']);
    expect(result.diagnostics[0].message).not.toContain('; write');
  });
  // R52-3: near-miss navigability spellings name the approved form.
  it.each([
    ['navigable', 'write nav'],
    ['non-navigable', 'write nonav'],
    ['unspecified', 'explicit unspecified navigability requires whole-end data'],
  ])('hints the navigability spelling for invalid part %s', (token, hint) => {
    const result = parse(prefix + `a -> b (${token})`);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.invalid']);
    expect(result.diagnostics[0].message).toContain(hint);
  });
  // R52-4: only spaces and tabs are spacing inside an annotation.
  it.each([' ', ' ', '　', '\v', '\f'])('rejects %j spacing inside an annotation at the character', space => {
    for (const inner of [`1${space}"owner"`, `${space}1`, `1${space}`]) {
      const source = prefix + `a (${inner}) -> b`;
      const result = parse(source);
      expect(result.diagnostics.map(d => d.code), inner).toEqual(['coral.syntax.spacing.invalid']);
      const [diagnostic] = result.diagnostics;
      expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe(space);
      expect(diagnostic.message).toContain('spaces or tabs');
      expect(result.graph!.edges).toHaveLength(0);
    }
  });
  // Code review C52-1: a part glued to a string is one missing-spacing error at
  // the glued column; the glued part is not re-reported.
  it.each([
    ['("a"x)', 'x'],
    ['("a""b")', '"'],
    ['(1 "a"arrow)', 'a'],
  ])('reports one missing-spacing error for glued parts %s', (annotation, glued) => {
    for (const [source, field] of [
      [prefix + `a ${annotation} -> b`, 'sourceEnd'],
      [prefix + `a -> b ${annotation}`, 'targetEnd'],
    ] as const) {
      const result = parse(source);
      expect(result.diagnostics.map(d => d.code), source).toEqual(['coral.edge.end.invalid']);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.message).toBe(`Invalid ${field} spacing; parts must be separated by spaces or tabs`);
      const column = source.lastIndexOf(annotation) + annotation.indexOf('"', annotation.indexOf('"') + 1) + 1;
      expect(diagnostic.range!.start.offset).toBe(column);
      expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe(glued);
      expect(result.graph!.edges[0][field]).toBeUndefined();
    }
  });
  it('reports each glued column once in a run of glued parts', () => {
    const source = prefix + 'a ("a""b""c") -> b';
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.invalid', 'coral.edge.end.invalid']);
    expect(result.diagnostics.map(d => d.range!.start.offset)).toEqual([source.indexOf('"b"'), source.indexOf('"c"')]);
  });
  // R52-5: a well-formed but oversized bound names the whole-end data route.
  it.each(['9007199254740992', '0..9007199254740992'])('names whole-end data for oversized bound %s', token => {
    expect(parse(prefix + `a (${token}) -> b`).diagnostics[0].message).toContain('; a larger bound requires whole-end data.sourceEnd');
    expect(parse(prefix + `a -> b (${token})`).diagnostics[0].message).toContain('; a larger bound requires whole-end data.targetEnd');
  });
  it.each(['1e400', '0..1e400', '-1', '1.0'])('does not name whole-end data for malformed bound %s', token => {
    expect(parse(prefix + `a (${token}) -> b`).diagnostics[0].message).not.toContain('whole-end data');
  });
  it('rejects compact-expressible data but keeps empty and navigability ends', () => {
    const bad = parse(prefix + 'a -> b data {"sourceEnd":{"role":"owner"}}');
    expect(bad.diagnostics.map(d => d.code)).toEqual(['coral.edge.end.compact.required']);
    expect(bad.graph!.edges[0].sourceEnd).toBeUndefined();
    expect(parse(prefix + 'a -> b data {"sourceEnd":{},"targetEnd":{"role":"owner","navigability":"unspecified"}}').success).toBe(true);
  });
  it('groups compact/data collisions without a redundant canonicality error', () => {
    const source = prefix + 'a (1) -> b data {"sourceEnd":{"role":"owner"}}';
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.field.duplicate']);
    expect(result.diagnostics[0].related).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('write the whole end in one spelling');
  });
  it('reserves an invalid data end so a compact end still groups with it (T52-2)', () => {
    const source = prefix + 'a (1) -> b data {"sourceEnd":{"role":""}}';
    const result = parse(source);
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.edge.field.duplicate', 'coral.edge.end.invalid']);
    const [duplicate, invalid] = result.diagnostics;
    const slice = (d: { range?: { start: { offset: number }; end: { offset: number } } }) => source.slice(d.range!.start.offset, d.range!.end.offset);
    expect(slice(duplicate)).toBe('(1)');
    expect(duplicate.related).toHaveLength(1);
    expect(slice(duplicate.related![0])).toBe('"sourceEnd"');
    expect(slice(invalid)).toBe('"sourceEnd"');
  });
  it('copies and freezes related locations', () => {
    const position = { line: 1, column: 0, offset: 0 };
    const related = [{ message: 'again', position: { ...position }, range: { start: { ...position }, end: { line: 1, column: 1, offset: 1 } } }];
    const diagnostic = parseDiagnostic({ severity: 'error', code: 'test', message: 'test', position, related });
    related[0].position.column = 10;
    expect(diagnostic.related![0].position.column).toBe(0);
    expect(Object.isFrozen(diagnostic.related)).toBe(true);
    expect(Object.isFrozen(diagnostic.related![0].range!.end)).toBe(true);
  });
});
