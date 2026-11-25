import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOUNDARY_TARGETS,
  buildTrace,
  replayTrace,
  runBoundaryCampaign,
  shrinkFailingTrace,
  FORMAT_OPEN_KINDS,
  formatOpenInput,
  openDocumentText,
} from './fuzz-model.mjs';

test('the same seed and budgets produce the same bounded trace', () => {
  const options = { seed: 'slice92-unit-seed', target: 'language', cases: 8, maxSize: 32 };
  const first = buildTrace(options);
  const second = buildTrace(options);
  assert.deepEqual(first, second);
  assert.equal(first.actions.length, 8);
  assert.ok(first.actions.every(action => JSON.stringify(action.payload).length <= 256));
  assert.throws(() => buildTrace({ ...options, cases: 0 }), /cases/i);
  assert.throws(() => buildTrace({ ...options, maxSize: 0 }), /maxSize/i);
});

test('a serialized trace replays the same actions in order', async () => {
  const trace = buildTrace({ seed: 'slice92-replay', target: 'graphir', cases: 5, maxSize: 24 });
  const seen = [];
  await replayTrace(JSON.parse(JSON.stringify(trace)), async action => { seen.push(action); });
  assert.deepEqual(seen, trace.actions);
});

test('shrinking finds the shortest failing prefix and minimizes its string payload', async () => {
  const trace = {
    schemaVersion: 1,
    seed: 'controlled-defect',
    target: 'canary',
    budgets: { cases: 4, maxSize: 32, timeoutMs: 1000 },
    actions: [
      { index: 0, operation: 'safe', payload: { text: 'alpha' } },
      { index: 1, operation: 'safe', payload: { text: 'beta' } },
      { index: 2, operation: 'fail', payload: { text: 'prefix-X-suffix' } },
      { index: 3, operation: 'unused', payload: { text: 'omega' } },
    ],
  };
  const fails = async candidate => candidate.actions.some(action =>
    action.operation === 'fail' && action.payload.text.includes('X'));
  const minimized = await shrinkFailingTrace(trace, fails);
  assert.equal(minimized.actions.length, 3);
  assert.equal(minimized.actions[2].payload.text, 'X');
});

test('every non-UI trust-boundary target runs deterministically', async () => {
  assert.deepEqual(BOUNDARY_TARGETS, ['language', 'format-open', 'graphir', 'svg', 'browser']);
  for (const target of BOUNDARY_TARGETS) {
    const result = await runBoundaryCampaign({
      seed: `slice92-${target}`,
      target,
      cases: 4,
      maxSize: 48,
      timeoutMs: 5000,
    });
    assert.equal(result.cases, 4);
    assert.equal(result.failures.length, 0);
    assert.equal(result.trace.actions.length, 4);
  }
});

// Review finding 4: the budget is enforced even when an action never returns.
test('a hung action is terminated at the time budget and names the hanging case', async () => {
  const trace = {
    schemaVersion: 1,
    seed: 'controlled-hang',
    target: 'canary',
    budgets: { cases: 2, maxSize: 8, timeoutMs: 300 },
    actions: [
      { index: 0, operation: 'canary-safe', payload: { text: 'a', variant: 0 } },
      { index: 1, operation: 'canary-hang', payload: { text: 'b', variant: 0 } },
    ],
  };
  const started = Date.now();
  const result = await runBoundaryCampaign({ trace });
  assert.ok(Date.now() - started < 5000, 'the campaign returned promptly');
  assert.deepEqual(result.failures, ['campaign exceeded 300ms; terminated during action 1']);
});

// Review finding 4: format-open generates every format and exercises the
// document open/migration boundary, not only detection of fixed samples.
test('format-open generates every supported input kind around the fuzzed text', () => {
  const kinds = new Set();
  for (let variant = 0; variant < FORMAT_OPEN_KINDS.length; variant += 1) {
    const input = formatOpenInput('Fuzz-Label', variant);
    kinds.add(input.kind);
    // A Mermaid class name must be an identifier, so that kind sanitizes the text.
    const expected = input.kind === 'mermaid-class' ? /Fuzz_Label/ : /Fuzz-Label/;
    if (input.kind !== 'corrupt-document') assert.match(input.source, expected, input.kind);
  }
  assert.deepEqual([...kinds].sort(), [...FORMAT_OPEN_KINDS].sort());
});

test('document open keeps meaning, rejects corruption, and never mutates its input', () => {
  const opened = openDocumentText(formatOpenInput('Kept "label"', FORMAT_OPEN_KINDS.indexOf('coral-document')).source);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.labels, ['Kept "label"-0']);
  const corrupt = openDocumentText(formatOpenInput('x', FORMAT_OPEN_KINDS.indexOf('corrupt-document')).source);
  assert.equal(corrupt.ok, false);
});
