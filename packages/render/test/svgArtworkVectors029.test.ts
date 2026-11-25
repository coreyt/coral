import { createHash } from 'node:crypto';
import { SVG_ARTWORK_PROFILE_FROZEN_029 } from '../src/artwork/svgArtworkModel029.js';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Structure checks for the coral.svg-artwork profile version 1 vectors.
// The vectors are final: the step C2 admitter reproduces every one of them
// (svgArtworkConformance029.test.ts). This suite checks their shape and
// self-consistency and the frozen profile hash record (profile §15).

const specUrl = new URL('../spec/', import.meta.url);
const vectorsUrl = new URL('svg-artwork-1/vectors/', specUrl);
const profileText = readFileSync(new URL('svg-artwork-1.md', specUrl), 'utf8');

const PROFILE = { id: 'coral.svg-artwork', version: '1' };
const CODES = new Set([
  'coral.artwork.svg.parse',
  'coral.artwork.svg.element.unsupported',
  'coral.artwork.svg.attribute.unsupported',
  'coral.artwork.svg.reference.unsupported',
  'coral.artwork.svg.reference.cycle',
  'coral.artwork.svg.budget.exceeded',
  'coral.artwork.svg.geometry.invalid',
  'coral.artwork.svg.viewbox.invalid',
]);
const BUDGETS = new Set([
  'input.bytes', 'input.elements', 'input.segments', 'nesting', 'reference-depth',
  'bytes', 'elements', 'segments',
]);
const TIER_BYTES = { standard: 65_536, detailed: 262_144 } as const;
const PRIMITIVES = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Part = string | { repeat: string; count: number };
type Expect =
  | { result: 'admitted'; tier: 'standard' | 'detailed'; inputIsCanonical: boolean; canonical?: string; canonicalParts?: Part[]; bytes?: number }
  | { result: 'refused'; codes: string[]; budgets?: string[] };
interface Vector { id: string; description: string; covers: string[]; input?: string; inputParts?: Part[]; expect: Expect }
interface VectorFile { profile: typeof PROFILE; status: string; vectors: Vector[] }
interface Manifest { profile: typeof PROFILE; status: string; files: string[]; requiredCoverage: string[] }

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, vectorsUrl), 'utf8')) as T;
}

function expand(text: string | undefined, parts: Part[] | undefined, where: string): string {
  expect(text === undefined, `${where}: exactly one of text or parts`).not.toBe(parts === undefined);
  if (text !== undefined) {
    expect(typeof text, where).toBe('string');
    return text;
  }
  expect(Array.isArray(parts) && parts.length > 0, `${where}: parts`).toBe(true);
  return parts!.map((part) => {
    if (typeof part === 'string') return part;
    expect(Object.keys(part).sort(), `${where}: part keys`).toEqual(['count', 'repeat']);
    expect(Number.isInteger(part.count) && part.count > 0, `${where}: count`).toBe(true);
    return part.repeat.repeat(part.count);
  }).join('');
}

