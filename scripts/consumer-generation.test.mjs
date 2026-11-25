import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConsumerGeneration } from './consumer-generation.mjs';

test('Coral 0.2.8 Core 0.2.3 preserves the GraphIR 3 compatibility API generation', () => {
  assert.deepEqual(resolveConsumerGeneration({ artifactVersion: '0.2.8', rootVersion: '0.2.8',
    rootCoreVersion: '0.2.3' }), { core: '0.2.3', schema: '3.0.0' });
  assert.deepEqual(resolveConsumerGeneration({ artifactVersion: '0.2.6', rootVersion: '0.2.8',
    rootCoreVersion: '0.2.3' }), { core: '0.2.2', schema: '3.0.0' });
});

test('current source artifacts follow the exact adopted core instead of a stale Coral-version table', () => {
  assert.deepEqual(resolveConsumerGeneration({
    artifactVersion: '0.2.5',
    rootVersion: '0.2.5',
    rootCoreVersion: '0.2.2',
  }), { core: '0.2.2', schema: '3.0.0' });
});

test('an explicit published-baseline core disambiguates equal pre-bump package versions', () => {
  assert.deepEqual(resolveConsumerGeneration({
    artifactVersion: '0.2.5',
    rootVersion: '0.2.5',
    rootCoreVersion: '0.2.2',
    expectedCoreVersion: '0.2.1',
  }), { core: '0.2.1', schema: '2.0.0' });
});

test('historical generations remain available for immutable baseline consumers', () => {
  assert.deepEqual(resolveConsumerGeneration({
    artifactVersion: '0.2.4',
    rootVersion: '0.2.5',
    rootCoreVersion: '0.2.2',
  }), { core: '0.2.0', schema: '1.0.0' });
});

test('unknown core generations fail closed', () => {
  assert.throws(() => resolveConsumerGeneration({
    artifactVersion: '0.2.6',
    rootVersion: '0.2.6',
    rootCoreVersion: '0.2.9',
  }), /No consumer expectation is approved/);
});

test('0.2.9 uses public Core 0.2.4 while immutable 0.2.8 consumers retain their generation', () => {
  assert.deepEqual(resolveConsumerGeneration({ artifactVersion: '0.2.9', rootVersion: '0.2.9',
    rootCoreVersion: '0.2.4' }), { core: '0.2.4', schema: '3.0.0' });
  assert.deepEqual(resolveConsumerGeneration({ artifactVersion: '0.2.8', rootVersion: '0.2.9',
    rootCoreVersion: '0.2.4' }), { core: '0.2.3', schema: '3.0.0' });
});
