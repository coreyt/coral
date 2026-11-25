import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIR } from '@graph-ir/core';
import { describe, expect, it } from 'vitest';
import { recordSpellings, type SpellingEvent } from '../src/occurrences.js';
import { parse } from '../src/parser/index.js';
import { printWithDiagnostics } from '../src/printer/index.js';
import { parse as parseSource, formatDocument028, HEADER_MANIFEST_028 } from '../src/index.js';
import { SPELLINGS } from '../src/spellings.js';
import type { GraphIR } from '../src/types.js';
import type { DiagnosticRange, DiagnosticRelatedLocation } from '../src/diagnostics.js';

interface ConformanceCase {
  id: string;
  category: 'valid' | 'invalid' | 'canonical' | 'roundtrip';
  entryPoint: 'graph-interchange' | 'saved-source' | 'saved-source-029' | 'source-format';
  edition: string;
  lineEndings?: 'crlf';
  staging?: 'available' | 'withheld';
  exactSource?: boolean;
  expectedHeaderDiagnostics?: Array<{ code: string; line: number; column: number; range?: DiagnosticRange }>;
  source: string;
  coverage: string[];
  canonical?: string;
  expectedGraphIR?: string;
  expectedDiagnostics: Array<string | { code: string; line: number; column?: number; range?: DiagnosticRange; related?: readonly DiagnosticRelatedLocation[] }>;
  collides?: string[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'spec', 'conformance');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  cases: ConformanceCase[];
};

const readExact = (path: string) => readFileSync(join(root, path), 'utf8');
const read = (path: string) => readExact(path).trimEnd();
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
  trustedDigests: Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
    (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest]))) };
const graphCases = manifest.cases.filter(({ entryPoint }) => entryPoint === 'graph-interchange');

function semanticGraph<T>(value: T): T {
  const clone = structuredClone(value) as unknown as {
    constraints?: Array<Record<string, unknown>>;
  };
  for (const constraint of clone.constraints ?? []) {
    if (constraint.gap === 0) delete constraint.gap;
    if (constraint.inset === 0) delete constraint.inset;
    if (constraint.alignment === 'center') delete constraint.alignment;
    if (constraint.direction === 'forward') delete constraint.direction;
  }
  return clone as T;
}

describe('Coral Language 1.2.0 graph-interchange conformance corpus', () => {
  for (const fixture of graphCases) {
    it(fixture.id, () => {
      const result = parse(read(fixture.source));
      if (fixture.category === 'invalid') {
        // Exact code/line counts plus full optional primary/related ranges.
        const actual = result.errors.map((error) => {
          const diagnostic = error as typeof error & { code: string };
          return `${diagnostic.code}@${error.line}`;
        }).sort();
        const expected = fixture.expectedDiagnostics.map((entry) => {
          expect(typeof entry, 'invalid expectations are { code, line } entries').toBe('object');
          const { code, line } = entry as { code: string; line: number };
          expect(Number.isInteger(line) && line > 0).toBe(true);
          return `${code}@${line}`;
        }).sort();
        expect(actual).toEqual(expected);
        const remaining = [...result.diagnostics];
        for (const entry of fixture.expectedDiagnostics) {
          if (typeof entry === 'string') continue;
          const index = remaining.findIndex(item => item.code === entry.code && item.line === entry.line && (entry.column === undefined || item.column === entry.column));
          const diagnostic = remaining.splice(index, 1)[0];
          for (const field of ['column', 'range', 'related'] as const) {
            if (entry[field] !== undefined) expect(diagnostic[field], `${entry.code} ${field}`).toEqual(entry[field]);
          }
        }
        expect(result.diagnostics.every(({ severity }) => severity === 'error')).toBe(true);
        return;
      }
      expect(fixture.expectedDiagnostics).toEqual([]);

      expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
      expect(result.graph).toBeDefined();
      expect(validateIR(result.graph!).valid).toBe(true);
      if (fixture.expectedGraphIR) {
        expect(result.graph).toEqual(JSON.parse(read(fixture.expectedGraphIR)));
      }

      const printed = printWithDiagnostics(result.graph!);
      expect(printed.diagnostics).toEqual([]);
      if (fixture.canonical) expect(printed.text).toBe(read(fixture.canonical));

      const replay = parse(printed.text);
      expect(replay.success, JSON.stringify(replay.diagnostics, null, 2)).toBe(true);
      expect(semanticGraph(replay.graph)).toEqual(semanticGraph(result.graph));
      expect(printWithDiagnostics(replay.graph!).text).toBe(printed.text);
    });
  }
});

