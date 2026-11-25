import { mkdtemp, writeFile } from 'node:fs/promises';
import { copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const expected = process.env.CORAL_EXPECT_PLATFORM;
const actual = `${process.platform}-${process.arch}`;
if (expected && expected !== actual) {
  throw new Error(`Expected ${expected}; runner is ${actual}.`);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run native smoke through npm.');
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'coral-native-'));
// The exit hook also runs after a failed check, so no run leaves its build behind.
process.once('exit', () => rmSync(temp, { recursive: true, force: true }));
const npmEnv = { ...process.env, npm_config_cache: join(temp, 'npm-cache') };
// Release CI passes the retained candidate artifact directory so the native
// smoke loads the exact published bytes. Without it, pack locally (developer use).
const artifactDirectory = process.env.CORAL_ARTIFACT_DIR;
let tarball;
if (artifactDirectory) {
  const matches = readdirSync(resolve(artifactDirectory))
    .filter((name) => /^tree-sitter-coral-\d+\.\d+\.\d+\.tgz$/.test(name));
  if (matches.length !== 1) throw new Error(`Expected one tree-sitter-coral candidate tarball; found ${matches.length}.`);
  tarball = join(temp, matches[0]);
  copyFileSync(join(resolve(artifactDirectory), matches[0]), tarball);
} else {
  const before = new Set(readdirSync(temp));
  const pack = spawnSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json',
    '--pack-destination', temp, resolve(root, 'packages/tree-sitter-coral')], {
    cwd: root, encoding: 'utf8', env: npmEnv,
  });
  if (pack.status !== 0) throw new Error(pack.stderr);
  const created = readdirSync(temp).filter((name) => name.endsWith('.tgz') && !before.has(name));
  if (created.length !== 1) throw new Error(`npm pack created ${created.length} tarballs.`);
  tarball = join(temp, created[0]);
}
const policyKey = `file:${relative(temp, tarball).replaceAll('\\', '/')}`;
await writeFile(join(temp, 'package.json'), JSON.stringify({
  private: true,
  // npm 12 matches this saved local-package spec to its trusted identity on
  // Unix. The explicit Windows build below handles npm 12.0.2's path mismatch.
  allowScripts: { [policyKey]: true, 'tree-sitter': true },
}));
const install = spawnSync(process.execPath, [npmCli, 'install', '--no-package-lock',
  tarball, 'tree-sitter@0.25.1'], { cwd: temp, encoding: 'utf8', env: npmEnv });
if (install.status !== 0) throw new Error(install.stderr);
// npm 12.0.2 cannot match its Windows `file:C:\...` trusted identity to the
// normalized allowScripts key. Build the reviewed local artifact explicitly;
// published registry installs continue to use the package lifecycle approval.
const nodeGyp = resolve(dirname(dirname(npmCli)), 'node_modules/node-gyp/bin/node-gyp.js');
const build = spawnSync(process.execPath, [nodeGyp, 'rebuild'], {
  cwd: join(temp, 'node_modules/tree-sitter-coral'),
  encoding: 'utf8', env: npmEnv,
});
if (build.status !== 0) throw new Error(build.stderr);
const artifactVersion = /^tree-sitter-coral-(\d+\.\d+\.\d+)\.tgz$/.exec(basename(tarball))?.[1];
if (!artifactVersion) throw new Error(`Unrecognized native grammar artifact: ${basename(tarball)}`);
const sample = artifactVersion === '0.2.6'
  ? 'service "Consumer"'
  : '@diagram flowchart\nConsumer process\n';
const load = spawnSync(process.execPath, ['-e',
  `const Parser=require('tree-sitter');const language=require('tree-sitter-coral');const parser=new Parser();parser.setLanguage(language);const tree=parser.parse(${JSON.stringify(sample)});if(!tree.rootNode||tree.rootNode.hasError)process.exit(1)`],
  { cwd: temp, encoding: 'utf8' });
if (load.status !== 0) throw new Error(load.stderr);
console.log(`Native consumer smoke passed on ${actual}.`);
