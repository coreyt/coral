/** Local check: the 0.2.8 source reader from the packed language tarball.
 * CI runs the same assertions in the installed-renderer consumer.
 * CORAL_ARTIFACT_DIR selects the verified frozen candidate; otherwise pack fresh. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readRegistryCoreIdentity, validateRegistryCoreIdentity } from './graphir-candidate-identity.mjs';
import { candidateTarball } from './ci.mjs';
import { verifyLanguageReader028 } from './packed-language-reader.mjs';
import { npmCommand } from './npm-command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'coral-packed-language-'));
const consumer = path.join(temporary, 'consumer');

function run(command, args, env = process.env, cwd = root) {
  return execFileSync(command, args, { cwd, env: { ...env, npm_config_logs_max: '0' }, encoding: 'utf8',
    timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
// Windows npm is a .cmd shim; run its CLI with the active Node and literal arguments.
function npm(args, env, cwd) {
  const command = npmCommand(args, { env });
  return run(command.command, command.args, env, cwd);
}

try {
  const manifest = JSON.parse(readFileSync(path.join(root,
    'packages/language/package.json'), 'utf8'));
  assert.equal(manifest.name, '@coral-viz/language');
  let tarball;
  if (process.env.CORAL_ARTIFACT_DIR) {
    tarball = await candidateTarball('@coral-viz/language', path.resolve(process.env.CORAL_ARTIFACT_DIR));
  } else {
    npm(['pack', '-w', '@coral-viz/language', '--pack-destination', temporary],
      { ...process.env, npm_config_cache: path.join(temporary, 'npm-cache') });
    tarball = path.join(temporary, `coral-viz-language-${manifest.version}.tgz`);
  }
  assert.ok(existsSync(tarball), 'npm pack did not produce the expected language tarball');
  mkdirSync(consumer);
  run('tar', ['-xzf', tarball, '-C', consumer]);
  const core = await readRegistryCoreIdentity();
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'coral-packed-language-consumer', private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund',
    `@graph-ir/core@${core.version}`],
  { ...process.env, npm_config_cache: path.join(temporary, 'npm-cache'), npm_config_logs_max: '0' }, consumer);
  const lock = JSON.parse(readFileSync(path.join(consumer, 'package-lock.json'), 'utf8'));
  const installedCore = validateRegistryCoreIdentity(lock);
  assert.equal(installedCore.resolved, core.resolved);
  assert.equal(installedCore.integrity, core.integrity);
  const packageDirectory = path.join(consumer, 'package');
  const language = await import(pathToFileURL(path.join(packageDirectory, 'dist/index.js')).href);
  await verifyLanguageReader028(language, { root, packageDirectory });
  process.stdout.write('Packed language reader passed.\n');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
