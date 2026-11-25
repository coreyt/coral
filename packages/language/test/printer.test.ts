import { describe, it, expect } from 'vitest';
import { print } from '../src/printer/index.js';
import { parse } from '../src/parser/index.js';
import type { GraphIR } from '../src/types.js';

describe('Coral Printer', () => {
  it('rejects GraphIR 2 input instead of relabeling it through printed text', () => {
    const legacy = {
      version: '2.0.0',
      id: 'legacy',
      nodes: [{ id: 'api', type: 'service' }],
      edges: [],
    } as unknown as GraphIR;

    expect(() => print(legacy)).toThrow(/requires GraphIR 3\.0\.0.*named migration/i);
  });

  describe('constraint identity', () => {
    it('preserves derived constraint order when node declaration order differs', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
        constraints: [
          {
            id: 'coral.constraint.relative.1',
            kind: 'relative',
            strength: 'preferred',
            subject: { kind: 'node', nodeId: 'b' },
            relation: 'above',
            target: { kind: 'node', nodeId: 'a' },
          },
          {
            id: 'coral.constraint.relative.2',
            kind: 'relative',
            strength: 'preferred',
            subject: { kind: 'node', nodeId: 'a' },
            relation: 'above',
            target: { kind: 'node', nodeId: 'b' },
          },
        ],
      };

      const output = print(graph);
      const replay = parse(output);

      expect(output).toContain('service "B" above a');
      expect(output).toContain('constraint "coral.constraint.relative.2": a above b [preferred]');
      expect(replay.success).toBe(true);
      expect(replay.graph!.constraints).toEqual(graph.constraints);
    });

    it('uses identified syntax when a derived-looking id does not match its ordinal', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
        constraints: [{
          id: 'coral.constraint.relative.2',
          kind: 'relative',
          strength: 'preferred',
          subject: { kind: 'node', nodeId: 'a' },
          relation: 'above',
          target: { kind: 'node', nodeId: 'b' },
        }],
      };

      const output = print(graph);
      const replay = parse(output);

      expect(output).toContain('constraint "coral.constraint.relative.2": a above b [preferred]');
      expect(replay.success).toBe(true);
      expect(replay.graph!.constraints).toEqual(graph.constraints);
    });
  });

  describe('node printing', () => {
    it('prints a simple service node', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'web_app', type: 'service', label: 'Web App' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "Web App"');
    });

    it('prints different node types', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'api', type: 'service', label: 'API' },
          { id: 'db', type: 'database', label: 'Database' },
          { id: 'stripe', type: 'external_api', label: 'Stripe' },
          { id: 'user', type: 'actor', label: 'User' },
          { id: 'auth', type: 'module', label: 'Auth' },
          { id: 'backend', type: 'group', label: 'Backend' },
        ],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "API"');
      expect(output).toContain('database "Database"');
      expect(output).toContain('external_api "Stripe"');
      expect(output).toContain('actor "User"');
      expect(output).toContain('module "Auth"');
      expect(output).toContain('group "Backend"');
    });

    it('prints node with properties', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'api',
          type: 'service',
          label: 'API',
          properties: {
            description: 'Main API gateway',
            technology: 'Node.js',
          },
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "API" {');
      expect(output).toContain('description: "Main API gateway"');
      expect(output).toContain('technology: "Node.js"');
      expect(output).toContain('}');
    });

    it('prints nested nodes', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'payment',
          type: 'service',
          label: 'Payment Service',
          children: [
            { id: 'validation', type: 'module', label: 'Validation', parent: 'payment' },
            { id: 'processing', type: 'module', label: 'Processing', parent: 'payment' },
          ],
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "Payment Service" as payment {');
      expect(output).toContain('  module "Validation"');
      expect(output).toContain('  module "Processing"');
      expect(output).toContain('}');
    });
  });

  describe('edge printing', () => {
    it('prints a simple edge', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'api', type: 'service', label: 'API' },
          { id: 'db', type: 'database', label: 'DB' },
        ],
        edges: [{ id: 'e1', source: 'api', target: 'db' }],
      };

      const output = print(graph);
      expect(output).toContain('api -> db');
    });

    it('prints edge with type', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'api', type: 'service', label: 'API' },
          { id: 'db', type: 'database', label: 'DB' },
        ],
        edges: [{ id: 'e1', source: 'api', target: 'db', type: 'data_flow' }],
      };

      const output = print(graph);
      expect(output).toContain('api -> db as e1 [data_flow]');
    });

    it('prints edge with label', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'api', type: 'service', label: 'API' },
          { id: 'queue', type: 'service', label: 'Queue' },
        ],
        edges: [{
          id: 'e1',
          source: 'api',
          target: 'queue',
          type: 'event',
          label: 'OrderCreated',
        }],
      };

      const output = print(graph);
      expect(output).toContain('api -> queue as e1 [event, label: "OrderCreated"]');
    });

    it('prints multiple edges', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
          { id: 'c', type: 'service', label: 'C' },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
      };

      const output = print(graph);
      expect(output).toContain('a -> b');
      expect(output).toContain('b -> c');
    });
  });

  describe('formatting', () => {
    it('separates nodes and edges with blank line', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      const output = print(graph);
      const lines = output.split('\n');
      const nodeEndIndex = lines.findIndex(l => l.includes('service "B"'));
      const edgeStartIndex = lines.findIndex(l => l.includes('a -> b'));

      // There should be a blank line between nodes and edges
      expect(edgeStartIndex).toBeGreaterThan(nodeEndIndex + 1);
    });

    it('uses consistent indentation', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'parent',
          type: 'group',
          label: 'Parent',
          children: [{
            id: 'child',
            type: 'service',
            label: 'Child',
            parent: 'parent',
            properties: { key: 'value' },
          }],
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('group "Parent" {');
      expect(output).toContain('  service "Child" {');
      expect(output).toContain('    key: "value"');
    });
  });

  describe('roundtrip', () => {
    it('roundtrips simple nodes', () => {
      const source = `service "Web App"
database "PostgreSQL"
external_api "Stripe"`;

      const parsed = parse(source);
      expect(parsed.success).toBe(true);

      const printed = print(parsed.graph!);
      const reparsed = parse(printed);

      expect(reparsed.success).toBe(true);
      expect(reparsed.graph?.nodes.length).toBe(parsed.graph?.nodes.length);
    });

    it('roundtrips nodes with edges', () => {
      const source = `service "API"
database "DB"

api -> db [data_flow]`;

      const parsed = parse(source);
      expect(parsed.success).toBe(true);

      const printed = print(parsed.graph!);
      const reparsed = parse(printed);

      expect(reparsed.success).toBe(true);
      expect(reparsed.graph?.nodes.length).toBe(parsed.graph?.nodes.length);
      expect(reparsed.graph?.edges.length).toBe(parsed.graph?.edges.length);
    });

    it('roundtrips nested nodes', () => {
      const source = `service "Payment Service" {
  module "Validation"
  module "Processing"
}`;

      const parsed = parse(source);
      expect(parsed.success).toBe(true);

      const printed = print(parsed.graph!);
      const reparsed = parse(printed);

      expect(reparsed.success).toBe(true);
      expect(reparsed.graph?.nodes[0].children?.length).toBe(2);
    });

    it('roundtrips node properties', () => {
      const source = `service "API" {
  description: "Main gateway"
  technology: "Node.js"
}`;

      const parsed = parse(source);
      expect(parsed.success).toBe(true);

      const printed = print(parsed.graph!);
      const reparsed = parse(printed);

      expect(reparsed.success).toBe(true);
      expect(reparsed.graph?.nodes[0].properties).toEqual(parsed.graph?.nodes[0].properties);
    });
  });

  describe('edge cases', () => {
    it('handles empty graph', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [],
        edges: [],
      };

      const output = print(graph);
      expect(output).toBe('@graph {"id":"test"}');
    });

    it('escapes quotes in labels', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'test', type: 'service', label: 'Say "Hello"' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "Say \\"Hello\\""');
    });

    it('handles nodes without labels', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'my_service', type: 'service' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service as my_service');
    });

    it('escapes newlines in labels', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'test', type: 'service', label: 'Line1\nLine2' }],
        edges: [],
      };

      const output = print(graph);
      // Must produce valid single-line DSL string, not a literal newline
      expect(output).toBe('@graph {"id":"test"}\n\nservice "Line1\\nLine2" as test');
    });

    it('escapes tabs in labels', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'test', type: 'service', label: 'Col1\tCol2' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toBe('@graph {"id":"test"}\n\nservice "Col1\\tCol2" as test');
    });

    it('escapes carriage returns in labels', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{ id: 'test', type: 'service', label: 'Line1\r\nLine2' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toBe('@graph {"id":"test"}\n\nservice "Line1\\r\\nLine2" as test');
    });
  });

  describe('non-string properties', () => {
    it('prints numeric properties unquoted', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'api',
          type: 'service',
          label: 'API',
          properties: { port: 8080 },
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('port: 8080');
      // Must NOT be quoted
      expect(output).not.toContain('port: "8080"');
    });

    it('prints boolean properties unquoted', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'api',
          type: 'service',
          label: 'API',
          properties: { enabled: true, deprecated: false },
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('enabled: true');
      expect(output).toContain('deprecated: false');
    });

    it('prints non-string edge properties', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{
          id: 'e1',
          source: 'a',
          target: 'b',
          properties: { weight: 5 },
        }],
      };

      const output = print(graph);
      expect(output).toContain('weight: 5');
    });

    it('prints null and skips undefined properties', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'api',
          type: 'service',
          label: 'API',
          properties: { name: 'test', empty: null as unknown, undef: undefined as unknown },
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('name: "test"');
      expect(output).toContain('empty: null');
      expect(output).not.toContain('undef');
    });

    it('produces deterministic edge attribute order', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{
          id: 'e1',
          source: 'a',
          target: 'b',
          type: 'flow',
          label: 'sends',
          properties: { zeta: 'last', alpha: 'first' },
        }],
      };

      // Run multiple times, output must be identical
      const output1 = print(graph);
      const output2 = print(graph);
      expect(output1).toBe(output2);
      // Properties should be sorted alphabetically
      expect(output1).toContain('alpha: "first", zeta: "last"');
    });

    it('opens braces for node with only non-string properties', () => {
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'test',
        nodes: [{
          id: 'api',
          type: 'service',
          label: 'API',
          properties: { port: 8080 },
        }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "API" {');
      expect(output).toContain('port: 8080');
      expect(output).toContain('}');
    });
  });
});
