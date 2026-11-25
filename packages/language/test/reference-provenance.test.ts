import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser/index.js';

describe.each([false, true])('reference provenance with source info %s', includeSourceInfo => {
  it.each(['arrange', 'require arrange', 'constraint c: arrange'])('rejects malformed members without throwing in %s', form => {
    for (const member of ['!!!', '']) {
      const source = `service "A" as a\nservice "B" as b\n  ${form} a, ${member}, b as row\nservice "Following" as following`;
      const result = parse(source, { includeSourceInfo });
      expect(result.success).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      const diagnostic = result.diagnostics[0];
      expect(diagnostic.code).toBe('coral.constraint.subjects.invalid');
      expect(diagnostic.position.line).toBe(3);
      expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe(member);
      expect(diagnostic.position.column).toBe(2 + form.length + ' a, '.length);
      expect(result.graph!.constraints).toBeUndefined();
      expect(result.graph!.nodes.map(node => node.id)).toEqual(['a', 'b', 'following']);
    }
  });
  it('does not mistake keywords in IDs or quoted constraint references for clauses', () => {
    const source = 'service "A" as above above missing\nservice "B" as b\nrequire "missing at the top" above b\nservice "C" as of at the top of missing';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['missing', '"missing at the top"', 'missing']);
  });
  it('positions repeated missing endpoints independently through indentation and CRLF', () => {
    const source = 'service "A" as a\r\n  missing ("😀 missing") -> missing (1)';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => [d.code, d.line, d.column])).toEqual([
      ['coral.reference.unresolved.invalid', 2, 2], ['coral.reference.unresolved.invalid', 2, 28],
    ]);
    expect(result.diagnostics.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['missing', 'missing']);
  });
  it('ranges each constraint reference, including a repeated quoted token', () => {
    const source = 'service "A" as a\nrequire "missing" above "missing"\nconstraint c: arrange a, "other", third as row\nrequire a at the top of absent';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['"missing"', '"missing"', '"other"', 'third', 'absent']);
    expect(result.diagnostics.every(d => d.code === 'coral.constraint.reference.unresolved.invalid')).toBe(true);
  });
  it('retains inline scope and target spans and attaches authored scope subject', () => {
    const source = 'service "A" as a\nservice "B" as b\nservice "C" as c above missing\nrequire a at the top of b';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['missing', 'b']);
    expect(result.diagnostics[1].related?.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['a']);
  });
  it('reports ambiguity at the authored edge token', () => {
    const source = 'service "Same" as a\nservice "Same" as b\na -> "Same"';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics[0].code).toBe('coral.reference.ambiguous.invalid');
    expect(result.diagnostics[0].line).toBe(3);
    expect(source.slice(result.diagnostics[0].range!.start.offset, result.diagnostics[0].range!.end.offset)).toBe('"Same"');
  });
  // Slice 52 test review T52-3: ambiguity is reported for constraint references too.
  it.each([
    ['relative', 'require "Same" above b'],
    ['arrangement', 'arrange b, "Same" as row'],
    ['boundary', 'require b at the top of "Same"'],
  ])('reports an ambiguous %s constraint reference at the authored token', (_kind, line) => {
    const source = `service "Same" as a\nservice "Same" as c\nservice "B" as b\n${line}`;
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => d.code)).toEqual(['coral.constraint.reference.ambiguous.invalid']);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic.line).toBe(4);
    expect(source.slice(diagnostic.range!.start.offset, diagnostic.range!.end.offset)).toBe('"Same"');
    expect(diagnostic.range!.start.offset).toBe(source.lastIndexOf('"Same"'));
  });
  it('positions quoted waypoint owners and ports without splitting strings', () => {
    const source = 'service "A" as a\nservice "B" as b\na -> b via waypoint "x, waypoint y" relative to port missing."p.p" offset (1, 2), waypoint two relative to port a."missing.port" offset (3, 4), waypoint three relative to "missing, waypoint x" offset (0, 0)';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics.map(d => source.slice(d.range!.start.offset, d.range!.end.offset))).toEqual(['missing', '"missing.port"', '"missing, waypoint x"']);
    expect(result.diagnostics.every(d => d.code === 'coral.route.anchor.invalid')).toBe(true);
  });
  it('keeps whitespace outside the exact port owner and port token ranges', () => {
    const source = 'service "A" as a\na -> a via waypoint x relative to port\ta . "missing" offset (0, 0)';
    const result = parse(source, { includeSourceInfo });
    expect(result.diagnostics).toHaveLength(1);
    expect(source.slice(result.diagnostics[0].range!.start.offset, result.diagnostics[0].range!.end.offset)).toBe('"missing"');
  });
});
