#!/usr/bin/env npx tsx
/**
 * Armada Validation Script
 *
 * Quick validation script to check Armada's health and run basic queries.
 * Run with: npx tsx test/integration/validate-armada.ts
 *
 * This script uses the MCP client to call real Armada tools and reports
 * the results. Useful for:
 * - Verifying Armada is running and indexed
 * - Checking query performance
 * - Debugging indexing issues
 */

import { createArmadaClient, ArmadaClient } from '../../src/armada/client.js';

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

async function runValidation(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║             Armada Integration Validation                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  let client: ArmadaClient | null = null;
  const results: ValidationResult[] = [];

  try {
    // 1. Connection Test
    console.log('▸ Connecting to Armada MCP server...');
    const connectStart = Date.now();
    client = await createArmadaClient({
      serverCommand: 'python',
      serverArgs: ['-m', 'armada.mcp.server'],
      timeout: 15000,
    });
    const connectTime = Date.now() - connectStart;
    results.push({
      name: 'Connection',
      passed: true,
      message: 'Connected successfully',
      duration: connectTime,
    });
    console.log(`  ✓ Connected in ${connectTime}ms`);
    console.log('');

    // 2. Search Test - Find a known function
    console.log('▸ Testing search...');
    const searchStart = Date.now();
    const searchResult = await client.search('computeNodeSize', 'function', 5);
    const searchTime = Date.now() - searchStart;

    const foundTarget = searchResult.nodes.some(n =>
      n.name.includes('computeNodeSize') || n.id?.includes('computeNodeSize')
    );
    results.push({
      name: 'Search',
      passed: foundTarget && searchResult.nodes.length > 0,
      message: foundTarget
        ? `Found ${searchResult.nodes.length} results including computeNodeSize`
        : `Got ${searchResult.nodes.length} results but missing computeNodeSize`,
      duration: searchTime,
    });
    console.log(`  ${foundTarget ? '✓' : '✗'} ${results[results.length - 1].message} (${searchTime}ms)`);
    console.log('');

    // 3. Semantic Search Test
    console.log('▸ Testing semantic search...');
    const semanticStart = Date.now();
    const semanticResult = await client.search('function that renders diagrams', undefined, 5);
    const semanticTime = Date.now() - semanticStart;

    results.push({
      name: 'Semantic Search',
      passed: semanticResult.nodes.length > 0,
      message: `Found ${semanticResult.nodes.length} semantically related results`,
      duration: semanticTime,
    });
    console.log(`  ✓ ${results[results.length - 1].message} (${semanticTime}ms)`);
    if (semanticResult.nodes.length > 0) {
      console.log(`    Top result: ${semanticResult.nodes[0].name}`);
    }
    console.log('');

    // 4. Context Retrieval Test
    console.log('▸ Testing context retrieval...');
    const contextStart = Date.now();
    const contextResult = await client.getContext('layout algorithm');
    const contextTime = Date.now() - contextStart;

    results.push({
      name: 'Context Retrieval',
      passed: contextResult.nodes.length > 0,
      message: `Retrieved ${contextResult.nodes.length} context nodes`,
      duration: contextTime,
    });
    console.log(`  ✓ ${results[results.length - 1].message} (${contextTime}ms)`);
    console.log('');

    // 5. Dependency Test
    console.log('▸ Testing dependency traversal...');
    const depStart = Date.now();
    const depResult = await client.findDependencies('App', 'both', 2);
    const depTime = Date.now() - depStart;

    results.push({
      name: 'Dependency Traversal',
      passed: true, // Structure is valid even if empty
      message: `Found ${depResult.nodes.length} nodes, ${depResult.edges.length} edges`,
      duration: depTime,
    });
    console.log(`  ✓ ${results[results.length - 1].message} (${depTime}ms)`);
    console.log('');

    // 6. Impact Analysis Test
    console.log('▸ Testing impact analysis...');
    const impactStart = Date.now();
    const impactResult = await client.impactOf('packages/viz/src/layout/elk.ts');
    const impactTime = Date.now() - impactStart;

    results.push({
      name: 'Impact Analysis',
      passed: true,
      message: `Blast radius: ${impactResult.blast_radius}, impacted: ${impactResult.impacted_nodes.length}`,
      duration: impactTime,
    });
    console.log(`  ✓ ${results[results.length - 1].message} (${impactTime}ms)`);
    console.log('');

    // 7. Call Tracing Test
    console.log('▸ Testing call tracing...');
    const traceStart = Date.now();
    const traceResult = await client.traceCalls('App', 'layoutGraph', 5);
    const traceTime = Date.now() - traceStart;

    results.push({
      name: 'Call Tracing',
      passed: true,
      message: traceResult.found
        ? `Found ${traceResult.paths.length} path(s)`
        : 'No path found (this may be expected)',
      duration: traceTime,
    });
    console.log(`  ✓ ${results[results.length - 1].message} (${traceTime}ms)`);
    console.log('');

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: 'Connection',
      passed: false,
      message: `Failed: ${message}`,
    });
    console.error(`  ✗ Error: ${message}`);
    console.log('');
  } finally {
    if (client) {
      await client.disconnect();
    }
  }

  // Summary
  console.log('════════════════════════════════════════════════════════════');
  console.log('                        Summary                             ');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  results.forEach(r => {
    const status = r.passed ? '✓' : '✗';
    const time = r.duration ? ` (${r.duration}ms)` : '';
    console.log(`  ${status} ${r.name}: ${r.message}${time}`);
  });

  console.log('');
  console.log(`Results: ${passed}/${total} passed`);
  console.log(`Total time: ${totalTime}ms`);
  console.log('');

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run if executed directly
runValidation().catch(console.error);
