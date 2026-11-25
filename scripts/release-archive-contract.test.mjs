import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseWorkflow } from './workflow-policy.mjs';
import { validatePublicationReadiness } from './release-guard.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

const workflow = name => parseWorkflow(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));

test('active publish uses exactly the six current-version archives and release notes', () => {
  const steps = workflow('publish').jobs.publish.steps.filter(step => step.run?.startsWith('npm publish'));
  assert.equal(steps.length, 6);
  for (const step of steps) assert.ok(step.run.endsWith(
    `-${RENDERER_CANDIDATE.version}.tgz --access public`), step.run);
  const release = workflow('release').jobs.release.steps.map(step => step.run ?? '').join('\n');
  assert.ok(release.includes('node scripts/release-notes.mjs "${RELEASE_VERSION}" > release-notes.md'));
});

test('Pages promotes the proved frozen candidate site without rebuilding', () => {
  const pages = workflow('pages');
  const text = readFileSync('.github/workflows/pages.yml', 'utf8');
  for (const forbidden of [/build:online|verify:online|docs:api|docs:build|ci:site|ci\.mjs site\b/,
    /npm run (?:build|verify|test)\b/, /playwright install/, /actions\/upload-artifact@/, /coral-online-/])
    assert.doesNotMatch(text, forbidden);
  const steps = pages.jobs.build.steps;
  const at = predicate => steps.findIndex(predicate);
  const downloads = steps.filter(step => String(step.uses ?? '').startsWith('actions/download-artifact@'));
  assert.deepEqual(downloads.map(step => step.with.name).sort(),
    ['candidate-site', 'final-candidate-proof', 'node-26-candidate-packages']);
  assert.ok(downloads.every(step => step.with['run-id'] === '${{ inputs.candidate_run_id }}'
    && step.with.repository === 'coreyt/coral'));
  const guard = at(step => step.run === 'node scripts/release-guard.mjs');
  const proof = at(step => step.id === 'proof');
  const bytes = at(step => step.run === 'node scripts/candidate-artifacts.mjs verify candidate-artifacts');
  const restore = at(step => step.run === 'node scripts/ci.mjs restore-site');
  const restored = at(step => step.run === 'node scripts/release-final-candidate.mjs --restored-site build/site');
  const uploads = steps.map((step, index) => [step, index])
    .filter(([step]) => String(step.uses ?? '').startsWith('actions/upload-pages-artifact@'));
  assert.equal(uploads.length, 1, 'exactly one Pages artifact upload');
  const [[upload, uploadIndex]] = uploads;
  assert.ok(guard >= 0 && proof > guard && bytes > proof && restore > bytes && restored > restore && uploadIndex > restored);
  assert.ok(steps.slice(0, proof).every(step => !step.run || !/ci\.mjs|tar /.test(step.run)));
  assert.equal(steps[proof].run, 'node scripts/release-final-candidate.mjs candidate-proof/final-candidate-proof.json '
    + 'candidate-artifacts/candidate-manifest.json --site candidate-site/site.tar');
  assert.deepEqual(steps[proof].env, { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}', RELEASE_VERSION: '${{ inputs.version }}',
    RELEASE_COMMIT: '${{ inputs.commit }}', RELEASE_CANDIDATE_RUN_ID: '${{ inputs.candidate_run_id }}' });
  assert.deepEqual(steps[restore].env, { CORAL_SITE_ARTIFACT_DIR: 'candidate-site',
    EXPECTED_SITE_SHA256: '${{ steps.proof.outputs.site-sha256 }}',
    RELEASE_VERSION: '${{ inputs.version }}', RELEASE_COMMIT: '${{ inputs.commit }}' });
  assert.deepEqual(steps[restored].env, { EXPECTED_VERSION_SHA256: '${{ steps.proof.outputs.version-sha256 }}',
    EXPECTED_INTEGRITY_SHA256: '${{ steps.proof.outputs.integrity-sha256 }}' });
  assert.deepEqual(upload.with, { path: 'build/site', 'retention-days': 90 });
  assert.deepEqual(pages.jobs.build.permissions, { contents: 'read', actions: 'read' });
  // The registry job independently verifies the proof in its own context.
  const registry = pages.jobs.registry.steps.find(step => step.run?.includes('release-final-candidate.mjs'));
  assert.equal(registry.env.RELEASE_VERSION, '${{ inputs.version }}');
  assert.equal(registry.env.RELEASE_CANDIDATE_RUN_ID, '${{ inputs.candidate_run_id }}');
  assert.ok(pages.jobs.registry.steps.some(step => step.run === 'node scripts/release-registry.mjs verify'
    && step.env.RELEASE_PAGES_REGISTRY_VERIFICATION === true));
  assert.deepEqual(pages.jobs.deploy.needs, ['build', 'registry']);
  assert.deepEqual(pages.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.deepEqual(pages.concurrency, { group: 'coral-pages', 'cancel-in-progress': false });
  assert.deepEqual(pages.permissions, { contents: 'read' });
});

test('publication requires authorization and public dependencies', () => {
  const packages = [{ name: '@coral-viz/language', dependencies: { '@graph-ir/core': '0.2.3' } }];
  assert.throws(() => validatePublicationReadiness({ ...RENDERER_CANDIDATE, publicationAuthorized: false }, packages), /not authorized/);
  const authorized = { ...RENDERER_CANDIDATE, publicationAuthorized: true, identityState: 'public dependencies adopted' };
  assert.doesNotThrow(() => validatePublicationReadiness(authorized, packages));
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const version of ['file:../core.tgz', 'link:../core', 'workspace:*', '../core', '/tmp/core.tgz']) {
      assert.throws(() => validatePublicationReadiness(authorized,
        [{ name: '@coral-viz/language', [field]: { '@graph-ir/core': version } }]), /non-registry/);
    }
  }
  assert.throws(() => validatePublicationReadiness({ ...authorized, identityState: 'private frozen candidate' }, packages), /private/);
});
