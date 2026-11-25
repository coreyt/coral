import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path, { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { collectPublicEntries, generateApiDocs028, isWithinApiPath028, publishApiOutput028, verifyApiDocs028 } from './api-docs.mjs';

const publicEntries = {
  language: { '.': 'dist/index.d.ts', './parser': 'dist/parser/index.d.ts', './sequence': 'dist/sequence.d.ts', './printer': 'dist/printer/index.d.ts', './formats': 'dist/formats/index.d.ts' },
  render: { '.': 'dist/index.d.ts', './layout': 'dist/layout/index.d.ts', './svg-layout': 'dist/svg/layout.d.ts' },
  browser: { '.': 'dist/index.d.ts', './iife': null, './package.json': null },
  viz: { '.': 'dist/index.d.ts', './editor': 'dist/editor/index.d.ts', './layout': 'dist/layout/index.d.ts', './text-editor': 'dist/text-editor/index.d.ts' },
  'mcp-server': { '.': 'dist/index.d.ts' },
  'tree-sitter-coral': { '.': 'bindings/node/index.d.ts' },
};
const language = (changed = false) => `
export interface HeaderRuntime028 { manifest: { name: ${changed ? 'number' : 'string'} }; currentVersion: string; trustedDigests: Record<string, string>; }
export interface HeaderParseResult028 { valid: boolean; }
export interface CandidateResult { source: string; }
export interface GraphIR { nodes: string[]; }
export declare function parseDocument028(source: ${changed ? 'number' : 'string'}, runtime: HeaderRuntime028): { header: HeaderParseResult028; syntax: CandidateResult; graph?: ${changed ? 'string' : 'GraphIR'} };
export { parseDocument028 as parse };
`;
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'coral-api028-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [workspace, exports] of Object.entries(publicEntries)) {
    const base = join(root, 'packages', workspace);
    await mkdir(base, { recursive: true });
    const manifest = { name: workspace === 'tree-sitter-coral' ? workspace : `@coral-viz/${workspace}`, version: '0.2.8' };
    if (['mcp-server', 'tree-sitter-coral'].includes(workspace)) manifest.types = workspace === 'tree-sitter-coral' ? 'bindings/node' : 'dist/index.d.ts';
    else manifest.exports = Object.fromEntries(Object.entries(exports).map(([key, types]) => [key, types ? { types: './' + types, import: './' + types.replace('.d.ts', '.js') } : './metadata.js']));
    await writeFile(join(base, 'package.json'), JSON.stringify(manifest));
    for (const [subpath, path] of Object.entries(exports)) {
      if (!path) continue;
      const file = join(base, path);
      await mkdir(join(file, '..'), { recursive: true });
      let content = 'export declare const value: string;';
      if (workspace === 'language' && subpath === '.') content = language();
      if (workspace === 'language' && subpath === './parser') content = 'export interface ParseOptions { recover: boolean; }\nexport declare function parse(source: string, options?: ParseOptions): string;';
      if (workspace === 'mcp-server') content = 'export {};';
      if (workspace === 'tree-sitter-coral') content = "import Parser = require('tree-sitter'); declare const Coral: Parser.Language; export = Coral;";
      await writeFile(file, content);
    }
  }
  const dependency = join(root, 'node_modules/tree-sitter');
  await mkdir(dependency, { recursive: true });
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'tree-sitter', version: '0.25.1', types: 'index.d.ts' }));
  await writeFile(join(dependency, 'index.d.ts'), 'declare class Parser {} declare namespace Parser { interface Language { name: string; } } export = Parser;');
  return root;
}
const moduleByName = (model, name) => model.children.find(child => child.name === name);
const member = (module, name) => module.children.find(child => child.name === name);
function signature(model) {
  const module = moduleByName(model, '@coral-viz/language');
  const alias = member(module, 'parse');
  return (alias.signatures ? alias : module.children.find(child => child.id === alias.target)).signatures[0];
}
function contract(model) {
  const sig = signature(model);
  const runtime = member(moduleByName(model, '@coral-viz/language'), 'HeaderRuntime028');
  return {
    parameter: sig.parameters[0].type.name,
    returnGraph: sig.type.declaration.children.find(child => child.name === 'graph').type.name,
    publicMember: member(runtime, 'manifest').type.declaration.children[0].type.name,
  };
}