/**
 * Spelling guard check 3 (R-063 AC-5, design section 9): every parser store
 * of an in-scope field goes through a recorded `assign` or `derive`.
 */
describe('Coral Language spelling recording', () => {
  const matrix = JSON.parse(readFileSync(join(root, '..', 'graphir-field-matrix.json'), 'utf8')) as {
    dispositions: Array<{ record: string; field: string; spellings?: string[] }>;
  };
  const declared = new Set(matrix.dispositions.flatMap(({ record, field, spellings = [] }) =>
    spellings.map((spelling) => `${record}.${field} ${spelling}`)));
  const inScope = (record: string) => matrix.dispositions
    .filter((row) => row.record === record && row.spellings).map(({ field }) => field);

  function record(source: string): { events: SpellingEvent[]; graph: GraphIR } {
    const events: SpellingEvent[] = [];
    const stop = recordSpellings((event) => events.push(event));
    try {
      return { events, graph: parse(source).graph! };
    } finally {
      stop();
    }
  }

  /** Every stored in-scope field, as `[object, path, record]`. */
  function storedFields(graph: GraphIR): Array<[object, string, string]> {
    const out: Array<[object, string, string]> = [];
    const bag = (value: object) => value as Record<string, unknown>;
    for (const field of inScope('GraphIR')) if (bag(graph)[field] !== undefined) out.push([graph, field, 'GraphIR']);
    const walk = (nodes: GraphIR['nodes']) => {
      for (const node of nodes) {
        for (const field of inScope('GraphNode')) {
          const value = bag(node)[field];
          if (value === undefined) continue;
          if (field === 'properties') for (const key of Object.keys(value as object)) out.push([node, `properties.${key}`, 'GraphNode']);
          else out.push([node, field, 'GraphNode']);
        }
        walk(node.children ?? []);
      }
    };
    walk(graph.nodes);
    for (const edge of graph.edges) {
      for (const field of inScope('GraphEdge')) {
        const value = bag(edge)[field];
        if (value === undefined) continue;
        if (field === 'properties') for (const key of Object.keys(value as object)) out.push([edge, `properties.${key}`, 'GraphEdge']);
        else out.push([edge, field, 'GraphEdge']);
      }
      for (const field of inScope('EdgeStyle')) {
        if (edge.style && bag(edge.style)[field] !== undefined) out.push([edge, `style.${field}`, 'EdgeStyle']);
      }
    }
    const records = { relative: 'RelativeConstraint', boundary: 'BoundaryConstraint', arrangement: 'ArrangementConstraint' } as const;
    for (const constraint of graph.constraints ?? []) {
      for (const field of inScope(records[constraint.kind])) {
        if (bag(constraint)[field] !== undefined) out.push([constraint, field, records[constraint.kind]]);
      }
    }
    return out;
  }

  const accepted = graphCases.filter(({ category }) => category !== 'invalid');

  it('SPELLINGS equals the field-matrix pairs', () => {
    expect(new Set(SPELLINGS.map(([row, spelling]) => `${row} ${spelling}`))).toEqual(declared);
  });

  it('the valid, canonical, and round-trip fixtures use exactly the declared pairs', () => {
    const used = new Set<string>();
    for (const fixture of accepted) {
      for (const event of record(read(fixture.source)).events) {
        if (event.kind === 'assign') used.add(`${event.pair![0]} ${event.pair![1]}`);
      }
    }
    expect([...used].filter((pair) => !declared.has(pair)), 'undeclared pairs used').toEqual([]);
    expect([...declared].filter((pair) => !used.has(pair)).sort(), 'declared pairs never used').toEqual([]);
  });

  for (const fixture of accepted) {
    it(`every stored in-scope field of ${fixture.id} is explained by assign or derive`, () => {
      const { events, graph } = record(read(fixture.source));
      const unexplained = storedFields(graph)
        .filter(([target, path]) => !events.some((event) => event.target === target && event.path === path))
        .map(([, path, row]) => `${row}.${path}`);
      expect(unexplained).toEqual([]);
    });
  }

  for (const fixture of graphCases.filter(({ collides }) => collides?.length)) {
    it(`${fixture.id} records each collides row assigned twice on one object`, () => {
      const { events } = record(read(fixture.source));
      for (const row of fixture.collides!) {
        const assigned = events.filter((event) => event.kind === 'assign' && event.pair![0] === row);
        const twice = assigned.some((event) => assigned.filter((other) =>
          other.target === event.target && other.path === event.path).length >= 2);
        expect(twice, row).toBe(true);
      }
    });
  }
});


