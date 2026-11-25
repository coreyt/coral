import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

// .cmd shims cannot be execFile/spawn targets. Execute npm's JS with the
// active Node instead, keeping arguments literal (no shell quoting).
export function npmCommand(args, {
  platform = process.platform, env = process.env, execPath = process.execPath,
  fileExists = existsSync,
  findNpm = () => spawnSync('where.exe', ['npm'], { env, encoding: 'utf8' }).stdout ?? '',
} = {}) {
  if (env.npm_execpath) return { command: execPath, args: [env.npm_execpath, ...args] };
  if (platform !== 'win32') return { command: 'npm', args };
  const cliIn = directory => win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  // Respect the selected npm on PATH; bundled Node may ship an older npm.
  let cli = findNpm().split(/\r?\n/).filter(Boolean)
    .map(path => cliIn(win32.dirname(path.trim()))).find(fileExists);
  if (!cli && fileExists(cliIn(win32.dirname(execPath)))) cli = cliIn(win32.dirname(execPath));
  if (!cli) throw new Error('Cannot locate npm CLI; run through npm or put npm on PATH');
  return { command: execPath, args: [cli, ...args] };
}
