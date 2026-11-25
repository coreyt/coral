/**
 * Test: Mermaid -> Coral conversion -> LLM adjust
 *
 * Simulates what the app does when user has a Mermaid diagram
 * and types a prompt to adjust it.
 */
import { parseMermaidDSL } from '../../src/parsers';
import { printCoralDSL } from '../../src/printer';
import { generate } from '../../src/llm/generate';
import { validateOutput, checkStructuralDrift } from '../../src/llm/validate';

const validateDsl = (dsl: string) => validateOutput(dsl, 'coral');

const apiKey = process.env.LLM_API_KEY;
if (!apiKey) {
  console.error('Set LLM_API_KEY');
  process.exit(1);
}

const mermaidDsl = `flowchart TD
    A[Loading URL failed] --> B[Check console for errors]
    B --> C{Is JSON correct?}
    C -->|Yes| D[Raise GitHub issue]
    C -->|No| E{Someone sent link?}
    E -->|Yes| F[Ask for complete link]
    E -->|No| G{Copied complete URL?}
    G -->|Yes| D
    G -->|No| H[Check browser Timeline]`;

// Step 1: Parse Mermaid (like the app does on render)
const parsed = parseMermaidDSL(mermaidDsl);
console.log('-- Step 1: Parse Mermaid --');
console.log(`Nodes: ${parsed.nodes.map(n => n.id + '="' + n.label + '"').join(', ')}`);
console.log(`Edges: ${parsed.edges.length}`);

// Step 2: Convert to Coral DSL using shared utility
const coralDsl = printCoralDSL({ version: '1.0.0', id: 'current', nodes: parsed.nodes, edges: parsed.edges });
console.log('\n-- Step 2: Converted to Coral DSL --');
console.log(coralDsl);

// Step 3: Validate the converted DSL
const preValidation = validateDsl(coralDsl);
console.log('\n-- Step 3: Pre-validation --');
console.log(`Valid: ${preValidation.valid}, Nodes: ${preValidation.nodeCount} (${preValidation.nodeIds.join(', ')})`);
if (preValidation.errors.length > 0) {
  console.log(`Errors: ${preValidation.errors.map(e => 'L' + e.line + ': ' + e.message).join(', ')}`);
}

// Step 4: Send to LLM for adjustment
console.log('\n-- Step 4: LLM Adjust --');
console.log('Prompt: change is JSON correct to "check JSON"');

const result = await generate({
  prompt: 'change is JSON correct to "check JSON"',
  existingDsl: coralDsl,
  config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey,
  },
});

console.log(`\nSuccess: ${result.success}`);
console.log(`Retries: ${result.retries}`);
console.log(`Drift: ${result.driftDetected}`);
if (result.error) console.log(`Error: ${result.error}`);

if (result.dsl) {
  console.log('\n-- Result DSL --');
  console.log(result.dsl);

  const postValidation = validateDsl(result.dsl);
  console.log(`\nValidation: ${postValidation.valid ? 'PASS' : 'FAIL'}`);
  console.log(`Nodes: ${postValidation.nodeCount} (${postValidation.nodeIds.join(', ')})`);

  const drift = checkStructuralDrift(preValidation.nodeIds, postValidation.nodeIds);
  console.log(`Drift: ${drift.drifted ? 'DRIFTED' : 'OK'} (${drift.lossPercentage}% loss)`);

  const preserved = preValidation.nodeIds.filter(id => postValidation.nodeIds.includes(id));
  const added = postValidation.nodeIds.filter(id => !preValidation.nodeIds.includes(id));
  const removed = preValidation.nodeIds.filter(id => !postValidation.nodeIds.includes(id));
  console.log(`  Preserved: ${preserved.join(', ') || '(none)'}`);
  console.log(`  Added: ${added.join(', ') || '(none)'}`);
  console.log(`  Removed: ${removed.join(', ') || '(none)'}`);
}
