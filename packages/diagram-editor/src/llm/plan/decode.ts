/**
 * Strict admission of one `coral-plan/1` response (0.2.10 design,
 * "Deterministic validation and source compilation", steps 1 and 2; plan
 * slice 10). Every rule comes from the registry. Nothing is extracted,
 * trimmed, repaired or executed here: a response is admitted whole or
 * rejected with one categorized error.
 *
 * Ported from the experimental decoder (dev/experiments/ai-0.2.10/decode.mjs)
 * with the same acceptance, plus resource and capability categories.
 * Semantic program checks (repeated writes, use after removal, ports and
 * capacity) belong to the slice 30 executor.
 */
import {
  PLAN_CAPABILITIES, PLAN_ENUMS, PLAN_IDENTIFIER, PLAN_LIMITS, PLAN_OPERATIONS, PLAN_PROTOCOL, PLAN_RESPONSE_VARIANTS,
  type PlanCapability, type PlanField, type PlanOperationName,
} from './registry';

export type PlanRef = { existing: string } | { new: string };
export interface PlanEndpoint { node: PlanRef; port?: string }
export type PlanOperation = { id: string; op: PlanOperationName } & Record<string, unknown>;
export type PlanResponse = { protocol: typeof PLAN_PROTOCOL; snapshot: string } & (
  | { kind: 'plan'; operations: PlanOperation[] }
  | { kind: 'clarify'; reason: 'ambiguous'; question: string; choices?: { label: string; refs: string[] }[] }
  | { kind: 'clarify'; reason: 'missing-context'; question: string; contextRefs: string[] }
  | { kind: 'no_change'; reason: 'already-satisfied' | 'explanation' | 'unsupported'; message: string }
);

/** The parts of a model-facing snapshot that admission needs. */
export interface PlanSnapshotView {
  snapshot: string;
  capabilities: string;
  nodes: readonly { ref: string }[];
  relations: readonly { ref: string }[];
}

export type PlanDecodeCategory = 'malformed' | 'resources' | 'stale' | 'unauthorized' | 'bad-references';

export class PlanDecodeError extends Error {
  constructor(readonly category: PlanDecodeCategory, message: string) { super(message); }
}

const fail = (category: PlanDecodeCategory, message: string): never => { throw new PlanDecodeError(category, message); };
const malformed = (message: string): never => fail('malformed', message);
const encoder = new TextEncoder();
const utf8Length = (text: string) => encoder.encode(text).length;
/** ES2020 lib: no Object.hasOwn. */
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

// ---- strict JSON ------------------------------------------------------------

/**
 * One JSON value with duplicate-key, nesting and string-size rejection.
 * `JSON.parse` accepts duplicate keys and cannot bound nesting. Objects have
 * no prototype, so `__proto__` is an ordinary (unknown) key.
 */
export function parseStrictJson(text: string): unknown {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const expect = (c: string) => { if (text[i] !== c) malformed(`expected '${c}' at ${i}`); i++; };
  const value = (depth: number): unknown => {
    if (depth > PLAN_LIMITS.nesting) fail('resources', `nesting deeper than ${PLAN_LIMITS.nesting}`);
    ws();
    const c = text[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    for (const [word, literal] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, i)) { i += word.length; return literal; }
    }
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!number) malformed(i >= text.length ? 'truncated JSON' : `unexpected token at ${i}`);
    i += number![0].length;
    return Number(number![0]);
  };
  const object = (depth: number) => {
    expect('{'); ws();
    const out: Record<string, unknown> = Object.create(null);
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] !== '"') malformed(i >= text.length ? 'truncated JSON' : `expected string key at ${i}`);
      const key = string();
      if (hasOwn(out, key)) malformed(`duplicate key "${key}"`);
      ws(); expect(':');
      out[key] = value(depth + 1);
      ws();
      if (text[i] === ',') { i++; continue; }
      if (i >= text.length) malformed('truncated JSON');
      expect('}');
      return out;
    }
  };
  const array = (depth: number) => {
    expect('['); ws();
    const out: unknown[] = [];
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value(depth + 1));
      ws();
      if (text[i] === ',') { i++; continue; }
      if (i >= text.length) malformed('truncated JSON');
      expect(']');
      return out;
    }
  };
  const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const string = () => {
    expect('"');
    let out = '';
    for (;;) {
      if (i >= text.length) malformed('truncated JSON string');
      const c = text[i++];
      if (c === '"') break;
      if (c === '\\') {
        const e = text[i++];
        if (e === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) malformed(`bad unicode escape at ${i}`);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (e !== undefined && hasOwn(escapes, e)) out += escapes[e];
        else malformed(`bad escape at ${i}`);
      } else if (c.charCodeAt(0) < 0x20) malformed(`control character in string at ${i}`);
      else out += c;
    }
    if (utf8Length(out) > PLAN_LIMITS.stringBytes) fail('resources', `string longer than ${PLAN_LIMITS.stringBytes} bytes`);
    return out;
  };
  const result = value(1);
  ws();
  if (i !== text.length) malformed(`trailing content at ${i}`);
  return result;
}

