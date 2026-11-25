import { npmCommand } from './npm-command.mjs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp, lstat, mkdir, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import pathApi from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const forbiddenRoots = ['packages', 'docs', 'scripts', '.github', 'dev', 'tools', 'e2e'];
const requiredLicenseFiles = [
  'licenses/CORAL-LICENSE.txt',
  'licenses/fonts-README.md',
  'licenses/fonts-handwritten-OFL-1.1.txt',
  'licenses/fonts-mono-OFL-1.1.txt',
  'licenses/fonts-sans-OFL-1.1.txt',
  'licenses/fonts-serif-OFL-1.1.txt',
];
const secretMarkers = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9_])ghp_[A-Za-z0-9]{20,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])github_pat_[A-Za-z0-9_]{20,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])npm_[A-Za-z0-9]{20,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])sk-proj-[A-Za-z0-9_-]{20,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])sk-ant-[A-Za-z0-9_-]{20,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9]{32,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])AIza[A-Za-z0-9_-]{30,}(?=$|[^A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9_])hf_[A-Za-z0-9]{20,}(?=$|[^A-Za-z0-9_])/,
];
export const SUNSET_WORKER_SOURCE = join(repositoryRoot, 'packages/diagram-editor/public/sw.js');
const COMMIT = /^[0-9a-f]{40}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const posix = path => path.split(sep).join('/');
const canonical = value => `${JSON.stringify(value)}\n`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const equalIdentity = (left, right) => left?.product === right.product
  && left?.version === right.version && left?.commit === right.commit
  && Object.keys(left ?? {}).sort().join(',') === 'commit,product,version';

export function assertReleaseIdentity(value, expectedVersion) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Release identity must be an object');
  }
  if (Object.keys(value).sort().join(',') !== 'commit,product,version') {
    throw new Error('Release identity has unexpected fields');
  }
  if (value.product !== 'coral' || value.version !== expectedVersion
      || !VERSION.test(value.version) || !COMMIT.test(value.commit)) {
    throw new Error('Invalid Coral release identity');
  }
  return { product: value.product, version: value.version, commit: value.commit };
}

export function assertOutputLocation(repository, output, paths = pathApi) {
  const root = paths.resolve(repository);
  const target = paths.resolve(output);
  const relativePath = paths.relative(root, target);
  const path = relativePath.split(paths.sep).join('/');
  if (!path || path === '.' || path === '..' || path.startsWith('../') || paths.isAbsolute(relativePath)) {
    throw new Error('Output must be a new directory inside the repository, not the repository itself');
  }
  const sourcePath = paths.sep === '\\' ? path.toLowerCase() : path;
  if (forbiddenRoots.some(name => sourcePath === name || sourcePath.startsWith(`${name}/`))) {
    throw new Error(`Output is inside a source directory: ${path}`);
  }
  return target;
}

