/**
 * Tests for Coral File Format (CORAL-REQ-008)
 *
 * Tests cover:
 * - CoralDocument schema validation
 * - serialize/deserialize functions
 * - Migration framework
 * - Error handling
 */

import { describe, it, expect } from 'vitest';
import {
  CoralDocument,
  CURRENT_SCHEMA_VERSION,
  serialize,
  deserialize,
  validateDocument,
  migrateDocument,
  createDocument,
} from '../src/file/index.js';
import type { CoralNode, CoralEdge, GraphIR } from '../src/types.js';

describe('CoralDocument Schema', () => {
  describe('createDocument', () => {
    it('creates a minimal valid document', () => {
      const doc = createDocument({ name: 'Test Diagram' });

      expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(doc.metadata.name).toBe('Test Diagram');
      expect(doc.metadata.created).toBeDefined();
      expect(doc.metadata.modified).toBeDefined();
      expect(doc.content.format).toBe('graph-ir');
      expect(doc.settings.notation).toBe('flowchart');
    });

    it('creates document with DSL content', () => {
      const doc = createDocument({
        name: 'DSL Diagram',
        content: {
          format: 'dsl',
          dslType: 'coral',
          text: 'node A "Service A"',
        },
      });

      expect(doc.content.format).toBe('dsl');
      expect(doc.content.dslType).toBe('coral');
      expect(doc.content.text).toBe('node A "Service A"');
    });

    it('creates document with Graph-IR content', () => {
      const graphIR: GraphIR = {
        version: '1.0.0',
        id: 'test-graph',
        nodes: [{ id: 'a', type: 'service', label: 'Service A' }],
        edges: [],
      };

      const doc = createDocument({
        name: 'IR Diagram',
        content: {
          format: 'graph-ir',
          graphIR,
        },
      });

      expect(doc.content.format).toBe('graph-ir');
      expect(doc.content.graphIR).toEqual(graphIR);
    });

    it('includes optional metadata fields', () => {
      const doc = createDocument({
        name: 'Full Diagram',
        description: 'A test diagram',
        tags: ['test', 'example'],
        version: '1.0.0',
      });

      expect(doc.metadata.description).toBe('A test diagram');
      expect(doc.metadata.tags).toEqual(['test', 'example']);
      expect(doc.metadata.version).toBe('1.0.0');
    });
  });

  describe('validateDocument', () => {
    it('validates a correct document', () => {
      const doc = createDocument({ name: 'Valid' });
      const result = validateDocument(doc);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects document without schemaVersion', () => {
      const doc = { metadata: { name: 'Test' } } as unknown as CoralDocument;
      const result = validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
    });

    it('rejects document without metadata.name', () => {
      const doc = {
        schemaVersion: '1.0.0',
        metadata: {},
        content: { format: 'graph-ir' },
        settings: { notation: 'flowchart', layout: {} },
      } as unknown as CoralDocument;
      const result = validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('rejects invalid content format', () => {
      const doc = createDocument({ name: 'Test' });
      (doc.content as { format: string }).format = 'invalid';
      const result = validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('format'))).toBe(true);
    });

    it('rejects DSL content without text', () => {
      const doc = createDocument({
        name: 'Test',
        content: { format: 'dsl', dslType: 'coral' },
      });
      delete (doc.content as { text?: string }).text;
      const result = validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('text'))).toBe(true);
    });

    it('validates layout direction enum', () => {
      const doc = createDocument({ name: 'Test' });
      (doc.settings.layout.direction as string) = 'DIAGONAL';
      const result = validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('direction'))).toBe(true);
    });
  });
});

