import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const bridge = new URL('./verify-local-successor-bridge.mjs', import.meta.url);

test('the local successor bridge refuses a Core package older than the locked public package', () => {
  const root = mkdtempSync(join(tmpdir(), 'coral-bridge-version-'));
  try {
    const core = join(root, 'packages', 'core');
    mkdirSync(join(core, 'dist'), { recursive: true });
    writeFileSync(join(core, 'package.json'), JSON.stringify({ name: '@graph-ir/core', version: '0.2.2' }));
    writeFileSync(join(core, 'dist', 'index.js'), 'throw new Error("older Core must not load");\n');
    for (const candidate of [root, join(core, 'dist', 'index.js')]) {
      const result = spawnSync(process.execPath, [fileURLToPath(bridge), candidate], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires @graph-ir\/core@0\.2\.4/);
      assert.doesNotMatch(result.stderr, /older Core must not load/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the local successor bridge refuses same-version Core bytes that differ from the installed public package', () => {
  const root = mkdtempSync(join(tmpdir(), 'coral-bridge-bytes-'));
  try {
    const core = join(root, 'packages', 'core');
    mkdirSync(core, { recursive: true });
    const installedDist = fileURLToPath(new URL('../node_modules/@graph-ir/core/dist/', import.meta.url));
    cpSync(installedDist, join(core, 'dist'), { recursive: true });
    writeFileSync(join(core, 'package.json'), JSON.stringify({ name: '@graph-ir/core', version: '0.2.4' }));
    writeFileSync(join(core, 'dist', 'index.js'), 'throw new Error("divergent Core must not load");\n');
    const candidates = [root, join(core, 'dist', 'index.js')];
    for (const changedFile of ['index.js', 'validation/ir-validator.js']) {
      if (changedFile !== 'index.js') {
        copyFileSync(join(installedDist, 'index.js'), join(core, 'dist', 'index.js'));
        writeFileSync(join(core, 'dist', changedFile), 'throw new Error("divergent Core must not load");\n');
      }
      for (const candidate of candidates) {
        const result = spawnSync(process.execPath, [fileURLToPath(bridge), candidate], { encoding: 'utf8' });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /installed Core dist mismatch/);
        assert.doesNotMatch(result.stderr, /divergent Core must not load/);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
