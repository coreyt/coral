import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'node_modules/tree-sitter-cli/cli.js');
const grammar = resolve(root, 'packages/tree-sitter-coral');
const result = spawnSync(process.execPath, [cli, 'test'], {
  cwd: grammar,
  env: { ...process.env, XDG_CACHE_HOME: join(tmpdir(), 'coral-tree-sitter-cache') },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
