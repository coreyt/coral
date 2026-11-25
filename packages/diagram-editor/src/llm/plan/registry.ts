/**
 * The `coral-plan/1` operation registry (0.2.10 design, "Versioned
 * instruction schema"; plan slice 10).
 *
 * This is the one declaration of the wire contract. The strict decoder
 * (decode.ts), the JSON Schema and the model-facing descriptions below are all
 * derived from it, so no prompt can advertise more than the decoder admits.
 * Executor and source-compiler bindings belong to slice 30.
 */

export const PLAN_PROTOCOL = 'coral-plan/1';

/** Proposed design limits; a response beyond them is rejected, never truncated. */
export const PLAN_LIMITS = {
  responseBytes: 65_536,
  stringBytes: 4_096,
  nesting: 16,
  operations: 32,
  snapshotNodes: 200,
  snapshotRelations: 400,
  contextRounds: 2,
} as const;

/** Handles, references, operation IDs, ports and snapshot tokens. */
export const PLAN_IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

export const PLAN_ENUMS = {
  direction: ['none', 'first-to-second', 'second-to-first', 'both'],
  spacing: ['compact', 'normal', 'wide'],
  relation: ['above', 'below', 'left-of', 'right-of'],
  axis: ['row', 'column'],
  order: ['forward', 'reverse'],
  side: ['top', 'bottom', 'left', 'right'],
} as const;

type EnumKind = keyof typeof PLAN_ENUMS;
export type PlanFieldKind =
  | 'node-ref' | 'relation-ref' | 'entity-ref' | 'parent' | 'handle' | 'text' | 'node-type' | 'relation-type' | 'symbol'
  | 'endpoint' | 'members' | 'scope' | 'operations' | 'choices' | 'refs' | EnumKind;

export interface PlanField { kind: PlanFieldKind; optional?: true }

/** Shared field-kind meanings, used verbatim by the schema and the descriptions. */
export const PLAN_FIELD_DESCRIPTIONS: Record<PlanFieldKind, string> = {
  'node-ref': 'A node reference: {"existing": snapshot ref} or {"new": handle introduced earlier in this plan}.',
  'relation-ref': 'A relation reference: {"existing": snapshot ref} or {"new": handle introduced earlier in this plan}.',
  'entity-ref': 'A node or relation reference: {"existing": ref} or {"new": handle}.',
  parent: 'null for the diagram root, or a reference to one group node.',
  handle: 'A new handle naming the created entity; unique within the plan.',
  text: `Exact text, at most ${PLAN_LIMITS.stringBytes} UTF-8 bytes. An empty string is a visible empty value.`,
  'node-type': 'One node type the capability offers.',
  'relation-type': 'One relation type the capability offers.',
  symbol: 'One existing symbol the capability lists; symbols cannot be created.',
  endpoint: 'A node reference and an optional exact semantic port ID of that node.',
  members: 'At least two distinct node references, in order.',
  scope: '{"kind": "diagram"} or {"kind": "group", "target": group node reference}.',
  operations: `An ordered atomic program of 1 to ${PLAN_LIMITS.operations} operations.`,
  choices: 'Nonempty list of {"label": text, "refs": nonempty distinct snapshot refs}.',
  refs: 'Nonempty list of distinct existing snapshot refs.',
  direction: 'Relation direction between the first and second endpoint.',
  spacing: 'Gap: compact, normal or wide.',
  relation: 'Side of the fixed target on which the subject is placed.',
  axis: 'Row or column.',
  order: 'Traversal of the listed members.',
  side: 'Side of the scope.',
};

export interface PlanOperationSpec {
  describe: string;
  fields: Record<string, PlanField>;
  /** The entity kind a successful operation introduces under `as`. */
  introduces?: 'node' | 'relation';
  /** Fields whose existing references this operation writes, for editability. */
  writes: readonly string[];
}

const required = (kind: PlanFieldKind): PlanField => ({ kind });
const optional = (kind: PlanFieldKind): PlanField => ({ kind, optional: true });

