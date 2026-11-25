import { benchmarkEnvironment, assertPerformanceBudget, validatePerformanceSamples } from '../../../scripts/performance-policy.mjs';
import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print } from '../src/printer/index.js';

const benchmark = benchmarkEnvironment();
const budget = (name: string, value: number, limit: number) => assertPerformanceBudget({
  name, samples: [value], expectedSamples: 1, limit, comparison: 'lt' });

/**
 * Large-graph budgets for the language loop - R-026.
 *
 * The editor parses on every keystroke and prints on every visual edit, so
 * these two operations sit in the interaction path and are the ones a budget
 * can meaningfully protect.
 *
 * Budgets are deliberately generous relative to the measured numbers on a
 * development machine, because CI timing is noisy and a flaky budget gets
 * deleted rather than fixed. They exist to catch an order-of-magnitude
 * regression — an accidental quadratic in the id allocator, say — not to
 * measure milliseconds. Recorded numbers live in
 * docs/contribute/reference/performance-budgets.md.
 */

/** A connected graph of `n` nodes, in Coral source form. */
function sourceOf(n: number): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(`service "Node ${i}" @ (${i * 10}, ${(i % 20) * 40})`);
  }
  for (let i = 1; i < n; i++) {
    lines.push(`node_${i - 1} -> node_${i} [calls, label: "step ${i}"]`);
  }
  return lines.join('\n');
}

function millis(run: () => void): number {
  const start = performance.now();
  run();
  const elapsed = performance.now() - start;
  validatePerformanceSamples('operation', [elapsed], 1);
  return elapsed;
}

const BUDGETS: Array<{ nodes: number; parse: number; print: number }> = [
  { nodes: 100, parse: 100, print: 100 },
  { nodes: 500, parse: 400, print: 400 },
  { nodes: 2000, parse: 2000, print: 2000 },
];

describe.skipIf(!benchmark.measure)('R-026: language performance budgets', () => {
  it('groups many duplicate occurrences into one linear-size diagnostic', () => {
    const source = 'service "A" as a\na -> a [label: "first", ' + Array.from({ length: 20_000 }, () => 'label: "again"').join(', ') + ']';
    const elapsed = millis(() => {
      const result = parse(source);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].related).toHaveLength(20_000);
      expect(result.graph!.edges[0].label).toBe('first');
    });
    budget('operation duration', elapsed, 2000);
  });
  it('indexes normalized labels for many forward references', () => {
    const source = Array.from({ length: 5000 }, (_, i) => `"Node ${i}" (1) -> "Node ${(i + 1) % 5000}"`).join('\n') + '\n' +
      Array.from({ length: 5000 }, (_, i) => `service "Node ${i}" as id${i}`).join('\n');
    const elapsed = millis(() => {
      const result = parse(source);
      expect(result.success).toBe(true);
      expect(result.graph!.edges).toHaveLength(5000);
    });
    budget('operation duration', elapsed, 2000);
  });
  describe.each(BUDGETS)('a graph of $nodes nodes', ({ nodes, parse: parseBudget, print: printBudget }) => {
    const source = sourceOf(nodes);

    it(`parses within ${parseBudget}ms`, () => {
      // Warm the code paths so the first-call cost is not the measurement.
      parse(source);

      const elapsed = millis(() => {
        const result = parse(source);
        expect(result.success).toBe(true);
      });

      budget('operation duration', elapsed, parseBudget);
    });

    it(`prints within ${printBudget}ms`, () => {
      const graph = parse(source).graph!;
      print(graph);

      const elapsed = millis(() => print(graph));

      budget('operation duration', elapsed, printBudget);
    });
  });

  it('scales sub-quadratically in node count', () => {
    // The id allocator probes for a free id; a naive implementation degrades
    // badly on colliding labels. Ten times the nodes must not cost anywhere
    // near a hundred times the work.
    const small = sourceOf(200);
    const large = sourceOf(2000);
    parse(small);
    parse(large);

    const smallMs = Math.max(millis(() => parse(small)), 0.5);
    const largeMs = millis(() => parse(large));

    budget('parser growth ratio', largeMs / smallMs, 30);
  });

  it('does not degrade on labels that all derive the same id', () => {
    // Every label collides, so every allocation probes the taken set.
    const colliding = Array.from({ length: 1000 }, () => 'service "Same Name"').join('\n');
    parse(colliding);

    const elapsed = millis(() => {
      const result = parse(colliding);
      expect(result.graph!.nodes).toHaveLength(1000);
    });

    budget('operation duration', elapsed, 1500);
  });

  describe('R-063 AC-5: field occurrences scale linearly in keys per object', () => {
    // Every stored field is checked against the fields already stated on its
    // object, and every data key is positioned by its token. Both must be
    // indexed lookups: sixteen times the keys (2,500 to 40,000) must cost
    // about sixteen times the work, where a quadratic costs 256 times. The
    // fastest of five runs and a bound of 48 (3x linear, under a fifth of
    // quadratic) keep the check robust to CI noise and allocation overhead
    // (measured ratios run about 21 to 23) while still failing a quadratic.
    function fastest(run: () => void): number {
      run();
      const samples = Array.from({ length: 5 }, () => millis(run));
      return Math.max(Math.min(...samples), 0.5);
    }

    function ratio(sourceFor: (keys: number) => string): number {
      const small = sourceFor(2_500);
      const large = sourceFor(40_000);
      const check = (source: string) => () => {
        const result = parse(source);
        expect(result.success).toBe(true);
      };
      return fastest(check(large)) / fastest(check(small));
    }

    it('for properties in one node body', () => {
      const body = (keys: number) =>
        `service "A" as a {\n${Array.from({ length: keys }, (_, i) => `  k${i}: ${i}`).join('\n')}\n}`;
      budget('node property growth ratio', ratio(body), 48);
    }, 120_000);

    it('for keys in one edge data.properties object', () => {
      const data = (keys: number) =>
        `service "A" as a\nservice "B" as b\na -> b data {"properties":{${
          Array.from({ length: keys }, (_, i) => `"k${i}":[${i}]`).join(',')}}}`;
      budget('edge property growth ratio', ratio(data), 48);
    }, 120_000);
  });
});