describe('Serialization', () => {
  describe('serialize', () => {
    it('serializes nodes and edges to document', () => {
      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'service',
          position: { x: 100, y: 200 },
          data: { label: 'Service A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'database',
          position: { x: 300, y: 200 },
          data: { label: 'Database', nodeType: 'database' },
        },
      ];

      const edges: CoralEdge[] = [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          data: { label: 'connects' },
        },
      ];

      const doc = serialize(nodes, edges, { name: 'Test' });

      expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(doc.metadata.name).toBe('Test');
      expect(doc.content.format).toBe('graph-ir');
      expect(doc.content.graphIR?.nodes).toHaveLength(2);
      expect(doc.content.graphIR?.edges).toHaveLength(1);
      expect(doc.nodePositions).toEqual({
        a: { x: 100, y: 200 },
        b: { x: 300, y: 200 },
      });
    });

    it('preserves view state', () => {
      const nodes: CoralNode[] = [];
      const edges: CoralEdge[] = [];

      const doc = serialize(nodes, edges, {
        name: 'Test',
        viewState: {
          zoom: 1.5,
          pan: { x: 100, y: 50 },
          selectedNodes: ['a'],
        },
      });

      expect(doc.viewState).toEqual({
        zoom: 1.5,
        pan: { x: 100, y: 50 },
        selectedNodes: ['a'],
      });
    });

    it('includes layout settings', () => {
      const nodes: CoralNode[] = [];
      const edges: CoralEdge[] = [];

      const doc = serialize(nodes, edges, {
        name: 'Test',
        settings: {
          notation: 'bpmn',
          layout: {
            algorithm: 'layered',
            direction: 'RIGHT',
            spacing: { nodeNode: 80, layerSpacing: 100 },
          },
        },
      });

      expect(doc.settings.notation).toBe('bpmn');
      expect(doc.settings.layout.direction).toBe('RIGHT');
      expect(doc.settings.layout.spacing?.nodeNode).toBe(80);
    });

    it('updates modified timestamp', () => {
      const before = new Date().toISOString();
      const doc = serialize([], [], { name: 'Test' });
      const after = new Date().toISOString();

      expect(doc.metadata.modified >= before).toBe(true);
      expect(doc.metadata.modified <= after).toBe(true);
    });
  });

  describe('deserialize', () => {
    it('deserializes document to nodes and edges', () => {
      const doc = createDocument({
        name: 'Test',
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '1.0.0',
            id: 'test',
            nodes: [
              { id: 'a', type: 'service', label: 'Service A' },
              { id: 'b', type: 'database', label: 'Database' },
            ],
            edges: [{ id: 'e1', source: 'a', target: 'b', label: 'connects' }],
          },
        },
        nodePositions: {
          a: { x: 100, y: 200 },
          b: { x: 300, y: 200 },
        },
      });

      const result = deserialize(doc);

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe('a');
      expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(result.nodes[0].data.label).toBe('Service A');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('a');
      expect(result.edges[0].target).toBe('b');
    });

    it('uses default positions when not provided', () => {
      const doc = createDocument({
        name: 'Test',
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '1.0.0',
            id: 'test',
            nodes: [{ id: 'a', type: 'service', label: 'A' }],
            edges: [],
          },
        },
      });

      const result = deserialize(doc);

      expect(result.nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    it('returns settings from document', () => {
      const doc = createDocument({
        name: 'Test',
        settings: {
          notation: 'erd',
          layout: {
            algorithm: 'stress',
            direction: 'LEFT',
          },
        },
      });

      const result = deserialize(doc);

      expect(result.settings.notation).toBe('erd');
      expect(result.settings.layout.algorithm).toBe('stress');
      expect(result.settings.layout.direction).toBe('LEFT');
    });

    it('returns view state from document', () => {
      const doc = createDocument({
        name: 'Test',
        viewState: {
          zoom: 2,
          pan: { x: 50, y: 75 },
        },
      });

      const result = deserialize(doc);

      expect(result.viewState?.zoom).toBe(2);
      expect(result.viewState?.pan).toEqual({ x: 50, y: 75 });
    });

    it('throws on invalid document', () => {
      const invalid = { metadata: { name: 'Bad' } } as unknown as CoralDocument;

      expect(() => deserialize(invalid)).toThrow();
    });
  });
});

