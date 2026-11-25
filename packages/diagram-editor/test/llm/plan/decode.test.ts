import { describe, expect, it } from 'vitest';
import { decodePlanResponse, PlanDecodeError, validatePlanResponse, type PlanSnapshotView } from '../../../src/llm/plan/decode';
import { PLAN_CAPABILITIES, PLAN_LIMITS, planResponseJsonSchema, type PlanCapability } from '../../../src/llm/plan/registry';
import { parityFixture as fixture } from './parityFixture';

const view: PlanSnapshotView = {
  snapshot: 's42', capabilities: 'flowchart-plan-v1',
  nodes: [{ ref: 'n1' }, { ref: 'n2' }, { ref: 'g1' }], relations: [{ ref: 'e1' }],
};
const envelope = { protocol: 'coral-plan/1', snapshot: 's42' };
const insert = { ...envelope, kind: 'plan', operations: [
  { id: 'o1', op: 'node.add', as: 'newReview', parent: null, type: 'process', label: 'Security review' },
  { id: 'o2', op: 'edge.remove', target: { existing: 'e1' } },
  { id: 'o3', op: 'edge.add', as: 'f1', type: 'flow', first: { node: { existing: 'n1' } }, second: { node: { new: 'newReview' } }, direction: 'first-to-second' },
  { id: 'o4', op: 'edge.add', as: 'f2', type: 'flow', first: { node: { new: 'newReview' }, port: 'out' }, second: { node: { existing: 'n2' } }, direction: 'first-to-second' },
  { id: 'o5', op: 'layout.boundary', subject: { new: 'newReview' }, side: 'top', scope: { kind: 'group', target: { existing: 'g1' } }, spacing: 'wide' },
] };
const plan = (...operations: unknown[]) => ({ ...envelope, kind: 'plan', operations });
const op = (fields: Record<string, unknown>) => ({ id: 'o1', ...fields });

const category = (raw: string | Uint8Array, against = view) => {
  try { decodePlanResponse(raw, against); return 'accepted'; } catch (error) {
    if (!(error instanceof PlanDecodeError)) throw error;
    return error.category;
  }
};
const rejects = (value: unknown, expected: string) => expect(category(JSON.stringify(value)), JSON.stringify(value)).toBe(expected);

