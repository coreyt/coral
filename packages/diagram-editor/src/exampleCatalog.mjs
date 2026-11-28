const versions = { catalogVersion: '1.0.0', languageVersion: '1.3.0', sourceEdition: '0.2.8', runtimeVersion: '0.2.17' };
const notations = new Set(['block', 'flowchart', 'bpmn', 'code', 'architecture', 'aiml', 'data-engineering', 'sketch', 'uml-class', 'uml-sequence']);
const capabilities = new Set(['source-open', 'source-edit', 'source-save', 'svg-export']);
const identity = /^[a-z][a-z0-9-]*$/;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Validate the shared, deliberately bounded catalog contract; no filesystem/browser dependencies. */
export function validateExampleCatalog(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Missing example catalog.');
  for (const [field, expected] of Object.entries(versions)) {
    if (manifest[field] !== expected) throw new Error(`Unsupported catalog version or edition: ${field}.`);
  }
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('Missing example entries.');
  const ids = new Set();
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.id !== 'string' || !identity.test(entry.id)) throw new Error('Invalid example identity.');
    if (ids.has(entry.id)) throw new Error(`Duplicate example identity: ${entry.id}.`);
    ids.add(entry.id);
    if (!notations.has(entry.notation) || !nonempty(entry.name) || !nonempty(entry.description) || (entry.sourceEdition !== undefined && !['0.2.8', '0.2.9'].includes(entry.sourceEdition))) throw new Error(`Invalid example metadata: ${entry.id}.`);
    if (typeof entry.sourceFile !== 'string' || !/^[a-z][a-z0-9-]*\.coral$/.test(entry.sourceFile)) throw new Error(`Unsafe example source: ${entry.id}.`);
    if (!entry.preview || entry.preview.theme !== 'light' || entry.preview.style !== 'hifi' || !['RIGHT', 'DOWN'].includes(entry.preview.direction) || Object.keys(entry.preview).length !== 3) throw new Error(`Unsupported preview options: ${entry.id}.`);
    if (!Array.isArray(entry.capabilities) || !entry.capabilities.length || entry.capabilities.some(value => !capabilities.has(value)) || new Set(entry.capabilities).size !== entry.capabilities.length) throw new Error(`Unsupported capabilities: ${entry.id}.`);
    if (!Array.isArray(entry.limitations) || !entry.limitations.every(nonempty)) throw new Error(`Invalid limitations: ${entry.id}.`);
  }
  if (!Array.isArray(manifest.retired)) throw new Error('Missing retired examples.');
  for (const entry of manifest.retired) {
    if (!entry || typeof entry.id !== 'string' || !identity.test(entry.id) || ids.has(entry.id) || !nonempty(entry.reason)) throw new Error('Invalid or duplicate retired example.');
    ids.add(entry.id);
  }
  return manifest;
}

export function resolveExample(manifest, catalogVersion, id) {
  validateExampleCatalog(manifest);
  if (catalogVersion !== manifest.catalogVersion) throw new Error('The example catalog version is missing or unsupported.');
  const entry = manifest.entries.find(candidate => candidate.id === id);
  if (!entry) throw new Error(manifest.retired.some(candidate => candidate.id === id)
    ? 'This example is retired and unavailable.' : 'The requested example is missing or unavailable.');
  return entry;
}

export function exampleHref(manifest, id, editorPath = '../') {
  resolveExample(manifest, manifest.catalogVersion, id);
  return `${editorPath}?${new URLSearchParams({ example: id, catalog: manifest.catalogVersion })}`;
}

/** A portable source-owned copy uses the same render/layout inputs as its preview. */
export function createExampleDocument(manifest, id, source) {
  const entry = resolveExample(manifest, manifest.catalogVersion, id);
  if (typeof source !== 'string' || !source.startsWith(`@diagram ${entry.notation}\n`)) {
    throw new Error(`Example source notation mismatch: ${id}.`);
  }
  return {
    schemaVersion: '1.0.0',
    metadata: { name: entry.name, description: entry.description,
      created: '2026-10-19T00:00:00.000Z', modified: '2026-10-19T00:00:00.000Z' },
    content: { format: 'dsl', dslType: 'coral', text: source },
    settings: { notation: entry.notation, renderStyle028: entry.preview.style,
      layout: { algorithm: 'layered', direction: entry.preview.direction } },
  };
}
