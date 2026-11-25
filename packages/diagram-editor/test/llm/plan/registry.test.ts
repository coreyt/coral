import { describe, expect, it } from 'vitest';
import { FROZEN_CONTRACT } from '../../../src/onDeviceModel/contract';
import {
  PLAN_CAPABILITIES, PLAN_ENUMS, PLAN_FIELD_DESCRIPTIONS, PLAN_OPERATIONS, PLAN_RESPONSE_VARIANTS,
  describePlanContract, planResponseJsonSchema,
} from '../../../src/llm/plan/registry';

// Every reply form the frozen on-device contract teaches, and the registry
// entry the P2 translator turns it into.
const CONTRACT_VERBS: Record<string, string[]> = {
  add: ['node.add'], edge: ['edge.add'], label: ['entity.label.set'], unlabel: ['entity.label.unset'],
  delete: ['edge.remove', 'node.remove'], place: ['layout.relative'], arrange: ['layout.arrange'], boundary: ['layout.boundary'],
};

type Schema = Record<string, unknown>;
const walk = (schema: unknown, visit: (node: Schema) => void): void => {
  if (Array.isArray(schema)) { schema.forEach(item => walk(item, visit)); return; }
  if (!schema || typeof schema !== 'object') return;
  visit(schema as Schema);
  Object.values(schema).forEach(child => walk(child, visit));
};

const CAPABILITY_ID = 'flowchart-plan-v1';

describe('coral-plan/1 registry', () => {
  const capability = PLAN_CAPABILITIES[CAPABILITY_ID];

  it('offers every verb, type and enum the frozen on-device contract names', () => {
    const lines = FROZEN_CONTRACT.split('\n');
    for (const [verb, operations] of Object.entries(CONTRACT_VERBS)) {
      expect(lines.some(line => line.startsWith(`${verb} `) || line.includes(`| ${verb} `)), verb).toBe(true);
      for (const name of operations) expect(capability.operations, name).toContain(name);
    }
    expect(FROZEN_CONTRACT).toContain(`Types: ${Object.keys(capability.nodeTypes).join(' ')}.`);
    expect(FROZEN_CONTRACT).toContain(`Not offered: ${capability.unsupported.join('; ')}.`);
    expect(FROZEN_CONTRACT).toContain('edge flow FROM -> TO');
    expect(Object.keys(capability.relationTypes)).toEqual(['flow']);
    expect(capability.edgeDirections).toEqual(['first-to-second']);
    expect(FROZEN_CONTRACT).toContain(`place NODE ${PLAN_ENUMS.relation.join('|')} NODE SPACING`);
    expect(FROZEN_CONTRACT).toContain(`arrange ${PLAN_ENUMS.axis.join('|')} ${PLAN_ENUMS.order.join('|')} SPACING`);
    expect(FROZEN_CONTRACT).toContain(`boundary NODE ${PLAN_ENUMS.side.join('|')} diagram|GROUP SPACING   (SPACING: ${PLAN_ENUMS.spacing.join(', ')})`);
    // ask and no-change reasons map onto the clarify and no_change variants.
    const reasons = PLAN_RESPONSE_VARIANTS.flatMap(v => v.reasons ?? []);
    for (const reason of ['ambiguous', 'missing-context', 'already-satisfied', 'unsupported']) expect(reasons).toContain(reason);
  });

  it('generates a closed JSON Schema with one variant per response and operation', () => {
    const schema = planResponseJsonSchema(CAPABILITY_ID);
    const variants = schema.oneOf as Schema[];
    expect(variants.map(v => (v.properties as Schema).kind)).toEqual(PLAN_RESPONSE_VARIANTS.map(v => ({ const: v.kind })));
    walk(schema, node => { if (node.type === 'object') expect(node.additionalProperties).toBe(false); });
    const plan = variants[0].properties as { operations: { items: { oneOf: Schema[] } } };
    const operations = plan.operations.items.oneOf;
    expect(operations.map(op => (op.properties as Schema).op)).toEqual(capability.operations.map(name => ({ const: name })));
    for (const op of operations) {
      const name = ((op.properties as Schema).op as { const: keyof typeof PLAN_OPERATIONS }).const;
      expect(op.description).toBe(PLAN_OPERATIONS[name].describe);
      expect(Object.keys(op.properties as Schema)).toEqual(['id', 'op', ...Object.keys(PLAN_OPERATIONS[name].fields)]);
    }
    // plan, clarify and no_change share no field beyond the envelope.
    const own = variants.map(v => Object.keys(v.properties as Schema).filter(k => !['protocol', 'snapshot', 'kind', 'reason'].includes(k)));
    expect(own).toEqual([['operations'], ['question', 'choices'], ['question', 'contextRefs'], ['message']]);
    expect(variants[0].required).not.toContain('reason');
    expect(() => planResponseJsonSchema('nope')).toThrow();
  });

  it('describes the contract with the same shared descriptions', () => {
    const text = describePlanContract(CAPABILITY_ID);
    for (const name of capability.operations) expect(text).toContain(`- ${name} {`);
    for (const name of capability.operations) expect(text).toContain(PLAN_OPERATIONS[name].describe);
    for (const variant of PLAN_RESPONSE_VARIANTS) expect(text).toContain(variant.describe);
    for (const type of Object.keys(capability.nodeTypes)) expect(text).toContain(`${type} (`);
    expect(text).toContain(PLAN_FIELD_DESCRIPTIONS.endpoint);
    expect(text).toContain('Offered: first-to-second.');
    expect(() => describePlanContract('nope')).toThrow();
  });
});
