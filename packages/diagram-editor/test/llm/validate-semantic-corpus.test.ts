import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSemanticCorpus } from './validate-semantic-corpus';

let dir: string;

const KNOWN_GOOD = 'service "API" as api\ndatabase "DB" as db\napi -> db as edge_1 [label: "writes"]\n';

function writeMeta(semanticDir: string, name: string, meta: object): void {
  writeFileSync(join(semanticDir, `${name}.meta.json`), JSON.stringify(meta), 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coral-semantic-validate-test-'));
  mkdirSync(join(dir, 'coral'), { recursive: true });
  mkdirSync(join(dir, 'defects', 'semantic'), { recursive: true });
  writeFileSync(join(dir, 'coral', 'sample.coral'), KNOWN_GOOD, 'utf8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('validateSemanticCorpus', () => {
  it('accepts a well-formed defect and groups it under its slug', () => {
    const semanticDir = join(dir, 'defects', 'semantic');
    writeFileSync(join(semanticDir, 'sample-orphan-node-1.coral'), 'service "API" as api\ndatabase "DB" as db\n', 'utf8');
    writeMeta(semanticDir, 'sample-orphan-node-1', {
      originalFilename: 'sample.coral',
      defectType: 'orphan-node',
      affectedNodeIds: ['db'],
      affectedEdgeIds: [],
      explanation: 'db is now disconnected',
      outputFilename: 'sample-orphan-node-1.coral',
    });

    const { recordsBySlug, failures } = validateSemanticCorpus(dir);

    expect(failures).toEqual([]);
    expect(recordsBySlug.sample).toEqual([
      { defectType: 'orphan-node', affectedNodeIds: ['db'], affectedEdgeIds: [], explanation: 'db is now disconnected', outputFile: 'sample-orphan-node-1.coral' },
    ]);
  });

  it('rejects a defect referencing a node id absent from the known-good file', () => {
    const semanticDir = join(dir, 'defects', 'semantic');
    writeFileSync(join(semanticDir, 'sample-orphan-node-1.coral'), KNOWN_GOOD, 'utf8');
    writeMeta(semanticDir, 'sample-orphan-node-1', {
      originalFilename: 'sample.coral',
      defectType: 'orphan-node',
      affectedNodeIds: ['made-up-id'],
      affectedEdgeIds: [],
      explanation: '...',
      outputFilename: 'sample-orphan-node-1.coral',
    });

    const { recordsBySlug, failures } = validateSemanticCorpus(dir);

    expect(recordsBySlug.sample ?? []).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0].reasons[0]).toContain('made-up-id');
  });

  it('rejects a defect whose output DSL no longer parses (a semantic defect must not break syntax)', () => {
    const semanticDir = join(dir, 'defects', 'semantic');
    writeFileSync(join(semanticDir, 'sample-orphan-node-1.coral'), 'service "API as api\ndatabase "DB" as db\n', 'utf8');
    writeMeta(semanticDir, 'sample-orphan-node-1', {
      originalFilename: 'sample.coral',
      defectType: 'orphan-node',
      affectedNodeIds: ['db'],
      affectedEdgeIds: [],
      explanation: '...',
      outputFilename: 'sample-orphan-node-1.coral',
    });

    const { failures } = validateSemanticCorpus(dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].reasons.some((r) => r.includes('parse error'))).toBe(true);
  });

  it('rejects a meta.json missing required fields, with a specific reason', () => {
    const semanticDir = join(dir, 'defects', 'semantic');
    writeFileSync(join(semanticDir, 'sample-orphan-node-1.coral'), KNOWN_GOOD, 'utf8');
    writeMeta(semanticDir, 'sample-orphan-node-1', {
      originalFilename: 'sample.coral',
      defectType: 'orphan-node',
      outputFilename: 'sample-orphan-node-1.coral',
    });

    const { failures } = validateSemanticCorpus(dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].reasons).toContain('affectedNodeIds is not an array');
  });

  it('returns empty results when defects/semantic does not exist yet', () => {
    rmSync(join(dir, 'defects'), { recursive: true, force: true });
    const { recordsBySlug, failures } = validateSemanticCorpus(dir);
    expect(recordsBySlug).toEqual({});
    expect(failures).toEqual([]);
  });
});
