import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  SUNSET_WORKER_SOURCE, assertCleanSource, buildOnlineDelivery, assertNoRetiredDeliveryFiles, assertReleaseIdentity,
  assertOutputLocation, assertSafeOutput, createOnlineHandler, resolveOnlineRequest, verifyEditorBuild, verifyFrozenSite,
  writeSiteIntegrity,
} from './online-delivery.mjs';

const currentVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const identity = {
  product: 'coral', version: currentVersion,
  commit: '0123456789abcdef0123456789abcdef01234567',
};

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(root) {
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'licenses'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Coral</title>');
  await writeFile(join(root, 'docs', 'index.html'), '<!doctype html><title>Docs</title>');
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("coral")');
  await writeFile(join(root, 'assets', 'app.css'), 'body{}');
  await writeFile(join(root, 'licenses', 'CORAL-LICENSE.txt'), 'license');
  for (const name of [
    'fonts-README.md', 'fonts-handwritten-OFL-1.1.txt', 'fonts-mono-OFL-1.1.txt',
    'fonts-sans-OFL-1.1.txt', 'fonts-serif-OFL-1.1.txt',
  ]) await writeFile(join(root, 'licenses', name), `notice: ${name}`);
  await writeFile(join(root, 'version.json'), `${JSON.stringify(identity)}\n`);
}

test('release identity is exact and online delivery requires a clean source', () => {
  assert.deepEqual(assertReleaseIdentity(identity, currentVersion), identity);
  assert.throws(() => assertReleaseIdentity({ ...identity, version: '0.2.6' }, '0.2.8'), /Invalid Coral release identity/);
  assert.throws(() => assertReleaseIdentity({ ...identity, extra: true }, currentVersion));
  assert.doesNotThrow(() => assertCleanSource(''));
  assert.throws(() => assertCleanSource(' M tracked-file\n'), /clean source/i);
});

test('full online builds reject a dirty checkout unless the caller opts out', async (t) => {
  const repository = await temporaryDirectory(t, 'coral-online-dirty-');
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
  await writeFile(join(repository, 'dirty.txt'), 'dirty');
  await assert.rejects(() => buildOnlineDelivery({ repository }), /clean source/i);
  await assert.rejects(
    () => buildOnlineDelivery({ repository, requireCleanSource: false }),
    (error) => !/clean source/i.test(error.message),
  );
});

async function editorFixture(root) {
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'),
    `<!doctype html><script>globalThis.__CORAL_RELEASE_IDENTITY__=Object.freeze(${JSON.stringify(identity)})</script>`);
  await writeFile(join(root, 'sw.js'), await readFile(SUNSET_WORKER_SOURCE));
  for (const name of [
    'index-a.js', 'index-a.css', 'layout.worker-a.js', 'whisper.worker-a.js', 'ort-wasm-a.wasm',
  ]) await writeFile(join(root, 'assets', name), name);
}

test('editor build requires HTML, JavaScript, CSS, both feature workers and WASM', async (t) => {
  const complete = await temporaryDirectory(t, 'coral-editor-complete-');
  await editorFixture(complete);
  assert.ok((await verifyEditorBuild(complete, identity)).includes('assets/ort-wasm-a.wasm'));
  for (const [missing, message] of [
    ['index-a.js', /application JavaScript/i],
    ['layout.worker-a.js', /layout worker/i],
    ['whisper.worker-a.js', /whisper worker/i],
    ['ort-wasm-a.wasm', /wasm/i],
  ]) {
    const root = await temporaryDirectory(t, 'coral-editor-missing-');
    await editorFixture(root);
    await rm(join(root, 'assets', missing));
    await assert.rejects(() => verifyEditorBuild(root, identity), message, missing);
  }
});

test('output safety rejects source trees and pre-existing destinations', async (t) => {
  const repository = await temporaryDirectory(t, 'coral-online-root-');
  await mkdir(join(repository, 'packages'), { recursive: true });
  assert.throws(() => assertSafeOutput(repository, repository), /repository/i);
  assert.throws(() => assertSafeOutput(repository, join(repository, 'packages', 'out')), /source/i);
  const existing = join(repository, 'build', 'site');
  await mkdir(existing, { recursive: true });
  assert.throws(() => assertSafeOutput(repository, existing), /already exists/i);
});

