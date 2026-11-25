import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../src/parser/index.js';
import { print } from '../src/printer/index.js';
import { parseMermaid } from '../src/formats/mermaid.js';
import { parseDot } from '../src/formats/dot.js';
import type { GraphIR, GraphNode } from '../src/types.js';

/**
 * The round-trip corpus - R-009 AC-11.
 *
 * One source per defect in R-009 and R-010, plus the printed output of the
 * Mermaid and DOT importers. R-009 AC-9 (fixpoint) and R-010 AC-1 (identity)
 * and AC-4 (uniqueness) are asserted over every member.
 */

const DIR = join(import.meta.dirname, 'fixtures', 'roundtrip');

const fileCases: Array<[string, string]> = readdirSync(DIR)
  .filter((f) => f.endsWith('.coral'))
  .sort()
  .map((f) => [f, readFileSync(join(DIR, f), 'utf8')]);

/** Printed output of the importers, so their graphs are held to the same bar. */
const importedCases: Array<[string, string]> = [
  ['mermaid-flowchart', print(parseMermaid('graph TD\n  A[API Gateway] --> B[(Orders)]\n  B -.-> C{Check}').graph!)],
  ['dot-quoted-ids', print(parseDot('digraph G { "my node" -> "other-node"; a -> b [label="x, y"]; }').graph!)],
];

const cases = [...fileCases, ...importedCases];

function allNodes(g: GraphIR): GraphNode[] {
  const out: GraphNode[] = [];
  const walk = (ns: GraphNode[]) => {
    for (const n of ns) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(g.nodes);
  return out;
}

describe('round-trip corpus', () => {
  it('is not empty', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  describe.each(cases)('%s', (_name, source) => {
    it('parses', () => {
      expect(parse(source).success).toBe(true);
    });

    it('R-009 AC-9: reaches a fixpoint from the second application', () => {
      const first = parse(source);
      const text = print(first.graph!);
      const second = parse(text);

      expect(second.success).toBe(true);
      expect(print(second.graph!)).toBe(text);
    });

    it('R-010 AC-1: preserves node ids and edge endpoints', () => {
      const before = parse(source).graph!;
      const after = parse(print(before)).graph!;

      expect(allNodes(after).map((n) => n.id).sort()).toEqual(
        allNodes(before).map((n) => n.id).sort()
      );
      expect(after.edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual(
        before.edges.map((e) => `${e.source}->${e.target}`).sort()
      );
    });

    it('R-010 AC-4: gives every node and edge a distinct, non-empty id', () => {
      const g = parse(source).graph!;
      const nodeIds = allNodes(g).map((n) => n.id);
      const edgeIds = g.edges.map((e) => e.id);

      expect(new Set(nodeIds).size).toBe(nodeIds.length);
      expect(new Set(edgeIds).size).toBe(edgeIds.length);
      expect(nodeIds).not.toContain('');
      expect(edgeIds).not.toContain('');
    });
  });
});