describe('coral-plan/1 strict decoder', () => {
  it('accepts every plan the on-device translator produces on the parity fixture, unchanged', () => {
    let count = 0;
    for (const reply of fixture.replies) {
      if (!('plan' in reply.expected)) continue;
      const snapshot = fixture.diagrams[reply.diagram].snapshot;
      const label = `${reply.diagram} turn ${reply.turn}`;
      expect(validatePlanResponse(structuredClone(reply.expected.plan), snapshot), label).toEqual(reply.expected.plan);
      expect({ ...decodePlanResponse(JSON.stringify(reply.expected.plan), snapshot) }, label).toEqual(reply.expected.plan);
      count++;
    }
    expect(count).toBeGreaterThan(500);
  });

  it('accepts the design examples, including spatial operations and every response kind', () => {
    for (const value of [insert,
      plan(op({ op: 'entity.label.set', target: { existing: 'n2' }, value: '' })),
      plan(op({ op: 'entity.label.unset', target: { existing: 'e1' } })),
      plan(op({ op: 'node.remove', target: { existing: 'n1' } })),
      plan(op({ op: 'layout.relative', subject: { existing: 'n1' }, target: { existing: 'n2' }, relation: 'below', spacing: 'normal' })),
      plan(op({ op: 'layout.arrange', members: [{ existing: 'n1' }, { existing: 'n2' }], axis: 'row', direction: 'reverse', spacing: 'compact' })),
      { ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?', choices: [{ label: 'A', refs: ['n1'] }, { label: 'B', refs: ['n2', 'e1'] }] },
      { ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?' },
      { ...envelope, kind: 'clarify', reason: 'missing-context', question: 'Show?', contextRefs: ['g1'] },
      { ...envelope, kind: 'no_change', reason: 'explanation', message: 'Nothing to do. 🌊 ɑ' },
    ]) expect(category(JSON.stringify(value)), JSON.stringify(value)).toBe('accepted');
  });

  it('rejects unknown and duplicate keys at every level', () => {
    rejects({ ...insert, note: 'x' }, 'malformed');
    rejects(plan(op({ op: 'edge.remove', target: { existing: 'e1' }, cascade: true })), 'malformed');
    rejects(plan({ id: 'a', op: {} }), 'malformed');
    rejects(plan({ id: 'a', op: ['edge.remove'], target: { existing: 'e1' } }), 'malformed');
    // No property paths, wildcards, selectors by label or executable snippets.
    rejects(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value: 'x', path: 'style.fill' })), 'malformed');
    rejects(plan(op({ op: 'edge.remove', target: { existing: '*' } })), 'malformed');
    rejects(plan(op({ op: 'edge.remove', target: { label: 'Review request' } })), 'malformed');
    rejects(plan(op({ op: 'node.add', as: 'x', parent: null, type: 'process', source: 'x process' })), 'malformed');
    rejects(plan(op({ op: 'edge.remove', target: { existing: 'e1', new: 'x' } })), 'malformed');
    rejects(plan(op({ op: 'edge.add', as: 'f', type: 'flow', first: { node: { existing: 'n1' }, side: 'top' }, second: { node: { existing: 'n2' } }, direction: 'first-to-second' })), 'malformed');
    rejects(plan(op({ op: 'layout.boundary', subject: { existing: 'n1' }, side: 'top', scope: { kind: 'diagram', target: { existing: 'g1' } }, spacing: 'wide' })), 'malformed');
    rejects({ ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?', choices: [{ label: 'A', refs: ['n1'], why: 'x' }] }, 'malformed');
    expect(category('{"protocol":"coral-plan/1","snapshot":"s42","kind":"no_change","reason":"explanation","message":"a","message":"b"}')).toBe('malformed');
    expect(category('{"__proto__":{},"protocol":"coral-plan/1","snapshot":"s42","kind":"no_change","reason":"explanation","message":"a"}')).toBe('malformed');
  });

  it('rejects malformed, fenced, padded and every truncated form of a valid response', () => {
    const text = JSON.stringify(insert);
    for (let end = 0; end < text.length; end++) expect(category(text.slice(0, end)), `prefix ${end}`).toBe('malformed');
    for (const raw of ['```json\n' + text + '\n```', `Here is the plan: ${text}`, `${text} done`, `${text}${text}`, `[${text}]`, '', 'null',
      text.replace('"s42"', "'s42'"), text.replace('"o1"', '"o1",'), text.replace('"Security review"', '"bad\\x"'),
      text.replace('"Security review"', '"line\nbreak"')]) {
      expect(category(raw), raw.slice(0, 40)).toBe('malformed');
    }
    expect(category(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]))).toBe('malformed');
    expect(category(new Uint8Array([0x7b, 0xff, 0x7d]))).toBe('malformed');
    expect(category(new TextEncoder().encode(text))).toBe('accepted');
    expect(category(`\n ${text}\t`)).toBe('accepted');
  });

  it('rejects control, bidirectional-override and unpaired surrogate characters in text', () => {
    for (const value of ['a\u0000b', 'tab\there', 'cr\rhere', '\u007f', '\u0085', '\u2028', '\u202e', '\u2066', '\ud800', 'x\udc00', '\udc00\ud800']) {
      rejects(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value })), 'malformed');
    }
    rejects({ ...envelope, kind: 'no_change', reason: 'explanation', message: 'hi\u202ethere' }, 'malformed');
    rejects({ ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?', choices: [{ label: '\u0007', refs: ['n1'] }] }, 'malformed');
    for (const value of ['two\nlines', '😀 \ud83d\ude00', 'é ü 東京', '']) {
      expect(category(JSON.stringify(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value })))), value).toBe('accepted');
    }
  });

  it('rejects excess resources before execution', () => {
    const big = 'x'.repeat(PLAN_LIMITS.stringBytes + 1);
    rejects(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value: big })), 'resources');
    rejects(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value: 'é'.repeat(PLAN_LIMITS.stringBytes / 2 + 1) })), 'resources');
    expect(category(JSON.stringify(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value: 'é'.repeat(PLAN_LIMITS.stringBytes / 2) }))))).toBe('accepted');
    const many = Array.from({ length: PLAN_LIMITS.operations + 1 }, (_, k) => op({ id: `o${k}`, op: 'entity.label.set', target: { existing: 'n1' }, value: 'x' }));
    rejects(plan(...many), 'resources');
    expect(category(JSON.stringify(plan(...many.slice(1))))).toBe('accepted');
    const deep = '['.repeat(PLAN_LIMITS.nesting) + ']'.repeat(PLAN_LIMITS.nesting);
    expect(category(`{"protocol":"coral-plan/1","snapshot":"s42","kind":"plan","operations":${deep}}`)).toBe('resources');
    expect(category(' '.repeat(PLAN_LIMITS.responseBytes + 1))).toBe('resources');
  });

  it('rejects operations, types and directions the capability does not offer', () => {
    rejects(plan(op({ op: 'node.rename', target: { existing: 'n1' }, value: 'x' })), 'malformed');
    rejects(plan(op({ op: 'node.add', as: 'x', parent: null, type: 'io' })), 'unauthorized');
    rejects(plan(op({ op: 'node.add', as: 'x', parent: null, type: 'process', symbol: 'aws-s3' })), 'unauthorized');
    rejects(plan(op({ op: 'edge.add', as: 'f', type: 'annotation', first: { node: { existing: 'n1' } }, second: { node: { existing: 'n2' } }, direction: 'first-to-second' })), 'unauthorized');
    rejects(plan(op({ op: 'edge.add', as: 'f', type: 'flow', first: { node: { existing: 'n1' } }, second: { node: { existing: 'n2' } }, direction: 'both' })), 'unauthorized');
    rejects(plan(op({ op: 'edge.add', as: 'f', type: 'flow', first: { node: { existing: 'n1' } }, second: { node: { existing: 'n2' } }, direction: 'sideways' })), 'malformed');
    expect(category(JSON.stringify(insert), { ...view, capabilities: 'sequence-plan-v1' })).toBe('unauthorized');
    // A capability that offers labels only.
    const capabilities = PLAN_CAPABILITIES as Record<string, PlanCapability>;
    capabilities['labels-v1'] = { ...capabilities['flowchart-plan-v1'], id: 'labels-v1', profile: 'labels', operations: ['entity.label.set'] };
    try {
      const labels = { ...view, capabilities: 'labels-v1' };
      expect(category(JSON.stringify(insert), labels)).toBe('unauthorized');
      expect(category(JSON.stringify(plan(op({ op: 'entity.label.set', target: { existing: 'n1' }, value: 'x' }))), labels)).toBe('accepted');
    } finally { delete capabilities['labels-v1']; }
  });

  it('rejects a response for another snapshot as stale', () => {
    rejects({ ...insert, snapshot: 's41' }, 'stale');
    rejects({ ...insert, protocol: 'coral-plan/2' }, 'malformed');
  });

  it('rejects unknown, wrong-kind and out-of-order references', () => {
    rejects(plan(op({ op: 'edge.remove', target: { existing: 'n1' } })), 'bad-references');
    rejects(plan(op({ op: 'node.remove', target: { existing: 'e1' } })), 'bad-references');
    rejects(plan(op({ op: 'entity.label.set', target: { existing: 'n9' }, value: 'x' })), 'bad-references');
    rejects(plan(op({ op: 'entity.label.set', target: { new: 'x1' }, value: 'x' })), 'bad-references');
    rejects(plan(op({ op: 'node.add', as: 'x1', parent: { new: 'x1' }, type: 'process' })), 'bad-references');
    rejects(plan(op({ op: 'node.add', as: 'x1', parent: null, type: 'process' }), op({ id: 'o2', op: 'node.add', as: 'x1', parent: null, type: 'process' })), 'bad-references');
    rejects(plan(op({ op: 'node.add', as: 'x1', parent: null, type: 'process' }), op({ op: 'node.add', as: 'x2', parent: null, type: 'process' })), 'bad-references');
    rejects(plan(op({ op: 'layout.boundary', subject: { existing: 'n1' }, side: 'top', scope: { kind: 'group', target: { existing: 'e1' } }, spacing: 'wide' })), 'bad-references');
    rejects({ ...envelope, kind: 'clarify', reason: 'missing-context', question: 'Show?', contextRefs: ['n7'] }, 'bad-references');
    rejects({ ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?', choices: [{ label: 'A', refs: ['n7'] }] }, 'bad-references');
    rejects(plan(op({ op: 'layout.arrange', members: [{ existing: 'n1' }, { existing: 'n1' }], axis: 'row', direction: 'forward', spacing: 'normal' })), 'malformed');
    rejects(plan(op({ op: 'layout.arrange', members: [{ existing: 'n1' }], axis: 'row', direction: 'forward', spacing: 'normal' })), 'malformed');
    rejects(plan(op({ op: 'node.add', as: 'bad handle', parent: null, type: 'process' })), 'malformed');
  });

  it('keeps plan, clarify and no_change disjoint', () => {
    const clarify = { ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?' };
    rejects({ ...insert, question: 'Which?' }, 'malformed');
    rejects({ ...insert, reason: 'ambiguous' }, 'malformed');
    rejects({ ...clarify, operations: insert.operations }, 'malformed');
    rejects({ ...clarify, contextRefs: ['n1'] }, 'malformed');
    rejects({ ...clarify, reason: 'missing-context' }, 'malformed');
    rejects({ ...clarify, reason: 'missing-context', contextRefs: ['n1'], choices: [{ label: 'A', refs: ['n1'] }] }, 'malformed');
    rejects({ ...clarify, reason: 'missing-context', contextRefs: [] }, 'malformed');
    rejects({ ...clarify, reason: 'unsure' }, 'malformed');
    rejects({ ...clarify, choices: [] }, 'malformed');
    rejects({ ...envelope, kind: 'no_change', reason: 'explanation', message: 'x', operations: insert.operations }, 'malformed');
    rejects({ ...envelope, kind: 'no_change', reason: 'ambiguous', message: 'x' }, 'malformed');
    rejects({ ...envelope, kind: 'no_change', message: 'x' }, 'malformed');
    rejects({ ...envelope, kind: 'plan', operations: [] }, 'malformed');
    rejects({ ...envelope, kind: 'execute', operations: insert.operations }, 'malformed');
  });
});

/** The JSON Schema keywords the registry generates, enough to check agreement. */
function schemaAccepts(schema: Record<string, unknown>, value: unknown): boolean {
  const s = schema as { oneOf?: Record<string, unknown>[]; const?: unknown; enum?: unknown[]; type?: string; pattern?: string;
    properties?: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties?: boolean;
    items?: Record<string, unknown>; minItems?: number; maxItems?: number; uniqueItems?: boolean };
  if (s.oneOf && s.oneOf.filter(branch => schemaAccepts(branch, value)).length !== 1) return false;
  if ('const' in s && value !== s.const) return false;
  if (s.enum && !s.enum.includes(value)) return false;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (s.type && s.type !== type) return false;
  if (s.pattern && (typeof value !== 'string' || !new RegExp(s.pattern).test(value))) return false;
  if (type === 'object' && (s.properties || s.required)) {
    const object = value as Record<string, unknown>;
    if (s.required?.some(key => !(key in object))) return false;
    if (s.additionalProperties === false && Object.keys(object).some(key => !s.properties?.[key])) return false;
    if (Object.entries(object).some(([key, item]) => s.properties?.[key] && !schemaAccepts(s.properties[key], item))) return false;
  }
  if (type === 'array') {
    const array = value as unknown[];
    if (s.minItems !== undefined && array.length < s.minItems) return false;
    if (s.maxItems !== undefined && array.length > s.maxItems) return false;
    if (s.uniqueItems && new Set(array.map(item => JSON.stringify(item))).size !== array.length) return false;
    if (s.items && !array.every(item => schemaAccepts(s.items!, item))) return false;
  }
  return true;
}

describe('generated JSON Schema', () => {
  const schema = planResponseJsonSchema('flowchart-plan-v1');

  it('accepts every fixture plan the decoder accepts', () => {
    let count = 0;
    for (const reply of fixture.replies) {
      if (!('plan' in reply.expected)) continue;
      expect(schemaAccepts(schema, reply.expected.plan), `${reply.diagram} turn ${reply.turn}`).toBe(true);
      count++;
    }
    expect(count).toBe(512);
    expect(schemaAccepts(schema, insert)).toBe(true);
  });

  it('rejects the structural cases the decoder rejects', () => {
    const many = Array.from({ length: PLAN_LIMITS.operations + 1 }, (_, k) => op({ id: `o${k}`, op: 'edge.remove', target: { existing: 'e1' } }));
    for (const value of [
      { ...insert, note: 'x' }, { ...insert, protocol: 'coral-plan/2' }, { ...insert, question: 'x' },
      plan({ id: 'a', op: {} }), plan(), plan(...many),
      plan(op({ op: 'edge.remove', target: { existing: 'e1' }, cascade: true })),
      plan(op({ op: 'edge.remove', target: { existing: 'e1', new: 'x' } })),
      plan(op({ op: 'node.add', as: 'x', parent: null, type: 'io' })),
      plan(op({ op: 'edge.add', as: 'f', type: 'flow', first: { node: { existing: 'n1' } }, second: { node: { existing: 'n2' } }, direction: 'both' })),
      plan(op({ op: 'layout.arrange', members: [{ existing: 'n1' }], axis: 'row', direction: 'forward', spacing: 'normal' })),
      { ...envelope, kind: 'clarify', reason: 'ambiguous', question: 'Which?', contextRefs: ['n1'] },
      { ...envelope, kind: 'clarify', reason: 'missing-context', question: 'Show?' },
      { ...envelope, kind: 'no_change', reason: 'ambiguous', message: 'x' },
    ]) {
      expect(schemaAccepts(schema, value), JSON.stringify(value)).toBe(false);
      expect(category(JSON.stringify(value)), JSON.stringify(value)).not.toBe('accepted');
    }
  });
});
