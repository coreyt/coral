import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';
import { parseDot } from '../src/formats/dot.js';
import type { GraphIR, GraphNode } from '../src/types.js';

/**
 * Tests for node and edge identity - R-010.
 */

function graph(nodes: Partial<GraphNode>[], edges: Record<string, unknown>[] = []): GraphIR {
  return { version: '3.0.0', id: 'g', nodes, edges } as unknown as GraphIR;
}

/** Every node id, across all nesting levels. */
function allIds(g: GraphIR): string[] {
  const out: string[] = [];
  const walk = (ns: GraphNode[]) => {
    for (const n of ns) {
      out.push(n.id);
      if (n.children) walk(n.children);
    }
  };
  walk(g.nodes);
  return out;
}

describe('R-010: node and edge identity', () => {
  describe('AC-1: node identity survives a round-trip', () => {
    it('given ids not derived from labels when printed and re-parsed then ids and endpoints survive', () => {
      const g = graph(
        [
          { id: 'n1', type: 'service', label: 'Web' },
          { id: 'n2', type: 'database', label: 'DB' },
        ],
        [{ id: 'e1', source: 'n1', target: 'n2' }]
      );

      const reparsed = parse(print(g)).graph!;

      expect(allIds(reparsed).sort()).toEqual(['n1', 'n2']);
      expect(reparsed.edges[0].source).toBe('n1');
      expect(reparsed.edges[0].target).toBe('n2');
    });

    it('survives the rename that breaks edges today', () => {
      // setFromVisual keeps node.id and takes the new label from the canvas.
      const g = graph(
        [
          { id: 'web_app', type: 'service', label: 'Renamed Gateway' },
          { id: 'db', type: 'database', label: 'DB' },
        ],
        [{ id: 'e1', source: 'web_app', target: 'db' }]
      );

      const reparsed = parse(print(g)).graph!;
      const ids = allIds(reparsed);

      expect(ids).toContain('web_app');
      expect(reparsed.edges[0].source).toBe('web_app');
      expect(reparsed.edges[0].target).toBe('db');
    });
  });

  describe('AC-2: ids of any shape are expressible', () => {
    it('given a DOT id containing whitespace when converted to Coral then it round-trips', () => {
      const dot = parseDot('digraph G { "my node" -> "other-node"; }');
      expect(dot.graph).toBeDefined();

      const text = print(dot.graph!);
      const reparsed = parse(text);

      expect(reparsed.success).toBe(true);
      expect(allIds(reparsed.graph!)).toEqual(expect.arrayContaining(['my node', 'other-node']));
      expect(reparsed.graph!.edges[0].source).toBe('my node');
      expect(reparsed.graph!.edges[0].target).toBe('other-node');
    });

    it('replaces an empty id and rewrites the edges that referenced it', () => {
      const g = graph(
        [
          { id: '', type: 'service', label: 'Anon' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        [{ id: 'e1', source: '', target: 'b' }]
      );

      const { text, diagnostics } = printWithDiagnostics(g);
      const reparsed = parse(text);

      expect(reparsed.success).toBe(true);
      expect(allIds(reparsed.graph!)).not.toContain('');
      expect(reparsed.graph!.edges[0].source).not.toBe('');
      expect(reparsed.graph!.edges[0].source).toBe(allIds(reparsed.graph!)[0]);
      expect(diagnostics.some((d) => d.code === 'coral.node.id.degraded')).toBe(true);
    });
  });

  describe('AC-3: already-derived documents need no id clause', () => {
    it('given ids allocated by parse when printed then no as clause appears', () => {
      const source = 'service "Web App"\ndatabase "Orders DB"\n\nweb_app -> orders_db [uses]';
      const g = parse(source).graph!;

      const printed = print(g);

      expect(printed).not.toContain(' as ');
      expect(print(parse(printed).graph!)).toBe(printed);
    });

    it('does not annotate the second of two nodes sharing a base id', () => {
      // Both ids are legitimately derived: web_app and web_app_2.
      const g = parse('service "Web App"\nservice "Web App"').graph!;

      expect(allIds(g)).toEqual(['web_app', 'web_app_2']);
      expect(print(g)).not.toContain(' as ');
    });

    it('emits one clause, not three, when only the first node needs it', () => {
      // Marking the first explicit frees `a` for the second; a batched pass
      // would wrongly annotate all three.
      const g = graph([
        { id: 'a_3', type: 'service', label: 'A' },
        { id: 'a', type: 'service', label: 'A' },
        { id: 'a_2', type: 'service', label: 'A' },
      ]);

      const printed = print(g);

      expect(printed.match(/ as /g) ?? []).toHaveLength(1);
      expect(allIds(parse(printed).graph!)).toEqual(['a_3', 'a', 'a_2']);
    });

    it('keeps an unlabelled node free of a spurious clause', () => {
      const g = graph([{ id: 'db_main', type: 'database' }]);

      const printed = print(g);

      expect(printed).toBe('@graph {"id":"g"}\n\ndatabase as db_main');
      expect(print(parse(printed).graph!)).toBe(printed);
    });

    it('de-duplicates ids handed to print, keeping the first and reporting the rest', () => {
      const g = graph(
        [
          { id: 'x', type: 'service', label: 'One' },
          { id: 'x', type: 'service', label: 'Two' },
          { id: 'y', type: 'service', label: 'Three' },
        ],
        // The edge points at the first node holding `x`, and must still.
        [{ id: 'e1', source: 'x', target: 'y' }]
      );

      const { text, diagnostics } = printWithDiagnostics(g);
      const reparsed = parse(text).graph!;
      const ids = allIds(reparsed);

      expect(new Set(ids).size).toBe(3);
      // The first occurrence keeps the id; only the later one is renamed.
      expect(ids[0]).toBe('x');
      expect(ids[1]).not.toBe('x');
      // R-010 AC-3: edges referencing the shared id resolve to the first node.
      expect(reparsed.edges[0].source).toBe('x');
      expect(reparsed.edges[0].target).toBe('y');
      expect(diagnostics.some((d) => d.code === 'coral.node.id.degraded')).toBe(true);
      expect(print(reparsed)).toBe(text);
    });
  });

  describe('AC-4: generated ids are unique and non-empty', () => {
    const cases: Array<[string, string]> = [
      ['colliding labels', 'service "Web App"\nservice "Web App"\nservice "Web App 2"'],
      ['labels deriving an empty id', 'service "###"\nservice "@@@"'],
      ['explicit mixed with derived', 'service "Alpha" as web_app\nservice "Web App"'],
      ['explicit colliding with an earlier derived', 'service "Web App"\nservice "Beta" as web_app'],
      ['nested children sharing a base', 'group "Platform" {\n  service "Auth"\n  service "Auth"\n}'],
    ];

    it.each(cases)('gives every node a distinct non-empty id: %s', (_name, source) => {
      const result = parse(source);
      const ids = allIds(result.graph!);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('');
    });

    it('gives every edge a distinct id', () => {
      const result = parse('a -> b\na -> b\na -> b_2');
      const ids = result.graph!.edges.map((e) => e.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('rejects an explicit id that is already held (R-063 AC-5)', () => {
      const result = parse('service "Web App"\nservice "Beta" as web_app');

      expect(result.success).toBe(false);
      expect(result.errors.map((d) => [d.code, (d as { line: number }).line])).toEqual([['coral.node.id.invalid', 2]]);
    });
  });

  describe('AC-5: the clause has a fixed position', () => {
    it('parses the id clause between the label and the body', () => {
      const result = parse('group "Platform" as plat {\n  region: "us-east-1"\n}');

      expect(result.success).toBe(true);
      expect(result.graph!.nodes[0].id).toBe('plat');
      expect(result.graph!.nodes[0].properties).toMatchObject({ region: 'us-east-1' });
    });

    it('accepts a quoted id in the clause and at both edge endpoints', () => {
      const result = parse('service "A" as "my node"\nservice "B" as b\n\n"my node" -> b');

      expect(result.success).toBe(true);
      expect(allIds(result.graph!)).toEqual(['my node', 'b']);
      expect(result.graph!.edges[0].source).toBe('my node');
      expect(result.graph!.edges[0].target).toBe('b');
    });
  });
});
