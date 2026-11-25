import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { extractReleaseNotes } from './release-notes.mjs';

test('release notes are the reviewed changelog section in productSha (DRO100-10)', async () => {
  const notes = extractReleaseNotes(await readFile('CHANGELOG.md', 'utf8'), '0.2.6');
  assert.match(notes, /^### Added$/m);
  assert.doesNotMatch(notes, /^## /m);
  const sample = '# Changelog\n\n## 0.2.6\n\n### Added\n\n- A\n\n## 0.2.5\n\n- B\n';
  assert.equal(extractReleaseNotes(sample, '0.2.6'), '### Added\n\n- A\n');
  assert.throws(() => extractReleaseNotes('## Unreleased (0.2.6)\n\n- A\n', '0.2.6'), /## 0\.2\.6/);
  assert.throws(() => extractReleaseNotes('## 0.2.6\n\n## 0.2.5\n', '0.2.6'), /empty/);
});

// CRO100-6: the immutable release notes carry every headline change of the
// release, not only the late language work.
const HEADLINES = Object.freeze([
  ['new browser package', /`@coral-viz\/browser`, a new public package/],
  ['version-pinned CDN URL', /https:\/\/cdn\.jsdelivr\.net\/npm\/@coral-viz\/browser@0\.2\.6\/dist\/coral-browser\.iife\.js/],
  ['UML class notation', /UML class notation \(`uml-class`\)/],
  ['UML sequence notation', /UML sequence notation \(`uml-sequence`\)/],
  ['shared rendering', /`resolveRenderScene`/],
  ['GraphIR 3 adoption', /GraphIR 3\.0 through `@graph-ir\/core` 0\.2\.2/],
  ['GraphIR migration guide', /GraphIR migration guide/],
  ['online-hosted delivery', /online-hosted web application/],
  ['offline shell and ZIP retirement', /offline ZIP download/],
]);

test('the 0.2.6 notes name every headline change of the release (CRO100-6)', async () => {
  const notes = extractReleaseNotes(await readFile('CHANGELOG.md', 'utf8'), '0.2.6');
  for (const [headline, pattern] of HEADLINES) assert.match(notes, pattern, headline);
});
