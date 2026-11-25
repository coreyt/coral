import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { validatePlanResponse, type PlanResponse } from '../../../src/llm/plan/decode';
import { executePlan, operationEditability, type ExecutionResult } from '../../../src/llm/plan/execute';
import { capturePlanSnapshot, type PlanCapture } from '../../../src/llm/plan/snapshot';
import { canonicalJson } from '../../../src/sourceOwnedEdits028';
import { captureFixtureDiagram, parityFixture, remapResponse } from './parityFixture';

function capture(source: string, limits?: { nodes: number; relations: number }, selection?: { kind: 'node'; id: string }[]): PlanCapture {
  const result = capturePlanSnapshot({ source, sourceRevision: 1, requestId: 'r', ...(limits ? { limits } : {}), ...(selection ? { selection } : {}) });
  if (!result.ok) throw new Error(result.refusal.message);
  return result.capture;
}
const decode = (taken: PlanCapture, operations: Record<string, unknown>[]): PlanResponse => validatePlanResponse(
  { protocol: 'coral-plan/1', snapshot: taken.token, kind: 'plan', operations: operations.map((op, k) => ({ id: `o${k + 1}`, ...op })) }, taken.view);
const run = (taken: PlanCapture, ...operations: Record<string, unknown>[]) => executePlan(taken, decode(taken, operations));
const compiled = (result: ExecutionResult) => {
  if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
  return result.execution;
};
const refusal = (result: ExecutionResult) => (result.ok ? 'compiled' : result.refusal.code);
const existing = (ref: string) => ({ existing: ref });
const flow = (as: string, first: unknown, second: unknown, extra: Record<string, unknown> = {}) =>
  ({ op: 'edge.add', as, type: 'flow', first: { node: first }, second: { node: second }, direction: 'first-to-second', ...extra });

const DESIGN = '@diagram flowchart\nstart terminal as "Start"\nreview process as "Review request"\ntoReview = start -> review\n';

