/**
 * Notation Lint Tests
 *
 * Tests for lintAgainstNotation().
 */

import { describe, it, expect } from 'vitest';
import { lintAgainstNotation } from '../../src/llm/notationLint';
import type { GraphNode, GraphEdge } from '../../src/parsers';

describe('lintAgainstNotation', () => {
  describe('node type validity', () => {
    it('accepts valid explicit symbols and rejects foreign, unknown, and type-mismatched symbols', () => {
      const valid = lintAgainstNotation([
        { id: 'lane', type: 'group', label: 'Lane', symbol: 'bpmn-lane' },
      ], [], 'bpmn');
      expect(valid.filter((item) => item.severity === 'error')).toEqual([]);

      for (const symbol of ['arch-service', 'not-a-symbol']) {
        expect(lintAgainstNotation([
          { id: 'bad', type: 'service', label: 'Bad', symbol },
        ], [], 'bpmn')).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: 'notation.node.unsupported-symbol', severity: 'error' }),
        ]));
      }
      const mismatch = lintAgainstNotation([
        { id: 'gateway', type: 'group', label: 'Gateway', symbol: 'bpmn-gateway-parallel' },
      ], [], 'bpmn');
      expect(mismatch).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'notation.node.unsupported-symbol', message: expect.stringContaining('parallelGateway') }),
      ]));
    });

    it('returns no errors for valid architecture types', () => {
      const nodes: GraphNode[] = [
        { id: 'api', type: 'service', label: 'API' },
        { id: 'db', type: 'database', label: 'DB' },
        { id: 'user', type: 'actor', label: 'User' },
      ];
      const results = lintAgainstNotation(nodes, [], 'architecture');
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('returns error for invalid type in aiml notation', () => {
      const nodes: GraphNode[] = [
        { id: 'model', type: 'model', label: 'GPT-4' },
        { id: 'server', type: 'server', label: 'Server' }, // not a valid type
      ];
      const results = lintAgainstNotation(nodes, [], 'aiml');
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: 'notation.node.unsupported-type',
        category: 'capability',
      });
      expect(errors[0].message).toContain('server');
      expect(errors[0].nodeId).toBe('server');
    });

    it('returns no errors for valid aiml types', () => {
      const nodes: GraphNode[] = [
        { id: 'model', type: 'model', label: 'GPT-4' },
        { id: 'llm', type: 'llm', label: 'Claude' },
        { id: 'dataset', type: 'dataset', label: 'Training' },
        { id: 'guardrail', type: 'guardrail', label: 'Safety' },
      ];
      const results = lintAgainstNotation(nodes, [], 'aiml');
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('returns no errors for valid data-engineering types', () => {
      const nodes: GraphNode[] = [
        { id: 'src', type: 'source', label: 'Kafka' },
        { id: 'wh', type: 'warehouse', label: 'Snowflake' },
        { id: 'pipe', type: 'pipeline', label: 'ETL' },
      ];
      const results = lintAgainstNotation(nodes, [], 'data-engineering');
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('accepts base types in any notation', () => {
      const nodes: GraphNode[] = [
        { id: 'svc', type: 'service', label: 'Service' },
        { id: 'db', type: 'database', label: 'DB' },
      ];
      const results = lintAgainstNotation(nodes, [], 'aiml');
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('edge connection warnings', () => {
    it('does not claim an AI/ML symbol-rule warning before its type words are approved', () => {
      const nodes: GraphNode[] = [
        { id: 'ds', type: 'dataset', label: 'Data' },
        { id: 'guard', type: 'guardrail', label: 'Guard' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'ds', target: 'guard' },
      ];
      const results = lintAgainstNotation(nodes, edges, 'aiml');
      const warnings = results.filter(r => r.severity === 'warning');
      expect(warnings).toEqual([]);
    });

    it('returns no warning for valid connection in aiml', () => {
      const nodes: GraphNode[] = [
        { id: 'ds', type: 'dataset', label: 'Data' },
        { id: 'tr', type: 'training', label: 'Train' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'ds', target: 'tr' },
      ];
      const results = lintAgainstNotation(nodes, edges, 'aiml');
      const warnings = results.filter(r => r.severity === 'warning');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('unknown notation', () => {
    it('returns empty for unknown notation', () => {
      const nodes: GraphNode[] = [
        { id: 'x', type: 'whatever', label: 'X' },
      ];
      const results = lintAgainstNotation(nodes, [], 'nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('no notation (default)', () => {
    it('returns empty when no notation provided', () => {
      const nodes: GraphNode[] = [
        { id: 'x', type: 'service', label: 'X' },
      ];
      const results = lintAgainstNotation(nodes, [], '');
      expect(results).toHaveLength(0);
    });
  });
});