export const PLAN_OPERATIONS = {
  'node.add': {
    describe: 'Add one node of an offered type under the root (parent null) or one existing group; `as` names the new handle.',
    fields: { as: required('handle'), parent: required('parent'), type: required('node-type'), label: optional('text'), symbol: optional('symbol') },
    introduces: 'node', writes: ['parent'],
  },
  'entity.label.set': {
    describe: 'Set exactly one node or relation label to the given text (an empty string is a visible empty label).',
    fields: { target: required('entity-ref'), value: required('text') }, writes: ['target'],
  },
  'entity.label.unset': {
    describe: 'Remove the authored label of one node or relation; the default display returns.',
    fields: { target: required('entity-ref') }, writes: ['target'],
  },
  'edge.add': {
    describe: 'Add one relation of an offered type between two endpoints with an explicit direction; `as` names the new handle.',
    fields: { as: required('handle'), type: required('relation-type'), first: required('endpoint'), second: required('endpoint'),
      direction: required('direction'), label: optional('text') },
    introduces: 'relation', writes: [],
  },
  'edge.remove': {
    describe: 'Remove exactly one relation.',
    fields: { target: required('relation-ref') }, writes: ['target'],
  },
  'node.remove': {
    describe: 'Remove exactly one node that has no children and no incident relations. Removal never cascades; remove dependents first.',
    fields: { target: required('node-ref') }, writes: ['target'],
  },
  'layout.relative': {
    describe: 'Place one subject node above, below, left-of or right-of one fixed target node with the named spacing.',
    fields: { subject: required('node-ref'), target: required('node-ref'), relation: required('relation'), spacing: required('spacing') },
    writes: ['subject'],
  },
  'layout.arrange': {
    describe: 'Arrange at least two distinct member nodes (no ancestor/descendant pairs) along a row or column in the listed order.',
    fields: { members: required('members'), axis: required('axis'), direction: required('order'), spacing: required('spacing') },
    writes: ['members'],
  },
  'layout.boundary': {
    describe: 'Move one subject node to the named side of the diagram or of one group, inset by the named spacing.',
    fields: { subject: required('node-ref'), side: required('side'), scope: required('scope'), spacing: required('spacing') },
    writes: ['subject'],
  },
} as const satisfies Record<string, PlanOperationSpec>;

export type PlanOperationName = keyof typeof PLAN_OPERATIONS;

/** Response variants; `plan`, `clarify` and `no_change` share no fields beyond the envelope. */
export interface PlanResponseVariant {
  kind: 'plan' | 'clarify' | 'no_change';
  /** Absent: the variant carries no reason. */
  reasons?: readonly string[];
  describe: string;
  fields: Record<string, PlanField>;
}

export const PLAN_RESPONSE_VARIANTS: readonly PlanResponseVariant[] = [
  { kind: 'plan', describe: 'Operations for Coral to validate, execute on a detached copy and show for review.',
    fields: { operations: required('operations') } },
  { kind: 'clarify', reasons: ['ambiguous'],
    describe: 'Ask which entities are meant. May offer choices; never requests context.',
    fields: { question: required('text'), choices: optional('choices') } },
  { kind: 'clarify', reasons: ['missing-context'],
    describe: 'Ask for the details of listed snapshot refs; never offers choices.',
    fields: { question: required('text'), contextRefs: required('refs') } },
  { kind: 'no_change', reasons: ['already-satisfied', 'explanation', 'unsupported'],
    describe: 'No edit: already satisfied, an explanation, or a request this contract cannot express.',
    fields: { message: required('text') } },
];

export interface PlanCapability {
  id: string;
  version: number;
  profile: string;
  operations: readonly PlanOperationName[];
  nodeTypes: Readonly<Record<string, string>>;
  /** Node types that may be a parent. */
  containers: readonly string[];
  relationTypes: Readonly<Record<string, string>>;
  /** The type a relation without an authored type has in this profile. */
  defaultRelationType: string;
  /** The only direction values offered for creation. */
  edgeDirections: readonly (typeof PLAN_ENUMS.direction)[number][];
  symbols: readonly string[];
  unsupported: readonly string[];
}