test('Windows output safety rejects other drives, UNC shares, parent and cased source paths', () => {
  for (const output of ['D:\\site', '\\\\server\\share\\site', 'C:\\', 'C:\\repo\\..',
    'c:\\REPO\\Packages\\out', 'C:\\repo\\DOCS\\out', 'C:\\repo\\.GITHUB\\out']) {
    assert.throws(() => assertOutputLocation('C:\\repo', output, win32), /repository|source/i, output);
  }
  assert.equal(assertOutputLocation('C:\\repo', 'c:\\REPO\\build\\site', win32), 'c:\\REPO\\build\\site');
});

test('output safety rejects a symlinked parent, including Windows junctions', async (t) => {
  const repository = await temporaryDirectory(t, 'coral-online-linked-parent-');
  await mkdir(join(repository, 'real'));
  await symlink(join(repository, 'real'), join(repository, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertSafeOutput(repository, join(repository, 'linked', 'site')), /symlink/i);
  if (process.platform === 'win32') {
    assert.throws(() => assertSafeOutput(repository.toUpperCase(), join(repository, 'linked', 'site')), /symlink/i);
  }
});

test('retired manifest, application ZIP and archive checksum fail closed', () => {
  for (const path of ['manifest.webmanifest', 'coral-editor-0.2.5.zip', 'SHA256SUMS']) {
    assert.throws(() => assertNoRetiredDeliveryFiles(['index.html', path]), new RegExp(path.replace('.', '\\.')));
  }
  assert.doesNotThrow(() => assertNoRetiredDeliveryFiles([
    'assets/layout.worker.js', 'assets/whisper.worker.js', 'version.json',
  ]));
});

test('retired outputs fail closed by basename anywhere in the payload', () => {
  for (const path of [
    'docs/sw.js', 'assets/sw.js', 'docs/manifest.webmanifest', 'assets/app.webmanifest',
    'downloads/coral.zip', 'coral-0.2.6.zip', 'docs/coral.tar', 'coral.tar.gz', 'assets/coral.tar.xz',
    'downloads/CORAL.ZIP', 'docs/MANIFEST.WEBMANIFEST', 'assets/coral.TAR.GZ',
    'coral.tgz', 'docs/SHA256SUMS', 'release/SHA256SUMS.txt', 'MD5SUMS', 'SHA1SUMS', 'sha512sums',
    'CHECKSUMS', 'docs/SUMS.txt', 'checksum.txt', 'downloads/coral.zip.sha256',
    'downloads/coral.tgz.sha512', 'downloads/coral.tar.gz.md5',
    'coral.gz', 'assets/coral.bz2', 'coral.xz', 'coral.7z', 'coral.rar',
    'coral.zst', 'assets/service-worker.js', 'docs/serviceworker.js', 'assets/ServiceWorker.js',
    'assets/app-sw.js', 'assets/index.sw.js', 'docs/SW.js',
  ]) assert.throws(() => assertNoRetiredDeliveryFiles(['index.html', path]), /retired offline delivery/i, path);
  assert.doesNotThrow(() => assertNoRetiredDeliveryFiles([
    'sw.js', 'assets/layout.worker-Bh-84rlx.js', 'assets/whisper.worker-DXyKS-G5.js',
    'docs/assets/use_how-to_sums.md.js', 'assets/tarot.js', 'docs/CHECKSUMS.html', 'assets/consums.js',
    'assets/coral.SUMS', 'assets/newsw.js', 'assets/gzip-helper.js',
  ]));
});

test('nested sw.js is rejected even when byte-identical to the sunset worker', async (t) => {
  const root = await temporaryDirectory(t, 'coral-online-nested-sw-');
  await fixture(root);
  await writeFile(join(root, 'docs', 'sw.js'), await readFile(SUNSET_WORKER_SOURCE));
  await assert.rejects(() => writeSiteIntegrity(root, identity), /retired offline delivery.*docs\/sw\.js/i);
});

test('integrity requires notices, rejects secrets, and excludes retired outputs', async (t) => {
  const missing = await temporaryDirectory(t, 'coral-online-missing-');
  await fixture(missing);
  await rm(join(missing, 'licenses', 'fonts-serif-OFL-1.1.txt'));
  await assert.rejects(() => writeSiteIntegrity(missing, identity), /fonts-serif-OFL-1\.1\.txt/);

  const secret = await temporaryDirectory(t, 'coral-online-secret-');
  await fixture(secret);
  await writeFile(join(secret, 'leak.txt'), ['g', 'hp_', 'a'.repeat(24)].join(''));
  await assert.rejects(() => writeSiteIntegrity(secret, identity), /secret marker/i);

  const retired = await temporaryDirectory(t, 'coral-online-retired-');
  await fixture(retired);
  await writeFile(join(retired, 'sw.js'), 'worker');
  await assert.rejects(() => writeSiteIntegrity(retired, identity), /retired offline delivery.*sunset/i);
});

test('only the exact 0.2.6 sunset worker is deployable as sw.js', async (t) => {
  const root = await temporaryDirectory(t, 'coral-online-sunset-');
  await fixture(root);
  await writeFile(join(root, 'sw.js'), await readFile(SUNSET_WORKER_SOURCE));
  const manifest = await writeSiteIntegrity(root, identity);
  assert.equal(manifest.files.some(({ path }) => path === 'sw.js'), true);
  assert.match((await resolveOnlineRequest(root, 'GET', '/coral/sw.js')).type, /text\/javascript/);
});

test('integrity is canonical, complete and rejects mutation, additions and symlinks', async (t) => {
  const root = await temporaryDirectory(t, 'coral-online-integrity-');
  await fixture(root);
  const manifest = await writeSiteIntegrity(root, identity);
  assert.deepEqual(await verifyFrozenSite(root, identity), manifest);
  assert.equal(manifest.files.some(({ path }) => path === 'sw.js'), false);
  assert.equal(manifest.files.some(({ path }) => path === 'manifest.webmanifest'), false);

  await writeFile(join(root, 'assets', 'app.js'), 'mutated');
  await assert.rejects(() => verifyFrozenSite(root, identity), /integrity/i);
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("coral")');
  await writeFile(join(root, 'extra.txt'), 'extra');
  await assert.rejects(() => verifyFrozenSite(root, identity), /file set/i);
  // Junctions exercise the same lstat rejection without Windows symlink privileges.
  await symlink(process.platform === 'win32' ? join(root, 'docs') : 'index.html',
    join(root, 'linked.html'), process.platform === 'win32' ? 'junction' : 'file');
  await assert.rejects(() => verifyFrozenSite(root, identity), /symlink|unsupported/i);
});

test('online serving resolves exact app/docs routes and MIME types', async (t) => {
  const root = await temporaryDirectory(t, 'coral-online-serve-');
  await fixture(root);
  await writeSiteIntegrity(root, identity);
  for (const [path, type] of [
    ['/coral/', 'text/html'], ['/coral/docs/', 'text/html'],
    ['/coral/assets/app.js', 'text/javascript'], ['/coral/version.json', 'application/json'],
  ]) assert.match((await resolveOnlineRequest(root, 'GET', path)).type, new RegExp(type));
  for (const path of ['/coral/manifest.webmanifest', '/outside']) {
    await assert.rejects(() => resolveOnlineRequest(root, 'GET', path), /not found|ENOENT/);
  }
});

test('documentation shell publishes the contributor tree', async () => {
  const [config, index] = await Promise.all([
    readFile('docs/.vitepress/config.mts', 'utf8'), readFile('docs/index.md', 'utf8'),
  ]);
  assert.match(config, /base: '\/coral\/docs\/'/);
  assert.match(index, /\[Use Coral\]\(use\/index\.md\)/);
  assert.match(index, /\[Embed Coral\]\(embed\/index\.md\)/);
  assert.match(index, /\[Contribute to Coral\]\(contribute\/index\.md\)/);
});

test('an unreadable file destroys only its response and the server keeps serving', async (t) => {
  const root = await temporaryDirectory(t, 'coral-online-unreadable-');
  await fixture(root);
  // Windows chmod cannot revoke read access; root on POSIX also bypasses it.
  // Keep the real pipeline/socket assertion with a deterministic read error.
  const server = createServer(createOnlineHandler(root, {
    openReadStream: (path) => path === join(root, 'assets', 'app.js')
      ? new Readable({ read() { this.destroy(Object.assign(new Error('read denied'), { code: 'EACCES' })); } })
      : createReadStream(path),
  }));
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const signal = AbortSignal.timeout(3000);
    await assert.rejects(async () => { await (await fetch(`${base}/coral/assets/app.js`, { signal })).text(); },
      error => error.name !== 'TimeoutError');
    assert.equal((await fetch(`${base}/coral/`)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
  }
});
