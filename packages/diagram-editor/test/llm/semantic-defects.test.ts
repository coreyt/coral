import { describe, it, expect } from 'vitest';
import { validateSemanticDefect } from './semantic-defects';

const KNOWN_GOOD = 'service "API" as api\ndatabase "DB" as db\napi -> db as edge_1 [label: "writes"]\n';

describe('validateSemanticDefect', () => {
  it('accepts a record whose affected ids exist and whose output DSL still parses cleanly', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'orphan-node', affectedNodeIds: ['db'], affectedEdgeIds: ['edge_1'], explanation: 'db has no edges', outputFilename: 'x-orphan-node-1.coral' },
      KNOWN_GOOD,
      'service "API" as api\ndatabase "DB" as db\n',
    );
    expect(result).toMatchObject({ unknownNodeIds: [], unknownEdgeIds: [], outputParseErrors: [], valid: true });
  });

  it('rejects a record referencing a node id that does not exist in the known-good DSL', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'orphan-node', affectedNodeIds: ['nonexistent'], explanation: '...', outputFilename: 'x-orphan-node-1.coral' },
      KNOWN_GOOD,
      KNOWN_GOOD,
    );
    expect(result.valid).toBe(false);
    expect(result.unknownNodeIds).toEqual(['nonexistent']);
  });

  it('rejects a record referencing an edge id that does not exist', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'reversed-relationship-direction', affectedNodeIds: [], affectedEdgeIds: ['nope'], explanation: '...', outputFilename: 'x-reversed-relationship-direction-1.coral' },
      KNOWN_GOOD,
      KNOWN_GOOD,
    );
    expect(result.valid).toBe(false);
    expect(result.unknownEdgeIds).toEqual(['nope']);
  });

  it('rejects an output DSL that is no longer syntactically valid (a semantic defect must not also break syntax)', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'orphan-node', affectedNodeIds: ['db'], explanation: '...', outputFilename: 'x-orphan-node-1.coral' },
      KNOWN_GOOD,
      'service "API as api\ndatabase "DB" as db\n',
    );
    expect(result.valid).toBe(false);
    expect(result.outputParseErrors.length).toBeGreaterThan(0);
  });

  it('rejects an unchanged output that does not contain a semantic mutation', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'orphan-node', affectedNodeIds: ['db'], explanation: '...', outputFilename: 'x-orphan-node-1.coral' },
      KNOWN_GOOD,
      KNOWN_GOOD,
    );
    expect(result.valid).toBe(false);
    expect(result.outputUnchanged).toBe(true);
  });

  it('rejects a formatting-only rewrite whose parsed graph is unchanged', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'orphan-node', affectedNodeIds: ['db'], explanation: '...', outputFilename: 'x-orphan-node-1.coral' },
      KNOWN_GOOD,
      `\n${KNOWN_GOOD}`,
    );
    expect(result.valid).toBe(false);
    expect(result.outputGraphUnchanged).toBe(true);
  });

  it('rejects an unrelated graph mutation when none of the declared affected entities changed', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'node-type-role-mismatch', affectedNodeIds: ['db'], explanation: '...', outputFilename: 'x-node-type-role-mismatch-1.coral' },
      KNOWN_GOOD,
      'module "API" as api\ndatabase "DB" as db\napi -> db as edge_1 [label: "writes"]\n',
    );
    expect(result.valid).toBe(false);
    expect(result.affectedChangeObserved).toBe(false);
  });

  it('rejects declaration-order-only changes as the same semantic graph', () => {
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'node-type-role-mismatch', affectedNodeIds: ['db'], explanation: '...', outputFilename: 'x-node-type-role-mismatch-1.coral' },
      KNOWN_GOOD,
      'database "DB" as db\nservice "API" as api\napi -> db as edge_1 [label: "writes"]\n',
    );
    expect(result.valid).toBe(false);
    expect(result.outputGraphUnchanged).toBe(true);
    expect(result.affectedChangeObserved).toBe(false);
  });

  it('rejects object-property-order-only changes as the same semantic graph', () => {
    const known = 'service "API" as api data { "description": "x", "variant": "y" }\n';
    const reordered = 'service "API" as api data { "variant": "y", "description": "x" }\n';
    const result = validateSemanticDefect(
      { originalFilename: 'x.coral', defectType: 'node-type-role-mismatch', affectedNodeIds: ['api'], explanation: '...', outputFilename: 'x-node-type-role-mismatch-1.coral' },
      known,
      reordered,
    );
    expect(result.valid).toBe(false);
    expect(result.outputGraphUnchanged).toBe(true);
    expect(result.affectedChangeObserved).toBe(false);
  });
});
