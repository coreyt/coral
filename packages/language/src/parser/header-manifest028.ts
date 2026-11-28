import type { HeaderManifest028 } from './header028.js';

/**
 * Provisional installed editions for the staged 0.2.8 source reader.
 * Every digest is tested against the corresponding render catalog. Changing
 * a catalog's meaning must create a new edition, not mutate this identity.
 */
const manifest: HeaderManifest028 = {
  '0.2.8': {
    block: {
      profiles: [{ id: 'block', version: '1.0.0' }],
      catalogs: [{ id: 'block', version: '1.0.0',
        digest: 'sha256-872cdba0f0b10121e16a5f94146f274b26da1976ab0953ce2e28ca9ee4c9fca4' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    flowchart: {
      profiles: [{ id: 'flowchart', version: '1.0.0' }],
      catalogs: [{ id: 'flowchart', version: '1.0.0',
        digest: 'sha256-246bcb5c2370073023bbff21a3e3b7452aadb72352644505522df08de1de86fc' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    architecture: {
      profiles: [{ id: 'architecture', version: '1.0.0' }],
      catalogs: [{ id: 'architecture', version: '1.0.0',
        digest: 'sha256-79f8605c47f88f7b39d988a2e6e7ab5666b0523962db2a6f7aab5c336b5c6ea5' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    bpmn: {
      profiles: [{ id: 'bpmn', version: '1.0.0' }],
      catalogs: [{ id: 'bpmn', version: '1.0.1',
        digest: 'sha256-45b2c4b832e893c4966ec31808c4af9180da597a34e4df0ca454ca52e320e853' }],
      compatible: [['1.0.0', '1.0.1']], defaults: ['1.0.0', '1.0.1'],
    },
    erd: {
      enabled: false,
      profiles: [{ id: 'erd', version: '1.0.0' }],
      catalogs: [{ id: 'erd', version: '1.0.0',
        digest: 'sha256-3c9ffa26304c0fc49836dd018ff72444a2dc9e776c13098970e79e95efc69c96' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    code: {
      profiles: [{ id: 'code', version: '1.0.0' }],
      catalogs: [{ id: 'code', version: '1.0.0',
        digest: 'sha256-b96f75851f9bdff9dbb3505729b45efc794e9692b9bd9cc66cc61342f7c936a2' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    aiml: {
      profiles: [{ id: 'aiml', version: '1.0.0' }],
      catalogs: [{ id: 'aiml', version: '1.0.0',
        digest: 'sha256-fa03ec1ddc9c3dee68f1f1873bcd9d6f60b733ae62e923c0c10fa8f6004bc94b' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    'data-engineering': {
      profiles: [{ id: 'data-engineering', version: '1.0.0' }],
      catalogs: [{ id: 'data-engineering', version: '1.0.0',
        digest: 'sha256-aca518356af047536964fdb6c73fdae7681e494b24815846575bc360c16fa898' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    sketch: {
      profiles: [{ id: 'sketch', version: '1.0.0' }],
      catalogs: [{ id: 'sketch', version: '1.0.0',
        digest: 'sha256-4a36d9143d3b6f678e019b43e32146fee3628d7ae6a3345e50dc9d020bbe6a54' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    'uml-sequence': {
      profiles: [{ id: 'uml', kind: 'sequence', version: '1.0.0' }],
      catalogs: [{ id: 'uml-sequence', version: '1.0.0',
        digest: 'sha256-eecf2a75c554bfd9fae724b600fcde151ee4f14ab00d304f708e05960c529350' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    'uml-class': {
      profiles: [{ id: 'uml', kind: 'class', version: '1.0.0' }],
      catalogs: [{ id: 'uml-class', version: '1.0.0',
        digest: 'sha256-3369f5b1c1e7c9965935c3d4bbf8748c4fa84e00dfc653d7aac82b7990a1c485' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
    'uml-state': {
      profiles: [{ id: 'uml-state', version: '1.0.0' }],
      catalogs: [{ id: 'uml-state', version: '1.0.0',
        digest: 'sha256-8f61c3d209dd43a7307a2ba35fdab054877727302d78a387306653059cfba429' }],
      compatible: [['1.0.0', '1.0.0']], defaults: ['1.0.0', '1.0.0'],
    },
  },
};

/** Edition 0.2.9 extends the 028 reader family with document-local symbol
 * definitions and port label and connection-limit fields. It installs exactly
 * the 0.2.8 profiles, catalogs and digests. */
manifest['0.2.9'] = JSON.parse(JSON.stringify(manifest['0.2.8'])) as HeaderManifest028[string];

/** Edition 0.2.14 extends Coral with node style/technology/description/provider,
 * edge technology/description/endpoint labels, N1 approvedTypeWords, Crow's Foot
 * ERD (enabling erd and retiring Chen), expanded block/architecture catalogs,
 * cloud infrastructure, camelCase relation mappings, and symmetric UML attribute
 * visibility. */
const edition0214 = JSON.parse(JSON.stringify(manifest['0.2.8'])) as HeaderManifest028[string];
const digests0214: Record<string, string> = {
  block: 'sha256-dd0923b6f4058dc0bd67e54c33abb087a224fd2ad9b79cd8ccaaf4dc743efe7e',
  erd: 'sha256-3cdd1e70ab93292dd38aba713c026661283e66df04fb6d3f1dfb29af24e0aafb',
  code: 'sha256-053fdf6270114df0fb356c36b14c3c9282067b9c18dda3be98bf9bf5b3128da2',
  architecture: 'sha256-53e81d82aad7b30c36e9cde1ea06becab645e8b9bdcea1ef86fc53dc1ae8f47c',
  aiml: 'sha256-aba23bd2ba00c9e4b92a1238e66b1b5a423d8b4a36820c89efbd520407bd5760',
  'data-engineering': 'sha256-b4f4a43d180626a01d0b1c2d646175ac03b192c06b8f33790d5675cae4ed423c',
  sketch: 'sha256-e0b6ceb7c382f81e3f3841ef03946df2d3b9581cacd3d636c571a45234edd85b',
};
for (const [id, digest] of Object.entries(digests0214)) {
  const entry = edition0214[id]!;
  delete entry.enabled;
  entry.catalogs = [{ id, version: '1.1.0', digest }];
  entry.compatible = [['1.0.0', '1.1.0']];
  entry.defaults = ['1.0.0', '1.1.0'];
}
edition0214.infrastructure = {
  profiles: [{ id: 'infrastructure', version: '1.0.0' }],
  catalogs: [{
    id: 'infrastructure',
    version: '1.0.0',
    digest: 'sha256-83f62279be1b07a20393fd001351159db8f7023b7ff2eecf2539c5cbd0812143',
  }],
  compatible: [['1.0.0', '1.0.0']],
  defaults: ['1.0.0', '1.0.0'],
};
manifest['0.2.14'] = edition0214;

/** Edition 0.2.17 extends Coral 0.2.14 with full visual & hierarchical UML State
 * machine support (initial, state, final, choice, fork, join, composite/group, note). */
const edition0217 = JSON.parse(JSON.stringify(edition0214)) as HeaderManifest028[string];
edition0217['uml-state'] = {
  profiles: [{ id: 'uml-state', version: '1.0.0' }],
  catalogs: [{
    id: 'uml-state',
    version: '1.1.0',
    digest: 'sha256-528426177521c593c78acfbb60541dd1e92e88d5054bb6caceeae1f773d07489',
  }],
  compatible: [['1.0.0', '1.1.0']],
  defaults: ['1.0.0', '1.1.0'],
};
manifest['0.2.17'] = edition0217;

function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeDeep(child);
  Object.freeze(value);
}
freezeDeep(manifest);
export const HEADER_MANIFEST_028: HeaderManifest028 = manifest;
