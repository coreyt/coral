import { readFileSync, readdirSync } from 'node:fs';
import pathApi, { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Generated VitePress output (git-ignored build and cache) copies sources such
// as the language SPEC, whose fences are graph interchange, not saved Coral.
const GENERATED_DOCS = new Set([join('.vitepress', 'dist'), join('.vitepress', 'cache')]);

function markdownFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return GENERATED_DOCS.has(pathApi.relative(root, path)) ? [] : markdownFiles(path, root);
    }
    return extname(entry.name) === '.md' ? [path] : [];
  });
}

/** Repository-relative example names use '/' on every platform. */
function exampleFile(root: string, path: string, paths: pathApi.PlatformPath = pathApi): string {
  return paths.relative(root, path).split(paths.sep).join('/');
}

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

describe('current public Coral examples', () => {
  it('names example files with POSIX separators on Windows and POSIX checkouts', () => {
    expect(exampleFile('C:\\work\\coral', 'C:\\work\\coral\\packages\\language\\README.md', pathApi.win32))
      .toBe('packages/language/README.md');
    expect(exampleFile('C:\\work\\coral', 'C:\\work\\coral\\README.md', pathApi.win32)).toBe('README.md');
    expect(exampleFile('/work/coral', '/work/coral/docs/use/get-started.md', pathApi.posix))
      .toBe('docs/use/get-started.md');
  });

  it('parses every displayed Coral fence as exact saved 0.2.8 source', () => {
    const sources: Array<{ name: string; source: string }> = [];
    for (const path of [join(repository, 'README.md'),
      join(repository, 'packages/language/README.md'), ...markdownFiles(join(repository, 'docs'))]) {
      const markdown = readFileSync(path, 'utf8');
      let index = 0;
      for (const match of markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)) {
        sources.push({ name: `${exampleFile(repository, path)} fence ${++index}`, source: match[1] });
      }
    }

    // docs/figures.json pins a reviewed 0.2.5 figure by hash; it is historical
    // evidence, not a displayed 0.2.8 source example.
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const name of [
      'README.md fence 1', 'packages/language/README.md fence 1',
      'docs/embed/reference/tree-sitter.md fence 1',
      'docs/use/reference/coral-dsl.md fence 1',
      'docs/use/get-started.md fence 1', 'docs/use/get-started.md fence 2',
    ]) expect(sources.some((example) => example.name === name), name).toBe(true);
    for (const example of sources) {
      const result = parseDocument028(example.source, runtime);
      expect(result.header.source, example.name).toBe(example.source);
      expect(result.header.diagnostics, example.name).toEqual([]);
      expect(result.syntax.diagnostics, example.name).toEqual([]);
      expect(result.graph ?? result.syntax.graph, example.name).toBeDefined();
    }
  });

  it('keeps the authoring skill examples on the saved 0.2.8 source reader', () => {
    const markdown = readFileSync(join(repository, 'skills/coral/SKILL.md'), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)]
      .map((match) => match[1]);
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const [index, source] of sources.entries()) {
      const name = `skills/coral/SKILL.md fence ${index + 1}`;
      const result = parseDocument028(source, runtime);
      expect(result.header.source, name).toBe(source);
      expect(result.header.diagnostics, name).toEqual([]);
      expect(result.syntax.diagnostics, name).toEqual([]);
      if (result.header.header?.diagramType === 'uml-sequence') {
        expect(result.syntax.sequenceItems.map((item) => item.kind), name)
          .toEqual(['edge', 'fragment', 'note']);
      } else expect(result.graph ?? result.syntax.graph, name).toBeDefined();
    }
  });

  it('keeps the validation skill positive and missing-reference examples current', () => {
    const markdown = readFileSync(join(repository, 'skills/coral-validate/SKILL.md'), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)]
      .map((match) => match[1]);
    expect(sources).toHaveLength(2);
    const valid = parseDocument028(sources[0]!, runtime);
    expect(valid.header.diagnostics).toEqual([]);
    expect(valid.syntax.diagnostics).toEqual([]);
    expect(valid.graph).toBeDefined();
    const invalid = parseDocument028(sources[1]!, runtime);
    expect(invalid.header.diagnostics).toEqual([]);
    expect(invalid.syntax.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: sources[1]!.indexOf('missing'),
      }) }),
    }));
    expect(invalid.header.source).toBe(sources[1]);
  });

  it('keeps duplicated Coral skills equal across repository and Claude locations', () => {
    for (const skill of ['coral', 'coral-validate', 'coral-convert', 'coral-explain', 'coral-scaffold']) {
      const maintained = readFileSync(join(repository, `skills/${skill}/SKILL.md`), 'utf8');
      const claude = readFileSync(join(repository, `.claude/skills/${skill}/SKILL.md`), 'utf8');
      expect(claude, skill).toBe(maintained);
    }
  });

  it('parses every complete Claude reference, conversion, and explanation example', () => {
    const skillNames = ['coral-dsl', 'coral-convert', 'coral-explain'];
    let count = 0;
    for (const skill of skillNames) {
      const markdown = readFileSync(join(repository, `.claude/skills/${skill}/SKILL.md`), 'utf8');
      for (const match of markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)) {
        const source = match[1];
        const name = `${skill} fence ${++count}`;
        const result = parseDocument028(source, runtime);
        expect(result.header.source, name).toBe(source);
        expect(result.header.diagnostics, name).toEqual([]);
        expect(result.syntax.diagnostics, name).toEqual([]);
      }
    }
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
