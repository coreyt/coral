/**
 * Conversion Pipeline Tests
 *
 * Deterministic unit tests for Mermaid -> Coral DSL conversion.
 * Tests the shared printer path used for Mermaid-to-Coral conversion.
 *
 * Run: npx vitest run test/llm/conversion.test.ts
 */

import { describe, it, expect } from 'vitest';
import { parseMermaidDSL } from '../../src/parsers';
// These tests round-trip GraphIR 3 printer interchange, not saved Coral source.
import { parseGraphFixture } from './graph-interchange-fixture';
import { printCoralDSL } from '../../src/printer';
import { convertToMermaidDslWithDiagnostics } from '../../src/llm/convert';

// Shared Mermaid input for all tests
// Uses [rect] for process and {diamond} for decision.
const MERMAID_INPUT = `flowchart TD
    A[API Gateway] --> B[Auth Service]
    B --> C{Is Authenticated?}
    C -->|Yes| D[User Dashboard]
    C -->|No| E[Login Page]
    D --> F[User Database]
    E --> B`;

function convertToCoralDsl(parsed: ReturnType<typeof parseMermaidDSL>): string {
  return printCoralDSL({
    version: '3.0.0',
    id: 'current',
    nodes: parsed.nodes,
    edges: parsed.edges,
  });
}

