import { describe, expect, it } from 'vitest';
// The reference decoder fixture, which judged every recorded reply (W-19).
import { decodeResponse } from './fixtures/reference-decode.mjs';
import { decodePlanResponse } from '../../src/llm/plan/decode';
import { parityFixture } from '../llm/plan/parityFixture';

type Json = Record<string, unknown>;
const encoder = new TextEncoder();

function outcome(decode: () => unknown): string {
  try { return `accepted ${JSON.stringify(decode())}`; } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw error;
    return 'rejected';
  }
}

/** Each mutation of one response, as raw text; null when it does not apply. */
const mutations: Record<string, (response: Json) => string | null> = {
  original: r => JSON.stringify(r),
  'unknown top-level key': r => JSON.stringify({ ...r, extra: 1 }),
  'duplicate key': r => `{"protocol":"coral-plan/1",${JSON.stringify(r).slice(1)}`,
  'truncated': r => JSON.stringify(r).slice(0, Math.floor(JSON.stringify(r).length / 2)),
  'stale token': r => JSON.stringify({ ...r, snapshot: 'sdeadbe' }),
  'wrong kind': r => JSON.stringify({ ...r, kind: r.kind === 'plan' ? 'clarify' : 'plan' }),
  'fenced': r => `\`\`\`json\n${JSON.stringify(r)}\n\`\`\``,
  'unknown operation key': r => (r.kind === 'plan' ? JSON.stringify(withOp(r, op => ({ ...op, note: 'x' }))) : null),
  'unknown operation': r => (r.kind === 'plan' ? JSON.stringify(withOp(r, op => ({ ...op, op: 'node.rename' }))) : null),
  'missing field': r => (r.kind === 'plan' ? JSON.stringify(withOp(r, op => {
    const [field] = Object.keys(op).filter(key => key !== 'id' && key !== 'op');
    const { [field]: _dropped, ...rest } = op;
    return rest;
  })) : null),
  'unknown existing ref': r => (JSON.stringify(r).includes('"existing"')
    ? JSON.stringify(r).replace(/"existing":"[^"]*"/, '"existing":"zz999"') : null),
  'undeclared new ref': r => (JSON.stringify(r).includes('"existing"')
    ? JSON.stringify(r).replace(/\{"existing":"[^"]*"\}/, '{"new":"zz"}') : null),
  'unoffered type': r => (r.kind === 'plan' && (r.operations as Json[]).some(op => op.op === 'node.add')
    ? JSON.stringify(withOp(r, op => (op.op === 'node.add' ? { ...op, type: 'io' } : op), true)) : null),
  'no operations': r => (r.kind === 'plan' ? JSON.stringify({ ...r, operations: [] }) : null),
  'too many operations': r => (r.kind === 'plan'
    ? JSON.stringify({ ...r, operations: Array.from({ length: 33 }, (_, k) => ({ ...(r.operations as Json[])[0], id: `m${k}` })) }) : null),
};

function withOp(response: Json, change: (op: Json) => Json, all = false): Json {
  const operations = response.operations as Json[];
  return { ...response, operations: operations.map((op, k) => (all || k === 0 ? change(op) : op)) };
}

describe('production and experimental decoder agreement', () => {
  it('agree on every fixture plan and on its mutations', () => {
    let compared = 0; let accepted = 0;
    const applied: Record<string, number> = {}; const rejected: Record<string, number> = {};
    for (const reply of parityFixture.replies) {
      if (!('plan' in reply.expected)) continue;
      const snapshot = parityFixture.diagrams[reply.diagram].snapshot;
      for (const [name, mutate] of Object.entries(mutations)) {
        const text = mutate(reply.expected.plan as Json);
        if (text === null) continue;
        const experimental = outcome(() => decodeResponse(encoder.encode(text), snapshot));
        const production = outcome(() => decodePlanResponse(encoder.encode(text), snapshot));
        expect(production, `${reply.diagram} turn ${reply.turn}: ${name}`).toBe(experimental);
        compared++;
        applied[name] = (applied[name] ?? 0) + 1;
        if (name === 'original') accepted += production.startsWith('accepted') ? 1 : 0;
        else rejected[name] = (rejected[name] ?? 0) + (production === 'rejected' ? 1 : 0);
      }
    }
    // Every plan is accepted as recorded; every mutation is rejected by both.
    expect(accepted).toBe(applied.original);
    const { original: _original, ...mutated } = applied;
    expect(rejected).toEqual(mutated);
    expect(accepted).toBeGreaterThan(500);
    expect(compared).toBeGreaterThan(5000);
  });
});
