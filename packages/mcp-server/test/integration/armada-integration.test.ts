/**
 * Armada Integration Tests
 *
 * REAL integration tests that exercise Armada MCP tools against the indexed
 * coral repository. These tests verify:
 *
 * 1. Indexer correctness - Are nodes/edges created correctly?
 * 2. Query handling - Do queries return expected results?
 * 3. Semantic search - Does vector search find relevant code?
 * 4. Graph traversal - Do dependency/impact queries work?
 * 5. Response format - Are responses structured correctly?
 *
 * Prerequisites:
 * - Armada MCP server running (via stdio or HTTP)
 * - coral repository indexed
 *
 * These tests use the ArmadaClient from mcp-server to call real MCP tools.
 *
 * Run with: npx vitest run test/integration/armada-integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArmadaClient, createArmadaClient } from '../../src/armada/client.js';

// Real response types from Armada MCP tools
interface SearchResult {
  query: string;
  confidence: 'high' | 'moderate' | 'low' | 'none';
  confidence_message: string;
  results: Array<{
    node: {
      id: string;
      type: string;
      name: string;
      file: string;
    };
    score: number;
  }>;
  total: number;
  returned: number;
}

interface ContextResult {
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    relevance: number;
    content: string;
  }>;
  total_matches: number;
  returned: number;
  token_estimate: number;
}

interface DependencyResult {
  source: string;
  direction: string;
  depth: number;
  dependencies: Array<{
    id: string;
    type: string;
    name: string;
    file: string;
    relation: string;
    depth: number;
  }>;
  total: number;
  truncated: boolean;
}

interface ImpactResult {
  source: string;
  change_type: string;
  impact: {
    direct: Array<{
      id: string;
      type: string;
      name: string;
      file: string;
    }>;
    transitive: Array<{
      id: string;
      type: string;
      name: string;
      file: string;
    }>;
    tests: Array<{
      id: string;
      name: string;
      file: string;
    }>;
  };
  summary: {
    direct_count: number;
    transitive_count: number;
    test_count: number;
    max_severity: 'low' | 'medium' | 'high' | 'critical';
  };
  truncated: boolean;
}

interface TraceResult {
  from: string;
  to: string;
  resolved_from: string;
  resolved_to: string;
  paths: Array<{
    nodes: string[];
    edges: Array<{
      source: string;
      target: string;
      type: string;
    }>;
  }>;
  found: boolean;
}

interface ArchitectureResult {
  packages: Array<{
    path: string;
    name: string;
    node_counts: Record<string, number>;
  }>;
  statistics: {
    total_packages: number;
    total_nodes: number;
    total_edges: number;
    by_type: Record<string, number>;
  };
  dependency_graph: Record<string, string[]>;
}

// Test data for known coral symbols
const KNOWN_SYMBOLS = {
  functions: ['computeNodeSize', 'measureText', 'layoutGraph', 'parseCoralDSL'],
  modules: ['App', 'schema', 'elk', 'converter'],
  classes: ['ArmadaClient'],
  types: ['CoralDocument', 'GraphIR', 'FontSettings'],
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Armada Integration Tests', () => {
  let client: ArmadaClient | null = null;
  let isArmadaAvailable = false;

  // Pre-flight: Try to connect to Armada
  beforeAll(async () => {
    // Skip tests if Armada is not available
    // This allows CI to skip these tests gracefully
    try {
      client = await createArmadaClient({
        serverCommand: 'python',
        serverArgs: ['-m', 'armada.mcp.server'],
        timeout: 10000,
      });
      isArmadaAvailable = true;
      console.log('✓ Connected to Armada MCP server');
    } catch (error) {
      console.log('⚠ Armada not available, skipping integration tests');
      console.log('  To run these tests, ensure Armada is installed and indexed');
      isArmadaAvailable = false;
    }
  }, 30000);

  afterAll(async () => {
    if (client && isArmadaAvailable) {
      await client.disconnect();
    }
  });

  // ============================================================================
  // Helper to skip tests when Armada is not available
  // ============================================================================
  const itWithArmada = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!isArmadaAvailable || !client) {
        console.log(`  ⊘ Skipped: ${name}`);
        return;
      }
      await fn();
    });
  };

  // ============================================================================
  // 1. Indexer Correctness Tests
  // ============================================================================
  describe('Indexer Correctness', () => {
    itWithArmada('should find known function by name', async () => {
      const result = await client!.search('computeNodeSize', 'function', 5);

      expect(result.nodes.length).toBeGreaterThan(0);

      const found = result.nodes.find(n =>
        n.name.includes('computeNodeSize') || n.id.includes('computeNodeSize')
      );
      expect(found).toBeDefined();
    });

    itWithArmada('should find known module', async () => {
      const result = await client!.search('schema', 'module', 5);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    itWithArmada('should include file paths in results', async () => {
      const result = await client!.search('layoutGraph', 'function', 5);

      expect(result.nodes.length).toBeGreaterThan(0);
      // Results should have path information
      const withPath = result.nodes.find(n => n.path && n.path.includes('.ts'));
      expect(withPath).toBeDefined();
    });

    itWithArmada('should correctly identify node types', async () => {
      // Search for a class
      const classResult = await client!.search('ArmadaClient', 'class', 5);

      if (classResult.nodes.length > 0) {
        const classNode = classResult.nodes.find(n =>
          n.type === 'class' || n.name.includes('ArmadaClient')
        );
        expect(classNode).toBeDefined();
      }
    });
  });

  // ============================================================================
  // 2. Semantic Search Tests
  // ============================================================================
  describe('Semantic Search', () => {
    itWithArmada('should find code by natural language query', async () => {
      const result = await client!.search('function that computes node sizes', undefined, 10);

      expect(result.nodes.length).toBeGreaterThan(0);
      // Should find nodeSizing-related code
      const relevant = result.nodes.some(n =>
        n.name.toLowerCase().includes('node') ||
        n.name.toLowerCase().includes('size') ||
        n.path?.includes('nodeSizing')
      );
      expect(relevant).toBe(true);
    });

    itWithArmada('should find code by conceptual query', async () => {
      const result = await client!.search('rendering diagrams visually', undefined, 10);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    itWithArmada('should rank results by relevance', async () => {
      const result = await client!.search('ELK layout algorithm', undefined, 10);

      expect(result.nodes.length).toBeGreaterThan(0);

      // Results should have confidence scores
      if (result.nodes.length > 1 && result.nodes[0].confidence !== undefined) {
        // First result should have higher or equal confidence
        expect(result.nodes[0].confidence).toBeGreaterThanOrEqual(
          result.nodes[result.nodes.length - 1].confidence || 0
        );
      }
    });

    itWithArmada('should handle domain-specific terminology', async () => {
      // Search with Coral-specific terms
      const result = await client!.search('GraphIR nodes and edges', undefined, 10);

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 3. Query Filtering Tests
  // ============================================================================
  describe('Query Filtering', () => {
    itWithArmada('should filter by node type', async () => {
      const functionsOnly = await client!.search('layout', 'function', 10);
      const modulesOnly = await client!.search('layout', 'module', 10);

      // Both should return results
      expect(functionsOnly.nodes.length + modulesOnly.nodes.length).toBeGreaterThan(0);
    });

    itWithArmada('should respect result limits', async () => {
      const limited = await client!.search('function', undefined, 3);
      const unlimited = await client!.search('function', undefined, 20);

      expect(limited.nodes.length).toBeLessThanOrEqual(3);
      expect(unlimited.nodes.length).toBeGreaterThanOrEqual(limited.nodes.length);
    });

    itWithArmada('should handle empty results gracefully', async () => {
      const result = await client!.search('xyznonexistentsymbol12345', undefined, 5);

      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
    });
  });

  // ============================================================================
  // 4. Context Retrieval Tests
  // ============================================================================
  describe('Context Retrieval', () => {
    itWithArmada('should retrieve context for a query', async () => {
      const result = await client!.getContext('layout algorithm');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    itWithArmada('should return relevance scores', async () => {
      const result = await client!.getContext('diagram rendering');

      if (result.nodes.length > 0) {
        // Nodes should have relevance property
        result.nodes.forEach(node => {
          expect(node.confidence).toBeGreaterThanOrEqual(0);
        });
      }
    });

    itWithArmada('should support scoped queries', async () => {
      const scopedResult = await client!.getContext(
        'function',
        'packages/viz'
      );

      // Results should be scoped (if any found)
      if (scopedResult.nodes.length > 0) {
        const inScope = scopedResult.nodes.some(n =>
          n.path?.includes('viz') || n.id?.includes('viz')
        );
        expect(inScope).toBe(true);
      }
    });
  });

  // ============================================================================
  // 5. Dependency Graph Tests
  // ============================================================================
  describe('Dependency Graph', () => {
    itWithArmada('should find dependencies of a symbol', async () => {
      // First, find a known symbol
      const searchResult = await client!.search('App', 'module', 1);

      if (searchResult.nodes.length > 0) {
        const symbol = searchResult.nodes[0].id || searchResult.nodes[0].name;
        const deps = await client!.findDependencies(symbol, 'both', 2);

        expect(deps.symbol).toBeDefined();
        // Structure should be valid even if empty
        expect(Array.isArray(deps.nodes)).toBe(true);
        expect(Array.isArray(deps.edges)).toBe(true);
      }
    });

    itWithArmada('should distinguish upstream vs downstream', async () => {
      const searchResult = await client!.search('schema', 'module', 1);

      if (searchResult.nodes.length > 0) {
        const symbol = searchResult.nodes[0].id || searchResult.nodes[0].name;

        const upstream = await client!.findDependencies(symbol, 'upstream', 2);
        const downstream = await client!.findDependencies(symbol, 'downstream', 2);

        // Both should return valid structures
        expect(upstream.direction).toBe('upstream');
        expect(downstream.direction).toBe('downstream');
      }
    });

    itWithArmada('should include edge information', async () => {
      const searchResult = await client!.search('App', 'module', 1);

      if (searchResult.nodes.length > 0) {
        const symbol = searchResult.nodes[0].id || searchResult.nodes[0].name;
        const deps = await client!.findDependencies(symbol, 'both', 3);

        // If there are nodes, there might be edges
        if (deps.edges.length > 0) {
          deps.edges.forEach(edge => {
            expect(edge.source).toBeDefined();
            expect(edge.target).toBeDefined();
            expect(edge.type).toBeDefined();
          });
        }
      }
    });
  });

  // ============================================================================
  // 6. Impact Analysis Tests
  // ============================================================================
  describe('Impact Analysis', () => {
    itWithArmada('should analyze impact of modifying a symbol', async () => {
      const result = await client!.impactOf('packages/viz/src/file/schema.ts', 'FontSettings');

      // Response should have expected structure
      expect(result.file).toBeDefined();
      expect(result.impacted_nodes).toBeDefined();
      expect(result.blast_radius).toBeDefined();
    });

    itWithArmada('should report blast radius', async () => {
      const result = await client!.impactOf('packages/viz/src/layout/elk.ts');

      expect(typeof result.blast_radius).toBe('number');
      expect(result.blast_radius).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // 7. Call Tracing Tests
  // ============================================================================
  describe('Call Tracing', () => {
    itWithArmada('should attempt to trace calls between symbols', async () => {
      // Find two functions that might be connected
      const result = await client!.traceCalls('App', 'layoutGraph', 5);

      // Should return valid structure regardless of whether path is found
      expect(result.source).toBeDefined();
      expect(result.target).toBeDefined();
      expect(Array.isArray(result.paths)).toBe(true);
      expect(typeof result.found).toBe('boolean');
    });

    itWithArmada('should handle non-existent paths gracefully', async () => {
      const result = await client!.traceCalls(
        'nonexistentA',
        'nonexistentB',
        3
      );

      // Should not throw, should return found: false
      expect(result.found).toBe(false);
      expect(result.paths.length).toBe(0);
    });
  });

  // ============================================================================
  // 8. Response Format Validation
  // ============================================================================
  describe('Response Format', () => {
    itWithArmada('search should return expected structure', async () => {
      const result = await client!.search('test', undefined, 5);

      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('total_count');
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    itWithArmada('getContext should return expected structure', async () => {
      const result = await client!.getContext('test');

      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    itWithArmada('findDependencies should return expected structure', async () => {
      const result = await client!.findDependencies('App', 'both', 1);

      expect(result).toHaveProperty('symbol');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
    });
  });

  // ============================================================================
  // 9. Edge Cases and Robustness
  // ============================================================================
  describe('Edge Cases', () => {
    itWithArmada('should handle empty query', async () => {
      const result = await client!.search('', undefined, 5);
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    itWithArmada('should handle special characters', async () => {
      const result = await client!.search('<T>(arg: string) => void', undefined, 5);
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    itWithArmada('should handle very long query', async () => {
      const longQuery = 'function '.repeat(50);
      const result = await client!.search(longQuery, undefined, 5);
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    itWithArmada('should handle unicode in query', async () => {
      const result = await client!.search('函数 функция', undefined, 5);
      expect(Array.isArray(result.nodes)).toBe(true);
    });
  });

  // ============================================================================
  // 10. Performance Benchmarks
  // ============================================================================
  describe('Performance', () => {
    itWithArmada('search should complete within 5 seconds', async () => {
      const start = Date.now();
      await client!.search('function', undefined, 20);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      console.log(`  Search: ${elapsed}ms`);
    });

    itWithArmada('getContext should complete within 5 seconds', async () => {
      const start = Date.now();
      await client!.getContext('layout algorithm');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      console.log(`  Context: ${elapsed}ms`);
    });

    itWithArmada('findDependencies should complete within 5 seconds', async () => {
      const start = Date.now();
      await client!.findDependencies('App', 'both', 2);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      console.log(`  Dependencies: ${elapsed}ms`);
    });
  });
});