describe('JSON Serialization', () => {
  it('serializes to valid JSON string', () => {
    const doc = createDocument({ name: 'Test' });
    const json = JSON.stringify(doc, null, 2);

    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).metadata.name).toBe('Test');
  });

  it('roundtrips through JSON', () => {
    const nodes: CoralNode[] = [
      {
        id: 'a',
        type: 'service',
        position: { x: 100, y: 200 },
        data: { label: 'Service A', nodeType: 'service' },
      },
    ];
    const edges: CoralEdge[] = [];

    const doc = serialize(nodes, edges, { name: 'Roundtrip Test' });
    const json = JSON.stringify(doc);
    const parsed = JSON.parse(json) as CoralDocument;
    const result = deserialize(parsed);

    expect(result.nodes[0].id).toBe('a');
    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(result.nodes[0].data.label).toBe('Service A');
  });
});

describe('Migration', () => {
  describe('migrateDocument', () => {
    it('returns document unchanged if already current version', () => {
      const doc = createDocument({ name: 'Current' });
      const migrated = migrateDocument(doc);

      expect(migrated).toEqual(doc);
    });

    it('migrates older schema versions to current', () => {
      // Simulate an older version document
      const oldDoc = {
        schemaVersion: '0.9.0',
        metadata: {
          name: 'Old Document',
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir' as const,
          graphIR: {
            version: '1.0.0',
            id: 'old',
            nodes: [],
            edges: [],
          },
        },
        settings: {
          notation: 'flowchart',
          layout: {
            algorithm: 'layered',
            direction: 'DOWN' as const,
          },
        },
      };

      const migrated = migrateDocument(oldDoc as unknown as CoralDocument);

      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('throws for unknown schema version', () => {
      const futureDoc = {
        schemaVersion: '99.0.0',
        metadata: { name: 'Future' },
      } as unknown as CoralDocument;

      expect(() => migrateDocument(futureDoc)).toThrow(/unknown.*version/i);
    });
  });
});

describe('Edge Cases', () => {
  it('handles empty nodes and edges', () => {
    const doc = serialize([], [], { name: 'Empty' });
    const result = deserialize(doc);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('handles nodes with complex properties', () => {
    const nodes: CoralNode[] = [
      {
        id: 'complex',
        type: 'service',
        position: { x: 0, y: 0 },
        data: {
          label: 'Complex',
          nodeType: 'service',
          properties: {
            nested: { value: 123 },
            array: [1, 2, 3],
          },
        },
      },
    ];

    const doc = serialize(nodes, [], { name: 'Complex' });
    const result = deserialize(doc);

    expect(result.nodes[0].data.properties?.nested).toEqual({ value: 123 });
    expect(result.nodes[0].data.properties?.array).toEqual([1, 2, 3]);
  });

  it('handles special characters in labels', () => {
    const nodes: CoralNode[] = [
      {
        id: 'special',
        type: 'service',
        position: { x: 0, y: 0 },
        data: {
          label: 'Service "with" <special> & chars',
          nodeType: 'service',
        },
      },
    ];

    const doc = serialize(nodes, [], { name: 'Special "chars"' });
    const json = JSON.stringify(doc);
    const parsed = JSON.parse(json) as CoralDocument;
    const result = deserialize(parsed);

    expect(result.nodes[0].data.label).toBe('Service "with" <special> & chars');
  });

  it('handles unicode in content', () => {
    const nodes: CoralNode[] = [
      {
        id: 'unicode',
        type: 'service',
        position: { x: 0, y: 0 },
        data: {
          label: '服务 🚀 Сервис',
          nodeType: 'service',
        },
      },
    ];

    const doc = serialize(nodes, [], { name: '图表 📊' });
    const json = JSON.stringify(doc);
    const parsed = JSON.parse(json) as CoralDocument;
    const result = deserialize(parsed);

    expect(result.nodes[0].data.label).toBe('服务 🚀 Сервис');
    expect(parsed.metadata.name).toBe('图表 📊');
  });
});
