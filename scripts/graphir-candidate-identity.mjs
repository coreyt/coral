import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export function validateRegistryCoreIdentity(lock) {
  const copies = Object.keys(lock.packages ?? {}).filter((key) =>
    key.endsWith('node_modules/@graph-ir/core'));
  assert.deepEqual(copies, ['node_modules/@graph-ir/core'], 'one locked public Core copy');
  const core = lock.packages[copies[0]];
  assert.notEqual(core.link, true, 'public Core must not be a link');
  assert.equal(core.version, '0.2.4', 'public Core version');
  assert.equal(core.resolved, 'https://registry.npmjs.org/@graph-ir/core/-/core-0.2.4.tgz',
    'public Core registry URL');
  // The registry's dist.integrity for the reviewed v0.2.4 build.
  assert.equal(core.integrity, 'sha512-VaMsdpYUVStDWfx2SCITkVolRaOSlDJ64kfCbfImc2D/shZd64ESGJKhmnJ0a5s6KIe7CCF8a1rR7KQ1C/GzWQ==',
    'public Core lock integrity');
  return { name: '@graph-ir/core', version: core.version, gitHead: '606309d66e34dcb2b2a414183a9e43727b56e2fa',
    integrity: core.integrity,
    resolved: core.resolved, publication: 'registry' };
}

export async function readRegistryCoreIdentity() {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  return validateRegistryCoreIdentity(lock);
}
