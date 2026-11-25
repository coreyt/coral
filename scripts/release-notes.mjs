import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// DRO100-10: the GitHub release notes are the reviewed `## <version>` section
// of CHANGELOG.md in the product SHA, never generated at release time.
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.indexOf(`## ${version}`);
  if (start < 0) throw new Error(`CHANGELOG.md has no final ## ${version} section`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  if (!body) throw new Error(`CHANGELOG.md ## ${version} section is empty`);
  return `${body}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2];
  process.stdout.write(extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version));
}
