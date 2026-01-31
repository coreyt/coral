import { describe, it, expect } from 'vitest';
import { print } from '../src/printer/index.js';
import { parse } from '../src/parser/index.js';
import type { GraphIR, GraphNode, GraphEdge } from '../src/types.js';

describe('Coral Printer', () => {
  describe('node printing', () => {
    it('prints a simple service node', () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [{ id: 'web_app', type: 'service', label: 'Web App' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "Web App"');
    });

    it('prints different node types', () => {
      const graph: GraphIR = {
        version: '1.0.0',
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
        version: '1.0.0',
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
        version: '1.0.0',
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
      expect(output).toContain('service "Payment Service" {');
      expect(output).toContain('  module "Validation"');
      expect(output).toContain('  module "Processing"');
      expect(output).toContain('}');
    });
  });

  describe('edge printing', () => {
    it('prints a simple edge', () => {
      const graph: GraphIR = {
        version: '1.0.0',
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
        version: '1.0.0',
        id: 'test',
        nodes: [
          { id: 'api', type: 'service', label: 'API' },
          { id: 'db', type: 'database', label: 'DB' },
        ],
        edges: [{ id: 'e1', source: 'api', target: 'db', type: 'data_flow' }],
      };

      const output = print(graph);
      expect(output).toContain('api -> db [data_flow]');
    });

    it('prints edge with label', () => {
      const graph: GraphIR = {
        version: '1.0.0',
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
      expect(output).toContain('api -> queue [event, label = "OrderCreated"]');
    });

    it('prints multiple edges', () => {
      const graph: GraphIR = {
        version: '1.0.0',
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
        version: '1.0.0',
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
        version: '1.0.0',
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
        version: '1.0.0',
        id: 'test',
        nodes: [],
        edges: [],
      };

      const output = print(graph);
      expect(output).toBe('');
    });

    it('escapes quotes in labels', () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [{ id: 'test', type: 'service', label: 'Say "Hello"' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "Say \\"Hello\\""');
    });

    it('handles nodes without labels', () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [{ id: 'my_service', type: 'service' }],
        edges: [],
      };

      const output = print(graph);
      expect(output).toContain('service "my_service"');
    });
  });
});