// ---- registry-driven schema validation ------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

function closed(value: unknown, keys: Record<string, { optional?: true }>, where: string): Json {
  if (!isObject(value)) return malformed(`${where} must be an object`);
  for (const key of Object.keys(value)) if (!hasOwn(keys, key)) malformed(`${where}: unknown field "${key}"`);
  for (const [key, field] of Object.entries(keys)) if (!field.optional && !hasOwn(value, key)) malformed(`${where}: missing field "${key}"`);
  return value;
}

const identifier = (v: unknown, where: string): string =>
  (typeof v === 'string' && PLAN_IDENTIFIER.test(v) ? v : malformed(`${where}: invalid identifier`));

/**
 * Characters text may not carry: C0 controls other than newline, DEL and C1
 * controls, line and paragraph separators, bidirectional overrides and
 * isolates, and unpaired surrogates. Coral source cannot hold the first
 * three; the last two can make reviewed text read differently from its bytes.
 */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the purpose
const FORBIDDEN_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function text(v: unknown, where: string): string {
  if (typeof v !== 'string') return malformed(`${where}: must be a string`);
  if (utf8Length(v) > PLAN_LIMITS.stringBytes) fail('resources', `${where}: longer than ${PLAN_LIMITS.stringBytes} bytes`);
  if (FORBIDDEN_TEXT.test(v)) malformed(`${where}: contains a control, bidirectional-override or unpaired surrogate character`);
  return v;
}

function ref(v: unknown, where: string): PlanRef {
  if (!isObject(v)) return malformed(`${where}: reference must be an object`);
  const keys = Object.keys(v);
  if (keys.length !== 1 || (keys[0] !== 'existing' && keys[0] !== 'new')) malformed(`${where}: reference needs exactly one of existing/new`);
  identifier(v[keys[0]], where);
  return v as PlanRef;
}

function refList(v: unknown, where: string, min: number) {
  if (!Array.isArray(v) || v.length < min) return malformed(`${where}: needs at least ${min} item${min === 1 ? '' : 's'}`);
  if (new Set(v.map(item => JSON.stringify(item))).size !== v.length) malformed(`${where}: duplicate references`);
  return v;
}

function offered(v: unknown, values: readonly unknown[], where: string) {
  if (!values.includes(v)) fail('unauthorized', `${where}: "${String(v)}" is not offered by this capability`);
}

function oneOf(v: unknown, values: readonly unknown[], where: string) {
  if (!values.includes(v)) malformed(`${where}: must be one of ${values.join(', ')}`);
}

