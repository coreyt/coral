import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser/index.js';
import type { GraphIR } from '../src/types.js';

/**
 * Slice 53: each GraphIR field has one Coral spelling per object (R-063 AC-5).
 * Every collision or repeat has one primary and exact related occurrences; the
 * recovered graph keeps the first occurrence in source order.
 */

interface Reported {
  code: string;
  severity: string;
  line: number | undefined;
  text: string | undefined;
}

function reported(source: string): { diagnostics: Reported[]; graph: GraphIR } {
  const result = parse(source);
  const lines = source.split('\n');
  return {
    graph: result.graph!,
    // These legacy location assertions continue checking EVERY occurrence.
    // Primary-count/group identity is checked separately below.
    diagnostics: result.diagnostics.flatMap((primary) => [primary, ...(primary.related ?? []).map(location => ({ ...location, code: primary.code, severity: primary.severity }))]).map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      line: diagnostic.range?.start.line,
      text: diagnostic.range
        ? lines[diagnostic.range.start.line - 1].slice(diagnostic.range.start.column, diagnostic.range.end.column)
        : undefined,
    })),
  };
}

const NODES = 'service "A" as a\nservice "B" as b\n';
const at = (code: string, line: number, text: string): Reported => ({ code, severity: 'error', line, text });

describe('Slice 53 spelling collisions', () => {
  describe('D8: an edge property through an attribute and data.properties', () => {
    it('reports both spellings and keeps the attribute', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [k: 1] data {"properties":{"k":[2]}}`);
      expect(diagnostics).toEqual([
        at('coral.edge.field.duplicate', 3, 'k'),
        at('coral.edge.field.duplicate', 3, '"k"'),
      ]);
      expect(graph.edges[0].properties).toEqual({ k: 1 });
    });

    it('D10 control: properties.label is not label', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [label: "x"] data {"properties":{"label":"y"}}`);
      expect(diagnostics).toEqual([]);
      expect(graph.edges[0]).toMatchObject({ label: 'x', properties: { label: 'y' } });
    });

    it('points a dotted property collision at the authored dotted key', () => {
      const source = `${NODES}a -> b ["a.b": 1] data {"properties":{"a":{"b":2},"a.b":{"x":3}}}`;
      const { diagnostics, graph } = reported(source);
      expect(diagnostics).toEqual([
        at('coral.edge.field.duplicate', 3, '"a.b"'),
        at('coral.edge.field.duplicate', 3, '"a.b"'),
      ]);
      expect(graph.edges[0].properties).toEqual({ 'a.b': 1, a: { b: 2 } });
    });
  });

  describe('D13: a repeated line style', () => {
    it('reports both tokens and keeps the first', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [dashed, dotted]`);
      expect(diagnostics).toEqual([
        at('coral.edge.field.duplicate', 3, 'dashed'),
        at('coral.edge.field.duplicate', 3, 'dotted'),
      ]);
      expect(graph.edges[0].style).toEqual({ lineStyle: 'dashed' });
    });
  });

  describe('D14: a repeated named attribute', () => {
    it('reports a repeated label at each key', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [label: "x", label: "y"]`);
      expect(diagnostics).toEqual([
        at('coral.edge.field.duplicate', 3, 'label'),
        at('coral.edge.field.duplicate', 3, 'label'),
      ]);
      expect(graph.edges[0].label).toBe('x');
    });

    it('treats a quoted and a bare key as one key', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [k: 1, "k": 2]`);
      expect(diagnostics).toEqual([
        at('coral.edge.field.duplicate', 3, 'k'),
        at('coral.edge.field.duplicate', 3, '"k"'),
      ]);
      expect(graph.edges[0].properties).toEqual({ k: 1 });
    });

    it('reports a repeated description', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [description: "one", description: "two"]`);
      expect(diagnostics.map(({ code, text }) => [code, text])).toEqual([
        ['coral.edge.field.duplicate', 'description'],
        ['coral.edge.field.duplicate', 'description'],
      ]);
      expect(graph.edges[0].description).toBe('one');
    });

    it('reports three locations as one primary error with two related locations', () => {
      const result = parse(`${NODES}a -> b [label: "x", label: "y", label: "z"]`);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].related).toHaveLength(2);
      const { diagnostics } = reported(`${NODES}a -> b [label: "x", label: "y", label: "z"]`);
      expect(diagnostics.filter(({ code }) => code === 'coral.edge.field.duplicate')).toHaveLength(3);
    });

    it('counts an invalid first occurrence and stores nothing', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [label: 1, label: "x"]`);
      expect(diagnostics).toEqual([
        at('coral.attribute.label.invalid', 3, 'label'),
        at('coral.edge.field.duplicate', 3, 'label'),
        at('coral.edge.field.duplicate', 3, 'label'),
      ]);
      expect(graph.edges[0].label).toBeUndefined();
    });

    it('does not treat two edges between the same nodes as a collision', () => {
      const { diagnostics } = reported(`${NODES}a -> b [label: "x"]\na -> b [label: "x"]`);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('D15: a duplicate JSON key', () => {
    it('reports a repeated @graph key', () => {
      const { diagnostics, graph } = reported('@graph {"id":"g","id":"h"}\nservice "A"');
      expect(diagnostics).toEqual([
        at('coral.json.key.duplicate', 1, '"id"'),
        at('coral.json.key.duplicate', 1, '"id"'),
      ]);
      expect(graph.id).toBe('g');
    });

    it('reports a repeated node data key', () => {
      const { diagnostics, graph } = reported('service "A" as a data {"symbol":"x","symbol":"y"}');
      expect(diagnostics).toEqual([
        at('coral.json.key.duplicate', 1, '"symbol"'),
        at('coral.json.key.duplicate', 1, '"symbol"'),
      ]);
      expect(graph.nodes[0].symbol).toBe('x');
    });

    it('reports a repeated nested key at every level', () => {
      const source = 'service "A" as a data {"ports":[{"id":"p","side":"EAST","properties":{"x":1,"x":2}}]}';
      const { diagnostics, graph } = reported(source);
      expect(diagnostics).toEqual([
        at('coral.json.key.duplicate', 1, '"x"'),
        at('coral.json.key.duplicate', 1, '"x"'),
      ]);
      expect(graph.nodes[0].ports?.[0].properties).toEqual({ x: 1 });
    });

    it('reports a repeated edge data key', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b data {"sourcePort":"p","sourcePort":"q"}`);
      expect(diagnostics).toEqual([
        at('coral.json.key.duplicate', 3, '"sourcePort"'),
        at('coral.json.key.duplicate', 3, '"sourcePort"'),
      ]);
      expect(graph.edges[0].sourcePort).toBe('p');
    });

    it('reports a repeated key in a JSON body value', () => {
      const { diagnostics, graph } = reported('service "A" as a {\n  k: {"n":1,"n":2}\n}');
      expect(diagnostics).toEqual([
        at('coral.json.key.duplicate', 2, '"n"'),
        at('coral.json.key.duplicate', 2, '"n"'),
      ]);
      expect(graph.nodes[0].properties).toEqual({ k: { n: 1 } });
    });
  });

  describe('D16: a repeated body property', () => {
    it('reports both keys and keeps the first', () => {
      const { diagnostics, graph } = reported('service "A" as a {\n  k: 1\n  "k": 2\n}');
      expect(diagnostics).toEqual([
        at('coral.node.field.duplicate', 2, 'k'),
        at('coral.node.field.duplicate', 3, '"k"'),
      ]);
      expect(graph.nodes[0].properties).toEqual({ k: 1 });
    });
  });

  describe('D22: a repeated constraint parameter', () => {
    it('reports a repeated gap', () => {
      const { diagnostics, graph } = reported(`${NODES}constraint c: a above b [gap: 8, gap: 12]`);
      expect(diagnostics).toEqual([
        at('coral.constraint.field.duplicate', 3, 'gap'),
        at('coral.constraint.field.duplicate', 3, 'gap'),
      ]);
      expect(graph.constraints?.[0]).toMatchObject({ id: 'c', gap: 8 });
    });

    it('reports two strength flags', () => {
      const { diagnostics, graph } = reported(`${NODES}constraint c: a above b [required, preferred]`);
      expect(diagnostics).toEqual([
        at('coral.constraint.field.duplicate', 3, 'required'),
        at('coral.constraint.field.duplicate', 3, 'preferred'),
      ]);
      expect(graph.constraints?.[0]).toMatchObject({ id: 'c', strength: 'required' });
    });

    it('reports repeated inset, alignment, and direction', () => {
      const source = `${NODES}constraint i: a at the top [inset: 1, inset: 2]\n` +
        'constraint r: arrange a, b as row [alignment: start, alignment: end, direction: reverse, direction: forward]';
      const { diagnostics, graph } = reported(source);
      expect(diagnostics.map(({ code, line, text }) => [code, line, text])).toEqual([
        ['coral.constraint.field.duplicate', 3, 'inset'],
        ['coral.constraint.field.duplicate', 3, 'inset'],
        ['coral.constraint.field.duplicate', 4, 'alignment'],
        ['coral.constraint.field.duplicate', 4, 'alignment'],
        ['coral.constraint.field.duplicate', 4, 'direction'],
        ['coral.constraint.field.duplicate', 4, 'direction'],
      ]);
      expect(graph.constraints).toMatchObject([
        { id: 'i', inset: 1 },
        { id: 'r', alignment: 'start', direction: 'reverse' },
      ]);
    });
  });

  describe('D23: require with a strength flag', () => {
    it('reports the prefix and the flag and keeps the prefix', () => {
      const { diagnostics, graph } = reported(`${NODES}require a above b [preferred]`);
      expect(diagnostics).toEqual([
        at('coral.constraint.field.duplicate', 3, 'require'),
        at('coral.constraint.field.duplicate', 3, 'preferred'),
      ]);
      expect(graph.constraints?.[0].strength).toBe('required');
    });

    it('covers require arrange', () => {
      const { diagnostics, graph } = reported(`${NODES}require arrange a, b as row [required]`);
      expect(diagnostics).toEqual([
        at('coral.constraint.field.duplicate', 3, 'require'),
        at('coral.constraint.field.duplicate', 3, 'required'),
      ]);
      expect(graph.constraints?.[0].strength).toBe('required');
    });

    it('accepts require with value parameters', () => {
      const { diagnostics, graph } = reported(`${NODES}require a above b [gap: 8]`);
      expect(diagnostics).toEqual([]);
      expect(graph.constraints?.[0]).toMatchObject({ strength: 'required', gap: 8 });
    });
  });
});

