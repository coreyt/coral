#!/usr/bin/env npx tsx
/**
 * Live LLM Test Script
 *
 * Runs the same prompt → fetch → validate → drift pipeline as the browser app.
 * Usage: npx tsx packages/diagram-editor/test/llm/test-live.ts
 *
 * Set environment variables:
 *   LLM_PROVIDER=anthropic|openai|google|mistral  (default: anthropic)
 *   LLM_MODEL=<model-id>                          (default: first model for provider)
 *   LLM_API_KEY=<key>                             (required)
 */

import { getProvider, getProviders } from '../../src/llm/providers';
import { composeSystemPrompt } from '../../src/llm/prompt';
import { validateOutput, checkStructuralDrift } from '../../src/llm/validate';
import { generate } from '../../src/llm/generate';
import type { LLMConfig, LLMProviderId } from '../../src/llm/types';

const validateDsl = (dsl: string) => validateOutput(dsl, 'coral');

// ── Config ──────────────────────────────────────────────────────────

const provider = (process.env.LLM_PROVIDER || 'anthropic') as LLMProviderId;
const apiKey = process.env.LLM_API_KEY;

if (!apiKey) {
  console.error('ERROR: Set LLM_API_KEY environment variable');
  console.error('Usage: LLM_API_KEY=sk-... npx tsx packages/diagram-editor/test/llm/test-live.ts');
  process.exit(1);
}

const providerConfig = getProvider(provider);
if (!providerConfig) {
  console.error(`Unknown provider: ${provider}`);
  console.error(`Available: ${getProviders().map(p => p.id).join(', ')}`);
  process.exit(1);
}

const model = process.env.LLM_MODEL || providerConfig.models[0].id;
const config: LLMConfig = { provider, model, apiKey };

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  Coral LLM Live Test                 ║`);
console.log(`╚══════════════════════════════════════╝`);
console.log(`Provider: ${providerConfig.name} (${model})\n`);

// ── Helpers ─────────────────────────────────────────────────────────

function hr(label: string) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(50)}`);
}

function printDslPreview(dsl: string, maxLines = 20) {
  const lines = dsl.split('\n');
  const preview = lines.slice(0, maxLines).join('\n');
  console.log(preview);
  if (lines.length > maxLines) {
    console.log(`  ... (${lines.length - maxLines} more lines)`);
  }
}

// ── Test 1: Fresh Generation ────────────────────────────────────────

async function testGenerate() {
  hr('TEST 1: Fresh Generation');
  console.log('Prompt: "Create a login flow with auth service, user database, and email verification"\n');

  const result = await generate({
    prompt: 'Create a login flow with auth service, user database, and email verification',
    config,
  });

  console.log(`Success: ${result.success}`);
  console.log(`Retries: ${result.retries}`);
  console.log(`Drift: ${result.driftDetected}`);
  if (result.error) console.log(`Error: ${result.error}`);

  if (result.dsl) {
    console.log(`\nGenerated DSL:`);
    printDslPreview(result.dsl);

    const validation = validateDsl(result.dsl);
    console.log(`\nValidation: ${validation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Nodes: ${validation.nodeCount} (${validation.nodeIds.join(', ')})`);
    if (validation.errors.length > 0) {
      console.log(`Errors: ${validation.errors.map(e => `L${e.line}: ${e.message}`).join(', ')}`);
    }
  }

  return result;
}

// ── Test 2: Adjust (add a node) ─────────────────────────────────────

async function testAdjust(existingDsl: string) {
  hr('TEST 2: Adjust — Add a node');
  console.log('Existing DSL has these nodes:');
  const existing = validateDsl(existingDsl);
  console.log(`  ${existing.nodeIds.join(', ')}`);
  console.log('Prompt: "Add a rate limiter service between the client and the API"\n');

  const result = await generate({
    prompt: 'Add a rate limiter service between the client and the API',
    existingDsl,
    config,
  });

  console.log(`Success: ${result.success}`);
  console.log(`Retries: ${result.retries}`);
  console.log(`Drift: ${result.driftDetected}`);
  if (result.error) console.log(`Error: ${result.error}`);

  if (result.dsl) {
    console.log(`\nAdjusted DSL:`);
    printDslPreview(result.dsl);

    const validation = validateDsl(result.dsl);
    console.log(`\nValidation: ${validation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Nodes: ${validation.nodeCount} (${validation.nodeIds.join(', ')})`);

    // Drift check
    const drift = checkStructuralDrift(existing.nodeIds, validation.nodeIds);
    console.log(`Drift check: ${drift.drifted ? 'DRIFTED' : 'OK'} (${drift.lossPercentage}% loss)`);

    // Show which nodes were preserved/added/removed
    const preserved = existing.nodeIds.filter(id => validation.nodeIds.includes(id));
    const added = validation.nodeIds.filter(id => !existing.nodeIds.includes(id));
    const removed = existing.nodeIds.filter(id => !validation.nodeIds.includes(id));
    console.log(`  Preserved: ${preserved.join(', ') || '(none)'}`);
    console.log(`  Added: ${added.join(', ') || '(none)'}`);
    console.log(`  Removed: ${removed.join(', ') || '(none)'}`);

    if (validation.errors.length > 0) {
      console.log(`Errors: ${validation.errors.map(e => `L${e.line}: ${e.message}`).join(', ')}`);
    }
  }

  return result;
}

// ── Test 3: Raw prompt inspection ───────────────────────────────────

function testPromptInspection() {
  hr('TEST 3: Prompt Inspection');

  const sysGenerate = composeSystemPrompt('generate');
  const sysAdjust = composeSystemPrompt('adjust', 'service "A"\nservice "B"\na -> b');

  console.log(`System prompt (generate mode): ${sysGenerate.length} chars`);
  console.log(`System prompt (adjust mode): ${sysAdjust.length} chars`);
  console.log(`\nGenerate system prompt preview (first 500 chars):`);
  console.log(sysGenerate.slice(0, 500));
  console.log('...');
}

// ── Run ─────────────────────────────────────────────────────────────

async function main() {
  testPromptInspection();

  const genResult = await testGenerate();

  if (genResult.success && genResult.dsl) {
    await testAdjust(genResult.dsl);
  } else {
    // Use a known-good DSL for adjust test
    const fallbackDsl = [
      'service "API Gateway"',
      'service "Auth Service"',
      'database "User DB"',
      '',
      'api_gateway -> auth_service [label: "authenticates"]',
      'auth_service -> user_db [label: "queries"]',
    ].join('\n');
    await testAdjust(fallbackDsl);
  }

  hr('DONE');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
