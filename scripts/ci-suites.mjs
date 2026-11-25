import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Executable ownership, not a historical evidence or assertion-count ledger.
// Each root script test has one owning suite per platform. Windows runs every
// current contract plus the path/process/filesystem fixtures that must execute
// on real Windows, each once, until equivalence is classified.
const CONTRACTS = Object.freeze([
  'api-docs', 'api-docs-build', 'documentation-examples',
  'graphir-adoption', 'verify-local-successor-bridge', 'offline-retirement', 'online-delivery',
  'example-catalog', 'canvas-creation-contract', 'capability-truth', 'library-docs',
  'contributor-docs', 'markdown-corpus', 'language-spec', 'coral-corpus',
  'fuzz-model',
]);
const WINDOWS_FIXTURES = ['check-toolchain', 'npm-command', 'clean', 'candidate-artifacts'];
export const SCRIPT_SUITES = Object.freeze({
  source: [
    'check-toolchain', 'session-start-hook', 'clean', 'npm-command',
    'workflow-policy', 'ci-workflow', 'release-controls', 'release-readiness',
    'release-version', 'workspace-audit', 'braces-risk', 'packed-package',
    'candidate-artifacts', 'ci-final-candidate', 'release-archive-contract',
    'renderer-candidate-config', 'github-release-guard', 'release-notes', 'pages-restore',
    'release-workflow-steps', 'release-closure', 'cdn-readback', 'api-compat',
    'consumer-generation', 'performance-policy',
  ],
  contracts: CONTRACTS,
  windows: Object.freeze([...new Set([...CONTRACTS, ...WINDOWS_FIXTURES])]),
});

const root = resolve(import.meta.dirname, '..');
export function suiteFiles(name) {
  if (!Object.hasOwn(SCRIPT_SUITES, name)) throw new Error('Unknown script suite: ' + name);
  const files = SCRIPT_SUITES[name].map(file => join('scripts', file + '.test.mjs'));
  const missing = files.filter(file => !existsSync(join(root, file)));
  if (missing.length) throw new Error('Script suite ' + name + ' names missing tests: ' + missing.join(', '));
  return files.map(file => join(root, file));
}