describe('Slice 53 rejected spellings', () => {
  describe('D26: explicit identity (D-1)', () => {
    it('rejects a node id already held by an earlier explicit or derived id', () => {
      const { diagnostics, graph } = reported('service "A" as a\nservice "B" as a\nservice "B2"\nservice "Other" as b2');
      expect(diagnostics).toEqual([
        at('coral.node.id.invalid', 2, 'a'),
        at('coral.node.id.invalid', 4, 'b2'),
      ]);
      expect(graph.nodes.map(({ id }) => id)).toEqual(['a', 'b', 'b2', 'other']);
      expect(parse('service "A" as a\nservice "B" as a').diagnostics[0].message).toContain('line 1');
    });

    it('rejects an empty node id', () => {
      const { diagnostics, graph } = reported('service "A" as ""');
      expect(diagnostics).toEqual([at('coral.node.id.invalid', 1, '""')]);
      expect(graph.nodes[0].id).toBe('a');
    });

    it('rejects a duplicate or empty edge id', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b as e\na -> b as e\na -> b as ""`);
      expect(diagnostics).toEqual([
        at('coral.edge.id.invalid', 4, 'e'),
        at('coral.edge.id.invalid', 5, '""'),
      ]);
      expect(graph.edges.map(({ id }) => id)).toEqual(['e', 'a_to_b', 'a_to_b_2']);
    });
  });

  describe('D27: no silent drop (D-2)', () => {
    it.each([
      ['@graph {"id":"g","extra":1}', 'coral.graph.data-field.unsupported', 1, '"extra"'],
      ['@graph {"id":"g","name":1}', 'coral.graph.data-field.invalid', 1, '"name"'],
      ['@graph {"id":"g","metadata":{"tags":"x"}}', 'coral.graph.data-field.invalid', 1, '"metadata"'],
      ['@graph {"id":"g","layoutOptions":{"direction":"SIDEWAYS"}}', 'coral.graph.data-field.invalid', 1, '"layoutOptions"'],
      ['service "A" data {"label":"x"}', 'coral.node.data-field.unsupported', 1, '"label"'],
      ['service "A" data {"unknown":1}', 'coral.node.data-field.unsupported', 1, '"unknown"'],
      ['service "A" data {"dimensions":{"width":-1,"height":1}}', 'coral.node.data-field.invalid', 1, '"dimensions"'],
      ['service "A" data {"symbol":1}', 'coral.node.data-field.invalid', 1, '"symbol"'],
      [`${NODES}a -> b data {"label":"y"}`, 'coral.edge.data-field.unsupported', 3, '"label"'],
      [`${NODES}a -> b data {"sourcePort":1}`, 'coral.edge.data-field.invalid', 3, '"sourcePort"'],
      [`${NODES}a -> b data {"style":"dashed"}`, 'coral.edge.data-field.invalid', 3, '"style"'],
      [`${NODES}a -> b data {"style":{"lineStyle":"dotted"}}`, 'coral.edge.data-field.unsupported', 3, '"lineStyle"'],
      [`${NODES}a -> b data {"style":{"routing":"curvy"}}`, 'coral.edge.data-field.invalid', 3, '"routing"'],
      [`${NODES}a -> b data {"style":{"color":"red"}}`, 'coral.edge.data-field.unsupported', 3, '"color"'],
      [`${NODES}a -> b data {"properties":[1]}`, 'coral.edge.data-field.invalid', 3, '"properties"'],
    ])('%s reports %s', (source, code, line, text) => {
      const { diagnostics } = reported(source);
      expect(diagnostics).toEqual([at(code, line, text)]);
    });

    it('names the readable spelling for a readable field in data', () => {
      const edge = parse(`${NODES}a -> b data {"style":{"lineStyle":"dotted"}}`).diagnostics[0];
      expect(edge.message).toContain('[dotted]');
      const node = parse('service "A" data {"position":{"x":1,"y":2}}').diagnostics[0];
      expect(node.message).toContain('@ (x, y)');
    });

    it('stores nothing for a rejected data key', () => {
      const { graph } = reported(`${NODES}a -> b data {"label":"y","sourcePort":1}`);
      expect(graph.edges[0].label).toBeUndefined();
      expect(graph.edges[0].sourcePort).toBeUndefined();
    });
  });

  describe('D-4: non-canonical spellings', () => {
    it('D8s: rejects a scalar in edge data.properties, naming the attribute', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [k: 1] data {"properties":{"k":2}}`);
      expect(diagnostics).toEqual([at('coral.edge.data-field.unsupported', 3, '"k"')]);
      expect(parse(`${NODES}a -> b data {"properties":{"k":2}}`).diagnostics[0].message).toContain('[k: 2]');
      expect(graph.edges[0].properties).toEqual({ k: 1 });
    });

    it('keeps label and description scalars and non-scalars in data.properties', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b data {"properties":{"label":"x","description":"y","list":[1]}}`);
      expect(diagnostics).toEqual([]);
      expect(graph.edges[0].properties).toEqual({ label: 'x', description: 'y', list: [1] });
    });

    it('D25: rejects a strength flag on an arrange line', () => {
      const { diagnostics, graph } = reported(`${NODES}arrange a, b as row [required]`);
      expect(diagnostics).toEqual([at('coral.constraint.parameter.invalid', 3, 'required')]);
      expect(parse(`${NODES}arrange a, b as row [required]`).diagnostics[0].message).toContain('require arrange');
      expect(graph.constraints?.[0].strength).toBe('preferred');
    });

    it('keeps one strength flag on a constraint id: line', () => {
      const { diagnostics, graph } = reported(`${NODES}constraint c: arrange a, b as row [preferred]`);
      expect(diagnostics).toEqual([]);
      expect(graph.constraints?.[0].strength).toBe('preferred');
    });
  });

  describe('D28: attribute values (m-6, R2-5)', () => {
    it.each([
      ['[k: hello]', 'hello'],
      ['[k: hello world]', 'hello world'],
      ['[has many]', 'has many'],
    ])('%s is coral.attribute.value.unparsed', (attributes, text) => {
      const { diagnostics, graph } = reported(`${NODES}a -> b ${attributes}`);
      expect(diagnostics).toEqual([at('coral.attribute.value.unparsed', 3, text)]);
      expect(graph.edges[0].properties).toBeUndefined();
      expect(graph.edges[0].type).toBeUndefined();
    });

    it('accepts quoted strings, numbers, booleans, null, and identifier relation tokens', () => {
      const { diagnostics } = reported(`${NODES}a -> b [event, "multi word", k: "v", n: -1.5e2, t: true, f: false, z: null]`);
      expect(diagnostics.map(({ code }) => code)).toEqual(['coral.attribute.relation.invalid']);
    });
  });

  describe('R3-4: constraint keywords are bare', () => {
    it('rejects a quoted alignment or direction keyword', () => {
      const source = `${NODES}constraint c: a above b [alignment: "start"]\nconstraint d: arrange a, b as row [direction: "reverse"]`;
      const result = parse(source);
      expect(result.diagnostics.map(({ code, line }) => [code, line])).toEqual([
        ['coral.constraint.parameter.invalid', 3],
        ['coral.constraint.parameter.invalid', 4],
      ]);
      expect(result.diagnostics[0].message).toContain('alignment: start');
      expect(result.diagnostics[1].message).toContain('direction: reverse');
    });

    it('accepts bare keywords', () => {
      const { diagnostics, graph } = reported(`${NODES}constraint c: arrange a, b as row [alignment: start, direction: reverse]`);
      expect(diagnostics).toEqual([]);
      expect(graph.constraints?.[0]).toMatchObject({ alignment: 'start', direction: 'reverse' });
    });
  });

  describe('rule 5: reserved underscore keys', () => {
    it('rejects a reserved body key and creates no properties', () => {
      const { diagnostics, graph } = reported('service "A" as a {\n  _k: 1\n}');
      expect(diagnostics).toEqual([at('coral.node.reserved-key.invalid', 2, '_k')]);
      expect(graph.nodes[0].properties).toBeUndefined();
    });

    it('rejects a reserved edge attribute and data.properties key', () => {
      const { diagnostics, graph } = reported(`${NODES}a -> b [_k: 1] data {"properties":{"_j":[1]}}`);
      expect(diagnostics).toEqual([
        at('coral.edge.reserved-key.invalid', 3, '_k'),
        at('coral.edge.reserved-key.invalid', 3, '"_j"'),
      ]);
      expect(graph.edges[0].properties).toBeUndefined();
    });
  });

  it('the parser reports no warning or information diagnostic for these inputs', () => {
    const result = parse(`${NODES}a -> b [_k: 1] data {"label":"x"}\nservice "C" {\n  _p: 1\n}`);
    expect(result.diagnostics.every(({ severity }) => severity === 'error')).toBe(true);
  });

  describe('constraint parameter errors are ranged on the parameter token', () => {
    /** The code, 0-based start column, and ranged text of each parameter error on line 3. */
    function parameterErrors(line: string): Array<{ column: number | undefined; text: string | undefined }> {
      const result = parse(`${NODES}${line}`);
      return result.diagnostics
        .filter(({ code }) => code === 'coral.constraint.parameter.invalid')
        .map(({ range }) => ({
          column: range?.start.column,
          text: range ? line.slice(range.start.column, range.end.column) : undefined,
        }));
    }

    it('ranges an invalid gap value on its own key, not an earlier repeat', () => {
      expect(parameterErrors('require a above b [gap: 8, gap: "x"]')).toEqual([{ column: 27, text: 'gap' }]);
    });

    it('ranges an invalid gap value on the parameter key, not a constraint id that shares its text', () => {
      expect(parameterErrors('constraint gap: a above b [gap: "x"]')).toEqual([{ column: 27, text: 'gap' }]);
    });

    it('ranges an invalid alignment value on the parameter key', () => {
      expect(parameterErrors('constraint alignment: a above b [alignment: sideways]'))
        .toEqual([{ column: 33, text: 'alignment' }]);
    });

    it('ranges an unrecognized parameter on its key', () => {
      expect(parameterErrors('constraint foo: a above b [foo: 1]')).toEqual([{ column: 27, text: 'foo' }]);
    });

    it('ranges an unrecognized flag on its token', () => {
      expect(parameterErrors('constraint a: a above b [a]')).toEqual([{ column: 25, text: 'a' }]);
    });

    it('ranges an inapplicable parameter on its key', () => {
      expect(parameterErrors('constraint gap: a at the top [gap: 8]')).toEqual([{ column: 30, text: 'gap' }]);
    });
  });

  describe('edge attribute order: the relation token leads', () => {
    it('rejects a relation token after a line style, naming the canonical order', () => {
      const result = parse(`${NODES}a -> b [dashed, event]`);
      expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The relation token event must come before the line style; write [event, dashed]',
      }]);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.range?.start).toMatchObject({ line: 3, column: 16 });
      expect(result.graph!.edges[0].type).toBeUndefined();
      expect(result.graph!.edges[0].style).toEqual({ lineStyle: 'dashed' });
    });

    it('rejects a quoted relation token after a line style', () => {
      const result = parse(`${NODES}a -> b [dotted, "event"]`);
      expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The relation token "event" must come before the line style; write ["event", dotted]',
      }]);
    });

    it('accepts the canonical order', () => {
      const result = parse(`${NODES}a -> b [event, dashed, label: "x"]`);
      expect(result.diagnostics).toEqual([]);
      expect(result.graph!.edges[0]).toMatchObject({ type: 'event', style: { lineStyle: 'dashed' }, label: 'x' });
    });

    it('rejects a line style after a named attribute, naming the canonical order', () => {
      const result = parse(`${NODES}a -> b [label: "x", dashed]`);
      expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The line style dashed must come before the named attributes; write [dashed, label: "x"]',
      }]);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.range?.start).toMatchObject({ line: 3, column: 20 });
      expect(diagnostic.range?.end).toMatchObject({ line: 3, column: 26 });
      expect(result.graph!.edges[0].style).toBeUndefined();
      expect(result.graph!.edges[0].label).toBe('x');
    });

    it('rejects a relation token after a named attribute, naming the canonical order', () => {
      const result = parse(`${NODES}a -> b [label: "x", event]`);
      expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The relation token event must come before the named attributes; write [event, label: "x"]',
      }]);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.range?.start).toMatchObject({ line: 3, column: 20 });
      expect(diagnostic.range?.end).toMatchObject({ line: 3, column: 25 });
      expect(result.graph!.edges[0].type).toBeUndefined();
      expect(result.graph!.edges[0].label).toBe('x');
    });

    const orderErrors = (attributes: string) => parse(`${NODES}a -> b ${attributes}`).diagnostics
      .map(({ code, message, range }) => ({ code, message, column: range?.start.column }));

    it('names the full canonical list, keeping a leading relation token', () => {
      expect(orderErrors('[event, label: "x", dashed]')).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The line style dashed must come before the named attributes; write [event, dashed, label: "x"]',
        column: 27,
      }]);
    });

    it('names the full canonical list, keeping every named attribute in source order', () => {
      expect(orderErrors('[label: "x", dashed, color: "red"]')).toEqual([{
        code: 'coral.attribute.relation.invalid',
        message: 'The line style dashed must come before the named attributes; write [dashed, label: "x", color: "red"]',
        column: 20,
      }]);
    });

    it('reports each misplaced token once, each naming the same canonical list', () => {
      expect(orderErrors('[label: "x", dashed, event]')).toEqual([
        {
          code: 'coral.attribute.relation.invalid',
          message: 'The line style dashed must come before the named attributes; write [event, dashed, label: "x"]',
          column: 20,
        },
        {
          code: 'coral.attribute.relation.invalid',
          message: 'The relation token event must come before the named attributes; write [event, dashed, label: "x"]',
          column: 28,
        },
      ]);
    });

    it('rewrites a relation, line style, and named attributes with their raw values', () => {
      expect(orderErrors('[writes, label: "Persists", dashed, weight: 3]').map(({ message }) => message)).toEqual([
        'The line style dashed must come before the named attributes; write [writes, dashed, label: "Persists", weight: 3]',
      ]);
      expect(orderErrors('[label: "a, [b]", dashed]').map(({ message }) => message)).toEqual([
        'The line style dashed must come before the named attributes; write [dashed, label: "a, [b]"]',
      ]);
    });

    it('names the full list for a relation token after a line style', () => {
      expect(orderErrors('[dashed, event, label: "x"]').map(({ message }) => message)).toEqual([
        'The relation token event must come before the line style; write [event, dashed, label: "x"]',
      ]);
    });

    it('treats a removed = attribute as named, so a later line style is still misplaced', () => {
      expect(orderErrors('[label = "x", dashed]').map(({ code }) => code)).toEqual([
        'coral.attribute.equals.unsupported',
        'coral.attribute.relation.invalid',
      ]);
    });
  });
});