describe('Mermaid -> Coral conversion', () => {
  it('converts linear flow with correct node count, labels, and IDs', () => {
    const parsed = parseMermaidDSL(MERMAID_INPUT);
    const coral = convertToCoralDsl(parsed);
    const reparsed = parseGraphFixture(coral);

    // 6 nodes
    expect(reparsed.nodes).toHaveLength(6);

    // All labels present
    const labels = reparsed.nodes.map((n) => n.label);
    expect(labels).toContain('API Gateway');
    expect(labels).toContain('Auth Service');
    expect(labels).toContain('Is Authenticated?');
    expect(labels).toContain('User Dashboard');
    expect(labels).toContain('Login Page');
    expect(labels).toContain('User Database');

    // Mermaid's own ids survive the conversion (R-010); they are carried by an
    // `as` clause rather than remapped to label-derived ids.
    const ids = reparsed.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'E', 'F']));

    // 6 edges with correct remapped source/target
    expect(reparsed.edges).toHaveLength(6);

    const e0 = reparsed.edges[0];
    expect(e0.source).toBe('A');
    expect(e0.target).toBe('B');
  });

  it('maps Mermaid shapes to flowchart-specific Coral words', () => {
    const parsed = parseMermaidDSL(MERMAID_INPUT);
    const coral = convertToCoralDsl(parsed);
    const reparsed = parseGraphFixture(coral);

    // Diamond node {Is Authenticated?} -> decision type
    const authNode = reparsed.nodes.find((n) => n.label === 'Is Authenticated?');
    expect(authNode).toBeDefined();
    expect(authNode!.type).toBe('decision');

    // Rectangle nodes -> process type
    const apiNode = reparsed.nodes.find((n) => n.label === 'API Gateway');
    expect(apiNode).toBeDefined();
    expect(apiNode!.type).toBe('process');

    const dbNode = reparsed.nodes.find((n) => n.label === 'User Database');
    expect(dbNode).toBeDefined();
    expect(dbNode!.type).toBe('process');
  });

  it('preserves edge labels through conversion', () => {
    const parsed = parseMermaidDSL(MERMAID_INPUT);
    const coral = convertToCoralDsl(parsed);

    // Edge labels preserved in Coral DSL text
    expect(coral).toContain('[label: "Yes"]');
    expect(coral).toContain('[label: "No"]');

    // Verify via re-parse
    const reparsed = parseGraphFixture(coral);

    const yesEdge = reparsed.edges.find((e) => e.label === 'Yes');
    expect(yesEdge).toBeDefined();
    expect(yesEdge!.source).toBe('C');
    expect(yesEdge!.target).toBe('D');

    const noEdge = reparsed.edges.find((e) => e.label === 'No');
    expect(noEdge).toBeDefined();
    expect(noEdge!.source).toBe('C');
    expect(noEdge!.target).toBe('E');
  });

  it('roundtrips: Mermaid -> Coral -> parse with zero errors', () => {
    const parsed = parseMermaidDSL(MERMAID_INPUT);
    const coral = convertToCoralDsl(parsed);
    const reparsed = parseGraphFixture(coral);

    // Zero parse errors
    expect(reparsed.errors).toHaveLength(0);

    // Node/edge counts match
    expect(reparsed.nodes).toHaveLength(parsed.nodes.length);
    expect(reparsed.edges).toHaveLength(parsed.edges.length);

    // All edge source/target IDs exist in node IDs
    const nodeIds = new Set(reparsed.nodes.map((n) => n.id));
    for (const edge of reparsed.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});

describe('Coral -> Mermaid loss reporting', () => {
  it('names geometry, properties, relation, route, and dotted-style loss', () => {
    const result = convertToMermaidDslWithDiagnostics({
      version: '3.0.0',
      id: 'g',
      nodes: [{
        id: 'a', type: 'service', label: 'A', position: { x: 10, y: 20 },
        pinned: true, properties: { port: 8080 },
      }],
      edges: [{
        id: 'e', source: 'a', target: 'a', type: 'calls',
        style: { lineStyle: 'dotted' }, properties: { weight: 2 },
        routingPoints: [{ x: 40, y: 50 }],
      }],
    });

    expect(result.text).toContain('flowchart TD');
    expect(result.diagnostics.join('\n')).toMatch(/position|pinning|properties|relation type|waypoints|dotted style/);
  });

  it('maps unsafe identifiers, escapes delimiters, preserves the real type subset, and reports every other field', () => {
    const sourceInfo = { range: { start: 0, end: 1 } };
    const result = convertToMermaidDslWithDiagnostics({
      version: '3.0.0', id: 'graph id', name: 'Name', metadata: { author: 'A' },
      layoutOptions: { direction: 'LEFT' },
      nodes: [{
        id: '1 bad/id', type: 'database', label: 'A ] | " B', description: 'desc',
        symbol: 'arch-database', variant: 'sql', ports: [{ id: 'p', side: 'EAST' }],
        dimensions: { width: 10, height: 20 }, position: { x: 1, y: 2 }, pinned: true,
        layoutOptions: { portConstraints: 'FIXED_SIDE' }, properties: { x: 1 }, sourceInfo,
      }],
      edges: [{
        id: 'edge id', source: '1 bad/id', target: '1 bad/id', sourcePort: 'p', targetPort: 'p',
        type: 'calls', label: 'x | y', properties: { q: 1 }, routingPoints: [{ x: 3, y: 4 }],
        style: { lineStyle: 'dotted', routing: 'spline' },
        sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        sourceInfo,
      }],
    });

    expect(result.text).toContain('n_1_bad_id[(A &#93; &#124; &quot; B)]');
    expect(parseMermaidDSL(result.text).errors).toHaveLength(0);
    expect(parseMermaidDSL(result.text).nodes[0].type).toBe('database');
    const report = result.diagnostics.join('\n');
    for (const term of [
      'Graph id', 'Graph name', 'Graph metadata', 'layout options', 'identifier',
      'description', 'symbol', 'variant', 'ports', 'dimensions', 'position', 'pinning',
      'properties', 'source information', 'Edge id', 'source port', 'target port',
      'relation type', 'waypoints', 'dotted style', 'source marker', 'target arrow', 'routing style',
    ]) expect(report).toMatch(new RegExp(term, 'i'));
  });
});

describe('Edge style preservation through conversion', () => {
  const MERMAID_WITH_DASHED = `flowchart TD
    A[API Gateway] --> B[Auth Service]
    B -.-> C[Cache]
    A --> C`;

  it('preserves dashed edge style from Mermaid through Coral conversion', () => {
    const parsed = parseMermaidDSL(MERMAID_WITH_DASHED);

    // Mermaid parser should extract dashed style
    const dashedEdge = parsed.edges.find((e) => e.source === 'B' && e.target === 'C');
    expect(dashedEdge).toBeDefined();
    expect(dashedEdge!.lineStyle).toBe('dashed');

    // Solid edges should have no lineStyle
    const solidEdge = parsed.edges.find((e) => e.source === 'A' && e.target === 'B');
    expect(solidEdge).toBeDefined();
    expect(solidEdge!.lineStyle).toBeUndefined();

    // Convert to Coral DSL
    const coral = convertToCoralDsl(parsed);

    // Coral DSL text should contain [dashed]
    expect(coral).toContain('[dashed]');

    // Re-parse and verify style preserved
    const reparsed = parseGraphFixture(coral);
    expect(reparsed.errors).toHaveLength(0);

    // Mermaid's ids survive, so the edge is still identified by its endpoints.
    const reDashed = reparsed.edges.find((e) => e.source === 'B' && e.target === 'C');
    expect(reDashed).toBeDefined();
    expect(reDashed!.lineStyle).toBe('dashed');

    // An edge Mermaid gave no style keeps none; only a style that was set is emitted.
    const rePlain = reparsed.edges.find((e) => e.source === 'A' && e.target === 'B');
    expect(rePlain).toBeDefined();
    expect(rePlain!.lineStyle).toBeUndefined();
  });

  it('roundtrips dashed+label through Coral DSL parse/print', () => {
    const dsl = `service "A"
service "B"

a -> b [dashed, label: "cached"]`;

    const parsed = parseGraphFixture(dsl);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.edges[0].lineStyle).toBe('dashed');
    expect(parsed.edges[0].label).toBe('cached');

    // Print back to DSL
    const printed = printCoralDSL({
      version: '3.0.0',
      id: 'test',
      nodes: parsed.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
      edges: parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        lineStyle: e.lineStyle,
      })),
    });

    expect(printed).toContain('[dashed, label: "cached"]');

    // Re-parse and verify
    const reparsed = parseGraphFixture(printed);
    expect(reparsed.edges[0].lineStyle).toBe('dashed');
    expect(reparsed.edges[0].label).toBe('cached');
  });

  it('roundtrips dotted style through Coral DSL parse/print', () => {
    const dsl = `service "X"
service "Y"

x -> y [dotted]`;

    const parsed = parseGraphFixture(dsl);
    expect(parsed.edges[0].lineStyle).toBe('dotted');

    const printed = printCoralDSL({
      version: '3.0.0',
      id: 'test',
      nodes: parsed.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
      edges: parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        lineStyle: e.lineStyle,
      })),
    });

    expect(printed).toContain('[dotted]');

    const reparsed = parseGraphFixture(printed);
    expect(reparsed.edges[0].lineStyle).toBe('dotted');
  });

  it('does not output style attribute for solid (default) edges', () => {
    const dsl = `service "A"
service "B"

a -> b [label: "calls"]`;

    const parsed = parseGraphFixture(dsl);
    const printed = printCoralDSL({
      version: '3.0.0',
      id: 'test',
      nodes: parsed.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
      edges: parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        lineStyle: 'solid' as const,
      })),
    });

    // `solid` is emitted so the line style survives a round-trip (R-009 AC-6).
    expect(printed).toContain('[solid, label: "calls"]');
  });
});