describe('Coral Language 1.2.0 saved-source editions 0.2.8 and 0.2.9 corpus', () => {
  for (const fixture of manifest.cases.filter(({ entryPoint }) => entryPoint !== 'graph-interchange')) {
    it(fixture.id, () => {
      const source = readExact(fixture.source);
      if (fixture.lineEndings === 'crlf') {
        expect(source).toContain('\r\n');
        expect(source).not.toMatch(/(?<!\r)\n|\r(?!\n)/);
      }
      const result = parseSource(source, runtime);
      // The installed default stays 0.2.8; only an explicit pin selects 0.2.9.
      expect(result.header.effectiveCoralVersion ?? runtime.currentVersion).toBe(fixture.edition);
      if (fixture.entryPoint === 'saved-source-029') {
        expect(source).toMatch(/^@coralVersion "0\.2\.9"\r?$/m);
        // The header scanner alone delimits raw artwork: the body never sees it.
        for (const region of result.header.definitionRegions ?? [])
          expect(result.header.body.slice(region.range.start.offset, region.range.end.offset).trim()).toBe('');
        if (fixture.category !== 'invalid') {
          for (const definition of result.definitions ?? [])
            expect(source.slice(definition.artwork.content.start, definition.artwork.content.end))
              .toBe(definition.artwork.text);
          expect(result.definitions?.length).toBeGreaterThan(0);
        }
      }
      expect(fixture.exactSource).toBe(true);
      expect(result.header.source).toBe(source);
      expect(result.header.body.length).toBe(source.length);
      expect(result.header.diagnostics.map(({ code, range }) => ({
        code, line: range.start.line, column: range.start.column, range,
      }))).toEqual(fixture.expectedHeaderDiagnostics);
      expect(result.syntax.diagnostics.map(({ code, line, column, range }) => ({
        code, line, column, ...(range ? { range } : {}),
      }))).toEqual(fixture.expectedDiagnostics);
      expect(result.graph !== undefined).toBe(fixture.staging === 'available');
      if (fixture.expectedGraphIR) expect(result.graph).toEqual(JSON.parse(read(fixture.expectedGraphIR)));
      // Reading or replaying a draft never canonicalizes its save authority.
      expect(parseSource(result.header.source, runtime)).toEqual(result);
      if (fixture.canonical) {
        const canonical = formatDocument028(source, runtime);
        expect(canonical).toBe(readExact(fixture.canonical));
        if (fixture.lineEndings === 'crlf') expect(canonical).not.toMatch(/(?<!\r)\n|\r(?!\n)/);
        expect(formatDocument028(canonical, runtime)).toBe(canonical);
        expect(parseSource(canonical, runtime).graph).toEqual(result.graph);
      }
      if (fixture.category === 'invalid') expect(() => formatDocument028(source, runtime))
        .toThrow('coral.format028.source.invalid');
      if (fixture.coverage.includes('saved-source-successor-only')) {
        expect(result.header.header).toBeDefined();
        expect(result.syntax.diagnostics).toEqual([]);
        expect(result.graph).toBeUndefined();
        // A structural syntax graph cannot certify complete portable meaning.
        expect(result.syntax.graph).toBeDefined();
      }
    });
  }
});
