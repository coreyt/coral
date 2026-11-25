import { describe, expect, it } from 'vitest';
import { validatePlanResponse } from '../../src/llm/plan/decode';
import { executePlan } from '../../src/llm/plan/execute';
import { capturePlanSnapshot, type CaptureResult, type CompactSnapshot } from '../../src/llm/plan/snapshot';
import { compactSnapshot, coralPlan, inputCapMessage, TRAINED_TYPES } from '../../src/onDeviceModel/eligibility';
import { handleTable, renderCompactSnapshot, translate } from '../../src/onDeviceModel/translator';
import { coralSource, parityFixture } from '../llm/plan/parityFixture';

const capture = (source: string, selection?: { kind: 'node'; id: string }[]): CaptureResult =>
  capturePlanSnapshot({ source, sourceRevision: 1, geometryRevision: 1, requestId: 'r', ...(selection ? { selection } : {}) });
const compact = (source: string) => {
  const result = compactSnapshot(capture(source));
  if (!result.ok) throw new Error(result.refusal.message);
  return result.snapshot;
};
const refusal = (result: ReturnType<typeof compactSnapshot>) => (result.ok ? 'eligible' : result.refusal);
/** A fixture diagram written as Coral: the model's `datastore` is Coral's `database`. */
const asCoral = (snapshot: CompactSnapshot) => coralSource({ ...snapshot,
  nodes: snapshot.nodes.map(node => ({ ...node, type: node.type === 'datastore' ? 'database' : node.type })) });

describe('on-device compact snapshot', () => {
  it('equals the experiment snapshot text for every fixture diagram', async () => {
    const diagrams = Object.values(parityFixture.diagrams);
    expect(diagrams.length).toBeGreaterThan(500);
    for (const diagram of diagrams) {
      const product = compact(asCoral(diagram.snapshot));
      // Handles are a seeded shuffle of list positions, so they depend on the
      // request ID, the token and the order nodes are listed in. The product
      // lists them in document order; list them in the fixture's order here.
      const bySourceId = new Map(product.nodes.map(node => [node.sourceId, node]));
      const snapshot = { ...product, snapshot: diagram.snapshot.snapshot,
        nodes: diagram.snapshot.nodes.map(node => bySourceId.get(node.sourceId)!) };
      expect(snapshot.nodes).toHaveLength(product.nodes.length);
      expect(renderCompactSnapshot(snapshot, await handleTable(diagram.id, snapshot)), diagram.id).toBe(diagram.snapshotText);
    }
  }, 120_000);

  it('shows local IDs, trained ports and types, and no selection', () => {
    const snapshot = compact('@diagram flowchart\nask decision as "OK?"\nstep process\n' +
      'team group {\n  db database as "Orders"\n}\nask:yes -> step\n');
    expect(snapshot.selected).toEqual([]);
    expect(snapshot.nodes).toEqual([
      { ref: 'n1', sourceId: 'ask', type: 'decision', label: 'OK?', parent: null, ports: [{ id: 'yes' }, { id: 'no' }] },
      { ref: 'n2', sourceId: 'step', type: 'process', parent: null },
      { ref: 'n3', sourceId: 'team', type: 'group', parent: null },
      { ref: 'n4', sourceId: 'db', type: 'datastore', label: 'Orders', parent: 'n3' },
    ]);
    const selected = compactSnapshot(capture('@diagram flowchart\na process\n', [{ kind: 'node', id: 'a' }]));
    expect(selected.ok && selected.snapshot.selected).toEqual([]);
  });

  it('maps each Coral type to a trained type, one to one', () => {
    expect(TRAINED_TYPES).toEqual({ terminal: 'terminal', process: 'process', decision: 'decision', database: 'datastore', group: 'group' });
  });

  it('writes the model\'s datastore as a Coral database', async () => {
    const result = capture('@diagram flowchart\nstart terminal\n');
    const adapted = compactSnapshot(result);
    if (!result.ok || !adapted.ok) throw new Error('ineligible');
    const table = await handleTable('r', adapted.snapshot);
    const decoded = validatePlanResponse(translate('add x1 datastore "Archive" in root', adapted.snapshot, table), result.capture.view);
    expect(coralPlan(decoded)).toMatchObject({ operations: [{ op: 'node.add', type: 'database' }] });
    const executed = executePlan(result.capture, coralPlan(decoded));
    expect(executed.ok && executed.execution.source).toBe('@diagram flowchart\nstart terminal\narchive database as "Archive"\n');
  });
});

describe('on-device eligibility refusals', () => {
  const cases: [string, ReturnType<typeof compactSnapshot>, string, RegExp][] = [
    ['invalid source', compactSnapshot(capture('@diagram flowchart\na process\na -> missing\n')),
      'coral.plan.snapshot.invalid', /source errors/],
    ['another profile', compactSnapshot(capture('@diagram architecture\napi service\n')),
      'coral.plan.snapshot.profile', /flowcharts only/],
    ['untrained node type', compactSnapshot(capture('@diagram flowchart\nin io as "Read input"\n')),
      'coral.on-device.type', /"Read input", a io node.*terminal, process, decision, database and group/],
    ['generic type word', compactSnapshot(capture('@diagram flowchart\nstore datastore\n')),
      'coral.on-device.type', /store, a datastore node/],
    ['untrained relation type', compactSnapshot(capture('@diagram flowchart\na process\nb process\nnote = a -> b [type: annotation]\n')),
      'coral.on-device.relation', /flow arrows only.*annotation/],
    ['too large to describe', compactSnapshot(capturePlanSnapshot({ source: `@diagram flowchart\n${
      Array.from({ length: 201 }, (_, k) => `p${k} process\n`).join('')}`, sourceRevision: 1, geometryRevision: 1, requestId: 'r' })),
      'coral.plan.snapshot.too-large', /too large/],
    ['partial view', compactSnapshot(capturePlanSnapshot({ source: `@diagram flowchart\n${
      Array.from({ length: 201 }, (_, k) => `p${k} process\n`).join('')}`, sourceRevision: 1, geometryRevision: 1, requestId: 'r',
      selection: [{ kind: 'node', id: 'p0' }] })), 'coral.on-device.too-large', /too large/],
    ['untrained port', compactSnapshot(capture('@diagram flowchart\np process as "Pay"\nq process\np:out -> q\n')),
      'coral.on-device.port', /out port of "Pay".*yes and no ports/],
    ['untrained decision port', compactSnapshot(capture('@diagram flowchart\nd decision\nq process\nq -> d:in\n')),
      'coral.on-device.port', /in port of d/],
    ['editor busy', compactSnapshot({ ok: false, refusal: { code: 'coral.plan.busy', message: 'internal' } }),
      'coral.plan.busy', /still updating/],
  ];
  it.each(cases)('refuses %s in plain words', (_name, result, code, message) => {
    expect(refusal(result)).toMatchObject({ code });
    expect(!result.ok && result.refusal.message).toMatch(message);
  });

  it('refuses an over-long prompt in plain words', () => {
    expect(inputCapMessage(2300, 2048)).toBe('This request and diagram are too long for the on-device model ' +
      '(2300 tokens; the limit is 2048). Shorten the request or try a smaller flowchart.');
  });
});