function checkField(field: PlanField, v: unknown, where: string, capability: PlanCapability): void {
  const kind = field.kind;
  switch (kind) {
    case 'node-ref': case 'relation-ref': case 'entity-ref': ref(v, where); return;
    case 'parent': if (v !== null) ref(v, where); return;
    case 'handle': identifier(v, where); return;
    case 'text': text(v, where); return;
    case 'node-type': text(v, where); offered(v, Object.keys(capability.nodeTypes), where); return;
    case 'relation-type': text(v, where); offered(v, Object.keys(capability.relationTypes), where); return;
    case 'symbol': text(v, where); offered(v, capability.symbols, where); return;
    case 'direction': oneOf(v, PLAN_ENUMS.direction, where); offered(v, capability.edgeDirections, where); return;
    case 'endpoint': {
      const endpoint = closed(v, { node: {}, port: { optional: true } }, where);
      ref(endpoint.node, `${where}.node`);
      if (hasOwn(endpoint, 'port')) identifier(endpoint.port, `${where}.port`);
      return;
    }
    case 'members': refList(v, where, 2).forEach((member, k) => ref(member, `${where}[${k}]`)); return;
    case 'scope': {
      if (!isObject(v)) return malformed(`${where}: must be an object`);
      if (v.kind === 'diagram') closed(v, { kind: {} }, where);
      else if (v.kind === 'group') { closed(v, { kind: {}, target: {} }, where); ref(v.target, `${where}.target`); }
      else malformed(`${where}: unknown scope kind`);
      return;
    }
    case 'operations': {
      if (!Array.isArray(v) || !v.length) return malformed(`${where}: must be a nonempty array`);
      if (v.length > PLAN_LIMITS.operations) fail('resources', `more than ${PLAN_LIMITS.operations} operations`);
      v.forEach((op, k) => checkOperation(op, `${where}[${k}]`, capability));
      return;
    }
    case 'choices': {
      if (!Array.isArray(v) || !v.length) return malformed(`${where}: must be a nonempty array`);
      v.forEach((choice, k) => {
        const item = closed(choice, { label: {}, refs: {} }, `${where}[${k}]`);
        text(item.label, `${where}[${k}].label`);
        refList(item.refs, `${where}[${k}].refs`, 1).forEach(r => identifier(r, `${where}[${k}].refs`));
      });
      return;
    }
    case 'refs': refList(v, where, 1).forEach(r => identifier(r, where)); return;
    default: oneOf(v, PLAN_ENUMS[kind], where);
  }
}

function checkOperation(op: unknown, where: string, capability: PlanCapability): void {
  if (!isObject(op)) return malformed(`${where} must be an object`);
  const name = op.op;
  if (typeof name !== 'string') return malformed(`${where}: op must be a string`);
  if (!hasOwn(PLAN_OPERATIONS, name)) return malformed(`${where}: unknown op "${name}"`);
  if (!capability.operations.includes(name as PlanOperationName)) fail('unauthorized', `${where}: ${name} is not offered by this capability`);
  const spec = PLAN_OPERATIONS[name as PlanOperationName];
  closed(op, { id: {}, op: {}, ...spec.fields }, where);
  identifier(op.id, `${where}.id`);
  for (const [key, field] of Object.entries(spec.fields) as [string, PlanField][]) {
    if (hasOwn(op, key)) checkField(field, op[key], `${where}.${key}`, capability);
  }
}

// ---- reference resolution -----------------------------------------------------

