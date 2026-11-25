import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the Slice 92 inherited consumer check through npm.');

const cases = ['language', 'render', 'library-docs-render', 'mcp-server'].join(',');
const result = spawnSync(process.execPath, [npmCli, 'run', 'smoke:consumer'], {
  encoding: 'utf8',
  stdio: 'inherit',
  env: { ...process.env, CORAL_CONSUMER_CASES: cases },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