test('public manifest inventory retains typed, native, CLI, and non-type entries', async t => {
  const repository = await fixture(t), entries = await collectPublicEntries(repository);
  assert.equal(entries.length, 17);
  assert.equal(entries.filter(entry => entry.declaration).length, 15);
  assert.equal(entries.filter(entry => entry.status === 'no-type-entry').length, 2);
  assert(entries.some(entry => entry.name === 'tree-sitter-coral' && entry.declaration.endsWith('/index.d.ts')));
  const path = join(repository, 'packages/language/dist/index.d.ts');
  await rm(path);
  await assert.rejects(collectPublicEntries(repository), /build public packages first/);
});

test('real TypeDoc output preserves aliases, return/public types, and Pages links; detects contracts with unchanged manifests', async t => {
  const repository = await fixture(t), output = join(repository, 'build/api');
  const beforeInventory = await collectPublicEntries(repository);
  const first = await generateApiDocs028({ repository, output });
  assert(first.verification.htmlPages > 15);
  assert.deepEqual(await verifyApiDocs028(output), first.verification);
  const initialJson = await readFile(join(output, 'reflection.json'), 'utf8');
  assert(!initialJson.includes(repository));
  assert(!initialJson.includes('coral-api028-test-'));
  const model = JSON.parse(initialJson);
  await generateApiDocs028({ repository, output });
  assert.equal(await readFile(join(output, 'reflection.json'), 'utf8'), initialJson);
  assert.equal(model.children.length, 15);
  assert.deepEqual(contract(model), { parameter: 'string', returnGraph: 'GraphIR', publicMember: 'string' });
  const sig = signature(model), returned = sig.type.declaration.children;
  assert.equal(sig.parameters[1].type.name, 'HeaderRuntime028');
  assert.equal(returned.find(child => child.name === 'header').type.name, 'HeaderParseResult028');
  assert.equal(returned.find(child => child.name === 'syntax').type.name, 'CandidateResult');
  assert.equal(returned.find(child => child.name === 'graph').flags.isOptional, true);
  const lang = moduleByName(model, '@coral-viz/language');
  const parse = member(lang, 'parse'), named = member(lang, 'parseDocument028');
  assert(parse.target === named.id || named.target === parse.id);
  assert.equal(member(moduleByName(model, '@coral-viz/language/parser'), 'parse').signatures[0].parameters[1].name, 'options');
  assert.equal(moduleByName(model, '@coral-viz/mcp-server').children?.length ?? 0, 0);
  const native = moduleByName(model, 'tree-sitter-coral').children[0];
  assert.equal(native.name, 'export=');
  assert.equal(native.type.name, 'Parser.Language');
  assert.equal(native.type.package, 'tree-sitter');
  await writeFile(join(repository, 'packages/language/dist/index.d.ts'), language(true));
  await generateApiDocs028({ repository, output });
  assert.deepEqual(await collectPublicEntries(repository), beforeInventory);
  const changed = JSON.parse(await readFile(join(output, 'reflection.json'), 'utf8'));
  assert.deepEqual(contract(changed), { parameter: 'number', returnGraph: 'string', publicMember: 'number' });
  assert.notDeepEqual(contract(model), contract(changed));
  const index = join(output, 'index.html'), html = await readFile(index, 'utf8');
  await writeFile(index, html + '<a href="missing.html">Broken</a>');
  await assert.rejects(verifyApiDocs028(output), /Missing API link/);
  await writeFile(index, html + '<a href="index.html#missing-fragment">Broken fragment</a>');
  await assert.rejects(verifyApiDocs028(output), /Missing API fragment/);
  await writeFile(index, html + '<a href="/coral/docs/api/index.html">Absolute</a>');
  await assert.rejects(verifyApiDocs028(output), /escapes Pages prefix/);
  await writeFile(index, html + '<script src="https://example.invalid/app.js"></script>');
  await assert.rejects(verifyApiDocs028(output), /Remote API asset/);
  await writeFile(index, html);
  await writeFile(join(output, 'remote.css'), 'body { background: url(https://example.invalid/bg.png); }');
  await assert.rejects(verifyApiDocs028(output), /Remote CSS asset/);
});

test('validation warnings fail without replacing an existing generated site', async t => {
  const repository = await fixture(t), output = join(repository, 'build/api');
  await generateApiDocs028({ repository, output });
  const prior = await readFile(join(output, 'reflection.json'), 'utf8');
  await writeFile(join(repository, 'packages/language/dist/index.d.ts'), language() + '\n/** See {@link missingSymbol}. */\nexport declare function broken(): void;');
  await assert.rejects(generateApiDocs028({ repository, output }), /warnings/);
  assert.equal(await readFile(join(output, 'reflection.json'), 'utf8'), prior);
});

