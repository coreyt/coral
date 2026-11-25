import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANDIDATE_PACKAGES } from './candidate-artifacts.mjs';

export const RENDERER_CANDIDATE = Object.freeze(JSON.parse(readFileSync(new URL(
  '../dev/releases/0.2.12/renderer-candidate.json', import.meta.url), 'utf8')));

export function validateRendererCandidate(config) {
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.version, '0.2.12');
  assert.equal(config.candidateRef, `refs/heads/release/${config.version}`);
  assert.equal(config.integrationRef, `refs/heads/release/${config.version}`);
  assert.equal(config.mergeTarget, `refs/heads/release/${config.version}`);
  assert.deepEqual(config.packages, CANDIDATE_PACKAGES);
  assert.equal(config.dependenciesManifest, 'package-lock.json');
  assert.equal(config.identityState, 'public dependencies adopted');
  assert.equal(typeof config.publicationAuthorized, 'boolean');
  assert.ok(config.ownerBlockers.length >= 4);
  return config;
}
validateRendererCandidate(RENDERER_CANDIDATE);
