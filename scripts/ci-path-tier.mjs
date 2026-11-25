import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const activeVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const activeRelease = `dev/releases/${activeVersion}/`;

// Current authorities always require the full matrix even though they are
// Markdown: the root plan and guidance, and every plan or design of the active
// release at any depth (release, slice and CI plans and designs).
const authorityPath = path => path === 'PLAN.md'
  || path === 'CLAUDE.md'
  || (path.startsWith(activeRelease) && /(?:^|[/-])(?:plan|design)\.md$/.test(path))
  || /^dev\/releases\/[^/]+\/plan\.md$/.test(path);

// Only passive release records and root prose are reduced. The docs site holds
// executable examples whose behavior only the full matrix checks.
const narrowPath = path => !authorityPath(path) && (/^dev\/(?:archive\/)?releases\/.+\.md$/.test(path)
  || /^[^/]+\.md$/.test(path));

export function classifyChangedPaths(paths, { finalCandidate = false, unknownBase = false } = {}) {
  const normalized = paths.filter(Boolean);
  const docsAndReleaseRecords = !unknownBase && normalized.length > 0 && normalized.every(narrowPath);
  const fullMatrix = finalCandidate || !docsAndReleaseRecords;
  return {
    tier: fullMatrix ? 'full-matrix' : 'docs-release-records',
    fullMatrix,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = ['--final-candidate', '--stdin', '--unknown-base'];
  const finalCandidate = process.argv.includes('--final-candidate');
  const unknownBase = process.argv.includes('--unknown-base');
  const paths = unknownBase
    ? []
    : process.argv.includes('--stdin')
      ? readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean)
      : process.argv.slice(2).filter(value => !flags.includes(value));
  const result = classifyChangedPaths(paths, { finalCandidate, unknownBase });
  console.log(`tier=${result.tier}`);
  console.log(`full-matrix=${result.fullMatrix}`);
}
