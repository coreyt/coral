import assert from 'node:assert/strict';
import test from 'node:test';

import { TOOLCHAINS, validateToolchain } from './check-toolchain.mjs';

const npmAgent = version => `npm/${version} node/v0.0.0 linux x64`;

test('release role accepts exactly Node 26.8.2 and npm 12.0.2', () => {
  assert.deepEqual(validateToolchain({
    nodeVersion: TOOLCHAINS.release.node,
    npmUserAgent: npmAgent(TOOLCHAINS.release.npm),
  }).errors, []);
});

test('minimum-runtime role accepts exactly Node 24.19.0 and npm 12.0.2', () => {
  assert.deepEqual(validateToolchain({
    nodeVersion: TOOLCHAINS.minimumRuntime.node,
    npmUserAgent: npmAgent(TOOLCHAINS.minimumRuntime.npm),
    role: 'minimum-runtime',
  }).errors, []);
});

test('release role rejects the minimum runtime', () => {
  const { errors } = validateToolchain({
    nodeVersion: TOOLCHAINS.minimumRuntime.node,
    npmUserAgent: npmAgent(TOOLCHAINS.release.npm),
  });
  assert.match(errors.join('\n'), /Node 26\.8\.2 is required for release/);
});

test('minimum-runtime role rejects the release runtime and wrong npm', () => {
  const { errors } = validateToolchain({
    nodeVersion: TOOLCHAINS.release.node,
    npmUserAgent: npmAgent('11.0.0'),
    role: 'minimum-runtime',
  });
  assert.match(errors.join('\n'), /Node 24\.19\.0 is required for minimum-runtime/);
  assert.match(errors.join('\n'), /npm 12\.0\.2 is required for minimum-runtime/);
});
