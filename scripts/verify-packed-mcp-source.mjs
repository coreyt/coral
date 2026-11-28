/** Manual check: current Coral source conversion through a clean installed MCP
 * client, using the locked public GraphIR Core package. Not part of CI.
 * CORAL_ARTIFACT_DIR selects the verified frozen candidate; otherwise the three
 * workspaces are built and packed freshly. Performs no publication. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readRegistryCoreIdentity, validateRegistryCoreIdentity } from './graphir-candidate-identity.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { npmCommand } from './npm-command.mjs';
import { verifiedCandidate } from './ci.mjs';

const root = resolve(import.meta.dirname, '..');
const names = ['@coral-viz/language', '@coral-viz/render', '@coral-viz/mcp-server'];
const staging = mkdtempSync(join(tmpdir(), 'coral-028-packed-mcp-source-'));
const environment = { ...process.env, npm_config_cache: join(staging, 'npm-cache'), npm_config_logs_max: '0' };
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300_000, env: environment,
});
// Windows npm is a .cmd shim; run its CLI with the active Node and literal arguments.
const npm = (args, cwd) => {
  const command = npmCommand(args, { env: environment });
  return run(command.command, command.args, cwd);
};

try {
  const core = await readRegistryCoreIdentity();
  const artifacts = join(staging, 'artifacts');
  const consumer = join(staging, 'consumer');
  mkdirSync(artifacts); mkdirSync(consumer);
  const archives = [];
  const archiveIntegrity = new Map([[core.name, core.integrity]]);
  if (process.env.CORAL_ARTIFACT_DIR) {
    const directory = resolve(process.env.CORAL_ARTIFACT_DIR);
    const candidate = await verifiedCandidate(directory);
    for (const name of names) {
      const pkg = candidate.packages.find((item) => item.name === name);
      assert.ok(pkg, `candidate manifest omits ${name}`);
      archiveIntegrity.set(name, pkg.integrity);
      archives.push(join(directory, pkg.filename));
    }
  } else {
    for (const name of names) npm(['run', 'build', '-w', name]);
    for (const name of names) {
      const response = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--workspace', name,
        '--pack-destination', artifacts]));
      const packed = Array.isArray(response) ? response[0] : Object.values(response)[0];
      archiveIntegrity.set(name, packed.integrity);
      archives.push(join(artifacts, packed.filename));
    }
  }
  for (const [index, archive] of archives.entries()) {
    const manifest = JSON.parse(run('tar', ['-xOf', archive, 'package/package.json']));
    assert.equal(manifest.name, names[index]);
    assert.equal(manifest.version, RENDERER_CANDIDATE.version);
  }
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'coral-028-packed-mcp-source-check', version: '1.0.0', type: 'module', private: true,
  }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund',
    `@graph-ir/core@${core.version}`, ...archives], consumer);
  const lock = JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8'));
  assert.equal(validateRegistryCoreIdentity(lock).resolved, core.resolved, 'public Core registry URL');
  const isolated = realpathSync(consumer);
  for (const name of ['@graph-ir/core', ...names]) {
    const location = relative(isolated, realpathSync(join(consumer, 'node_modules', name)));
    assert.ok(location && !location.startsWith('..') && !isAbsolute(location),
      `${name} must be installed inside the isolated consumer`);
    assert.equal(lock.packages[`node_modules/${name}`]?.integrity, archiveIntegrity.get(name),
      `${name} installed integrity`);
  }
  const mcpBin = join(consumer, 'node_modules/@coral-viz/mcp-server/dist/index.js');
  const check = join(consumer, 'verify.mjs');
  writeFileSync(check, `import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'packed-coral-source-check', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath,
  args: [${JSON.stringify(mcpBin)}] }));
const input = ['sequenceDiagram', 'participant A', 'participant B',
  'Note over A,B: shared', 'A->>B: before', 'alt accepted', 'A->>B: request',
  'else rejected', 'B-->>A: denied', 'end', 'A-)B: between', 'loop retry',
  'A->>B: again', 'end'].join('\\n');
try {
  assert.equal(client.getServerVersion()?.version, ${JSON.stringify(RENDERER_CANDIDATE.version)},
    'installed MCP runtime must advertise the active package release');
  const converted = await client.callTool({ name: 'coral_convert', arguments: {
    content: input, from: 'mermaid', to: 'coral', strict: true,
  } });
  assert.ok(!converted.isError, JSON.stringify(converted.structuredContent));
  assert.deepEqual(converted.structuredContent?.diagnostics, []);
  const output = converted.content.find((item) => item.type === 'text')?.text ?? '';
  const start = output.indexOf('@diagram uml-sequence');
  assert.ok(start >= 0, 'installed writer must return Coral 0.2.8');
  const source = output.slice(start);
  assert.ok(source.includes('note "shared" on A, B'));
  assert.ok(source.includes('alt "accepted" {'));
  assert.ok(source.includes('} else "rejected" {'));
  assert.ok(source.includes('loop "retry" {'));
  const validated = await client.callTool({ name: 'coral_validate', arguments: { content: source } });
  assert.ok(!validated.isError, JSON.stringify(validated.structuredContent));
  assert.deepEqual(validated.structuredContent?.diagnostics, []);
  const identity = await client.callTool({ name: 'coral_convert', arguments: {
    content: source, from: 'coral', to: 'coral', strict: true,
  } });
  assert.ok(!identity.isError, JSON.stringify(identity.structuredContent));
  const identityText = identity.content.find((item) => item.type === 'text')?.text ?? '';
  assert.equal(identityText.slice(identityText.indexOf('@diagram')), source,
    'installed identity conversion must preserve the exact generated source');
  const invalid = '@diagram flowchart\\n@profileVersion "1.' + String.fromCharCode(9) +
    '0.0"\\nentry process\\n';
  const invalidValidation = await client.callTool({ name: 'coral_validate', arguments: {
    content: invalid,
  } });
  assert.equal(invalidValidation.isError, true);
  assert.ok(invalidValidation.structuredContent?.diagnostics?.some(({ code, range }) =>
    code === 'header.string.control' && range?.start.offset === invalid.indexOf(String.fromCharCode(9))));
  const invalidExport = await client.callTool({ name: 'coral_convert', arguments: {
    content: invalid, from: 'coral', to: 'json', strict: true,
  } });
  assert.equal(invalidExport.isError, true);
  assert.equal(invalidExport.structuredContent?.nodeCount, 0);
  assert.ok(invalidExport.structuredContent?.diagnostics?.some(({ code }) =>
    code === 'header.string.control'));
  assert.ok(!invalidExport.content.some((item) => item.type === 'text' &&
    item.text.includes('"version": "4.0.0"')));
  const exported = await client.callTool({ name: 'coral_convert', arguments: {
    content: source, from: 'coral', to: 'json', strict: true,
  } });
  assert.ok(!exported.isError, JSON.stringify(exported.structuredContent));
  assert.deepEqual(exported.structuredContent?.modelVerification,
    { scope: 'full', complete: true }, 'installed MCP candidate export needs full model verification');
  const text = exported.content.find((item) => item.type === 'text')?.text ?? '';
  const graph = JSON.parse(text.slice(text.indexOf('{')));
  assert.equal(graph.version, '4.0.0');
  assert.deepEqual(graph.interaction.messages.map(({ id }) => id),
    ['msg_1', 'msg_2', 'msg_3', 'msg_4', 'msg_5']);
  assert.deepEqual(graph.interaction.items, [
    { kind: 'note', id: 'note-1' }, { kind: 'message', id: 'msg_1' },
    { kind: 'fragment', id: 'fragment-1' }, { kind: 'message', id: 'msg_4' },
    { kind: 'fragment', id: 'fragment-2' },
  ]);
  assert.deepEqual(graph.interaction.fragments.map(({ id, kind }) => ({ id, kind })),
    [{ id: 'fragment-1', kind: 'alt' }, { id: 'fragment-2', kind: 'loop' }]);
  assert.deepEqual(graph.interaction.fragments[0].operands.map(({ items }) => items), [
    [{ kind: 'message', id: 'msg_2' }], [{ kind: 'message', id: 'msg_3' }],
  ]);
  assert.deepEqual(graph.interaction.fragments[1].operands[0].items,
    [{ kind: 'message', id: 'msg_5' }]);
  assert.deepEqual(graph.interaction.notes.map(({ id, text }) => ({ id, text })),
    [{ id: 'note-1', text: 'shared' }]);
  const checkedGraph = await client.callTool({ name: 'coral_validate', arguments: {
    content: JSON.stringify(graph), strict: true,
  } });
  assert.ok(!checkedGraph.isError, JSON.stringify(checkedGraph.structuredContent));
  assert.deepEqual(checkedGraph.structuredContent?.diagnostics, []);
  for (const [unsupported, expectedCode] of [
    ['gantt\\n  title Plan\\n  section A\\n  Task :a1, 2026-01-01, 5d',
      'mermaid.diagram.unsupported'],
    ['flowchart LR\\n  api[API] --> db[(Database)]',
      'mermaid.flowchart.shape.degraded'],
  ]) {
    const refusal = await client.callTool({ name: 'coral_convert', arguments: {
      content: unsupported, from: 'mermaid', to: 'coral', strict: true,
    } });
    assert.equal(refusal.isError, true);
    assert.ok(refusal.structuredContent?.diagnostics?.some(({ code }) => code === expectedCode));
    assert.ok(!refusal.content.some((item) => item.type === 'text' && item.text.includes('@diagram')));
  }
  console.log('Installed MCP source conversion, identity, export and refusals passed.');
} finally { await client.close(); }
`);
  process.stdout.write(run(process.execPath, [check], consumer));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
