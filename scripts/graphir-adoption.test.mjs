import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readRegistryCoreIdentity, validateRegistryCoreIdentity } from './graphir-candidate-identity.mjs';

const schemaUrl = new URL('../packages/language/spec/upstream/graph-ir.schema.json', import.meta.url);
const directConsumers = ['language', 'render', 'viz', 'mcp-server', 'browser', 'diagram-editor'];

const expected = {
  schemaVersion: '3.0.0',
  schemaSha256: '0769a26cb4afd1d85dcad7b03be2cf35559a230603f92f3182d7af454fc4ad42',
};

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('all direct public consumers pin one exact current Core identity', async () => {
  const identity = await readRegistryCoreIdentity();
  for (const workspace of directConsumers) {
    const manifest = await json(new URL(`../packages/${workspace}/package.json`, import.meta.url));
    assert.equal(manifest.dependencies['@graph-ir/core'], identity.version, workspace);
  }

  const lock = await json(new URL('../package-lock.json', import.meta.url));
  const installed = lock.packages['node_modules/@graph-ir/core'];
  assert.equal(installed.version, identity.version);
  assert.equal(installed.integrity, identity.integrity);
  if (identity.resolved) assert.equal(installed.resolved, identity.resolved);
  else assert.match(installed.resolved, /^https:\/\/registry\.npmjs\.org\//);
  assert.equal(
    Object.keys(lock.packages).filter((key) => key.endsWith('node_modules/@graph-ir/core')).length,
    1,
  );
});

test('registry dependency identity rejects private paths, wrong versions, other SRI and duplicate copies', () => {
  const core = { version: '0.2.4', resolved: 'https://registry.npmjs.org/@graph-ir/core/-/core-0.2.4.tgz',
    integrity: 'sha512-VaMsdpYUVStDWfx2SCITkVolRaOSlDJ64kfCbfImc2D/shZd64ESGJKhmnJ0a5s6KIe7CCF8a1rR7KQ1C/GzWQ==' };
  const lock = { packages: { 'node_modules/@graph-ir/core': core } };
  assert.equal(validateRegistryCoreIdentity(lock).integrity, core.integrity);
  for (const mutation of [{ version: '0.2.3' }, { resolved: 'file:private-core.tgz' },
    { resolved: 'https://other.example/core.tgz' }, { integrity: 'sha512-wrong' },
    { integrity: `sha512-${Buffer.alloc(64).toString('base64')}` }, { link: true }]) {
    assert.throws(() => validateRegistryCoreIdentity({ packages: {
      'node_modules/@graph-ir/core': { ...core, ...mutation } } }));
  }
  assert.throws(() => validateRegistryCoreIdentity({ packages: {
    ...lock.packages, 'packages/render/node_modules/@graph-ir/core': core } }));
});

test('the installed public Core was built from the v0.2.4 tag commit', async () => {
  const installed = await json(new URL('../node_modules/@graph-ir/core/package.json', import.meta.url));
  assert.equal(installed.gitHead, '606309d66e34dcb2b2a414183a9e43727b56e2fa');
});

test('the checked language schema is the approved GraphIR 3 snapshot', async () => {
  const bytes = await readFile(schemaUrl);
  const schema = JSON.parse(bytes);
  assert.equal(schema.properties.version.const, expected.schemaVersion);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.schemaSha256);
});

test('Coral workflows are repository-local and contain no cross-repository GraphIR access', async () => {
  const workflowNames = ['ci.yml', 'release.yml'];
  for (const name of workflowNames) {
    let source = '';
    try {
      source = await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    assert.doesNotMatch(source, /GRAPH_IR_SPEC_READ_TOKEN/);
    assert.doesNotMatch(source, /coreyt\/graph-IR(?:\.git)?/i);
    assert.doesNotMatch(source, /coreyt\/graph-ir-tools(?:\.git)?/i);
  }
});

test('published core validates GraphIR 3 and exposes the named 2-to-3 migration', async () => {
  const core = await import('@graph-ir/core');
  const current = { version: '3.0.0', id: 'current', nodes: [], edges: [] };
  assert.equal(core.validateIR(current).valid, true);
  assert.equal(core.validateIR({ ...current, version: '2.0.0' }).valid, false);

  const migrated = core.migrateGraphIR2To3({ version: '2.0.0', id: 'old', nodes: [], edges: [] });
  assert.equal(migrated.success, true);
  assert.equal(migrated.migrated?.version, '3.0.0');
  assert.equal(migrated.fromVersion, '2.0.0');
  assert.equal(migrated.toVersion, '3.0.0');
});

test('published core preserves explicit interaction order independently of storage order', async () => {
  const { diffGraphIR, validateIR } = await import('@graph-ir/core');
  const graph = {
    version: '3.0.0', id: 'sequence',
    profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
    nodes: [{ id: 'a', type: 'participant' }, { id: 'b', type: 'participant' }],
    edges: [{ id: 'm', source: 'a', target: 'b' }],
    interaction: {
      participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
      participantOrder: ['a', 'b'],
      messages: [{ id: 'm', edgeId: 'm', sourceParticipantId: 'a', targetParticipantId: 'b' }],
      messageOrder: ['m'],
    },
  };
  assert.equal(validateIR(graph).valid, true);

  const storagePermutation = structuredClone(graph);
  storagePermutation.nodes.reverse();
  storagePermutation.interaction.participants.reverse();
  assert.deepEqual(diffGraphIR(graph, storagePermutation).changes, []);

  const authoredOrderChange = structuredClone(graph);
  authoredOrderChange.interaction.participantOrder.reverse();
  assert.ok(diffGraphIR(graph, authoredOrderChange).changes.some(
    (change) => change.path.includes('interaction.participantOrder'),
  ));

  const invalidReference = structuredClone(graph);
  invalidReference.interaction.messages[0].sourceParticipantId = 'm';
  assert.ok(validateIR(invalidReference).errors.some(
    (error) => error.code === 'WRONG_INTERACTION_REFERENCE_KIND' &&
      error.path === '/interaction/messages/0/sourceParticipantId',
  ));
});

test('published migration reports endpoint conversion and attributable ambiguity', async () => {
  const { migrateGraphIR2To3, validateIR } = await import('@graph-ir/core');
  const migrated = migrateGraphIR2To3({
    version: '2.0.0', id: 'class', metadata: { notation: 'uml-class' },
    nodes: [{ id: 'Account', type: 'classifier', properties: { members: ['+ String name'] } }],
    edges: [{
      id: 'self', source: 'Account', target: 'Account',
      style: { sourceArrow: 'diamond', targetArrow: 'arrow' },
    }],
  });
  assert.equal(migrated.success, true);
  assert.deepEqual(migrated.migrated.edges[0].sourceEnd, {
    marker: { kind: 'diamond', fill: 'unspecified' },
  });
  assert.equal(validateIR(migrated.migrated).valid, true);

  const ambiguous = migrateGraphIR2To3({
    version: '2.0.0', id: 'ambiguous', metadata: { notation: 'uml-class' },
    nodes: [{ id: 'A', type: 'classifier', properties: { members: ['not valid extra'] } }],
    edges: [],
  });
  assert.equal(ambiguous.success, false);
  assert.ok(ambiguous.losses.some(
    (loss) => loss.code === 'AMBIGUOUS_CLASSIFIER_MEMBER' &&
      loss.path === '/nodes/0/properties/members/0',
  ));
});
