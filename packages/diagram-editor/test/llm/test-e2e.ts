#!/usr/bin/env npx tsx
/**
 * E2E LLM Integration Tests
 *
 * Live integration tests hitting real LLM APIs. Each test has explicit
 * pass/fail assertions with exit code 1 on any failure.
 *
 * Usage: LLM_API_KEY=... npx tsx packages/diagram-editor/test/llm/test-e2e.ts
 *
 * Environment variables:
 *   LLM_API_KEY=<key>                             (required)
 *   LLM_PROVIDER=anthropic|openai|google|mistral  (default: anthropic)
 *   LLM_MODEL=<model-id>                          (default: first model for provider)
 */

import { parseMermaidDSL } from '../../src/parsers';
import { printCoralDSL } from '../../src/printer';
import { generate } from '../../src/llm/generate';
import { validateOutput, checkStructuralDrift } from '../../src/llm/validate';
import { getProvider, getProviders } from '../../src/llm/providers';
import type { LLMConfig, LLMProviderId } from '../../src/llm/types';

const validateDsl = (dsl: string) => validateOutput(dsl, 'coral');
const convertToCoralDsl = (parsed: ReturnType<typeof parseMermaidDSL>) => printCoralDSL({
  version: '1.0.0',
  id: 'current',
  nodes: parsed.nodes,
  edges: parsed.edges,
});

// ── Config ──────────────────────────────────────────────────────────

const provider = (process.env.LLM_PROVIDER || 'anthropic') as LLMProviderId;
const apiKey = process.env.LLM_API_KEY;

if (!apiKey) {
  console.error('ERROR: Set LLM_API_KEY environment variable');
  console.error('Usage: LLM_API_KEY=... npx tsx packages/diagram-editor/test/llm/test-e2e.ts');
  process.exit(1);
}

const providerConfig = getProvider(provider);
if (!providerConfig) {
  console.error(`Unknown provider: ${provider}`);
  console.error(`Available: ${getProviders().map((p) => p.id).join(', ')}`);
  process.exit(1);
}

const model = process.env.LLM_MODEL || providerConfig.models[0].id;
const config: LLMConfig = { provider, model, apiKey };

// ── Assertion Framework ─────────────────────────────────────────────

const failures: string[] = [];
let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  } else {
    passedAssertions++;
    console.log(`  PASS: ${message}`);
  }
}

function hr(label: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(60)}`);
}

// ── Test Fixtures ───────────────────────────────────────────────────

const MERMAID_INPUT = `flowchart TD
    A[API Gateway] --> B[Auth Service]
    B --> C{Is Authenticated?}
    C -->|Yes| D[User Dashboard]
    C -->|No| E[Login Page]
    D --> F[User Database]
    E --> B`;

const CORAL_INPUT = `service "API Gateway"
service "Auth Service"
module "Is Authenticated?"
service "User Dashboard"
service "Login Page"
database "User Database"

