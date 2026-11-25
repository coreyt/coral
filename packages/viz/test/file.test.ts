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
  migrateDocumentWithDiagnostics,
  needsMigration,
  getMigrationSteps,
  createDocument,
  materializeReferencedPorts,
  stripResolvedPorts,
} from '../src/file/index.js';
import type { CoralNode, CoralEdge, GraphIR } from '../src/types.js';
import { validateIR } from '@graph-ir/core';

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
        version: '3.0.0',
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
    it('accepts an empty DSL source while still requiring the text field', () => {
      const doc = createDocument({ name: 'Cleared source', content: {
        format: 'dsl', dslType: 'coral', text: '',
      } });
      expect(validateDocument(doc)).toEqual({ valid: true, errors: [] });
      expect(validateDocument({ ...doc, content: { format: 'dsl', dslType: 'coral' } }).errors)
        .toContain('content.text is required when format is "dsl"');
    });

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
  it('rejects legacy GraphIR instead of relabeling it while saving', () => {
    const legacy = {
      version: '2.0.0', id: 'legacy', nodes: [], edges: [],
    } as unknown as GraphIR;

    expect(() => serialize([], [], { name: 'Legacy', graphIR: legacy }))
      .toThrow(/requires GraphIR 3\.0\.0.*named migration/i);
  });

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

    it('preserves graph fields and embeds the same geometry used by the view', () => {
      const nodes: CoralNode[] = [{
        id: 'api',
        type: 'symbol',
        position: { x: 100, y: 200 },
        parentId: 'platform',
        draggable: false,
        data: {
          label: 'API',
          nodeType: 'service',
          description: 'Public API',
          properties: { port: 8080 },
          pinned: true,
        },
      }];
      const edges: CoralEdge[] = [{
        id: 'e1',
        source: 'api',
        target: 'store',
        sourceHandle: 'out',
        targetHandle: 'in',
        style: { strokeDasharray: '6,3' },
        data: {
          label: 'writes',
          edgeType: 'dependency',
          properties: { weight: 3 },
          lineStyle: 'dashed',
        },
      }];
      const waypoints = new Map([['e1', [
        { id: 'w1', x: 300, y: 250, type: 'corner' as const },
      ]]]);

      const graph = serialize(nodes, edges, { name: 'Fidelity' }, waypoints).content.graphIR!;
      expect(graph.nodes[0]).toMatchObject({
        id: 'api',
        parent: 'platform',
        position: { x: 100, y: 200 },
        pinned: true,
        description: 'Public API',
        properties: { port: 8080 },
      });
      expect(graph.edges[0]).toMatchObject({
        sourcePort: 'out',
        targetPort: 'in',
        type: 'dependency',
        properties: { weight: 3 },
        style: { lineStyle: 'dashed' },
        routeIntent: { waypoints: [{
          id: 'w1', placement: { kind: 'absolute', position: { x: 300, y: 250 } },
        }] },
      });
    });

    it('does not resurrect a canonical line style cleared in the visual view', () => {
      const edge: CoralEdge = {
        id: 'e1', source: 'a', target: 'b',
        data: { canonical: { style: { lineStyle: 'dashed' } } },
      };

      const saved = serialize([], [edge], { name: 'Cleared style' }).content.graphIR!.edges[0];

      expect(saved).not.toHaveProperty('style');
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

    it('preserves all document settings', () => {
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
          font: { default: { family: 'Inter', size: 15, weight: 600 } },
          suppressErrorAnnotations: true,
          suppressWarningAnnotations: true,
        },
      });

      expect(doc.settings.notation).toBe('bpmn');
      expect(doc.settings.layout.direction).toBe('RIGHT');
      expect(doc.settings.layout.spacing?.nodeNode).toBe(80);
      expect(doc.settings.font?.default).toEqual({ family: 'Inter', size: 15, weight: 600 });
      expect(doc.settings.suppressErrorAnnotations).toBe(true);
      expect(doc.settings.suppressWarningAnnotations).toBe(true);
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
            version: '3.0.0',
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
            version: '3.0.0',
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
            version: '2.0.0',
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
      expect(migrated.content.graphIR?.version).toBe('3.0.0');
    });

    it('uses the named GraphIR 2-to-3 migration and returns attributable evidence', () => {
      const doc = createDocument({ name: 'Legacy GraphIR' });
      doc.content.graphIR = {
        version: '2.0.0',
        id: 'sequence',
        metadata: { notation: 'uml-sequence' },
        nodes: [
          { id: 'client', type: 'actor' },
          { id: 'api', type: 'service' },
        ],
        edges: [{ id: 'request', source: 'client', target: 'api' }],
      } as unknown as GraphIR;

      const result = migrateDocumentWithDiagnostics(doc);

      expect(result.document.content.graphIR).toMatchObject({
        version: '3.0.0',
        profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
        interaction: {
          participantOrder: ['client', 'api'],
          messageOrder: ['request'],
        },
      });
      expect(result.graphIR).toMatchObject({ fromVersion: '2.0.0', toVersion: '3.0.0' });
      expect(result.graphIR?.changes.map((change) => change.code)).toContain('SET_SCHEMA_VERSION');
    });

    it.each(['2.0.0', '3.0.0'])('moves a legacy flat edge lineStyle into style.lineStyle in GraphIR %s', (version) => {
      // 0.2.5 and early 0.2.6 saves spread the editor's flat edge lineStyle
      // into the file; neither GraphIR schema allows it on the edge itself.
      const doc = createDocument({ name: 'Legacy line styles' });
      doc.content.graphIR = {
        version, id: 'legacy',
        nodes: [{ id: 'a', type: 'service', label: 'A' }, { id: 'b', type: 'service', label: 'B' }],
        edges: [
          { id: 'dashed', source: 'a', target: 'b', lineStyle: 'dashed' },
          { id: 'both', source: 'b', target: 'a', lineStyle: 'dotted', style: { lineStyle: 'dashed' } },
        ],
      } as unknown as GraphIR;
      const result = migrateDocumentWithDiagnostics(doc);
      const edges = result.document.content.graphIR!.edges as unknown as Array<Record<string, unknown>>;
      expect(edges.map((edge) => 'lineStyle' in edge)).toEqual([false, false]);
      expect(edges.map((edge) => (edge.style as { lineStyle?: string }).lineStyle)).toEqual(['dashed', 'dashed']);
      expect(result.graphIR?.changes.filter((change) => change.code === 'MOVE_EDGE_LINE_STYLE').map((change) => change.path))
        .toEqual(['/edges/0/lineStyle', '/edges/1/lineStyle']);
      expect((doc.content.graphIR!.edges[0] as unknown as Record<string, unknown>).lineStyle).toBe('dashed');
    });

    it('materializes complete resolved port sets and strips an exact symbol match', () => {
      const graph: GraphIR = {
        version: '3.0.0', id: 'ports',
        nodes: [{ id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' }],
        edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
      };
      const resolvePorts = () => [
        { id: 'in', side: 'WEST' as const, properties: { direction: 'in' } },
        { id: 'out', side: 'EAST' as const, properties: { direction: 'out' } },
      ];

      const materialized = materializeReferencedPorts(graph, resolvePorts);
      expect(validateIR(materialized.graph).valid).toBe(true);
      expect(materialized.graph.nodes.every((node) => node.ports?.length === 2)).toBe(true);
      expect(materialized.changes.map((change) => change.code)).toEqual([
        'MATERIALIZE_SYMBOL_PORTS', 'MATERIALIZE_SYMBOL_PORTS',
      ]);

      const stripped = stripResolvedPorts(materialized.graph, resolvePorts);
      expect(stripped.graph).toEqual(graph);
      expect(stripped.changes.map((change) => change.code)).toEqual([
        'STRIP_SYMBOL_PORTS', 'STRIP_SYMBOL_PORTS',
      ]);
    });

    it('accepts only the undeclared edge ports a concrete port resolver supplies', () => {
      const doc = createDocument({ name: 'Ports' });
      doc.content.graphIR = {
        version: '3.0.0', id: 'ports',
        nodes: [{ id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' }],
        edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
      } as unknown as GraphIR;
      expect(() => migrateDocumentWithDiagnostics(doc)).toThrow(/Missing source port "out"/);
      const resolvePorts = () => [
        { id: 'out', side: 'EAST' as const }, { id: 'in', side: 'WEST' as const },
      ];
      expect(migrateDocumentWithDiagnostics(doc, { resolvePorts }).document.content.graphIR).toEqual(doc.content.graphIR);
      expect(deserialize(doc, { resolvePorts }).edges).toHaveLength(1);
      expect(() => migrateDocumentWithDiagnostics(doc, { resolvePorts: () => [{ id: 'out', side: 'EAST' }] }))
        .toThrow(/Missing target port "in"/);
    });

    it('materializes symbol ports before GraphIR 2 migration and preserves other normalization', () => {
      const doc = createDocument({ name: 'Legacy ports' });
      doc.content.graphIR = {
        version: '2.0.0', id: 'legacy-ports',
        nodes: [{ id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' }],
        edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in', lineStyle: 'dashed' }],
      } as unknown as GraphIR;
      const resolvePorts = () => [
        { id: 'in', side: 'WEST' as const }, { id: 'out', side: 'EAST' as const },
      ];

      const result = migrateDocumentWithDiagnostics(doc, { resolvePorts });
      expect(result.document.content.graphIR).toMatchObject({
        version: '3.0.0',
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [{ id: 'e', style: { lineStyle: 'dashed' } }],
      });
      expect(result.document.content.graphIR?.nodes.every((node) => node.ports === undefined)).toBe(true);
      expect(result.graphIR?.changes.map((change) => change.code)).toEqual(expect.arrayContaining([
        'MOVE_EDGE_LINE_STYLE', 'MATERIALIZE_SYMBOL_PORTS', 'STRIP_SYMBOL_PORTS',
      ]));
    });

    it('passes a source-draft dsl document through migration and validation unchanged (R-064 AC-4)', async () => {
      const doc = createDocument({ name: 'Draft' });
      doc.content = { format: 'dsl', dslType: 'coral', text: 'service "A"\ninvalid line' };
      const result = migrateDocumentWithDiagnostics(doc);
      expect(result.document.content).toEqual(doc.content);
      expect(result.graphIR).toBeUndefined();
      expect(validateDocument(result.document).valid).toBe(true);
      const root = await import('../src/index.js');
      expect(root.migrateDocumentWithDiagnostics).toBe(migrateDocumentWithDiagnostics);
    });

    it('reports nested GraphIR migration even when the Coral envelope is current', () => {
      const doc = createDocument({ name: 'Legacy GraphIR' });
      doc.content.graphIR = {
        version: '2.0.0', id: 'legacy', nodes: [], edges: [],
      } as unknown as GraphIR;

      expect(needsMigration(doc)).toBe(true);
      expect(getMigrationSteps(doc)).toEqual(['GraphIR 2.0.0→3.0.0']);
      expect(needsMigration(migrateDocument(doc))).toBe(false);
    });

    it('rejects a GraphIR 2 value relabeled as GraphIR 3', () => {
      const doc = createDocument({ name: 'Relabeled' });
      doc.content.graphIR = {
        version: '3.0.0', id: 'relabeled', nodes: [],
        edges: [{ id: 'e', source: 'a', target: 'b', style: { targetArrow: 'arrow' } }],
      } as unknown as GraphIR;

      expect(() => migrateDocument(doc)).toThrow(/Invalid GraphIR 3 document|SCHEMA_VIOLATION/);
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
  it('round-trips nested canonical fields and graph-level metadata', () => {
    const sourceInfo = { range: { start: 0, end: 4 }, originalText: 'node' };
    const original: GraphIR = {
      version: '3.0.0', id: 'preserve-id', name: 'Graph name',
      metadata: { author: 'Ada', tags: ['release'] },
      layoutOptions: { algorithm: 'fixed', direction: 'RIGHT' },
      nodes: [{
        id: 'parent', type: 'group', label: 'Parent', position: { x: 100, y: 200 },
        symbol: 'arch-container', dimensions: { width: 400, height: 300 },
        children: [{
          id: 'child', type: 'service', label: 'Child', parent: 'parent',
          position: { x: 25, y: 35 }, symbol: 'arch-service', variant: 'api',
          ports: [{ id: 'http', side: 'EAST' }], layoutOptions: { portConstraints: 'FIXED_SIDE' },
          sourceInfo,
        }],
      }],
      edges: [{
        id: 'e', source: 'child', target: 'parent', sourcePort: 'http',
        style: { lineStyle: 'dashed', routing: 'spline' },
        sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
        sourceInfo,
      }],
    };
    const seed = createDocument({ name: 'Document', content: { graphIR: original } });
    seed.metadata = {
      name: 'Document', description: 'Doc description', tags: ['one'], version: 'v4',
      created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
    };
    const view = deserialize(seed);
    const saved = serialize(view.nodes, view.edges, {
      name: seed.metadata.name,
      description: seed.metadata.description,
      tags: seed.metadata.tags,
      version: seed.metadata.version,
      created: seed.metadata.created,
      graphIR: original,
      settings: view.settings,
    });

    expect(JSON.parse(JSON.stringify(saved.content.graphIR))).toEqual(original);
    expect(saved.metadata).toMatchObject({
      description: 'Doc description', tags: ['one'], version: 'v4', created: seed.metadata.created,
    });
    const reloaded = deserialize(saved);
    expect(reloaded.nodes.find((node) => node.id === 'child')?.parentId).toBe('parent');
    expect(reloaded.nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 25, y: 35 });
  });

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