/**
 * The flowchart capability. Its types and operations are those the frozen
 * on-device contract names (R-066), including the spatial operations (OD-7).
 */
export const PLAN_CAPABILITIES: Readonly<Record<string, PlanCapability>> = {
  'flowchart-plan-v1': {
    id: 'flowchart-plan-v1',
    version: 1,
    profile: 'flowchart',
    operations: Object.keys(PLAN_OPERATIONS) as PlanOperationName[],
    nodeTypes: {
      terminal: 'start or end of a flow',
      process: 'an action step',
      decision: 'a branch with yes/no ports',
      datastore: 'a database or store',
      group: 'a container for other nodes',
    },
    containers: ['group'],
    relationTypes: { flow: 'a directed flow between two nodes' },
    defaultRelationType: 'flow',
    edgeDirections: ['first-to-second'],
    symbols: [],
    unsupported: ['reparenting a node', 'renaming a source ID', 'style or property changes', 'cascading deletion'],
  },
};

export function capabilityForProfile(profile: string): PlanCapability | undefined {
  return Object.values(PLAN_CAPABILITIES).find(capability => capability.profile === profile);
}

// ---- derived JSON Schema -----------------------------------------------------

type Schema = Record<string, unknown>;
const identifierSchema: Schema = { type: 'string', pattern: PLAN_IDENTIFIER.source };
const refSchema = (description: string): Schema => ({ description, oneOf: [
  { type: 'object', additionalProperties: false, required: ['existing'], properties: { existing: identifierSchema } },
  { type: 'object', additionalProperties: false, required: ['new'], properties: { new: identifierSchema } },
] });
const closedObject = (properties: Record<string, Schema>, requiredKeys: string[], description?: string): Schema => ({
  type: 'object', additionalProperties: false, required: requiredKeys, properties, ...(description ? { description } : {}),
});

function fieldSchema(kind: PlanFieldKind, capability: PlanCapability): Schema {
  const description = PLAN_FIELD_DESCRIPTIONS[kind];
  const node = refSchema(PLAN_FIELD_DESCRIPTIONS['node-ref']);
  switch (kind) {
    case 'node-ref': case 'relation-ref': case 'entity-ref': return refSchema(description);
    case 'parent': return { description, oneOf: [{ type: 'null' }, node] };
    case 'handle': return { ...identifierSchema, description };
    case 'text': return { type: 'string', description };
    case 'node-type': return { enum: Object.keys(capability.nodeTypes), description };
    case 'relation-type': return { enum: Object.keys(capability.relationTypes), description };
    case 'symbol': return { enum: [...capability.symbols], description };
    case 'endpoint': return closedObject({ node, port: identifierSchema }, ['node'], description);
    case 'members': return { type: 'array', minItems: 2, uniqueItems: true, items: node, description };
    case 'scope': return { description, oneOf: [
      closedObject({ kind: { const: 'diagram' } }, ['kind']),
      closedObject({ kind: { const: 'group' }, target: node }, ['kind', 'target']),
    ] };
    case 'operations': return { type: 'array', minItems: 1, maxItems: PLAN_LIMITS.operations, description,
      items: { oneOf: capability.operations.map(name => operationSchema(name, capability)) } };
    case 'choices': return { type: 'array', minItems: 1, description, items: closedObject({
      label: { type: 'string' }, refs: { type: 'array', minItems: 1, uniqueItems: true, items: identifierSchema } }, ['label', 'refs']) };
    case 'refs': return { type: 'array', minItems: 1, uniqueItems: true, items: identifierSchema, description };
    case 'direction': return { enum: [...capability.edgeDirections], description };
    default: return { enum: [...PLAN_ENUMS[kind]], description };
  }
}

