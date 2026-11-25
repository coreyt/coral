import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(path, 'utf8');
const absent = async path => assert.rejects(() => access(path), { code: 'ENOENT' });

test('retired PWA implementation is unreachable from active source', async () => {
  for (const path of [
    'packages/diagram-editor/pwa/sw.js',
    'packages/diagram-editor/public/manifest.webmanifest',
    'packages/diagram-editor/public/icons/coral-192.png',
    'packages/diagram-editor/public/icons/coral-512.png',
    'packages/diagram-editor/public/icons/coral-source.svg',
    'packages/diagram-editor/src/pwa/PwaStatus.tsx',
    'packages/diagram-editor/src/pwa/usePwaLifecycle.ts',
    'packages/diagram-editor/test/pwa/usePwaLifecycle.test.ts',
    'packages/diagram-editor/test/components/PwaStatus.test.tsx',
    'e2e/slice20-pwa.spec.ts',
    'scripts/pwa-build.mjs',
    'scripts/pwa-build.test.mjs',
    'scripts/pwa-worker.test.mjs',
    'scripts/generate-pwa-icons.mjs',
  ]) await absent(path);

  const [html, view, controller, welcome, guidance, recovery] = await Promise.all([
    read('packages/diagram-editor/index.html'),
    read('packages/diagram-editor/src/AppView.tsx'),
    read('packages/diagram-editor/src/useEditorController.ts'),
    read('packages/diagram-editor/src/GuidanceDialogs.tsx'),
    read('packages/diagram-editor/src/guidanceContent.ts'),
    read('packages/diagram-editor/src/useAutoRecovery.ts'),
  ]);
  assert.doesNotMatch(html, /manifest\.webmanifest|rel=["']manifest/i);
  assert.doesNotMatch(view, /PwaStatus|\bpwa\b/);
  assert.doesNotMatch(controller, /usePwaLifecycle|prepareForUpdate|cancelUpdatePreparation|\bpwa\b/);
  assert.doesNotMatch(welcome, /Install Coral|canInstall|onInstall/);
  assert.doesNotMatch(guidance, /core offline shell|offline use/i);
  assert.doesNotMatch(recovery, /UPDATE_RECOVERY|prepareForUpdate|cancelUpdatePreparation/);
});

test('Workbox is absent while active Transformers overrides remain', async () => {
  const root = JSON.parse(await read('package.json'));
  const editor = JSON.parse(await read('packages/diagram-editor/package.json'));
  const lock = await read('package-lock.json');
  assert.equal(root.devDependencies['workbox-build'], undefined);
  assert.equal(editor.dependencies['workbox-window'], undefined);
  assert.doesNotMatch(lock, /node_modules\/workbox-|"workbox-(?:build|window)"/);
  assert.equal(root.overrides.sharp, '0.35.5');
  assert.equal(root.overrides['adm-zip'], '0.6.1');
});

test('online delivery replaces active PWA and application archive commands', async () => {
  const [manifest, ci, pages, policy, stages] = await Promise.all([
    read('package.json'), read('.github/workflows/ci.yml'),
    read('.github/workflows/pages.yml'), read('dev/release-policy.json'), read('scripts/ci.mjs'),
  ]);
  for (const text of [manifest, ci, pages]) {
    assert.doesNotMatch(text, /test:pwa|pwa-build|test:static|build:static|verify:static|static-delivery/);
  }
  // CI owns delivery through its stage; Pages promotes the frozen site bytes.
  const scripts = JSON.parse(manifest).scripts;
  assert.equal(scripts['ci:delivery'], 'node scripts/ci.mjs delivery');
  assert.match(stages, /online-delivery\.integration\.test\.mjs/);
  assert.match(stages, /CORAL_FROZEN_SITE/);
  assert.match(ci, /npm run ci:delivery\b/);
  assert.match(pages, /site\.tar/);
  assert.doesNotMatch(pages, /build:online|npm run (?:build|verify|ci:site)\b|online-delivery\.mjs build/);
  assert.doesNotMatch(pages, /coral-editor-|build\/SHA256SUMS/);
  const parsed = JSON.parse(policy);
  assert.ok(parsed.requiredChecks.includes(parsed.delivery.currentCheck));
  assert.equal(parsed.requiredChecks.includes('static-delivery'), false);
});

test('active browser specs make no service-worker or offline-restart claim', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir('e2e')) {
    if (!name.endsWith('.spec.ts') || name === 'slice30-online-delivery.spec.ts') continue;
    const source = await read(`e2e/${name}`);
    assert.doesNotMatch(source, /serviceWorker\.(?:register|ready|controller)|setOffline\(true\)/, name);
    assert.doesNotMatch(source, /['"]Version \d+\.\d+\.\d+['"]|coral-welcome-seen:\d/, `${name}: hardcoded release version`);
  }
  assert.doesNotMatch(await read('playwright.config.ts'), /coral-welcome-seen:\d|\bPWA\b/);
});

test('user documentation and README advertise no install, offline, or archive delivery', async () => {
  const pages = ['README.md', 'docs/use/reference/browser-support.md', 'docs/use/how-to/install-or-use-the-web-app.md'];
  for (const page of pages) {
    const source = await read(page);
    assert.doesNotMatch(source, /installable|Install and web use|Installed application|Offline after|downloadable ZIP|ZIP and checksum/i, page);
  }
  assert.doesNotMatch(await read('dev/documentation-style.md'), /offline precache/i);
});

test('0.2.6 sunset worker retires the 0.2.5 shell, removes itself, and never reloads pages', async () => {
  const source = await read('packages/diagram-editor/public/sw.js');
  const listeners = new Map();
  const deleted = [];
  const navigated = [];
  let claimed = false;
  let unregistered = false;
  let skipped = false;
  const self = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => { skipped = true; },
    registration: { unregister: async () => { unregistered = true; return true; } },
    clients: {
      claim: async () => { claimed = true; },
      matchAll: async () => [{ url: 'https://example.test/coral/', navigate: async url => navigated.push(url) }],
    },
    caches: {
      keys: async () => ['coral-shell-0.2.5-abc', 'coral-shell-tmp-1', 'unrelated', 'whisper-models'],
      delete: async name => { deleted.push(name); return true; },
    },
  };
  new Function('self', source)(self);
  assert.deepEqual([...listeners.keys()].sort(), ['activate', 'install']);
  listeners.get('install')({ waitUntil: promise => promise });
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.equal(skipped, true);
  assert.equal(claimed, false);
  assert.deepEqual(deleted, ['coral-shell-0.2.5-abc', 'coral-shell-tmp-1']);
  assert.equal(unregistered, true);
  assert.deepEqual(navigated, []);
  assert.doesNotMatch(source, /addEventListener\(['"]fetch|importScripts|\bregister\(|navigate\(|claim\(/);
});

test('the 0.2.6 application never registers a service worker', async () => {
  const { readdir } = await import('node:fs/promises');
  const walk = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat();
  for (const path of ['packages/diagram-editor/index.html', ...await walk('packages/diagram-editor/src')]) {
    assert.doesNotMatch(await read(path), /serviceWorker\.register\(|workbox/i, path);
  }
});

test('0.2.6 sunset worker still unregisters when cache cleanup fails', async () => {
  const source = await read('packages/diagram-editor/public/sw.js');
  const listeners = new Map();
  let unregistered = false;
  const self = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => {},
    registration: { unregister: async () => { unregistered = true; return true; } },
    caches: {
      keys: async () => { throw new Error('storage unavailable'); },
      delete: async () => true,
    },
  };
  new Function('self', source)(self);
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.equal(unregistered, true);
});
