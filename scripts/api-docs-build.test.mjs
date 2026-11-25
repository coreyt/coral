import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('generated API assets stay outside authored-source lint after documentation generation', async () => {
  const lint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)) });
  assert.equal(await lint.isPathIgnored('docs/public/api/assets/main.js'), true);
  assert.equal(await lint.isPathIgnored('scripts/api-docs.mjs'), false);
  const [authored] = await lint.lintText('const value = ;', { filePath: 'scripts/authored-api-lint-probe.mjs' });
  assert(authored.errorCount > 0, 'authored source must still be checked');
});

test('documentation build rebuilds all public declarations before generating and assembling', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.devDependencies.typedoc, '0.28.20');
  const expected = ['language', 'render', 'browser', 'viz', 'mcp-server']
    .map(name => `npm run build -w @coral-viz/${name}`);
  const commands = manifest.scripts['build:public'].split(/\s*&&\s*/);
  assert.deepEqual(commands, expected);
  const reordered = [...commands];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => assert.deepEqual(reordered, expected), assert.AssertionError);
  assert.equal(manifest.scripts['docs:api'], 'npm run build:public && node scripts/api-docs.mjs');
  // Prepared mode consumes declarations that CI already built and checked.
  assert.equal(manifest.scripts['docs:api:prepared'], 'node scripts/api-docs.mjs');
  assert.equal(manifest.scripts['docs:build'], 'npm run docs:api && vitepress build docs');
  const { SCRIPT_SUITES } = await import('./ci-suites.mjs');
  for (const suite of ['contracts', 'windows']) {
    for (const name of ['api-docs', 'api-docs-build']) assert(SCRIPT_SUITES[suite].includes(name), `${suite} owns ${name}`);
  }
  assert.match(await read('.gitignore'), /^\/docs\/public\/api\/$/m);
});

test('online assembly generates fresh API output and root Pages marker before integrity; frozen verification never rebuilds', async () => {
  const source = await read('scripts/online-delivery.mjs');
  const build = source.slice(source.indexOf('export async function buildOnlineDelivery'), source.indexOf('async function main'));
  const apiDocs = "npmCommand(['run', prepared ? 'docs:api:prepared' : 'docs:api'])";
  assert(build.indexOf(apiDocs) >= 0, 'API generation selects the explicit prepared mode');
  assert(build.indexOf(apiDocs) < build.indexOf('await buildEditorOnline'));
  assert.match(build, /prepared = false/, 'standalone builds prepare their own declarations');
  assert(build.indexOf("join(site, '.nojekyll')") < build.indexOf('await writeSiteIntegrity'));
  const verify = source.slice(source.indexOf('export async function verifyFrozenSite'), source.indexOf('const mimeTypes'));
  assert.doesNotMatch(verify, /generateApiDocs|docs:api|execFileAsync/);
  assert.match(await read('docs/.vitepress/config.mts'), /link: '\/api\/'/);
});

const workflows = async () => Promise.all(['ci.yml', 'pages.yml', 'publish.yml', 'release.yml', 'pages-restore.yml']
  .map(async file => [file, parse(await read(`.github/workflows/${file}`))]));
const jobsOf = list => list.flatMap(([file, workflow]) => Object.entries(workflow.jobs)
  .map(([name, job]) => ({ file, name, steps: job.steps ?? [] })));

test('one CI job owns the frozen candidate-site payload, built once from prepared declarations', async () => {
  const jobs = jobsOf(await workflows());
  const owners = jobs.filter(job => job.steps.some(step => String(step.uses ?? '').startsWith('actions/upload-artifact@')
    && step.with?.name === 'candidate-site'));
  assert.deepEqual(owners.map(job => `${job.file}:${job.name}`), ['ci.yml:candidate-site']);
  const builders = jobs.filter(job => job.steps.some(step =>
    /npm run (?:ci:site|build:online|docs:api|docs:build)\b|scripts\/ci\.mjs site\b/.test(step.run ?? '')));
  assert.deepEqual(builders.map(job => `${job.file}:${job.name}`), ['ci.yml:candidate-site'],
    'Pages and publication promote the frozen payload instead of rebuilding it');
  const ci = await read('scripts/ci.mjs');
  const site = ci.slice(ci.indexOf('async function siteCandidate'), ci.indexOf('async function units'));
  assert(site.indexOf('await hydratePackages()') >= 0
    && site.indexOf('await hydratePackages()') < site.indexOf('buildOnlineDelivery('));
  assert.match(site, /buildOnlineDelivery\(\{[^}]*prepared: true/);
});

test('full delivery integration runs once, after pinned Chromium, with exactly one independent build', async () => {
  const jobs = jobsOf(await workflows());
  const integration = /npm run (?:ci:delivery|test:online-delivery:integration)\b|scripts\/ci\.mjs delivery\b|npm run verify(?:\s|$)/;
  const owners = jobs.filter(job => job.steps.some(step => integration.test(step.run ?? '')));
  assert.deepEqual(owners.map(job => `${job.file}:${job.name}`), ['ci.yml:online-delivery']);
  for (const { file, name, steps } of owners) {
    const index = steps.findIndex(step => integration.test(step.run ?? ''));
    assert(steps.slice(0, index).some(step => /npx playwright install(?: --with-deps)? chromium/.test(step.run ?? '')),
      `${file}:${name} must provision its pinned browser`);
    assert(steps.slice(0, index).some(step => step.with?.name === 'candidate-site'), `${file}:${name} consumes the frozen site`);
    assert.match(String(steps[index].env?.EXPECTED_SITE_SHA256 ?? ''), /needs\.candidate-site\.outputs\.payload-sha256/);
  }
  // The delivery stage hands a disposable frozen copy to the integration test,
  // which then makes exactly one fresh, independently prepared build.
  const ci = await read('scripts/ci.mjs');
  const delivery = ci.slice(ci.indexOf("stage === 'delivery'"));
  assert.match(delivery, /CORAL_FROZEN_SITE: join\(temporary, 'candidate'\)/);
  assert(delivery.indexOf('cp(site') < delivery.indexOf('CORAL_FROZEN_SITE'), 'the frozen payload is copied, never mutated');
  const test = await read('scripts/online-delivery.integration.test.mjs');
  const builds = test.match(/await buildOnlineDelivery\(/g) ?? [];
  assert.equal(builds.length, 2, 'one standalone first build and one independent build');
  const first = test.slice(test.indexOf('const first = frozen'), test.indexOf('const second = await buildOnlineDelivery('));
  assert.match(first, /^const first = frozen\s*\?\s*\{ site: frozen,[\s\S]*:\s*await buildOnlineDelivery\(\{/,
    'a frozen candidate replaces the first build');
});
