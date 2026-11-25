/** Current candidate inventory checks; inspection never executes package code. */
export function validatePackedPackage028(manifest, files, { name, version }) {
  const errors = [];
  const fail = message => errors.push(`${name}: ${message}`);
  if (manifest.name !== name || manifest.version !== version) fail('packed name/version mismatch');
  const safe = path => typeof path === 'string' && !path.includes('\\')
    && path.startsWith('package/') && !path.split('/').some(part => part === '..' || part === '.');
  if (new Set(files).size !== files.length || files.some(path => !safe(path))) fail('unsafe or duplicate inventory path');
  if (files.some(path => /(?:^|\/)(?:node_modules|dev|test-results)\//.test(path))) fail('development output in archive');
  for (const file of ['package.json', 'README.md', 'LICENSE']) {
    if (!files.includes(`package/${file}`)) fail(`missing ${file}`);
  }
  const declarations = files.some(path => /^package\/dist\/.*\.d\.(?:ts|mts)$/.test(path));
  if (name === 'tree-sitter-coral') {
    if (!files.includes('package/src/parser.c')) fail('missing native parser');
  } else if (!declarations) fail('missing declarations');

  const targetExists = (target, directory = false, types = false) => {
    if (typeof target !== 'string') return false;
    const path = `package/${target.replace(/^\.\//, '')}`;
    if (!safe(path)) return false;
    if (path.includes('*')) {
      const pattern = new RegExp(`^${path.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      return files.some(file => pattern.test(file));
    }
    return files.includes(path) || (directory && files.includes(`${path}/index.${types ? 'd.ts' : 'js'}`));
  };
  const checkExport = value => {
    if (value === null) return;
    if (typeof value === 'string') {
      if (!value.startsWith('./') || !targetExists(value)) fail(`missing or unsafe export ${value}`);
    } else if (Array.isArray(value)) {
      for (const item of value) checkExport(item);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) checkExport(item);
    } else fail('invalid export target');
  };
  if (manifest.exports !== undefined) checkExport(manifest.exports);
  for (const field of ['main', 'types', 'module', 'unpkg', 'jsdelivr']) {
    if (manifest[field] !== undefined && !targetExists(manifest[field], true, field === 'types')) fail(`missing ${field} target`);
  }
  if (typeof manifest.browser === 'string') {
    if (!targetExists(manifest.browser)) fail('missing browser target');
  } else if (manifest.browser && typeof manifest.browser === 'object') {
    for (const [source, replacement] of Object.entries(manifest.browser)) {
      if (source.startsWith('.') && !targetExists(source)) fail('missing browser source');
      if (replacement !== false && (typeof replacement !== 'string'
        || !targetExists(replacement))) fail('missing or unsafe browser replacement');
    }
  }
  const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const target of bins) if (!targetExists(target)) fail('missing bin target');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, spec] of Object.entries(manifest[field] ?? {})) {
      if (!isRegistryDependency(spec)) fail(`non-registry ${field}.${dependency}`);
      if (dependency.startsWith('@coral-viz/') && spec !== version) fail(`wrong Coral dependency ${dependency}`);
      if (dependency === '@graph-ir/core' && spec !== '0.2.4') fail('wrong frozen Core dependency');
    }
  }
  return errors;
}

export function isRegistryDependency(spec) {
  if (typeof spec !== 'string' || !spec.trim()) return false;
  // Registry tags and semver range tokens only. npm also treats bare .tgz
  // names and ~/ paths as local files; a protocol blacklist misses those.
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(spec)) return true;
  const token = /^(?:[~^<>=]*v?(?:[0-9]+|[xX*])(?:\.(?:[0-9]+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|-)$/;
  return spec.split(/\s*\|\|\s*|\s+/).filter(Boolean).every(part => token.test(part));
}
