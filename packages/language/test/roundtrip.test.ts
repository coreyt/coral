import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print } from '../src/printer/index.js';
import type { GraphIR } from '../src/types.js';

/**
 * Tests for round-trip fidelity - R-009.
 */

function graph(nodes: unknown[], edges: unknown[] = []): GraphIR {
  const present = new Set(nodes.map((node) => (node as { id?: string }).id));
  const endpointNodes = [...new Set(edges.flatMap((edge) => {
    const value = edge as { source: string; target: string };
    return [value.source, value.target];
  }))].filter((id) => !present.has(id)).map((id) => ({ id, type: 'service' }));
  return { version: '3.0.0', id: 'g', nodes: [...nodes, ...endpointNodes], edges } as unknown as GraphIR;
}

/** print -> parse -> print, the loop the editor runs constantly. */
function loop(g: GraphIR): { text: string; again: string; reparsed: GraphIR } {
  const text = print(g);
  const first = parse(text);
  expect(first.success).toBe(true);
  const again = print(first.graph!);
  return { text, again, reparsed: first.graph! };
}

describe('R-009: round-trip fidelity', () => {
  describe('AC-1: labels survive any number of round-trips', () => {
    const labels = [
      ['a double quote', 'say "hi"'],
      ['a backslash', 'C:\\path'],
      ['a newline', 'Line1\nLine2'],
      ['a carriage return', 'Line1\r\nLine2'],
      ['a tab', 'Col1\tCol2'],
      ['all of them', 'a"b\\c\nd\te'],
    ];

    it.each(labels)('round-trips a label containing %s', (_name, label) => {
      let g = graph([{ id: 'n', type: 'service', label }]);

      for (let i = 0; i < 3; i++) {
        const result = parse(print(g));
        expect(result.success).toBe(true);
        expect(result.graph!.nodes[0].label).toBe(label);
        g = result.graph!;
      }
    });
  });

  describe('AC-2: an empty label is distinct from an absent one', () => {
    it('round-trips an empty label as an empty label', () => {
      const { reparsed } = loop(graph([{ id: 'x', type: 'service', label: '' }]));
      expect(reparsed.nodes[0].label).toBe('');
    });

    it('keeps the label absent while preserving the id', () => {
      const { reparsed } = loop(graph([{ id: 'db_main', type: 'database' }]));
      expect(reparsed.nodes[0].label).toBeUndefined();
    });
  });

  describe('AC-3: scalar properties round-trip with their types', () => {
    it('round-trips node properties including exponent-form numbers', () => {
      const props = { port: 8080, enabled: true, disabled: false, ratio: 1e-7, big: 1e21, name: 'x' };
      const { reparsed } = loop(graph([{ id: 'a', type: 'service', label: 'A', properties: props }]));

      expect(reparsed.nodes[0].properties).toEqual(props);
    });

    it('round-trips edge properties with their types', () => {
      const props = { weight: 3, critical: true, ratio: 1e-7 };
      const { reparsed } = loop(
        graph([], [{ id: 'e', source: 'a', target: 'b', properties: props }])
      );

      expect(reparsed.edges[0].properties).toEqual(props);
    });

    it('does not emit a non-finite number', () => {
      const text = print(graph([{ id: 'a', type: 'service', label: 'A', properties: { r: Infinity } }]));
      expect(text).not.toContain('Infinity');
      expect(parse(text).success).toBe(true);
    });
  });

  describe('AC-4: quoted values may contain commas', () => {
    it('keeps a comma inside an edge label', () => {
      const { reparsed } = loop(graph([], [{ id: 'e', source: 'a', target: 'b', label: 'a, b' }]));
      expect(reparsed.edges[0].label).toBe('a, b');
    });

    it('keeps a comma alongside other attributes', () => {
      const { reparsed } = loop(
        graph([], [{ id: 'e', source: 'a', target: 'b', type: 'http', label: 'x, y', properties: { w: 2 } }])
      );

      expect(reparsed.edges[0].label).toBe('x, y');
      expect(reparsed.edges[0].type).toBe('http');
      expect(reparsed.edges[0].properties).toEqual({ w: 2 });
    });
  });

  describe('AC-5: quoted values may contain brackets', () => {
    it('keeps a bracket inside an edge label', () => {
      const { reparsed } = loop(graph([], [{ id: 'e', source: 'a', target: 'b', label: 'x]y' }]));
      expect(reparsed.edges[0].label).toBe('x]y');
    });

    it('does not misread a relation type that looks like a line style', () => {
      const { reparsed } = loop(
        graph([], [{ id: 'e', source: 'a', target: 'b', type: 'dashed', style: { lineStyle: 'dotted' } }])
      );

      expect(reparsed.edges[0].type).toBe('dashed');
      expect(reparsed.edges[0].style?.lineStyle).toBe('dotted');
    });
  });

  describe('AC-6: line style round-trips', () => {
    it.each([['solid'], ['dashed'], ['dotted']])('round-trips %s', (lineStyle) => {
      const { reparsed } = loop(
        graph([], [{ id: 'e', source: 'a', target: 'b', style: { lineStyle } }])
      );

      expect(reparsed.edges[0].style?.lineStyle).toBe(lineStyle);
    });
  });

  describe('AC-7: property keys round-trip or are reported', () => {
    it('round-trips a key outside the bare identifier charset', () => {
      const { reparsed } = loop(
        graph([{ id: 'a', type: 'service', label: 'A', properties: { 'content-type': 'json' } }])
      );

      expect(reparsed.nodes[0].properties).toEqual({ 'content-type': 'json' });
    });

    it('rejects a reserved underscore key in source and stores the rest (R-063 AC-5)', () => {
      const result = parse('service "A" {\n  _internal: "x"\n  keep: "y"\n}');

      expect(result.success).toBe(false);
      expect(result.graph!.nodes[0].properties).toEqual({ keep: 'y' });
      expect(result.diagnostics!.map((d) => [d.severity, d.code])).toEqual([['error', 'coral.node.reserved-key.invalid']]);
    });

    it('omits a reserved underscore key from edges too', () => {
      const text = print(graph([], [{ id: 'e', source: 'a', target: 'b', properties: { _x: 'v', keep: 'y' } }]));

      expect(text).not.toContain('_x');
      expect(text).toContain('keep');
    });
  });

  describe('AC-8: a failed parse still returns what parsed', () => {
    it('keeps the nodes from every other line', () => {
      const result = parse('service "A"\n!!!not coral!!!\nservice "B"');

      expect(result.success).toBe(false);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.map((n) => n.id)).toEqual(['a', 'b']);
      expect(result.errors[0].line).toBe(2);
    });
  });

  describe('AC-9: printing reaches a fixpoint', () => {
    const sources = [
      'service "Web App"',
      'service "Web App"\ndatabase "Orders DB"\n\nweb_app -> orders_db [uses]',
      'group "Platform" {\n  region: "us-east-1"\n  service "Auth"\n}',
      'service "say \\"hi\\""',
      'service "A"\nservice "A"\nservice "A 2"',
      'service as a\nservice as b\na -> b [http, dashed, label: "x, y", weight: 3]',
    ];

    it.each(sources)('is stable from the second application: %j', (source) => {
      const first = parse(source);
      expect(first.success).toBe(true);

      const t = print(first.graph!);
      const second = parse(t);
      expect(second.success).toBe(true);
      expect(print(second.graph!)).toBe(t);
    });
  });

  describe('AC-10: one printer emits the DSL', () => {
    it('emits edge attributes with the colon spelling', () => {
      const text = print(
        graph([], [{ id: 'e', source: 'a', target: 'b', type: 'http', label: 'x', properties: { w: 2 } }])
      );

      expect(text).toContain('label: "x"');
      expect(text).toContain('w: 2');
      expect(text).not.toContain('= ');
    });

    it('rejects the removed equals spelling on input (R-063 AC-5)', () => {
      const result = parse('service as a\nservice as b\na -> b [label = "x", w = 2]');

      expect(result.success).toBe(false);
      expect(result.errors.map((error) => (error as { code?: string }).code))
        .toEqual(['coral.attribute.equals.unsupported', 'coral.attribute.equals.unsupported']);
      expect(result.graph!.edges[0].label).toBeUndefined();
      expect(result.graph!.edges[0].properties).toBeUndefined();
    });
  });
});
