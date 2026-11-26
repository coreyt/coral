import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFinalCandidateProof } from './ci-final-candidate.mjs';
import { finalCandidateFixture } from './final-candidate-fixture.mjs';
import { validateFinalCandidateEvidence, validateCandidateManifestBinding } from './release-final-candidate.mjs';
import { RENDERER_CANDIDATE, validateRendererCandidate } from './renderer-candidate-config.mjs';
import { validateCandidateArtifactConsumers } from './workflow-policy.mjs';
import { manifestPaths, validatePublicationReadiness } from './release-guard.mjs';

const { sha, manifest, manifestBytes, env, needs, attemptJobs: jobs } = finalCandidateFixture();

test('active 0.2.15 candidate records author-approved publication with public dependencies', () => {
  const publicManifests = manifestPaths.map(path => JSON.parse(readFileSync(path, 'utf8')))
    .filter(manifest => !manifest.private);
  assert.equal(publicManifests.length, 6);
  assert.doesNotThrow(() => validatePublicationReadiness(RENDERER_CANDIDATE, publicManifests));
  assert.equal(RENDERER_CANDIDATE.publicationAuthorized, true);
  assert.equal(RENDERER_CANDIDATE.candidateRef, 'refs/heads/release/0.2.15');
  assert.equal(RENDERER_CANDIDATE.integrationRef, RENDERER_CANDIDATE.candidateRef);
  assert.equal(RENDERER_CANDIDATE.mergeTarget, RENDERER_CANDIDATE.candidateRef);
  assert.equal(RENDERER_CANDIDATE.identityState, 'public dependencies adopted');
  assert.equal(RENDERER_CANDIDATE.dependenciesManifest, 'package-lock.json');
  assert.equal(JSON.parse(readFileSync('package.json')).version, RENDERER_CANDIDATE.version);
  for (const mutation of [{ version: '0.2.6' }, { candidateRef: 'refs/heads/main' },
    { publicationAuthorized: 'true' }, { identityState: 'private frozen candidate' },
    { dependenciesManifest: 'dev/releases/0.2.8/dependencies/manifest.json' }, { packages: [] }])
    assert.throws(() => validateRendererCandidate({ ...RENDERER_CANDIDATE, ...mutation }));
});

test('active candidate CI producer, every retained consumer and aggregate pin the frozen version', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.deepEqual(validateCandidateArtifactConsumers(ci), []);
  assert.match(validateCandidateArtifactConsumers(ci.replaceAll('RELEASE_VERSION: 0.2.15',
    'RELEASE_VERSION: 0.2.6')).join('\n'), /active candidate version|retained candidate/);
});

test('active proof binds package version, exact SHA and manual candidate ref', () => {
  const proof = buildFinalCandidateProof({ env, needs, jobs, manifestBytes });
  assert.equal(proof.version, '0.2.15');
  assert.equal(proof.schemaVersion, 3);
  for (const mutation of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'push' }])
    assert.throws(() => buildFinalCandidateProof({ env: { ...env, ...mutation }, needs, jobs, manifestBytes }));
  for (const mutation of [{ version: '0.2.6' }, { productSha: 'd'.repeat(40) }])
    assert.throws(() => buildFinalCandidateProof({ env, needs, jobs,
      manifestBytes: Buffer.from(JSON.stringify({ ...manifest, ...mutation })) }));
});

test('active hosted readback refuses wrong ref, proof version, attempt and artifact binding', () => {
  const { evidence, identity, proof } = finalCandidateFixture();
  assert.deepEqual(validateFinalCandidateEvidence(evidence, identity), []);
  for (const mutation of [{ proof: { ...proof, version: '0.2.6' } },
    { run: { ...evidence.run, head_branch: 'main' } },
    { run: { ...evidence.run, run_attempt: 2 } },
    { artifacts: [{ ...evidence.artifacts[0], id: 78 }, ...evidence.artifacts.slice(1)] }])
    assert.ok(validateFinalCandidateEvidence({ ...evidence, ...mutation }, identity).length > 0);
  assert.deepEqual(validateCandidateManifestBinding(proof, manifestBytes,
    { version: '0.2.15', productSha: sha }).errors, []);
  assert.ok(validateCandidateManifestBinding(proof, manifestBytes,
    { version: '0.2.6', productSha: sha }).errors.length > 0);
});