api_gateway -> auth_service [label: "routes"]
auth_service -> is_authenticated
is_authenticated -> user_dashboard [label: "Yes"]
is_authenticated -> login_page [label: "No"]
user_dashboard -> user_database [label: "queries"]
login_page -> auth_service [label: "retry"]`;

const MULTI_ROUND_PROMPTS = [
  'Add a rate limiter between API Gateway and Auth Service',
  'Rename User Dashboard to Admin Panel',
  'Add an edge from Admin Panel to User Database with label "reads"',
  'Add a cache service between Auth Service and User Database',
  'Rename Login Page to Sign In',
  'Add a logging service that receives events from API Gateway',
  'Add an edge from Rate Limiter to Logging Service',
  'Rename User Database to PostgreSQL',
  'Add a Redis Cache node connected to Cache Service',
  'Remove the edge from Sign In to Auth Service',
];

// ── Test 5: Mermaid -> Coral -> adjust: rename ─────────────────────

async function test5_mermaidRename(): Promise<void> {
  hr('TEST 5: Mermaid -> Coral -> adjust: rename');

  // Convert Mermaid to Coral
  const parsed = parseMermaidDSL(MERMAID_INPUT);
  const coralDsl = convertToCoralDsl(parsed);
  const preValidation = validateDsl(coralDsl);
  console.log(`  Converted: ${preValidation.nodeCount} nodes, IDs: ${preValidation.nodeIds.join(', ')}`);

  assert(preValidation.valid, 'Pre-conversion DSL is valid');

  // Ask LLM to rename one node
  const result = await generate({
    prompt: 'Rename "User Dashboard" to "Admin Panel"',
    existingDsl: coralDsl,
    config,
  });

  assert(result.success, 'LLM adjust succeeded');

  if (result.dsl) {
    const postValidation = validateDsl(result.dsl);
    assert(postValidation.valid, 'Post-adjust DSL is valid');

    // Renamed node should be present
    assert(
      postValidation.nodeIds.includes('admin_panel'),
      'Renamed node "admin_panel" is present',
    );

    // Original nodes (except renamed) should be preserved
    const otherOriginals = preValidation.nodeIds.filter((id) => id !== 'user_dashboard');
    const preserved = otherOriginals.filter((id) => postValidation.nodeIds.includes(id));
    assert(
      preserved.length === otherOriginals.length,
      `All other original nodes preserved (${preserved.length}/${otherOriginals.length})`,
    );

    // Drift check: should not be drifted
    const drift = checkStructuralDrift(preValidation.nodeIds, postValidation.nodeIds);
    assert(!drift.drifted, `No structural drift (${drift.lossPercentage}% loss)`);
  }
}

// ── Test 6: Mermaid -> Coral -> adjust: add node ───────────────────

async function test6_mermaidAddNode(): Promise<void> {
  hr('TEST 6: Mermaid -> Coral -> adjust: add node');

  const parsed = parseMermaidDSL(MERMAID_INPUT);
  const coralDsl = convertToCoralDsl(parsed);
  const preValidation = validateDsl(coralDsl);
  console.log(`  Converted: ${preValidation.nodeCount} nodes`);

  assert(preValidation.valid, 'Pre-conversion DSL is valid');

  const result = await generate({
    prompt: 'Add a rate limiter service between API Gateway and Auth Service',
    existingDsl: coralDsl,
    config,
  });

  assert(result.success, 'LLM adjust succeeded');

  if (result.dsl) {
    const postValidation = validateDsl(result.dsl);
    assert(postValidation.valid, 'Post-adjust DSL is valid');

    // All original nodes should be preserved
    const preserved = preValidation.nodeIds.filter((id) => postValidation.nodeIds.includes(id));
    assert(
      preserved.length === preValidation.nodeIds.length,
      `All original nodes preserved (${preserved.length}/${preValidation.nodeIds.length})`,
    );

    // At least 1 new node
    assert(
      postValidation.nodeCount > preValidation.nodeCount,
      `New node added (${postValidation.nodeCount} > ${preValidation.nodeCount})`,
    );

    // Drift check
    const drift = checkStructuralDrift(preValidation.nodeIds, postValidation.nodeIds);
    assert(!drift.drifted, `No structural drift (${drift.lossPercentage}% loss)`);
  }
}

// ── Test 7: Coral native -> adjust: modify edge ────────────────────

async function test7_coralModifyEdge(): Promise<void> {
  hr('TEST 7: Coral native -> adjust: modify edge');

  const preValidation = validateDsl(CORAL_INPUT);
  console.log(`  Input: ${preValidation.nodeCount} nodes, IDs: ${preValidation.nodeIds.join(', ')}`);

  assert(preValidation.valid, 'Input DSL is valid');

  const result = await generate({
    prompt: 'Change the label on the edge from api_gateway to auth_service from "routes" to "forwards requests"',
    existingDsl: CORAL_INPUT,
    config,
  });

  assert(result.success, 'LLM adjust succeeded');

  if (result.dsl) {
    const postValidation = validateDsl(result.dsl);
    assert(postValidation.valid, 'Post-adjust DSL is valid');

    // All nodes preserved
    const preserved = preValidation.nodeIds.filter((id) => postValidation.nodeIds.includes(id));
    assert(
      preserved.length === preValidation.nodeIds.length,
      `All nodes preserved (${preserved.length}/${preValidation.nodeIds.length})`,
    );

    // Edge label changed
    assert(
      result.dsl.includes('forwards requests'),
      'Edge label "forwards requests" is present',
    );

    // Drift check
    const drift = checkStructuralDrift(preValidation.nodeIds, postValidation.nodeIds);
    assert(!drift.drifted, `No structural drift (${drift.lossPercentage}% loss)`);
  }
}

// ── Test 8: Generate -> 1 adjust ───────────────────────────────────

async function test8_generateThenAdjust(): Promise<void> {
  hr('TEST 8: Generate -> 1 adjust');

  // Fresh generate
  console.log('  Generating from prompt...');
  const genResult = await generate({
    prompt: 'Create a web application architecture with: API Gateway, Auth Service, User Dashboard, Login Page, and User Database',
    config,
  });

  assert(genResult.success, 'Generate succeeded');

  if (!genResult.dsl) {
    console.log('  SKIP: No DSL generated, cannot run adjust test');
    return;
  }

  const genValidation = validateDsl(genResult.dsl);
  assert(genValidation.valid, 'Generated DSL is valid');
  assert(genValidation.nodeCount >= 3, `Generated >= 3 nodes (got ${genValidation.nodeCount})`);
  console.log(`  Generated: ${genValidation.nodeCount} nodes`);

  // Adjust
  console.log('  Adjusting: add a cache service...');
  const adjResult = await generate({
    prompt: 'Add a cache service between Auth Service and User Database',
    existingDsl: genResult.dsl,
    config,
  });

  assert(adjResult.success, 'Adjust succeeded');

  if (adjResult.dsl) {
    const adjValidation = validateDsl(adjResult.dsl);
    assert(adjValidation.valid, 'Adjusted DSL is valid');

    // Should preserve most original nodes
    const drift = checkStructuralDrift(genValidation.nodeIds, adjValidation.nodeIds);
    assert(!drift.drifted, `No structural drift (${drift.lossPercentage}% loss)`);
  }
}

// ── Test 9: Generate -> 3 sequential adjusts ───────────────────────

async function test9_threeAdjusts(): Promise<void> {
  hr('TEST 9: Generate -> 3 sequential adjusts');

  // Fresh generate
  console.log('  Generating from prompt...');
  const genResult = await generate({
    prompt: 'Create a web application architecture with: API Gateway, Auth Service, User Dashboard, Login Page, and User Database',
    config,
  });

  assert(genResult.success, 'Generate succeeded');

  if (!genResult.dsl) {
    console.log('  SKIP: No DSL generated');
    return;
  }

  const genValidation = validateDsl(genResult.dsl);
  assert(genValidation.valid, 'Generated DSL is valid');
  const baselineNodeCount = genValidation.nodeCount;
  const baselineNodeIds = genValidation.nodeIds;
  console.log(`  Baseline: ${baselineNodeCount} nodes`);

  let currentDsl = genResult.dsl;

  for (let i = 0; i < 3; i++) {
    const prompt = MULTI_ROUND_PROMPTS[i];
    console.log(`\n  Round ${i + 1}: "${prompt}"`);

    const result = await generate({
      prompt,
      existingDsl: currentDsl,
      config,
    });

    assert(result.success, `Round ${i + 1} succeeded`);

    if (!result.dsl) {
      console.log(`  SKIP: Round ${i + 1} produced no DSL, stopping`);
      break;
    }

    const validation = validateDsl(result.dsl);
    assert(validation.valid, `Round ${i + 1} DSL is valid`);

    // Check cumulative drift from baseline
    const drift = checkStructuralDrift(baselineNodeIds, validation.nodeIds);
    assert(
      drift.lossPercentage <= 10,
      `Round ${i + 1} cumulative drift <= 10% (got ${drift.lossPercentage}%)`,
    );

    console.log(`  -> ${validation.nodeCount} nodes, ${drift.lossPercentage}% drift`);
    currentDsl = result.dsl;
  }
}

// ── Test 10: Generate -> 10 sequential adjusts ─────────────────────

async function test10_tenAdjusts(): Promise<void> {
  hr('TEST 10: Generate -> 10 sequential adjusts (stability)');

  // Fresh generate
  console.log('  Generating from prompt...');
  const genResult = await generate({
    prompt: 'Create a web application architecture with: API Gateway, Auth Service, User Dashboard, Login Page, and User Database',
    config,
  });

  assert(genResult.success, 'Generate succeeded');

  if (!genResult.dsl) {
    console.log('  SKIP: No DSL generated');
    return;
  }

  const genValidation = validateDsl(genResult.dsl);
  assert(genValidation.valid, 'Generated DSL is valid');
  const baselineNodeCount = genValidation.nodeCount;
  const baselineNodeIds = genValidation.nodeIds;
  console.log(`  Baseline: ${baselineNodeCount} nodes`);

  let currentDsl = genResult.dsl;
  const metrics: Array<{ round: number; nodeCount: number; driftPct: number; parseErrors: number }> = [];

  for (let i = 0; i < 10; i++) {
    const prompt = MULTI_ROUND_PROMPTS[i];
    console.log(`\n  Round ${i + 1}: "${prompt}"`);

    const result = await generate({
      prompt,
      existingDsl: currentDsl,
      config,
    });

    if (!result.success) {
      console.log(`  Round ${i + 1} FAILED: ${result.error}`);
      // Record failure but continue with previous DSL
      metrics.push({ round: i + 1, nodeCount: -1, driftPct: -1, parseErrors: -1 });
      continue;
    }

    if (!result.dsl) {
      console.log(`  Round ${i + 1}: no DSL returned`);
      metrics.push({ round: i + 1, nodeCount: -1, driftPct: -1, parseErrors: -1 });
      continue;
    }

    const validation = validateDsl(result.dsl);
    const drift = checkStructuralDrift(baselineNodeIds, validation.nodeIds);

    metrics.push({
      round: i + 1,
      nodeCount: validation.nodeCount,
      driftPct: drift.lossPercentage,
      parseErrors: validation.errors.length,
    });

    console.log(`  -> ${validation.nodeCount} nodes, ${drift.lossPercentage}% drift, ${validation.errors.length} errors`);
    currentDsl = result.dsl;
  }

  // Print metrics table
  console.log('\n  Metrics Summary:');
  console.log('  Round | Nodes | Drift% | Parse Errors');
  console.log('  ------|-------|--------|-------------');
  for (const m of metrics) {
    console.log(`  ${String(m.round).padStart(5)} | ${String(m.nodeCount).padStart(5)} | ${String(m.driftPct).padStart(5)}% | ${m.parseErrors}`);
  }

  // Final assertions
  const finalValidation = validateDsl(currentDsl);
  assert(finalValidation.valid, 'Final DSL is valid');

  const finalDrift = checkStructuralDrift(baselineNodeIds, finalValidation.nodeIds);
  assert(
    finalDrift.lossPercentage <= 20,
    `Final cumulative drift <= 20% (got ${finalDrift.lossPercentage}%)`,
  );

  assert(
    finalValidation.errors.length === 0,
    `Final DSL has 0 parse errors (got ${finalValidation.errors.length})`,
  );
}

// ── Runner ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  Coral E2E LLM Integration Tests         ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`Provider: ${providerConfig!.name} (${model})\n`);

  await test5_mermaidRename();
  await test6_mermaidAddNode();
  await test7_coralModifyEdge();
  await test8_generateThenAdjust();
  await test9_threeAdjusts();
  await test10_tenAdjusts();

  // Summary
  hr('RESULTS');
  console.log(`  Total assertions: ${totalAssertions}`);
  console.log(`  Passed: ${passedAssertions}`);
  console.log(`  Failed: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n  All tests passed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