describe('plan executor and source compiler', () => {
  it('inserts a process in a flow exactly as the design example describes', () => {
    const taken = capture(DESIGN);
    const execution = compiled(run(taken,
      { op: 'node.add', as: 'newReview', parent: null, type: 'process', label: 'Security review' },
      { op: 'edge.remove', target: existing('e1') },
      flow('firstFlow', existing('n1'), { new: 'newReview' }),
      flow('secondFlow', { new: 'newReview' }, existing('n2'))));
    expect(execution.source).toBe('@diagram flowchart\nstart terminal as "Start"\nreview process as "Review request"\n' +
      'securityReview process as "Security review"\nstart -> securityReview\nsecurityReview -> review\n');
    expect(execution.allocations).toEqual({ newReview: 'securityReview', firstFlow: 'edge-1', secondFlow: 'edge-2' });
    expect(execution.dependencies).toEqual({ o1: [], o2: [], o3: ['o1'], o4: ['o1'] });
    expect(execution.changed).toBe(true);
    // The expected meaning was built without printing; it equals the reparsed candidate.
    expect(canonicalJson(projectInstalledSourceToSuccessor028(execution.source).graph)).toBe(canonicalJson(execution.graph));
  });

  it('generates a fresh document from an empty flowchart', () => {
    const execution = compiled(run(capture('@diagram flowchart\n'),
      { op: 'node.add', as: 'x1', parent: null, type: 'terminal', label: 'Start' },
      { op: 'node.add', as: 'x2', parent: null, type: 'process', label: 'Do it' },
      { op: 'node.add', as: 'g', parent: null, type: 'group', label: 'Team' },
      { op: 'node.add', as: 'x3', parent: { new: 'g' }, type: 'datastore', label: 'Café DB' },
      { op: 'node.add', as: 'x4', parent: null, type: 'process', label: 'Do it' },
      { op: 'node.add', as: 'x5', parent: null, type: 'decision', label: '2 ways?' },
      { op: 'node.add', as: 'x6', parent: null, type: 'process' },
      flow('a', { new: 'x1' }, { new: 'x2' }),
      flow('b', { new: 'x2' }, { new: 'x3' }, { label: 'save' }),
      flow('c', { new: 'x5' }, { new: 'x4' }, { first: { node: { new: 'x5' }, port: 'yes' } })));
    expect(execution.source).toBe('@diagram flowchart\nstart terminal as "Start"\ndoIt process as "Do it"\n' +
      'team group as "Team" {\n  cafeDb datastore as "Café DB"\n}\ndoIt2 process as "Do it"\n' +
      'decision2Ways decision as "2 ways?"\nprocess process\n' +
      'start -> doIt\ndoIt -> team.cafeDb as "save"\ndecision2Ways:yes -> doIt2\n');
  });

  it('preserves every untouched byte: comments, CRLF, symbols, positions and opaque fields', () => {
    const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0"/></svg>\n';
    const lines = ['// keep this header', '@diagram flowchart', '@coralVersion "0.2.9"', '',
      '@symbol key {', '  name "Key"', '  size 2 x 2', '  artwork svg """', ...artwork.trimEnd().split('\n'), '"""', '}', '',
      'start terminal [variant: "start"] as "Start" // the entry', 'pinned process as "Pinned" @ (10, 20) pinned',
      'keyed process [symbol: "local.key"]', 'team group as "Team" {', '  // owned by ops', '  db datastore as "DB"', '}',
      'go = start -> pinned [label: "go"]', 'pinned -> keyed', ''];
    const source = lines.join('\r\n');
    const execution = compiled(run(capture(source),
      { op: 'entity.label.set', target: existing('n2'), value: 'Renamed' },
      { op: 'entity.label.unset', target: existing('e1') },
      { op: 'node.add', as: 'x', parent: existing('n4'), type: 'process', label: 'Cache' },
      { op: 'edge.add', as: 'f', type: 'flow', first: { node: existing('n3') }, second: { node: { new: 'x' } }, direction: 'first-to-second' }));
    expect(execution.source).toBe(source
      .replace('pinned process as "Pinned" @', 'pinned process as "Renamed" @')
      .replace('go = start -> pinned [label: "go"]', 'go = start -> pinned')
      .replace('  db datastore as "DB"\r\n}', '  db datastore as "DB"\r\n  cache process as "Cache"\r\n}') +
      'keyed -> team.cache\r\n');
    expect(execution.source.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(execution.graph.userSymbols029).toEqual(capture(source).graph.userSymbols029);
  });

  it('removes labels, connectors and empty nodes, and reports an unchanged plan as no change', () => {
    const source = '@diagram flowchart\na process as "A"\nb process\ng group {\n}\nab = a -> b as "x"\n';
    expect(compiled(run(capture(source), { op: 'entity.label.unset', target: existing('n1') },
      { op: 'edge.remove', target: existing('e1') }, { op: 'node.remove', target: existing('n2') },
      { op: 'node.remove', target: existing('n3') })).source).toBe('@diagram flowchart\na process\n');
    const unchanged = compiled(run(capture(source), { op: 'entity.label.set', target: existing('n1'), value: 'A' },
      { op: 'entity.label.unset', target: existing('n2') }));
    expect(unchanged.changed).toBe(false);
    expect(unchanged.source).toBe(source);
  });

  it('refuses invalid programs before compiling anything', () => {
    const taken = capture(DESIGN);
    expect(refusal(run(taken, { op: 'entity.label.set', target: existing('n1'), value: 'a' },
      { op: 'entity.label.unset', target: existing('n1') }))).toBe('coral.plan.repeated-write');
    expect(refusal(run(taken, { op: 'node.add', as: 'x', parent: null, type: 'process', label: 'A' },
      { op: 'entity.label.set', target: { new: 'x' }, value: 'B' }))).toBe('coral.plan.repeated-write');
    expect(refusal(run(taken, { op: 'edge.remove', target: existing('e1') },
      { op: 'entity.label.set', target: existing('e1'), value: 'x' }))).toBe('coral.plan.removed');
    expect(refusal(run(taken, { op: 'edge.remove', target: existing('e1') },
      { op: 'node.remove', target: existing('n1') }, flow('f', existing('n1'), existing('n2'))))).toBe('coral.plan.removed');
    expect(refusal(run(taken, { op: 'node.add', as: 'x', parent: null, type: 'process' },
      { op: 'node.remove', target: { new: 'x' } }))).toBe('coral.plan.cancellation');
    expect(refusal(run(taken, { op: 'node.add', as: 'x', parent: existing('n2'), type: 'process' }))).toBe('coral.plan.parent');
    expect(refusal(run(taken, { op: 'layout.relative', subject: existing('n1'), target: existing('n2'), relation: 'below', spacing: 'normal' })))
      .toBe('coral.plan.spatial.unmeasured');
  });

  it('enumerates the dependencies that block a non-cascading removal', () => {
    const result = run(capture(DESIGN), { op: 'node.remove', target: existing('n2') });
    expect(result).toEqual({ ok: false, refusal: { code: 'coral.plan.dependency', operation: 'o1', refs: ['e1'],
      message: 'n2 still has e1; remove them first. Removal never cascades.' } });
    const group = run(capture('@diagram flowchart\ng group {\n  a process\n}\n'), { op: 'node.remove', target: existing('n1') });
    expect(!group.ok && group.refusal.refs).toEqual(['n2']);
    expect(compiled(run(capture(DESIGN), { op: 'edge.remove', target: existing('e1') },
      { op: 'node.remove', target: existing('n2') })).dependencies).toEqual({ o1: [], o2: ['o1'] });
  });

  it('refuses compiler, preservation and successor failures with their own reasons', () => {
    const taken = capture('@diagram flowchart\na process // why\nb process\nc process\na -> b\nb -> c\n');
    expect(refusal(run(taken, { op: 'node.remove', target: existing('n1') }))).toBe('coral.plan.dependency');
    expect(refusal(run(taken, { op: 'edge.remove', target: existing('e1') }))).toBe('compiled');
    expect(refusal(run(taken, { op: 'edge.remove', target: existing('e2') }, { op: 'edge.remove', target: existing('e1') },
      { op: 'node.remove', target: existing('n1') }))).toBe('coral.editor.source-node-delete.comment');
    expect(refusal(run(taken, flow('f', existing('n1'), existing('n3'))))).toBe('compiled');
    expect(refusal(run(taken, flow('f', existing('n2'), existing('n3'), { first: { node: existing('n2'), port: 'in' } }))))
      .toBe('coral.editor.source-edge.port');
    expect(refusal(run(taken, { op: 'entity.label.set', target: existing('e1'), value: '' }))).toBe('coral.plan.label.empty-connector');
    // A label Coral cannot hold never passes the decoder; undecoded, the helper's own error is not masked.
    expect(() => executePlan(taken, { protocol: 'coral-plan/1', snapshot: taken.token, kind: 'plan',
      operations: [{ id: 'o1', op: 'entity.label.set', target: existing('n2'), value: 'nul\u0000' }] })).toThrow(/control character/);
    // A full connection limit is a domain refusal of the whole candidate.
    const limited = capture('@diagram flowchart\n@coralVersion "0.2.9"\na process\nb process\nck decision\na -> ck:in\n');
    expect(refusal(run(limited, flow('f', existing('n2'), existing('n3'), { second: { node: existing('n3'), port: 'in' } }))))
      .toBe('coral.plan.successor-invalid');
  });

  it('never executes clarifications or stale plans, and refuses stub writes', () => {
    const taken = capture(DESIGN);
    expect(refusal(executePlan(taken, validatePlanResponse({ protocol: 'coral-plan/1', snapshot: taken.token, kind: 'clarify',
      reason: 'ambiguous', question: 'Which?' }, taken.view)))).toBe('coral.plan.not-a-plan');
    const later = capture(DESIGN);
    expect(refusal(executePlan(later, decode(taken, [{ op: 'entity.label.set', target: existing('n1'), value: 'x' }]))))
      .toBe('coral.plan.stale');
    const partial = capture(`${DESIGN}other process\n`, { nodes: 2, relations: 1 }, [{ kind: 'node', id: 'start' }]);
    expect(refusal(run(partial, { op: 'entity.label.set', target: existing('n2'), value: 'x' }))).toBe('coral.plan.stub');
    expect(refusal(run(partial, { op: 'entity.label.set', target: existing('n1'), value: 'x' }))).toBe('compiled');
  });
});

describe('plan executor review cases', () => {
  const undecoded = (taken: PlanCapture, ...operations: Record<string, unknown>[]) => executePlan(taken,
    { protocol: 'coral-plan/1', snapshot: taken.token, kind: 'plan', operations: operations.map((op, k) => ({ id: `o${k + 1}`, ...op })) } as PlanResponse);

  it('treats spatial constraints as dependents and their IDs as taken', () => {
    const source = '@diagram flowchart\na process as "A"\nb process\nflow1 = a -> b as "go"\nc process\n' +
      'constraint caption: label node a above node b\nconstraint held: edge flow1 above node b\n';
    const taken = capture(source);
    const execution = compiled(run(taken, { op: 'node.add', as: 'x', parent: null, type: 'process', label: 'Caption' },
      flow('f', existing('n3'), { new: 'x' })));
    expect(execution.allocations).toEqual({ x: 'caption2', f: 'edge-1' });
    const dependency = (...operations: Record<string, unknown>[]) => {
      const result = run(taken, ...operations);
      return result.ok ? 'compiled' : `${result.refusal.code} ${result.refusal.refs?.join(',')}`;
    };
    expect(dependency({ op: 'entity.label.unset', target: existing('n1') })).toBe('coral.plan.dependency constraint:caption');
    expect(dependency({ op: 'entity.label.set', target: existing('n1'), value: '' })).toBe('coral.plan.dependency constraint:caption');
    expect(dependency({ op: 'entity.label.set', target: existing('n1'), value: 'B' })).toBe('compiled');
    expect(dependency({ op: 'edge.remove', target: existing('e1') })).toBe('coral.plan.dependency constraint:held');
    expect(dependency({ op: 'entity.label.unset', target: existing('e1') })).toBe('compiled');
    expect(dependency({ op: 'node.remove', target: existing('n2') })).toBe('coral.plan.dependency e1');
    expect(dependency({ op: 'node.remove', target: existing('n3') })).toBe('compiled');
  });

  it('keeps snapshot refs and plan handles apart in refusal refs', () => {
    const result = run(capture(DESIGN), { op: 'node.add', as: 'n1', parent: null, type: 'process' },
      flow('f', { new: 'n1' }, existing('n2')), { op: 'node.remove', target: existing('n2') });
    expect(!result.ok && result.refusal.refs).toEqual(['e1', 'new:f']);
  });

  it('allocates group-qualified IDs, strips accents and allows labelling a new connector once', () => {
    const taken = capture('@diagram flowchart\ncache process\nteam group {\n  db datastore\n}\n');
    const execution = compiled(run(taken,
      { op: 'node.add', as: 'x', parent: existing('n2'), type: 'process', label: 'Cache' },
      { op: 'node.add', as: 'y', parent: existing('n2'), type: 'process', label: 'Résumé step' },
      flow('f', { new: 'x' }, { new: 'y' }), { op: 'entity.label.set', target: { new: 'f' }, value: 'next' }));
    expect(execution.allocations).toEqual({ x: 'team.cache2', y: 'team.resumeStep', f: 'edge-1' });
    expect(execution.source).toBe('@diagram flowchart\ncache process\nteam group {\n  db datastore\n  cache2 process as "Cache"\n' +
      '  resumeStep process as "Résumé step"\n}\nteam.cache2 -> team.resumeStep as "next"\n');
    expect(refusal(run(taken, flow('f', existing('n1'), existing('n3'), { label: 'a' }), { op: 'entity.label.set', target: { new: 'f' }, value: 'b' })))
      .toBe('coral.plan.repeated-write');
  });

  it('removes a positioned node and a connector from a CRLF source', () => {
    const source = '@diagram flowchart\r\na process @ (1, 2)\r\nb process @ (3, 4) pinned\r\nc process\r\nab = a -> b\r\n';
    const execution = compiled(run(capture(source), { op: 'edge.remove', target: existing('e1') },
      { op: 'node.remove', target: existing('n1') }, { op: 'node.remove', target: existing('n2') }));
    expect(execution.source).toBe('@diagram flowchart\r\nc process\r\n');
  });

  it('refuses fields and undecoded references it cannot compile, without touching the capture', () => {
    const taken = capture(DESIGN);
    const before = structuredClone({ source: taken.source, graph: taken.graph, view: taken.view });
    expect(refusal(undecoded(taken, { op: 'node.remove', target: existing('e1') }))).toBe('coral.plan.reference');
    expect(refusal(undecoded(taken, { op: 'edge.remove', target: existing('n1') }))).toBe('coral.plan.reference');
    expect(refusal(undecoded(taken, flow('f', existing('n1'), existing('n2'), { direction: 'both' })))).toBe('coral.plan.not-compiled');
    expect(refusal(undecoded(taken, { op: 'node.add', as: 'x', parent: null, type: 'process', symbol: 'local.key' }))).toBe('coral.plan.not-compiled');
    expect(refusal(run(taken, { op: 'edge.remove', target: existing('e1') }, { op: 'node.remove', target: existing('n2') },
      { op: 'entity.label.set', target: existing('n2'), value: 'x' }))).toBe('coral.plan.removed');
    expect(compiled(run(taken, { op: 'entity.label.set', target: existing('n1'), value: 'Begin' })).changed).toBe(true);
    expect({ source: taken.source, graph: taken.graph, view: taken.view }).toEqual(before);
  });
});

describe('unnamed connectors (owner decisions 2026-11-15)', () => {
  const SOURCE = '@diagram flowchart\na process\nb process\nc process\nd process\na -> b as "ab"\nb -> c as "bc"\nc -> d as "cd"\n';
  const outcome = (result: ExecutionResult) => (result.ok ? result.execution.source : `${result.refusal.code} ${result.refusal.refs?.join(',')}`);
  const remove = (...refs: string[]) => refs.map(ref => ({ op: 'edge.remove', target: existing(ref) }));
  const ids = (result: ExecutionResult) => compiled(result).graph.edges.map(edge => `${edge.id}:${edge.label}`);

  it('removes in any order with the same result, renumbering later unnamed connectors', () => {
    const taken = capture(SOURCE);
    const kept = '@diagram flowchart\na process\nb process\nc process\nd process\nc -> d as "cd"\n';
    expect(outcome(run(taken, ...remove('e1', 'e2')))).toBe(kept);
    expect(outcome(run(taken, ...remove('e2', 'e1')))).toBe(kept);
    expect(ids(run(taken, ...remove('e2', 'e1')))).toEqual(['edge-1:cd']);
    expect(compiled(run(taken, ...remove('e2', 'e1'))).renumbered).toEqual({ 'edge-3': 'edge-1' });
    expect(compiled(run(taken, ...remove('e3'))).renumbered).toEqual({});
    // Removed connectors are reported under their base IDs, in plan order.
    expect(compiled(run(taken, ...remove('e2', 'e1'))).removedEdges).toEqual(['edge-2', 'edge-1']);
    expect(ids(run(taken, ...remove('e1'), { op: 'entity.label.set', target: existing('e3'), value: 'last' })))
      .toEqual(['edge-1:bc', 'edge-2:last']);
    expect(refusal(run(taken, ...remove('e2', 'e3'), { op: 'entity.label.set', target: existing('e3'), value: 'x' }))).toBe('coral.plan.removed');
  });

  it('appends new connectors unnamed, after every existing one, without renumbering them', () => {
    const taken = capture(SOURCE);
    const added = compiled(run(taken, flow('f', existing('n4'), existing('n1'), { label: 'back' })));
    expect(added.source).toBe(`${SOURCE}d -> a as "back"\n`);
    expect(added.graph.edges.map(edge => edge.id)).toEqual(['edge-1', 'edge-2', 'edge-3', 'edge-4']);
    expect(added.allocations).toEqual({ f: 'edge-4' });
    const replaced = run(taken, ...remove('e2'), flow('f', existing('n2'), existing('n4')), { op: 'entity.label.set', target: { new: 'f' }, value: 'skip' });
    expect(ids(replaced)).toEqual(['edge-1:ab', 'edge-2:cd', 'edge-3:skip']);
  });

  it('keeps operationEditability in agreement with executePlan', () => {
    const taken = capture(SOURCE);
    const verdicts = (...refs: string[]) => operationEditability(taken, decode(taken, remove(...refs)))
      .map(v => (v.verdict === 'refused' ? v.refusal.code : v.verdict));
    for (const order of [['e2', 'e3'], ['e3', 'e2'], ['e1', 'e2'], ['e2', 'e1']]) {
      expect(run(taken, ...remove(...order)).ok, order.join()).toBe(true);
      expect(verdicts(...order), order.join()).toEqual(['writable', 'writable']);
    }
  });
});

describe('plan executor on the on-device parity fixture', () => {
  // Every 8th translated plan keeps this to seconds; the full 512-plan run is recorded in status/slice-30.md.
  it('compiles each translated plan with exact preservation, or refuses it with a specific reason', () => {
    const outcomes = new Map<string, number>();
    let sampled = 0;
    parityFixture.replies.filter(reply => 'plan' in reply.expected).forEach((reply, k) => {
      if (k % 8) return;
      const plan = (reply.expected as { plan: { kind: string; operations?: { op: string }[] } }).plan;
      const { capture: taken, refOf } = captureFixtureDiagram(parityFixture.diagrams[reply.diagram].snapshot);
      const response = validatePlanResponse(remapResponse(plan, refOf, taken.token), taken.view);
      const result = executePlan(taken, response);
      const code = result.ok ? 'compiled' : result.refusal.code;
      outcomes.set(code, (outcomes.get(code) ?? 0) + 1);
      if (plan.kind !== 'plan') expect(code).toBe('coral.plan.not-a-plan');
      else if (plan.operations!.some(op => op.op.startsWith('layout.')) && !result.ok) expect(code).toMatch(/^coral\./);
      if (result.ok) {
        expect(canonicalJson(projectInstalledSourceToSuccessor028(result.execution.source).graph)).toBe(canonicalJson(result.execution.graph));
        expect(result.execution.source.startsWith('@diagram flowchart\n')).toBe(true);
      } else expect(result.refusal.message.length).toBeGreaterThan(0);
      sampled++;
    });
    expect(sampled).toBe(64);
    expect(outcomes.get('compiled')).toBeGreaterThan(0);
    for (const code of outcomes.keys()) expect(code).toMatch(/^(compiled|coral\.[\w.-]+)$/);
  }, 60_000);
});