function fieldsSchema(fields: Record<string, PlanField>, capability: PlanCapability) {
  return {
    properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, fieldSchema(field.kind, capability)])),
    required: Object.entries(fields).filter(([, field]) => !field.optional).map(([key]) => key),
  };
}

function operationSchema(name: PlanOperationName, capability: PlanCapability): Schema {
  const { properties, required: requiredKeys } = fieldsSchema(PLAN_OPERATIONS[name].fields, capability);
  return closedObject({ id: identifierSchema, op: { const: name }, ...properties }, ['id', 'op', ...requiredKeys],
    PLAN_OPERATIONS[name].describe);
}

/** JSON Schema (2020-12) for one capability, derived from the registry. */
export function planResponseJsonSchema(capabilityId: string): Schema {
  const capability = PLAN_CAPABILITIES[capabilityId];
  if (!capability) throw new Error(`Unknown plan capability ${capabilityId}`);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `${PLAN_PROTOCOL} response for ${capability.id}`,
    oneOf: PLAN_RESPONSE_VARIANTS.map(variant => {
      const { properties, required: requiredKeys } = fieldsSchema(variant.fields, capability);
      return closedObject({
        protocol: { const: PLAN_PROTOCOL }, snapshot: identifierSchema, kind: { const: variant.kind },
        ...(variant.reasons ? { reason: { enum: [...variant.reasons] } } : {}), ...properties,
      }, ['protocol', 'snapshot', 'kind', ...(variant.reasons ? ['reason'] : []), ...requiredKeys], variant.describe);
    }),
  };
}

// ---- derived model-facing description -----------------------------------------

/** Plain-text contract for a general model, derived from the same registry. */
export function describePlanContract(capabilityId: string): string {
  const capability = PLAN_CAPABILITIES[capabilityId];
  if (!capability) throw new Error(`Unknown plan capability ${capabilityId}`);
  const signature = (fields: Record<string, PlanField>) => Object.entries(fields)
    .map(([key, field]) => `${key}${field.optional ? '?' : ''}: ${field.kind}`).join(', ');
  const kinds = new Set<PlanFieldKind>();
  for (const name of capability.operations) for (const field of Object.values(PLAN_OPERATIONS[name].fields)) kinds.add(field.kind);
  for (const variant of PLAN_RESPONSE_VARIANTS) for (const field of Object.values(variant.fields)) kinds.add(field.kind);
  return [
    `Reply with exactly one JSON object: {"protocol": "${PLAN_PROTOCOL}", "snapshot": the snapshot token, "kind": ..., ...}. No other text.`,
    'Response kinds:',
    ...PLAN_RESPONSE_VARIANTS.map(variant => `- ${variant.kind}${variant.reasons ? ` (reason: ${variant.reasons.join(' | ')})` : ''} { ${signature(variant.fields)} }: ${variant.describe}`),
    'Operations (each also has "id": a unique operation ID):',
    ...capability.operations.map(name => `- ${name} { ${signature(PLAN_OPERATIONS[name].fields)} }: ${PLAN_OPERATIONS[name].describe}`),
    'Field kinds:',
    ...[...kinds].map(kind => `- ${kind}: ${kind === 'direction' ? `${PLAN_FIELD_DESCRIPTIONS[kind]} Offered: ${capability.edgeDirections.join(', ')}.` : PLAN_FIELD_DESCRIPTIONS[kind]}`),
    `Node types: ${Object.entries(capability.nodeTypes).map(([type, meaning]) => `${type} (${meaning})`).join('; ')}.`,
    `Relation types: ${Object.entries(capability.relationTypes).map(([type, meaning]) => `${type} (${meaning})`).join('; ')}.`,
    `Symbols: ${capability.symbols.length ? capability.symbols.join(', ') : 'none'}.`,
    `Not offered: ${capability.unsupported.join('; ')}.`,
    `Limits: ${PLAN_LIMITS.operations} operations, ${PLAN_LIMITS.responseBytes} response bytes, ${PLAN_LIMITS.stringBytes} bytes per string.`,
  ].join('\n');
}