function checkReferences(response: PlanResponse, view: PlanSnapshotView): void {
  const bad = (message: string): never => fail('bad-references', message);
  const nodes = new Set(view.nodes.map(n => n.ref));
  const relations = new Set(view.relations.map(r => r.ref));
  if (response.kind !== 'plan') {
    const listed = response.kind === 'clarify'
      ? [...(response.reason === 'missing-context' ? response.contextRefs : []), ...(response.reason === 'ambiguous' ? response.choices ?? [] : []).flatMap(c => c.refs)]
      : [];
    for (const r of listed) if (!nodes.has(r) && !relations.has(r)) bad(`unknown snapshot reference "${r}"`);
    return;
  }
  const newNodes = new Set<string>();
  const newRelations = new Set<string>();
  const ids = new Set<string>();
  const known = (r: PlanRef, kind: 'node' | 'relation' | 'entity') => {
    const [existing, introduced] = 'existing' in r ? [r.existing, false] : [r.new, true];
    const inNodes = introduced ? newNodes.has(existing) : nodes.has(existing);
    const inRelations = introduced ? newRelations.has(existing) : relations.has(existing);
    return kind === 'node' ? inNodes : kind === 'relation' ? inRelations : inNodes || inRelations;
  };
  response.operations.forEach((op, k) => {
    const where = `operations[${k}]`;
    if (ids.has(op.id)) bad(`${where}: duplicate operation id "${op.id}"`);
    ids.add(op.id);
    const spec = PLAN_OPERATIONS[op.op] as { fields: Record<string, PlanField>; introduces?: 'node' | 'relation' };
    const expect = (r: PlanRef, kind: 'node' | 'relation' | 'entity', at: string) => {
      if (!known(r, kind)) bad(`${where}.${at}: not a known ${kind === 'entity' ? '' : `${kind} `}reference`);
    };
    for (const [key, field] of Object.entries(spec.fields)) {
      const v = op[key];
      if (v === undefined || v === null) continue;
      switch (field.kind) {
        case 'node-ref': case 'parent': expect(v as PlanRef, 'node', key); break;
        case 'relation-ref': expect(v as PlanRef, 'relation', key); break;
        case 'entity-ref': expect(v as PlanRef, 'entity', key); break;
        case 'endpoint': expect((v as PlanEndpoint).node, 'node', key); break;
        case 'members': (v as PlanRef[]).forEach((m, j) => expect(m, 'node', `${key}[${j}]`)); break;
        case 'scope': if ((v as { kind: string }).kind === 'group') expect((v as { target: PlanRef }).target, 'node', `${key}.target`); break;
      }
    }
    if (spec.introduces) {
      const handle = op.as as string;
      if (newNodes.has(handle) || newRelations.has(handle)) bad(`${where}: duplicate handle "${handle}"`);
      (spec.introduces === 'node' ? newNodes : newRelations).add(handle);
    }
  });
}

// ---- entry points ------------------------------------------------------------------

/** Validate an already-parsed value (for example a translated on-device reply). */
export function validatePlanResponse(value: unknown, view: PlanSnapshotView): PlanResponse {
  if (!isObject(value)) return malformed('response must be an object');
  if (value.protocol !== PLAN_PROTOCOL) malformed(`protocol must be ${PLAN_PROTOCOL}`);
  const variants = PLAN_RESPONSE_VARIANTS.filter(v => v.kind === value.kind);
  if (!variants.length) malformed('kind must be plan, clarify or no_change');
  const variant = variants.find(v => !v.reasons || v.reasons.includes(value.reason as string));
  if (!variant) return malformed(`${String(value.kind)} reason must be one of ${variants.flatMap(v => v.reasons ?? []).join(', ')}`);
  closed(value, { protocol: {}, snapshot: {}, kind: {}, ...(variant.reasons ? { reason: {} } : {}), ...variant.fields }, 'response');
  identifier(value.snapshot, 'snapshot');
  if (value.snapshot !== view.snapshot) fail('stale', 'snapshot token does not match the captured snapshot');
  const capability = hasOwn(PLAN_CAPABILITIES, view.capabilities) ? PLAN_CAPABILITIES[view.capabilities] : undefined;
  if (!capability) return fail('unauthorized', `unknown capability ${view.capabilities}`);
  for (const [key, field] of Object.entries(variant.fields)) {
    if (hasOwn(value, key)) checkField(field, value[key], key, capability);
  }
  checkReferences(value as PlanResponse, view);
  return value as PlanResponse;
}

/** Decode one raw response: exact UTF-8 JSON, no fences, prose or repair. */
export function decodePlanResponse(raw: string | Uint8Array, view: PlanSnapshotView): PlanResponse {
  const bytes = typeof raw === 'string' ? utf8Length(raw) : raw.length;
  if (bytes > PLAN_LIMITS.responseBytes) fail('resources', `response longer than ${PLAN_LIMITS.responseBytes} bytes`);
  let text = raw as string;
  if (typeof raw !== 'string') {
    try {
      // A byte-order mark is content and therefore rejected by the parser.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
    } catch { malformed('response is not valid UTF-8'); }
  }
  return validatePlanResponse(parseStrictJson(text), view);
}
