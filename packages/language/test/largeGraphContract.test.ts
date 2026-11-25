import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print } from '../src/printer/index.js';

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


describe('large language input contracts', () => {
  it('retains one duplicate diagnostic with every related occurrence and the first label', () => {
    const source = 'service "A" as a\na -> a [label: "first", ' +
      Array.from({ length: 20_000 }, () => 'label: "again"').join(', ') + ']';
    const result = parse(source);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].related).toHaveLength(20_000);
    expect(result.graph!.edges[0].label).toBe('first');
  });
  it('resolves 5000 normalized forward references', () => {
    const source = Array.from({ length: 5000 }, (_, i) => `"Node ${i}" (1) -> "Node ${(i + 1) % 5000}"`).join('\n') + '\n' +
      Array.from({ length: 5000 }, (_, i) => `service "Node ${i}" as id${i}`).join('\n');
    const result = parse(source);
    expect(result.success).toBe(true);
    expect(result.graph!.edges).toHaveLength(5000);
  });
  it.each([100, 200, 500, 2000])('parses and prints a %i-node graph', (nodes) => {
    const result = parse(sourceOf(nodes));
    expect(result.success).toBe(true);
    expect(result.graph!.nodes).toHaveLength(nodes);
    const printed = print(result.graph!);
    expect(printed.length).toBeGreaterThan(0);
    expect(parse(printed).success).toBe(true);
  });
  it('allocates all 1000 colliding labels', () => {
    const result = parse(Array.from({ length: 1000 }, () => 'service "Same Name"').join('\n'));
    expect(result.graph!.nodes).toHaveLength(1000);
  });
  it.each([2500, 40000])('accepts %i keys in node and edge property objects', (keys) => {
    const body = `service "A" as a {\n${Array.from({ length: keys }, (_, i) => `  k${i}: ${i}`).join('\n')}\n}`;
    const data = `service "A" as a\nservice "B" as b\na -> b data {"properties":{${
      Array.from({ length: keys }, (_, i) => `"k${i}":[${i}]`).join(',')}}}`;
    expect(parse(body).success).toBe(true);
    expect(parse(data).success).toBe(true);
  });
});
