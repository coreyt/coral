import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  API_BASELINE_PACKAGES,
  API_BASELINE_VERSION,
  API_COMPAT_BASELINE_CASES,
} from './api-baseline.mjs';

const root = resolve(import.meta.dirname, '..');
// The Node 24 candidate consumer job already runs every applicable current
// case once. This command adds only the immutable published baseline.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the minimum-runtime compatibility consumers through npm.');
if (process.version !== 'v24.19.0') {
  throw new Error(`Node 24.19.0 is required; found ${process.version.slice(1)}.`);
}
const npmVersion = (process.env.npm_config_user_agent ?? '').match(/(?:^|\s)npm\/([^\s]+)/)?.[1];
if (npmVersion !== '12.0.2') throw new Error(`npm 12.0.2 is required; found ${npmVersion ?? 'unknown'}.`);

const stage = await mkdtemp(join(tmpdir(), 'coral-api-consumers-'));
const baselineArtifacts = join(stage, 'baseline-artifacts');
const npmCache = join(stage, 'npm-cache');

function run(command, args, context, extraEnv = {}, timeout = 900_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    env: { ...process.env, npm_config_cache: npmCache, ...extraEnv },
  });
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `status ${String(result.status)}`;
    const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
    throw new Error(`${context} failed (${outcome})${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout.trim() || result.stderr.trim();
}

function npm(args, context) {
  return run(process.execPath, [npmCli, ...args], context);
}

try {
  await mkdir(baselineArtifacts);
  for (const item of API_BASELINE_PACKAGES) {
    const output = JSON.parse(npm([
      'pack', '--ignore-scripts', '--json', '--pack-destination', baselineArtifacts,
      `${item.name}@${API_BASELINE_VERSION}`,
    ], `packing ${item.name}@${API_BASELINE_VERSION}`));
    const records = Array.isArray(output) ? output : Object.values(output);
    if (records.length !== 1) throw new Error(`Expected one published artifact for ${item.name}.`);
    const record = records[0];
    const archive = await readFile(join(baselineArtifacts, record.filename));
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
    if (record.name !== item.name || record.version !== API_BASELINE_VERSION
        || record.integrity !== item.integrity || integrity !== item.integrity) {
      throw new Error(`${item.name}@${API_BASELINE_VERSION} does not match the immutable baseline.`);
    }
  }

  run(process.execPath, [join(root, 'scripts/consumer-smoke.mjs')], `published ${API_BASELINE_VERSION} consumer set`, {
    CORAL_CONSUMER_CASES: API_COMPAT_BASELINE_CASES.join(','),
    CORAL_ARTIFACT_SCOPE: 'api-compat',
    CORAL_EXPECT_NODE: '24.19.0',
    CORAL_ARTIFACT_DIR: baselineArtifacts,
    CORAL_EXPECT_ARTIFACT_VERSION: API_BASELINE_VERSION,
  });
} finally {
  await rm(stage, { recursive: true, force: true });
}

console.log(`Node 24 consumers passed for published ${API_BASELINE_VERSION} artifacts: ${API_COMPAT_BASELINE_CASES.join(', ')}.`);