test('generator refuses repository, source, unowned output, and symlink destinations', async t => {
  const repository = await fixture(t);
  await assert.rejects(generateApiDocs028({ repository, output: repository }), /cannot contain/);
  await assert.rejects(generateApiDocs028({ repository, output: join(repository, 'packages/language') }), /docs\/public\/api/);
  const output = join(repository, 'build/unowned');
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'keep.txt'), 'user data');
  await assert.rejects(generateApiDocs028({ repository, output }), /unowned/);
  assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'user data');
  await symlink(join(repository, 'missing'), join(repository, 'build/dangling'));
  await assert.rejects(generateApiDocs028({ repository, output: join(repository, 'build/dangling') }), /symlink/);
  await symlink(output, join(repository, 'build/link'));
  await assert.rejects(generateApiDocs028({ repository, output: join(repository, 'build/link/api') }), /symlink/);
});

test('publication restores prior output, or retains its backup if rollback also fails', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coral-api028-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'api'), stage = join(root, 'stage'), rendered = join(stage, 'rendered');
  await mkdir(destination); await mkdir(rendered, { recursive: true });
  await writeFile(join(destination, 'keep.txt'), 'previous output');
  const denied = new Error('publication denied');
  await assert.rejects(publishApiOutput028(rendered, destination, stage, async (from, to) => {
    if (from === rendered) throw denied;
    return rename(from, to);
  }), /publication denied/);
  assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'previous output');
  await assert.rejects(publishApiOutput028(rendered, destination, stage, async (from, to) => {
    if (from === rendered || from === join(stage, 'previous')) throw denied;
    return rename(from, to);
  }), error => {
    assert.equal(error.backup, join(stage, 'previous'));
    assert.match(error.message, /previous output retained/);
    return true;
  });
  assert.equal(await readFile(join(stage, 'previous/keep.txt'), 'utf8'), 'previous output');
});

test('output containment handles POSIX and Windows child, parent and sibling paths', () => {
  for (const [paths, root] of [[path.posix, '/repo'], [path.win32, 'C:\\repo']]) {
    assert.equal(isWithinApiPath028(root, paths.join(root, 'docs/public/api'), paths), true);
    assert.equal(isWithinApiPath028(paths.join(root, 'docs/public/api'), root, paths), false);
    assert.equal(isWithinApiPath028(root, paths.join(root, '../other'), paths), false);
    assert.equal(isWithinApiPath028(root, root, paths), true);
  }
});


test('CSS URLs and imports resolve at the stylesheet location without remote assets', async t => {
  const output = await mkdtemp(join(tmpdir(), 'coral-api028-css-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const assets = join(output, 'assets'), themes = join(assets, 'themes');
  await mkdir(themes, { recursive: true });
  await writeFile(join(output, 'index.html'), '<link rel="stylesheet" href="assets/style.css">');
  await writeFile(join(output, '.nojekyll'), '');
  await writeFile(join(assets, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(assets, 'base.css'), 'body { color: black; }');
  const file = join(themes, 'theme.css');
  const check = async css => {
    await writeFile(file, css);
    return verifyApiDocs028(output);
  };
  await writeFile(join(assets, 'style.css'), '@import "themes/theme.css";');
  await check('@import "../base.css"; .icon { background: url("../image.svg"); mask: url(data:image/png;base64,AAAA); filter: url(#local-filter); }');
  await check('/* @import \"https://example.invalid/ignored.css\"; url(missing.png); */ @import url(../base.css) screen;');
  await check('.icon { background: url(\"../image.svg?cache=1#mask\"); }');
  await check("@import url('../base.css');");
  await assert.rejects(check('.icon { background: url("missing.png"); }'), /Missing CSS asset/);
  await assert.rejects(check("@import 'missing.css';"), /Missing CSS asset/);
  await assert.rejects(check('@import url(missing.css);'), /Missing CSS asset/);
  await assert.rejects(check('@import "https://example.invalid/theme.css";'), /Remote CSS asset/);
  await assert.rejects(check("@import '//example.invalid/theme.css';"), /Remote CSS asset/);
  await assert.rejects(check('@import url(https://example.invalid/theme.css);'), /Remote CSS asset/);
  await assert.rejects(check('.icon { background: url(https://example.invalid/icon.svg); }'), /Remote CSS asset/);
  await assert.rejects(check('@import "/coral/docs/api/assets/base.css";'), /escapes Pages prefix/);
  await assert.rejects(check('@import "../../../../outside.css";'), /escapes Pages prefix/);
});
