/**
 * Tests for viz-demo parsers
 */

import { describe, it, expect } from 'vitest';
import { parseCoralDSL, parseMermaidDSL } from '../src/parsers';

describe('parseCoralDSL', () => {
  describe('node parsing', () => {
    it('should parse service nodes', () => {
      const result = parseCoralDSL('service "My Service"');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]).toEqual({
        id: 'my_service',
        type: 'service',
        label: 'My Service',
      });
    });

    it('should parse database nodes', () => {
      const result = parseCoralDSL('database "PostgreSQL"');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('database');
    });

    it('should parse module nodes', () => {
      const result = parseCoralDSL('module "Auth Module"');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('module');
    });

    it('should parse all node types', () => {
      const dsl = `
service "S"
database "D"
module "M"
external_api "E"
actor "A"
group "G"
`;
      const result = parseCoralDSL(dsl);
      expect(result.nodes).toHaveLength(6);
      expect(result.nodes.map(n => n.type)).toEqual([
        'service', 'database', 'module', 'external_api', 'actor', 'group'
      ]);
    });

    it('should generate snake_case IDs from labels', () => {
      const result = parseCoralDSL('service "My Cool Service"');
      expect(result.nodes[0].id).toBe('my_cool_service');
    });
  });

  describe('edge parsing', () => {
    it('should parse simple edges', () => {
      const result = parseCoralDSL('a -> b');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: 'a',
        target: 'b',
      });
    });

    it('should parse edges with labels', () => {
      const result = parseCoralDSL('a -> b [label: "calls"]');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBe('calls');
    });

    it('should parse multiple edges', () => {
      const dsl = `
a -> b
b -> c
c -> a
`;
      const result = parseCoralDSL(dsl);
      expect(result.edges).toHaveLength(3);
    });
  });

  describe('comments and whitespace', () => {
    it('should skip comments', () => {
      const dsl = `
// This is a comment
service "Test"
// Another comment
`;
      const result = parseCoralDSL(dsl);
      expect(result.nodes).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const dsl = `

service "A"

service "B"

`;
      const result = parseCoralDSL(dsl);
      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should report unknown syntax', () => {
      const result = parseCoralDSL('this is invalid syntax here');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].line).toBe(1);
    });

    it('should return empty results for empty input', () => {
      const result = parseCoralDSL('');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('complete diagrams', () => {
    it('should parse a complete diagram', () => {
      const dsl = `
// Architecture diagram
service "Frontend"
service "API"
database "PostgreSQL"

frontend -> api
api -> postgresql
`;
      const result = parseCoralDSL(dsl);
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('parseMermaidDSL', () => {
  describe('flowchart declaration', () => {
    it('should skip flowchart TD declaration', () => {
      const result = parseMermaidDSL('flowchart TD');
      expect(result.nodes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip graph LR declaration', () => {
      const result = parseMermaidDSL('graph LR');
      expect(result.nodes).toHaveLength(0);
    });
  });

  describe('node parsing', () => {
    it('should parse nodes from edges', () => {
      const result = parseMermaidDSL('A --> B');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe('A');
      expect(result.nodes[1].id).toBe('B');
    });

    it('should parse nodes with rectangle labels', () => {
      const result = parseMermaidDSL('A[My Label] --> B[Other Label]');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('My Label');
      expect(result.nodes[1].label).toBe('Other Label');
    });

    it('should parse nodes with diamond labels (decision)', () => {
      const result = parseMermaidDSL('A{Is Valid?} --> B');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('Is Valid?');
      expect(result.nodes[0].type).toBe('module'); // diamond = decision = module
    });

    it('should parse nodes with rounded labels', () => {
      const result = parseMermaidDSL('A(Start) --> B(End)');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('Start');
    });

    it('should not duplicate nodes', () => {
      const result = parseMermaidDSL(`
A --> B
B --> C
A --> C
`);
      expect(result.nodes).toHaveLength(3);
    });
  });

  describe('edge parsing', () => {
    it('should parse simple edges', () => {
      const result = parseMermaidDSL('A --> B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
      });
    });

    it('should parse edges with labels', () => {
      const result = parseMermaidDSL('A -->|Yes| B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBe('Yes');
    });

    it('should parse multiple edge types', () => {
      const dsl = `
A --> B
C --- D
`;
      const result = parseMermaidDSL(dsl);
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('comments', () => {
    it('should skip Mermaid comments', () => {
      const result = parseMermaidDSL(`
%% This is a comment
A --> B
`);
      expect(result.nodes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('complete diagrams', () => {
    it('should parse a complete flowchart', () => {
      const dsl = `
flowchart TD
    A[Start] --> B{Is Valid?}
    B -->|Yes| C[Process]
    B -->|No| D[Error]
    C --> E[End]
    D --> E
`;
      const result = parseMermaidDSL(dsl);
      expect(result.nodes).toHaveLength(5);
      expect(result.edges).toHaveLength(5);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle indentation', () => {
      const dsl = `
flowchart TD
    A --> B
        B --> C
`;
      const result = parseMermaidDSL(dsl);
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should return empty results for empty input', () => {
      const result = parseMermaidDSL('');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });
});
