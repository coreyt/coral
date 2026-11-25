import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FROZEN_CONTRACT } from '../../src/onDeviceModel/contract';
import {
  compactMessages, handleTable, readableRefusal, renderCompactSnapshot, translate, TranslateError, type CompactSnapshot,
} from '../../src/onDeviceModel/translator';
import manifest from '../../src/onDeviceModel/model-manifest.json';

interface Fixture {
  contract: string;
  contractSha256: string;
  diagrams: Record<string, { id: string; request: string; snapshot: CompactSnapshot; snapshotText: string }>;
  replies: { diagram: string; set: string; turn: number; unauthorized: boolean; text: string;
    expected: { plan: unknown } | { rejected: string } }[];
}

// Built by dev/experiments/coralsmol/product/build-parity-fixture.mjs from
// recorded R2e runs: every P1 browser reply, plus every recorded native reply
// that was unauthorized or that the experiment translator rejected.
const fixture = JSON.parse(gunzipSync(readFileSync(join(import.meta.dirname, '../fixtures/onDeviceModel/parity.json.gz'))).toString('utf8')) as Fixture;

const outcome = (text: string, snapshot: CompactSnapshot, table: Awaited<ReturnType<typeof handleTable>>) => {
  try { return { plan: translate(text, snapshot, table) }; } catch (error) {
    if (!(error instanceof TranslateError)) throw error;
    return { rejected: error.message };
  }
};

describe('on-device model contract and translator parity', () => {
  it('freezes the contract text the model was trained on, and the manifest names its hash', () => {
    expect(FROZEN_CONTRACT).toBe(fixture.contract);
    const sha = createHash('sha256').update(FROZEN_CONTRACT).digest('hex');
    expect(sha).toBe(fixture.contractSha256);
    expect(manifest.contract.sha256).toBe(sha);
  });

  it('renders byte-identical messages for every fixture diagram', async () => {
    for (const diagram of Object.values(fixture.diagrams)) {
      const table = await handleTable(diagram.id, diagram.snapshot);
      expect(renderCompactSnapshot(diagram.snapshot, table)).toBe(diagram.snapshotText);
      expect(compactMessages(diagram.request, diagram.snapshot, table)).toEqual([
        { role: 'system', content: fixture.contract },
        { role: 'user', content: diagram.request },
        { role: 'system', content: diagram.snapshotText },
      ]);
    }
  });

  it('translates every recorded reply to the same plan, or rejects where the experiment rejects', async () => {
    const tables = new Map<string, Awaited<ReturnType<typeof handleTable>>>();
    let plans = 0; let rejections = 0; let unauthorized = 0;
    for (const reply of fixture.replies) {
      const diagram = fixture.diagrams[reply.diagram];
      if (!tables.has(reply.diagram)) tables.set(reply.diagram, await handleTable(diagram.id, diagram.snapshot));
      const actual = outcome(reply.text, diagram.snapshot, tables.get(reply.diagram)!);
      if ('plan' in reply.expected) {
        expect(actual, `${reply.diagram} turn ${reply.turn}`).toEqual(reply.expected);
        plans++;
      } else {
        expect(actual, `${reply.diagram} turn ${reply.turn}`).toHaveProperty('rejected');
        rejections++;
      }
      if (reply.unauthorized) unauthorized++;
    }
    expect(fixture.replies.filter(r => r.set === 'p1-browser')).toHaveLength(209);
    expect(plans + rejections).toBe(fixture.replies.length);
    expect(rejections).toBeGreaterThan(0);
    expect(unauthorized).toBeGreaterThan(200);
  });

  it('rejects special tokens, padding and unknown handles rather than repairing them', async () => {
    const diagram = fixture.diagrams[fixture.replies[0].diagram];
    const table = await handleTable(diagram.id, diagram.snapshot);
    for (const text of ['delete e1<|im_end|>', 'label n1 "<|im_start|>x"', ' delete e1', 'delete e1\n', '', 'delete e999', 'unknown n1']) {
      expect(() => translate(text, diagram.snapshot, table), JSON.stringify(text)).toThrow(TranslateError);
    }
  });

  it('rejects a question that offers the same item twice', async () => {
    const diagram = fixture.diagrams[fixture.replies[0].diagram];
    const table = await handleTable(diagram.id, diagram.snapshot);
    const [a, b] = diagram.snapshot.nodes.map(node => table.toHandle.get(node.ref)!);
    expect(translate(`ask ambiguous ${a} | ${b}`, diagram.snapshot, table)).toMatchObject({ kind: 'clarify' });
    for (const text of [`ask ambiguous ${a} | ${a}`, `ask ambiguous ${a} ${b} | ${b}`]) {
      expect(() => translate(text, diagram.snapshot, table), text).toThrow(TranslateError);
    }
  });

  it('names the entities a refusal lists by their labels, and leaves other words alone', () => {
    const { snapshot } = fixture.diagrams[fixture.replies[0].diagram];
    const [node, other] = snapshot.nodes as { ref: string; label?: string; sourceId: string }[];
    const message = `${node.ref} is a terminal, not a container; ${other.ref} stays.`;
    expect(readableRefusal({ message, refs: [node.ref] }, snapshot))
      .toBe(`"${node.label ?? node.sourceId}" is a terminal, not a container; ${other.ref} stays.`);
    expect(readableRefusal({ message }, snapshot)).toBe(message);
  });
});
