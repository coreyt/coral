import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';
import { parseDot } from '../src/formats/dot.js';
import { parseMermaid } from '../src/formats/mermaid.js';
import type { Diagnostic, ParseDiagnostic } from '../src/diagnostics.js';
import type { GraphIR } from '../src/types.js';

/**
 * Tests for the diagnostics channel - R-011.
 */

const CODE_GRAMMAR = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+\.(dropped|degraded|unparsed|unsupported|duplicate)$/;

/** A graph carrying one field of each kind the Coral surface cannot express. */
function lossyGraph(): GraphIR {
  return {
    version: '3.0.0',
    id: 'g',
    nodes: [
      {
        id: 'a',
        type: 'service',
        label: 'A',
        properties: { _internal: 'x', members: ['m()'], ratio: Number.POSITIVE_INFINITY },
        dimensions: { width: 10, height: 10 },
      },
    ],
    edges: [{ id: 'kept_id', source: 'a', target: 'a', sourcePort: 'p1' }],
  } as GraphIR;
}

describe('R-011: parse and print diagnostics', () => {
  describe('Unicode spacing', () => {
    it.each(['\u00a0', '\u2009', '\u2028', '\u200b', '\ufeff', '\v', '\f'])(
      'rejects a non-ASCII separator outside quoted text (%j) and keeps neighboring declarations',
      (separator) => {
        const source = `service "First"\nservice${separator}"Skipped"\nservice "Last"`;
        const result = parse(source);
        const spacing = (result.diagnostics as ParseDiagnostic[])
          .filter((item) => item.code === 'coral.syntax.spacing.invalid');

        expect(spacing).toHaveLength(1);
        expect(source.slice(spacing[0].range!.start.offset, spacing[0].range!.end.offset)).toBe(separator);
        expect(spacing[0].position).toEqual({ line: 2, column: 7, offset: 'service "First"\nservice'.length });
        expect(result.graph?.nodes.map((node) => node.label)).toEqual(['First', 'Last']);
      },
    );

    it.each(['\u2060', '\u{E0001}', '\u{E0100}'])(
      'reports an invisible format separator as one exact UTF-16 span (%j)',
      (separator) => {
        const source = `service "First${separator}label"\nservice${separator}"Skipped"\nservice "Last"`;
        const result = parse(source);
        const spacing = (result.diagnostics as ParseDiagnostic[])
          .filter((item) => item.code === 'coral.syntax.spacing.invalid');

        expect(spacing).toHaveLength(1);
        expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(separator);
        expect(spacing[0]!.range!.end.offset - spacing[0]!.range!.start.offset).toBe(separator.length);
        expect(result.graph?.nodes.map((node) => node.label)).toEqual([`First${separator}label`, 'Last']);
      },
    );

    it('accepts Unicode spacing inside labels and comments, and ordinary spaces and tabs outside them', () => {
      const source = '// An author note\u00a0\nservice\t"First\u00a0label"\nservice "Last"';
      const result = parse(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes.map((node) => node.label)).toEqual(['First\u00a0label', 'Last']);
    });

    it('accepts CRLF, but diagnoses each illegal separator on a source line independently', () => {
      const source = 'service "First"\r\nservice\u00a0"Bad"\u2009\r\nservice "Last"';
      const result = parse(source);
      const spacing = (result.diagnostics as ParseDiagnostic[])
        .filter((item) => item.code === 'coral.syntax.spacing.invalid');

      expect(spacing.map((item) => source.slice(item.range!.start.offset, item.range!.end.offset)))
        .toEqual(['\u00a0', '\u2009']);
      expect(spacing.map((item) => item.position.line)).toEqual([2, 2]);
      expect(result.graph?.nodes.map((node) => node.label)).toEqual(['First', 'Last']);
    });
  });

  describe('R-036: exact diagnostic ranges', () => {
    it('adds an exact UTF-16 half-open range when the reported source starts at the position', () => {
      const source = 'service "😀"\nbad syntax!';
      const diagnostic = parse(source).errors[0] as ParseDiagnostic & {
        range?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } };
      };

      expect(source.slice(diagnostic.range?.start.offset, diagnostic.range?.end.offset)).toBe('bad syntax!');
      expect(diagnostic.range).toEqual({
        start: { line: 2, column: 0, offset: 'service "😀"\n'.length },
        end: { line: 2, column: 11, offset: source.length },
      });
    });

    it('accounts for indentation while keeping line, column, and offset consistent', () => {
      const diagnostic = parse('  bad syntax!').errors[0] as ParseDiagnostic & { range?: unknown };
      expect(diagnostic.position).toEqual({ line: 1, column: 2, offset: 2 });
      expect(diagnostic.range).toEqual({
        start: { line: 1, column: 2, offset: 2 },
        end: { line: 1, column: 13, offset: 13 },
      });
    });

    it('ranges the offending token for invalid IDs, invalid data, reserved keys, and unclosed braces', () => {
      const source = [
        'service "One" as shared',
        'service "Two" as shared',
        'service "Bad" data nope',
        'service "Group" {',
        '  _private: "x"',
      ].join('\n');
      const diagnostics = parse(source).diagnostics as ParseDiagnostic[];
      const tokenFor = (code: string) => {
        const range = diagnostics.find((item) => item.code === code)?.range;
        return range ? source.slice(range.start.offset, range.end.offset) : undefined;
      };

      expect(tokenFor('coral.node.id.invalid')).toBe('shared');
      expect(tokenFor('coral.node.data.unparsed')).toBe('nope');
      expect(tokenFor('coral.node.reserved-key.invalid')).toBe('_private');
      expect(tokenFor('coral.brace.unparsed')).toBe('{');
    });

    it('anchors repeated tokens to their grammar clause rather than a label or value', () => {
      const source = [
        'service "One" as dup',
        'service "Two" as dup data {"description":"dup"}',
        'service "description" data {"description":3}',
        'service "Value collision" data {"description":"ports","ports":"bad"}',
        'service "Body" data {"description":"x"} {',
      ].join('\n');
      const diagnostics = parse(source).diagnostics as ParseDiagnostic[];
      const degraded = diagnostics.find((item) => item.code === 'coral.node.id.invalid')!;
      const badDescription = diagnostics.find((item) => item.message === 'description has the wrong shape')!;
      const badPorts = diagnostics.find((item) => item.message === 'ports has the wrong shape')!;
      const brace = diagnostics.find((item) => item.code === 'coral.brace.unparsed')!;

      expect(degraded.range?.start.offset).toBe(source.indexOf('as dup data') + 3);
      expect(badDescription.range?.start.offset).toBe(source.indexOf('{"description":3}') + 1);
      expect(badPorts.range?.start.offset).toBe(source.indexOf(',"ports":"bad"') + 1);
      expect(brace.range?.start.offset).toBe(source.lastIndexOf('{'));
    });

    it('ranges each duplicate JSON key exactly and keeps the first value (R-063 AC-5)', () => {
      const source = 'service "Duplicate" data {"ports":[],"ports":"bad"}';
      const result = parse(source);
      const duplicates = (result.diagnostics as ParseDiagnostic[])
        .filter((item) => item.code === 'coral.json.key.duplicate');

      expect(duplicates).toHaveLength(1);
      const locations = [duplicates[0], ...duplicates[0].related!];
      expect(locations.map(item => source.slice(item.range!.start.offset, item.range!.end.offset))).toEqual(['"ports"', '"ports"']);
      expect(locations[0].range!.start.offset).toBeLessThan(locations[1].range!.start.offset);
      expect(result.graph?.nodes[0].ports).toEqual([]);
    });
  });

  describe('AC-1: diagnostics are carried at every severity', () => {
    it('given a parse producing several severities when inspected then each carries severity, code, message and position', () => {
      // Coral source reports only errors (R-063 AC-5); DOT reports a stray `;`
      // as information and a stray `,` as an error.
      const result = parseDot('digraph { a; ; , }');

      expect(result.diagnostics).toBeDefined();
      const severities = new Set(result.diagnostics!.map((d) => d.severity));
      expect(severities.has('error')).toBe(true);
      expect(severities.has('info')).toBe(true);

      for (const d of result.diagnostics!) {
        expect(['error', 'warning', 'info']).toContain(d.severity);
        expect(d.code).toMatch(CODE_GRAMMAR);
        expect(typeof d.message).toBe('string');
        expect(d.position).toBeDefined();
        expect(typeof d.position.line).toBe('number');
        expect(typeof d.position.column).toBe('number');
        expect(typeof d.position.offset).toBe('number');
      }
    });

    it('mirrors position into the flat fields the MCP tools and editor gutter read', () => {
      const result = parse('!!!not coral!!!');

      for (const d of result.diagnostics! as ParseDiagnostic[]) {
        expect(d.line).toBe(d.position.line);
        expect(d.column).toBe(d.position.column);
        expect(d.offset).toBe(d.position.offset);
      }
    });
  });

  describe('AC-2: errors is a derived, tamper-proof view', () => {
    it('given any parse result when errors is inspected then it equals the error-severity diagnostics, element-identical and in order', () => {
      const result = parse('service "A"\n!!!bad!!!\n???worse???');
      const expected = result.diagnostics!.filter((d) => d.severity === 'error');

      expect(result.errors).toHaveLength(expected.length);
      result.errors.forEach((e, i) => {
        expect(e).toBe(expected[i]);
      });
    });

    it('freezes both arrays so neither can be desynchronised', () => {
      const result = parse('!!!bad!!!');

      expect(Object.isFrozen(result.errors)).toBe(true);
      expect(Object.isFrozen(result.diagnostics)).toBe(true);
      expect(() => result.errors.push({ message: 'x', line: 1, column: 0, offset: 0 })).toThrow();
      expect(() => (result.diagnostics as ParseDiagnostic[]).push({} as ParseDiagnostic)).toThrow();
    });
  });

  describe('AC-4: a warning never fails a parse', () => {
    it('given warnings and info but no errors when success is inspected then it is true', () => {
      // Coral source reports only errors (R-063 AC-5); DOT reports a stray `;` as information.
      const result = parseDot('digraph { a; ; }');

      expect(result.errors).toHaveLength(0);
      expect(result.diagnostics!.some((d) => d.severity !== 'error')).toBe(true);
      expect(result.success).toBe(true);
    });

    it('derives success in the mermaid sub-parsers rather than hardcoding it', () => {
      // The nine sub-parsers hardcoded `success: true`; it is now derived.
      const result = parseMermaid('classDiagram\n  class Order {\n    +place()\n  }');

      expect(result.success).toBe(result.diagnostics!.every((d) => d.severity !== 'error'));
      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
    });
  });

  describe('AC-5: diagnostics are ordered by source position', () => {
    it('given an unclosed brace opened before a later error then the brace sorts first', () => {
      const result = parse('service "A" {\n  name: "x"\n!!!bad!!!\n');

      const lines = result.diagnostics!.map((d) => d.position.line);
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);

      const brace = result.diagnostics!.find((d) => /brace/i.test(d.message));
      expect(brace).toBeDefined();
      expect(brace!.position.line).toBe(1);
    });
  });

  describe('AC-6: the printer reports what it cannot emit', () => {
    it('given a graph with fields Coral cannot express when printed then each is reported with position absent', () => {
      const { text, diagnostics } = printWithDiagnostics(lossyGraph());

      expect(typeof text).toBe('string');
      const codes = diagnostics.map((d) => d.code);
      expect(codes).not.toContain('coral.edge.id.dropped');
      expect(codes.some((c) => c.startsWith('coral.node.dimensions'))).toBe(false);
      expect(codes.some((c) => c.startsWith('coral.edge.source-port'))).toBe(false);
      expect(codes.some((c) => c.includes('property'))).toBe(true);

      for (const d of diagnostics as Diagnostic[]) {
        expect(d.code).toMatch(CODE_GRAMMAR);
        expect(d.position).toBeUndefined();
      }
    });

    it('keeps print returning a bare string so existing consumers are unaffected', () => {
      const out = print(lossyGraph());
      expect(typeof out).toBe('string');
      expect(out).toContain('service "A"');
    });

    it('reports a non-finite number rather than emitting unparseable text', () => {
      const { text, diagnostics } = printWithDiagnostics(lossyGraph());

      expect(text).not.toContain('Infinity');
      expect(diagnostics.some((d) => /finite|number/i.test(d.message))).toBe(true);
    });
  });

  describe('AC-7: existing consumers are unaffected', () => {
    it('keeps ParseError-shaped entries assignable without a cast', () => {
      const result = parse('!!!bad!!!');

      // The flat shape the MCP tools format and the editor maps.
      const mapped = result.errors.map((error) => ({ line: error.line, message: error.message }));
      expect(mapped[0].line).toBeGreaterThan(0);
      expect(typeof mapped[0].message).toBe('string');
    });
  });

  describe('AC-8: diagnostics are produced through one builder', () => {
    it('holds the derived-view invariant for the Coral parser', () => {
      const r = parse('service "A"\n!!!bad!!!');
      expect(r.errors).toEqual(r.diagnostics!.filter((d) => d.severity === 'error'));
      expect(r.success).toBe(r.diagnostics!.every((d) => d.severity !== 'error'));
    });

    it('holds the derived-view invariant for the DOT importer', () => {
      const r = parseDot('digraph G { a -> b; }');
      expect(r.errors).toEqual(r.diagnostics!.filter((d) => d.severity === 'error'));
      expect(r.success).toBe(r.diagnostics!.every((d) => d.severity !== 'error'));
    });

    it('holds the derived-view invariant for the Mermaid importer', () => {
      const r = parseMermaid('graph TD\n  A[One] --> B[Two]');
      expect(r.errors).toEqual(r.diagnostics!.filter((d) => d.severity === 'error'));
      expect(r.success).toBe(r.diagnostics!.every((d) => d.severity !== 'error'));
    });

    it('reports a flowchart line that matches nothing rather than skipping it in silence', () => {
      // parseFlowchart used to `continue` past any unmatched line.
      const r = parseMermaid('graph TD\n  A[One] --> B[Two]\n  }{');

      expect(r.diagnostics!.some((d) => d.code === 'mermaid.line.unparsed')).toBe(true);
      expect(r.success).toBe(true);
    });
  });
});
