import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { readRegistryCoreIdentity } from './graphir-candidate-identity.mjs';

const expected = Object.freeze({
  schemaVersion: '3.0.0',
  schemaSha256: '0769a26cb4afd1d85dcad7b03be2cf35559a230603f92f3182d7af454fc4ad42',
});
const directConsumers = ['language', 'render', 'viz', 'mcp-server', 'browser', 'diagram-editor'];

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const currentIdentity = await readRegistryCoreIdentity();
for (const workspace of directConsumers) {
  const manifest = await readJson(`packages/${workspace}/package.json`);
  const value = manifest.dependencies?.['@graph-ir/core'];
  if (value !== currentIdentity.version) {
    throw new Error(`${workspace} must pin @graph-ir/core exactly to ${currentIdentity.version}; found ${value}`);
  }
  if (/^(?:file:|git(?:\+|:)|https?:)/.test(value)) {
    throw new Error(`${workspace} uses a non-registry @graph-ir/core dependency`);
  }
}

const installedPackage = await readJson('node_modules/@graph-ir/core/package.json');
if (installedPackage.name !== currentIdentity.name || installedPackage.version !== currentIdentity.version) {
  throw new Error('Installed @graph-ir/core package differs from the registry lock version');
}
if (installedPackage.gitHead !== currentIdentity.gitHead) {
  throw new Error(`Installed @graph-ir/core was not built from the tag commit ${currentIdentity.gitHead}`);
}

const snapshotBytes = await readFile(new URL('../packages/language/spec/upstream/graph-ir.schema.json', import.meta.url));
if (sha256(snapshotBytes) !== expected.schemaSha256) {
  throw new Error('Language schema snapshot differs from the approved specification digest');
}
const snapshotSchema = JSON.parse(snapshotBytes);
const installedSchemaBytes = await readFile(new URL('../node_modules/@graph-ir/core/dist/schemas/graph-ir.schema.json', import.meta.url));
const installedSchema = JSON.parse(installedSchemaBytes);
if (JSON.stringify(installedSchema) !== JSON.stringify(snapshotSchema)) {
  throw new Error('Language schema snapshot differs structurally from the published package schema');
}
const installedSpec = await readJson('node_modules/@graph-ir/core/specification.json');
if (installedSpec.schemaVersion !== expected.schemaVersion ||
    installedSpec.schemaSha256 !== expected.schemaSha256) {
  throw new Error('Published package specification identity differs from the approved GraphIR release');
}

const workflowDirectory = new URL('../.github/workflows/', import.meta.url);
for (const name of await readdir(workflowDirectory)) {
  if (!/\.ya?ml$/.test(name)) continue;
  const source = await readFile(new URL(name, workflowDirectory), 'utf8');
  if (/GRAPH_IR_SPEC_READ_TOKEN|coreyt\/graph-IR(?:\.git)?|coreyt\/graph-ir-tools(?:\.git)?/i.test(source)) {
    throw new Error(`${name} contains prohibited cross-repository GraphIR access`);
  }
}

console.log(`GraphIR 3.0.0 provenance and one exact ${currentIdentity.publication} @graph-ir/core@${currentIdentity.version} copy verified; successor behavior is verified against the installed public package.`);
