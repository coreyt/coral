/** Build and consume the packed native grammar without publishing or installing it.
 * CORAL_ARTIFACT_DIR selects the verified frozen candidate; otherwise pack fresh. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { npmCommand } from './npm-command.mjs';
import { candidateTarball } from './ci.mjs';

const require = createRequire(import.meta.url);
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
if (process.argv[2] === '--consume') {
  consume(process.argv[3]);
  process.exit(0);
}
const temporary = mkdtempSync(path.join(tmpdir(), 'coral-packed-tree-sitter-'));
const packageRoot = path.join(temporary, 'consumer', 'package');

const lf = (text) => text.replace(/\r\n/g, '\n');

function run(command, args, cwd = root, env = process.env) {
  return execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180_000,
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  const manifest = JSON.parse(readFileSync(path.join(root,
    'packages/tree-sitter-coral/package.json'), 'utf8'));
  assert.equal(manifest.name, 'tree-sitter-coral');
  let tarball;
  if (process.env.CORAL_ARTIFACT_DIR) {
    tarball = await candidateTarball('tree-sitter-coral', path.resolve(process.env.CORAL_ARTIFACT_DIR));
  } else {
    const npm = npmCommand(['pack', '--ignore-scripts', '-w', 'tree-sitter-coral',
      '--pack-destination', temporary]);
    run(npm.command, npm.args, root,
      { ...process.env, npm_config_cache: path.join(temporary, 'npm-cache') });
    tarball = path.join(temporary, `${manifest.name}-${manifest.version}.tgz`);
  }
  assert.ok(existsSync(tarball), 'npm pack did not produce the expected tarball');
  const files = run('tar', ['-tzf', tarball]).split(/\r?\n/);
  for (const name of ['grammar.js', 'src/parser.c', 'src/scanner.c', 'src/node-types.json',
    'queries/highlights.scm', 'bindings/node/binding.cc']) {
    assert.ok(files.includes(`package/${name}`), `Tarball omits ${name}`);
  }

  mkdirSync(path.dirname(packageRoot), { recursive: true });
  run('tar', ['-xzf', tarball, '-C', path.dirname(packageRoot)]);
  // Source text may differ only in checkout line endings; the archive bytes
  // themselves were already checked by exact digest or produced by this pack.
  assert.equal(lf(readFileSync(path.join(packageRoot, 'grammar.js'), 'utf8')),
    lf(readFileSync(path.join(root, 'packages/tree-sitter-coral/grammar.js'), 'utf8')));
  const dependencies = path.join(packageRoot, 'node_modules');
  mkdirSync(dependencies);
  for (const name of ['node-addon-api', 'node-gyp-build']) {
    cpSync(path.dirname(require.resolve(`${name}/package.json`)),
      path.join(dependencies, name), { recursive: true });
  }

  const npmRoot = process.env.npm_execpath
    ? path.resolve(path.dirname(process.env.npm_execpath), '..')
    : path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm');
  const nodeGyp = path.join(npmRoot, 'node_modules/node-gyp/bin/node-gyp.js');
  assert.ok(existsSync(nodeGyp), `npm's bundled node-gyp is missing: ${nodeGyp}`);
  const headers = path.join(homedir(), '.cache/node-gyp', process.versions.node);
  const args = [nodeGyp, 'rebuild'];
  if (existsSync(path.join(headers, 'include/node/node.h'))) args.push(`--nodedir=${headers}`);
  run(process.execPath, args, packageRoot);

  // Windows keeps a loaded addon DLL locked until its process exits, so only a
  // child loads the packed binding and must exit before cleanup.
  process.stdout.write(`${run(process.execPath, [script, '--consume', packageRoot])}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function consume(packageRoot) {
  const Parser = require('tree-sitter');
  const packedRequire = createRequire(path.join(packageRoot, 'package.json'));
  const Coral = packedRequire('./bindings/node');
  const parser = new Parser();
  parser.setLanguage(Coral);
  const profiles = ['architecture', 'flowchart', 'block', 'bpmn', 'erd', 'code',
    'aiml', 'data-engineering', 'sketch', 'uml-class', 'uml-sequence'];
  for (const profile of profiles) {
    const kind = profile === 'uml-sequence' ? 'participant' : 'group';
    assert.equal(parser.parse(`@diagram ${profile}\na ${kind}\nb ${kind}\na -> b\n`)
      .rootNode.hasError, false, profile);
  }
  const ends = ['none', 'arrow', 'filledArrow', 'triangle', 'filledTriangle',
    'diamond', 'filledDiamond', 'circle', 'filledCircle', 'bar', 'crowFoot',
    'zeroOrOne', 'one', 'zeroOrMany', 'oneOrMany', 'zeroToMany'];
  for (const end of ends) {
    const source = `@diagram architecture\na service\nb service\n` +
      `a -> b [firstEnd: ${end}]\n`;
    assert.equal(parser.parse(source).rootNode.hasError, false, end);
  }
  const sequenceExtensions = [
    '@diagram uml-sequence\na participant\nb participant\n' +
      'phase = region "Review" {\n  a -> b\n  region {\n    b -> a\n  }\n}\n',
    '@diagram uml-sequence\na participant\nb participant\n' +
      'team = participants b, a [label: "Team"]\na -> b\n',
  ];
  for (const source of sequenceExtensions)
    assert.equal(parser.parse(source).rootNode.hasError, false, source);
  const malformedExtensions = [
    '@diagram uml-sequence\na participant\nregion Review {\n  a -> a\n}\n',
    '@diagram uml-sequence\na participant\nb participant\nteam = participants a b\n',
    '@diagram uml-sequence\na participant\nteam = participants a,\n',
  ];
  for (const source of malformedExtensions)
    assert.equal(parser.parse(source).rootNode.hasError, true, source);
  assert.equal(parser.parse('@diagram architecture\na service\nb service\n' +
    'a -> b [firstEnd: inventedMark]\n').rootNode.hasError, true);
  for (const control of ['\t', '\u0085', '\u2028', '\u2029']) {
    const source = '@diagram architecture\na service\nb service\n' +
      `a -> b [style: "dotted,${control}red"]\n`;
    assert.equal(parser.parse(source).rootNode.hasError, true,
      `Packed parser accepted raw control U+${control.codePointAt(0).toString(16)}`);
  }
  const raw = '<svg> <!-- // { } @symbol " --> a -> b\n"""x\n</svg>\n';
  const definition = '@diagram architecture\n@coralVersion "0.2.9"\n@symbol dot {\n' +
    '  name "Dot"\n  size 8 x 8\n  p port [direction: in, label: "P", maxConnections: 1]\n' +
    '  artwork svg """\n' + raw + '"""\n}\na service [symbol: "local.dot"]\n';
  const tree = parser.parse(definition);
  assert.equal(tree.rootNode.hasError, false, 'Packed parser rejected an edition 0.2.9 definition');
  assert.equal(tree.rootNode.descendantsOfType('raw_block')[0]?.text, '"""\n' + raw + '"""');
  assert.equal(parser.parse(definition.replace(raw + '"""\n', raw)).rootNode.hasError, true,
    'Packed parser accepted an unclosed raw artwork block');
  process.stdout.write(`Packed native grammar: ${profiles.length} profiles, ` +
    `${ends.length} keyed ends, ${sequenceExtensions.length} sequence extensions, ` +
    `${malformedExtensions.length} rejected extensions, 1 rejected unknown end, ` +
    '4 rejected style controls, 1 raw artwork block, 1 rejected unclosed block');
}