// Defs list p1…pN then c1…cM in ascending numeric order, and the rendering
// tree first references each kind in that same order (§12.2, §12.3).
function checkCanonicalIds(lines: string[], where: string): void {
  const defsEnd = lines.indexOf('  </defs>');
  const declared = (defsEnd < 0 ? [] : lines.slice(0, defsEnd))
    .flatMap((line) => [.../^ {4}<(?:linearGradient|radialGradient|clipPath) id="([pc][0-9]+)"/.exec(line)?.slice(1) ?? []]);
  const ascending = (kind: string, ids: string[]) => ids.filter((id) => id[0] === kind)
    .every((id, index) => id === `${kind}${index + 1}`);
  const kinds = declared.map((id) => id[0]).join('');
  expect(/^p*c*$/.test(kinds), `${where}: paint servers precede clip paths`).toBe(true);
  expect(ascending('p', declared) && ascending('c', declared), `${where}: defs in ascending numeric ID order`).toBe(true);
  const firstUse: string[] = [];
  for (const line of lines.slice(defsEnd + 1)) {
    for (const match of line.matchAll(/url\(#([pc][0-9]+)\)/g)) if (!firstUse.includes(match[1])) firstUse.push(match[1]);
  }
  expect(ascending('p', firstUse) && ascending('c', firstUse), `${where}: IDs numbered by first reference`).toBe(true);
  expect([...firstUse].sort(), `${where}: every declared ID is referenced`).toEqual([...declared].sort());
}

function checkCanonicalShape(text: string, where: string): void {
  expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'), `${where}: root`).toBe(true);
  expect(text.endsWith('</svg>\n'), `${where}: final line`).toBe(true);
  expect(text.includes('\r') || text.includes('\t'), `${where}: CR or tab`).toBe(false);
  const lines = text.slice(0, -1).split('\n');
  for (const line of lines) {
    expect(line, `${where}: a line exactly """`).not.toBe('"""');
    expect(line, `${where}: indentation and one tag per line`).toMatch(/^(?: {2})*<\/?[a-zA-Z]+(?: [a-zA-Z][a-zA-Z0-9:-]*="[^"&<>]*")*\/?>$/);
  }
  for (const banned of ['currentColor', 'href', 'style=', ' id="', 'xmlns:', '<use', '<title', '<desc', '<!--', '<?xml']) {
    const hits = banned === ' id="' ? text.replace(/ id="[pc][1-9][0-9]*"/g, '') : text;
    expect(hits.includes(banned), `${where}: contains ${banned}`).toBe(false);
  }
  for (const match of text.matchAll(/url\(([^)]*)\)/g)) {
    expect(match[1], `${where}: canonical reference`).toMatch(/^#[pc][1-9][0-9]*$/);
  }
  checkCanonicalIds(lines, where);
  const insideClip = new Set<number>();
  let clipDepth = 0;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('<clipPath')) clipDepth += line.endsWith('/>') ? 0 : 1;
    else if (line.trimStart().startsWith('</clipPath')) clipDepth -= 1;
    else if (clipDepth > 0) insideClip.add(index);
  });
  lines.forEach((line, index) => {
    const name = /^ *<([a-zA-Z]+)/.exec(line)?.[1];
    if (!name || !PRIMITIVES.includes(name)) return;
    for (const attribute of ['fill', 'stroke', 'stroke-width', 'opacity']) {
      const present = line.includes(` ${attribute}="`);
      expect(present, `${where}: <${name}> line ${index + 1} ${attribute}`).toBe(!insideClip.has(index));
    }
  });
}

describe('coral.svg-artwork 1 frozen profile and final vectors', () => {
  const manifest = readJson<Manifest>('manifest.json');

  it('names the profile identity, final vectors and the frozen profile', () => {
    expect(manifest.profile).toEqual(PROFILE);
    expect(manifest.status).toBe('final');
    expect(profileText).toMatch(/^# Coral SVG artwork profile, version 1\n/);
    expect(profileText).toContain('`coral.svg-artwork`');
    expect(profileText).toMatch(/Status: \*\*frozen\*\*/);
  });

  it('joins the production flag, packaged spec and exact freeze hashes', () => {
    expect(SVG_ARTWORK_PROFILE_FROZEN_029).toBe(true);
    const recordUrl = new URL('svg-artwork-1/freeze.json', specUrl);
    const record = JSON.parse(readFileSync(recordUrl, 'utf8')) as { profile: typeof PROFILE; artifacts: Record<string, string> };
    expect(record.profile).toEqual(PROFILE);
    const expected = ['../svg-artwork-1.md', 'vectors/manifest.json', ...manifest.files.map((name) => `vectors/${name}`)].sort();
    expect(Object.keys(record.artifacts).sort()).toEqual(expected);
    for (const [path, hash] of Object.entries(record.artifacts)) {
      expect(createHash('sha256').update(readFileSync(new URL(path, recordUrl))).digest('hex'), path).toBe(hash);
    }
    const pkg = JSON.parse(readFileSync(new URL('../package.json', specUrl), 'utf8'));
    expect(pkg.files).toContain('spec');
  });

  it('lists exactly the vector files present', () => {
    const present = readdirSync(vectorsUrl).filter((name) => name !== 'manifest.json').sort();
    expect([...manifest.files].sort()).toEqual(present);
    expect(present.length).toBeGreaterThan(0);
  });

  const files = manifest.files.map((name) => [name, readJson<VectorFile>(name)] as const);
  const all = files.flatMap(([name, file]) => file.vectors.map((vector) => [name, vector] as const));

  it('gives every file the profile identity and a nonempty vector list', () => {
    for (const [name, file] of files) {
      expect(Object.keys(file).sort(), name).toEqual(['profile', 'status', 'vectors']);
      expect(file.profile, name).toEqual(PROFILE);
      expect(file.status, name).toBe('final');
      expect(file.vectors.length, name).toBeGreaterThan(0);
    }
  });

  it('uses unique, well-formed vector IDs and descriptions', () => {
    const ids = all.map(([, vector]) => vector.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [name, vector] of all) {
      expect(vector.id, name).toMatch(ID_PATTERN);
      expect(vector.description.trim().length, vector.id).toBeGreaterThan(0);
      expect(Array.isArray(vector.covers) && vector.covers.length > 0, vector.id).toBe(true);
    }
  });

  it('covers every required case', () => {
    const covered = new Set(all.flatMap(([, vector]) => vector.covers));
    expect(manifest.requiredCoverage.filter((tag) => !covered.has(tag))).toEqual([]);
  });

  it('gives each vector a well-formed expectation', () => {
    for (const [, vector] of all) {
      const where = vector.id;
      expect(Object.keys(vector).filter((key) => !['id', 'description', 'covers', 'input', 'inputParts', 'expect'].includes(key)), where).toEqual([]);
      const input = expand(vector.input, vector.inputParts, `${where} input`);
      const outcome = vector.expect;
      if (outcome.result === 'admitted') {
        expect(Object.keys(outcome).filter((key) => !['result', 'tier', 'inputIsCanonical', 'canonical', 'canonicalParts', 'bytes'].includes(key)), where).toEqual([]);
        expect(['standard', 'detailed'], where).toContain(outcome.tier);
        const canonical = expand(outcome.canonical, outcome.canonicalParts, `${where} canonical`);
        checkCanonicalShape(canonical, where);
        expect(outcome.inputIsCanonical, `${where}: inputIsCanonical`).toBe(input === canonical);
        const bytes = Buffer.byteLength(canonical, 'utf8');
        if (outcome.bytes !== undefined) expect(bytes, `${where}: bytes`).toBe(outcome.bytes);
        expect(bytes, `${where}: tier bytes`).toBeLessThanOrEqual(TIER_BYTES[outcome.tier]);
      } else {
        expect(outcome.result, where).toBe('refused');
        expect(Object.keys(outcome).filter((key) => !['result', 'codes', 'budgets'].includes(key)), where).toEqual([]);
        expect(outcome.codes.length, where).toBeGreaterThan(0);
        expect(new Set(outcome.codes).size, where).toBe(outcome.codes.length);
        for (const code of outcome.codes) expect(CODES.has(code), `${where}: ${code}`).toBe(true);
        const needsBudgets = outcome.codes.includes('coral.artwork.svg.budget.exceeded');
        expect(outcome.budgets !== undefined, `${where}: budgets`).toBe(needsBudgets);
        for (const budget of outcome.budgets ?? []) expect(BUDGETS.has(budget), `${where}: ${budget}`).toBe(true);
      }
    }
  });

  it('documents every code and budget the vectors use', () => {
    for (const code of CODES) expect(profileText, code).toContain(`\`${code}\``);
    for (const budget of BUDGETS) expect(profileText, budget).toContain(`\`${budget}\``);
  });
});
