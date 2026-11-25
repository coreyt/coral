import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';

const root = resolve(import.meta.dirname, '../../..');
const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

function coralBlocks(path: string): string[] {
  const markdown = readFileSync(resolve(root, path), 'utf8');
  return [...markdown.matchAll(/^[ \t]*```coral\n([\s\S]*?)^[ \t]*```/gm)].map((match) => {
    const lines = match[1]!.replace(/\n$/, '').split('\n');
    const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length));
    return lines.map((line) => line.slice(indent)).join('\n') + '\n';
  });
}

describe('user-facing Coral examples use the installed 0.2.8 language', () => {
  it.each([
    'docs/use/get-started.md',
    'docs/use/how-to/place-and-edit-objects.md',
    'docs/use/reference/coral-dsl.md',
  ])('parses every Coral block in %s', (path) => {
    const blocks = coralBlocks(path);
    expect(blocks.length, path).toBeGreaterThan(0);
    for (const source of blocks) {
      expect(source, path).toMatch(/^@diagram /);
      const document = parseDocument028(source, runtime);
      expect([...document.header.diagnostics, ...document.syntax.diagnostics], `${path}\n${source}`).toEqual([]);
      expect(document.graph ?? document.syntax.graph, `${path}\n${source}`).toBeDefined();
    }
  });
});
