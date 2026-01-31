import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';

describe('Coral Parser', () => {
  describe('node declarations', () => {
    it('parses a simple service node', () => {
      const result = parse('service "Web App"');

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(1);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'web_app',
        type: 'service',
        label: 'Web App',
      });
    });

    it('parses a database node', () => {
      const result = parse('database "PostgreSQL"');

      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'postgresql',
        type: 'database',
        label: 'PostgreSQL',
      });
    });

    it('parses multiple node types', () => {
      const source = `
service "API"
database "DB"
external_api "Stripe"
actor "User"
module "Auth"
group "Backend"
`;
      const result = parse(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(6);
      expect(result.graph?.nodes.map(n => n.type)).toEqual([
        'service', 'database', 'external_api', 'actor', 'module', 'group'
      ]);
    });

    it('generates unique IDs for duplicate labels', () => {
      const result = parse(`
service "API"
service "API"
`);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.nodes[0].id).toBe('api');
      expect(result.graph?.nodes[1].id).toBe('api_2');
    });
  });

  describe('node bodies', () => {
    it('parses a node with empty body', () => {
      const result = parse('service "API" { }');

      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'api',
        type: 'service',
        label: 'API',
      });
    });

    it('parses a node with child nodes', () => {
      const result = parse(`
service "Payment Service" {
  module "Validation"
  module "Processing"
}
`);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(1);

      const parent = result.graph?.nodes[0];
      expect(parent?.children).toHaveLength(2);
      expect(parent?.children?.[0]).toMatchObject({
        id: 'validation',
        type: 'module',
        label: 'Validation',
        parent: 'payment_service',
      });
    });

    it('parses a node with properties', () => {
      const result = parse(`
service "API" {
  description: "Main API gateway"
  technology: "Node.js"
}
`);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].properties).toEqual({
        description: 'Main API gateway',
        technology: 'Node.js',
      });
    });

    it('parses nested groups', () => {
      const result = parse(`
group "Frontend" {
  service "Web App" {
    module "Router"
  }
}
`);

      expect(result.success).toBe(true);
      const frontend = result.graph?.nodes[0];
      expect(frontend?.children).toHaveLength(1);
      expect(frontend?.children?.[0].children).toHaveLength(1);
    });
  });

  describe('edge declarations', () => {
    it('parses a simple edge', () => {
      const result = parse(`
service "API"
database "DB"
api -> db
`);

      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(1);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'api',
        target: 'db',
      });
    });

    it('parses an edge with relation type', () => {
      const result = parse(`
service "API"
database "DB"
api -> db [data_flow]
`);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'api',
        target: 'db',
        type: 'data_flow',
      });
    });

    it('parses an edge with label attribute', () => {
      const result = parse(`
service "API"
service "Queue"
api -> queue [event, label = "OrderCreated"]
`);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'api',
        target: 'queue',
        type: 'event',
        label: 'OrderCreated',
      });
    });

    it('parses multiple edges', () => {
      const result = parse(`
service "Frontend"
service "API"
database "DB"
frontend -> api
api -> db
`);

      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(2);
    });

    it('generates unique edge IDs', () => {
      const result = parse(`
service "A"
service "B"
a -> b
a -> b
`);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].id).toBe('a_to_b');
      expect(result.graph?.edges[1].id).toBe('a_to_b_2');
    });
  });

  describe('comments', () => {
    it('ignores comments', () => {
      const result = parse(`
// This is a comment
service "API"
// Another comment
`);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(1);
    });
  });

  describe('source info', () => {
    it('includes source info when requested', () => {
      const result = parse('service "API"', { includeSourceInfo: true });

      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].sourceInfo).toBeDefined();
      // 'service "API"' is 13 characters (indices 0-12), end is exclusive
      expect(result.graph?.nodes[0].sourceInfo?.range.start).toBe(0);
      expect(result.graph?.nodes[0].sourceInfo?.range.end).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('reports parse errors', () => {
      const result = parse('invalid syntax here');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('graph metadata', () => {
    it('uses custom graph ID', () => {
      const result = parse('service "API"', { graphId: 'my-graph' });

      expect(result.graph?.id).toBe('my-graph');
    });

    it('uses custom graph name', () => {
      const result = parse('service "API"', { graphName: 'My Architecture' });

      expect(result.graph?.name).toBe('My Architecture');
    });
  });

  describe('ID generation', () => {
    it('converts labels to snake_case IDs', () => {
      const cases = [
        { label: 'Web App', expected: 'web_app' },
        { label: 'PostgreSQL', expected: 'postgresql' },
        { label: 'API Gateway', expected: 'api_gateway' },
        { label: 'User-Auth', expected: 'user_auth' },
        { label: 'Node.js Service', expected: 'node_js_service' },
      ];

      for (const { label, expected } of cases) {
        const result = parse(`service "${label}"`);
        expect(result.graph?.nodes[0].id).toBe(expected);
      }
    });
  });
});