export function assertSafeOutput(repository, output) {
  const root = resolve(repository);
  const target = assertOutputLocation(repository, output);
  let cursor = target;
  // relative() handles Windows casing; a string prefix would skip junctions.
  while (relative(root, cursor) !== '') {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Output path crosses a symlink: ${cursor}`);
    }
    cursor = resolve(cursor, '..');
  }
  if (existsSync(target)) throw new Error(`Output already exists: ${target}`);
  return target;
}

export function assertCleanSource(status) {
  if (status.trim()) throw new Error('Online delivery requires a clean source checkout');
}

export function assertNoRetiredDeliveryFiles(paths) {
  // Only the top-level sunset worker survives; content is checked separately.
  const retired = paths.find((path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return (path !== 'sw.js' && /(?:^|[.-])(?:service-?worker|sw)\.js$/i.test(name))
      || /\.(?:webmanifest|zip|tgz|gz|bz2|xz|7z|rar|zst)$|\.tar(?:\.|$)/i.test(name)
      || /^(?:SHA(?:1|256|512)SUMS|MD5SUMS|CHECKSUMS?|SUMS)(?:\.txt)?$/i.test(name)
      || /\.(?:sha(?:1|256|512)|md5|checksum)(?:\.txt)?$/i.test(name);
  });
  if (retired) throw new Error(`Retired offline delivery output: ${retired}`);
}

async function walk(directory, root, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const status = await lstat(absolute);
    if (status.isSymbolicLink() || (!status.isDirectory() && !status.isFile())) {
      throw new Error(`Unsupported or symlinked payload entry: ${absolute}`);
    }
    if (status.isDirectory()) await walk(absolute, root, files);
    else files.push(posix(relative(root, absolute)));
  }
}

export async function collectDeliveryFiles(directory, { includeIntegrity = false } = {}) {
  const root = resolve(directory);
  const files = [];
  await walk(root, root, files);
  files.sort();
  const filtered = includeIntegrity ? files : files.filter(path => path !== 'integrity.json');
  if (new Set(filtered).size !== filtered.length) throw new Error('Duplicate payload path');
  assertNoRetiredDeliveryFiles(filtered);
  if (filtered.includes('sw.js')
    && !(await readFile(join(root, 'sw.js'))).equals(await readFile(SUNSET_WORKER_SOURCE))) {
    throw new Error('Retired offline delivery output: sw.js is not the 0.2.6 sunset worker');
  }
  for (const path of filtered) {
    if (!path || path.startsWith('/') || path.startsWith('../') || path.includes('/../')) {
      throw new Error(`Payload path escapes the site: ${path}`);
    }
    if (path.endsWith('.map') || /(^|\/)(?:coverage|test-results|playwright-report)(\/|$)/.test(path)) {
      throw new Error(`Test or source-map output is not deployable: ${path}`);
    }
    if (/(^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:pem|key))/.test(path)) {
      throw new Error(`Credential-shaped file is not deployable: ${path}`);
    }
  }
  return filtered;
}

function assertNoSecretMarkers(path, bytes) {
  const text = bytes.toString('utf8');
  if (secretMarkers.some(pattern => pattern.test(text))) {
    throw new Error(`Known secret marker found in deployable payload: ${path}`);
  }
}

export async function writeSiteIntegrity(directory, identity) {
  const rootManifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const checked = assertReleaseIdentity(identity, rootManifest.version);
  const root = resolve(directory);
  if (existsSync(join(root, 'integrity.json'))) throw new Error('integrity.json already exists');
  const files = [];
  for (const path of await collectDeliveryFiles(root)) {
    const bytes = await readFile(join(root, path));
    assertNoSecretMarkers(path, bytes);
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  for (const required of ['index.html', 'docs/index.html', 'version.json', ...requiredLicenseFiles]) {
    if (!files.some(({ path }) => path === required)) throw new Error(`Missing required payload file: ${required}`);
  }
  const version = JSON.parse(await readFile(join(root, 'version.json'), 'utf8'));
  if (!equalIdentity(version, checked)) throw new Error('version.json identity mismatch');
  const manifest = { schemaVersion: 1, identity: checked, files };
  await writeFile(join(root, 'integrity.json'), canonical(manifest), { flag: 'wx' });
  return manifest;
}

export async function verifyFrozenSite(directory, expectedIdentity) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, 'integrity.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !equalIdentity(manifest.identity, expectedIdentity)) {
    throw new Error('Site integrity identity or schema mismatch');
  }
  const actualPaths = await collectDeliveryFiles(root);
  const recordedPaths = manifest.files?.map(({ path }) => path) ?? [];
  if (JSON.stringify(actualPaths) !== JSON.stringify(recordedPaths)) {
    throw new Error('Frozen site file set differs from integrity manifest');
  }
  for (const entry of manifest.files) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'bytes,path,sha256'
        || !/^[0-9a-f]{64}$/.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error('Malformed site integrity entry');
    }
    const bytes = await readFile(join(root, entry.path));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`Site integrity mismatch: ${entry.path}`);
    }
  }
  if (canonical(manifest) !== await readFile(join(root, 'integrity.json'), 'utf8')) {
    throw new Error('Site integrity manifest is not canonical');
  }
  const version = JSON.parse(await readFile(join(root, 'version.json'), 'utf8'));
  if (!equalIdentity(version, expectedIdentity)) throw new Error('Frozen version identity mismatch');
  return manifest;
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.txt', 'text/plain; charset=utf-8'],
]);

export async function resolveOnlineRequest(siteDirectory, method, requestUrl) {
  const root = resolve(siteDirectory);
  const url = new URL(requestUrl, 'http://localhost');
  if (method !== 'GET' && method !== 'HEAD') throw new Error('not found');
  if (!url.pathname.startsWith('/coral/')) throw new Error('not found');
  let path = decodeURIComponent(url.pathname.slice('/coral/'.length));
  if (!path) path = 'index.html';
  else if (path.endsWith('/')) path += 'index.html';
  else if (path.startsWith('docs/') && !extname(path)) path += '.html';
  if (path.startsWith('/') || path.startsWith('../') || path.includes('/../')) throw new Error('not found');
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error('not found');
  const status = await lstat(absolute);
  if (!status.isFile() || status.isSymbolicLink()) throw new Error('not found');
  return { absolute, type: mimeTypes.get(extname(path)) ?? 'application/octet-stream' };
}

export function createOnlineHandler(siteDirectory, { openReadStream = createReadStream } = {}) {
  return async (request, response) => {
    try {
      const { absolute, type } = await resolveOnlineRequest(siteDirectory, request.method, request.url);
      response.statusCode = 200;
      response.setHeader('content-type', type);
      response.setHeader('x-content-type-options', 'nosniff');
      if (request.method === 'HEAD') response.end();
      // A read failure after headers can only abort this response.
      else pipeline(openReadStream(absolute), response, error => { if (error) response.destroy(); });
    } catch {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end('Not found');
    }
  };
}

async function copyLicenses(root, site) {
  const destination = join(site, 'licenses');
  await mkdir(destination, { recursive: true });
  await cp(join(root, 'LICENSE'), join(destination, 'CORAL-LICENSE.txt'));
  const fonts = join(root, 'packages/render/third_party/fonts');
  for (const name of ['README.md', 'handwritten-OFL-1.1.txt', 'mono-OFL-1.1.txt', 'sans-OFL-1.1.txt', 'serif-OFL-1.1.txt']) {
    await cp(join(fonts, name), join(destination, `fonts-${name}`));
  }
}

async function repositoryIdentity(root) {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
  return assertReleaseIdentity({ product: 'coral', version: manifest.version, commit: stdout.trim() }, manifest.version);
}

function identityMarker(identity) {
  return `globalThis.__CORAL_RELEASE_IDENTITY__=Object.freeze(${JSON.stringify(identity)})`;
}

export async function verifyEditorBuild(directory, identity) {
  const files = await collectDeliveryFiles(directory, { includeIntegrity: true });
  for (const required of ['index.html', 'sw.js']) {
    if (!files.includes(required)) throw new Error(`Missing editor output: ${required}`);
  }
  if (!files.some(path => /^assets\/index-[^/]+\.js$/.test(path))) {
    throw new Error('Editor output must include application JavaScript');
  }
  if (!files.some(path => path.endsWith('.css'))) throw new Error('Editor output must include CSS');
  for (const [label, pattern] of [
    ['layout worker', /^assets\/layout\.worker-[^/]+\.js$/],
    ['Whisper worker', /^assets\/whisper\.worker-[^/]+\.js$/],
    ['WASM', /\.wasm$/],
  ]) {
    if (!files.some(path => pattern.test(path))) throw new Error(`Missing editor output: ${label}`);
  }
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  if (!html.includes(identityMarker(identity))) throw new Error('Emitted browser identity does not match build identity');
  return files;
}

export async function buildEditorOnline({ repository = repositoryRoot, output } = {}) {
  const root = resolve(repository);
  const identity = await repositoryIdentity(root);
  const editor = join(root, 'packages/diagram-editor');
  const destination = output ?? join(editor, 'dist');
  await execFileAsync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', destination, '--emptyOutDir'], {
    cwd: editor, env: { ...process.env, CORAL_RELEASE_IDENTITY: JSON.stringify(identity) },
  });
  await verifyEditorBuild(destination, identity);
  return { identity, directory: destination };
}

export async function buildOnlineDelivery({
  repository = repositoryRoot, output = join(repository, 'build'), requireCleanSource = true, prepared = false,
} = {}) {
  const root = resolve(repository);
  const target = assertSafeOutput(root, output);
  if (requireCleanSource) {
    const { stdout: status } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root });
    assertCleanSource(status);
  }
  const identity = await repositoryIdentity(root);
  const work = join(target, '.work');
  const app = join(work, 'app');
  const docs = join(work, 'docs');
  const site = join(target, 'site');
  await mkdir(app, { recursive: true });
  await mkdir(docs, { recursive: true });
  try {
    const npm = npmCommand(['run', prepared ? 'docs:api:prepared' : 'docs:api']);
    await execFileAsync(npm.command, npm.args, { cwd: root });
    await buildEditorOnline({ repository: root, output: app });
    await execFileAsync(process.execPath, [join(root, 'node_modules/vitepress/bin/vitepress.js'), 'build', join(root, 'docs'), '--outDir', docs], {
      cwd: root, env: { ...process.env, CORAL_DOCS_CACHE_DIR: join(work, 'vitepress-cache') },
    });
    await cp(app, site, { recursive: true, errorOnExist: true, force: false });
    await cp(docs, join(site, 'docs'), { recursive: true, errorOnExist: true, force: false });
    // Each static build starts browser SVG instance IDs from the same state.
    await execFileAsync(process.execPath, [join(root, 'scripts/example-catalog.mjs'),
      join(site, 'examples'), identity.version], { cwd: root });
    await copyLicenses(root, site);
    await writeFile(join(site, 'version.json'), canonical(identity), { flag: 'wx' });
    await writeFile(join(site, '.nojekyll'), '', { flag: 'wx' });
    await writeSiteIntegrity(site, identity);
    await verifyFrozenSite(site, identity);
    await rm(work, { recursive: true, force: true });
    return { identity, site };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const command = process.argv[2] ?? 'build';
  if (command === 'editor') {
    console.log(JSON.stringify(await buildEditorOnline()));
    return;
  }
  if (command === 'build') {
    console.log(JSON.stringify(await buildOnlineDelivery()));
    return;
  }
  if (command === 'verify') {
    const identity = await repositoryIdentity(repositoryRoot);
    await verifyFrozenSite(join(repositoryRoot, 'build/site'), identity);
    console.log(`Online delivery verified for ${identity.version} at ${identity.commit}`);
    return;
  }
  throw new Error(`Unknown online-delivery command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
