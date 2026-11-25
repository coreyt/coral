// Strict decoding of a delivered raw response into a validated `coral-plan/1`
// response. No fence stripping, trimming of prose, regex extraction or repair.
// The parser is a small recursive descent implementation because
// `JSON.parse` silently accepts duplicate keys and cannot bound nesting.

import {
  CAPABILITIES, CLARIFY_REASONS, ENUMS, LIMITS, NO_CHANGE_REASONS, OPS, PROTOCOL, RESPONSE_KINDS,
} from './registry.mjs';

export class DecodeError extends Error {
  constructor(category, message) {
    super(message);
    this.category = category; // 'malformed' | 'bad-references'
  }
}

const fail = (message) => { throw new DecodeError('malformed', message); };
const byteLength = (s) => Buffer.byteLength(s, 'utf8');

// ---- strict JSON ----------------------------------------------------------

export function parseStrictJson(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const expect = (c) => { if (text[i] !== c) fail(`expected '${c}' at ${i}`); i++; };
  const value = (depth) => {
    if (depth > LIMITS.nesting) fail(`nesting deeper than ${LIMITS.nesting}`);
    ws();
    const c = text[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    if (c === 't' && text.startsWith('true', i)) { i += 4; return true; }
    if (c === 'f' && text.startsWith('false', i)) { i += 5; return false; }
    if (c === 'n' && text.startsWith('null', i)) { i += 4; return null; }
    return number();
  };
  const object = (depth) => {
    expect('{'); ws();
    const out = Object.create(null); // no prototype: "__proto__" and "constructor" are plain keys
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail(`expected string key at ${i}`);
      const key = string();
      if (Object.hasOwn(out, key)) fail(`duplicate key "${key}"`);
      ws(); expect(':');
      Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
      ws();
      if (text[i] === ',') { i++; continue; }
      expect('}');
      return out;
    }
  };
  const array = (depth) => {
    expect('['); ws();
    const out = [];
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value(depth + 1));
      ws();
      if (text[i] === ',') { i++; continue; }
      expect(']');
      return out;
    }
  };
  const string = () => {
    expect('"');
    let out = '';
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      const c = text[i++];
      if (c === '"') break;
      if (c === '\\') {
        const e = text[i++];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`bad unicode escape at ${i}`);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (Object.hasOwn(map, e)) out += map[e];
        else fail(`bad escape at ${i}`);
      } else if (c.charCodeAt(0) < 0x20) fail(`control character in string at ${i}`);
      else out += c;
    }
    if (byteLength(out) > LIMITS.stringBytes) fail(`string longer than ${LIMITS.stringBytes} bytes`);
    return out;
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail(`unexpected token at ${i}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const result = value(1);
  ws();
  if (i !== text.length) fail(`trailing content at ${i}`);
  return result;
}

// ---- schema validation -------------------------------------------------------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function closed(obj, fields, where) {
  if (!isObject(obj)) fail(`${where} must be an object`);
  for (const key of Object.keys(obj)) {
    if (!Object.hasOwn(fields, key)) fail(`${where}: unknown field "${key}"`);
  }
  for (const [key, kind] of Object.entries(fields)) {
    if (!kind.endsWith('?') && !(key in obj)) fail(`${where}: missing field "${key}"`);
  }
}

const identifier = (v, where) => {
  if (typeof v !== 'string' || !LIMITS.identifier.test(v)) fail(`${where}: invalid identifier`);
  return v;
};

function ref(v, where) {
  if (!isObject(v)) fail(`${where}: reference must be an object`);
  const keys = Object.keys(v);
  if (keys.length !== 1 || !['existing', 'new'].includes(keys[0])) fail(`${where}: reference needs exactly one of existing/new`);
  identifier(v[keys[0]], where);
  return v;
}

function endpoint(v, where) {
  closed(v, { node: 'ref', port: 'string?' }, where);
  ref(v.node, `${where}.node`);
  if ('port' in v) identifier(v.port, `${where}.port`);
  return v;
}

function checkField(kind, v, where, capability) {
  switch (kind.replace(/\?$/, '')) {
    case 'ref': return ref(v, where);
    case 'ref-or-null': return v === null ? v : ref(v, where);
    case 'handle': return identifier(v, where);
    case 'string': if (typeof v !== 'string') fail(`${where}: must be a string`); return v;
    case 'type': if (typeof v !== 'string') fail(`${where}: must be a string`); return v;
    case 'symbol':
      if (typeof v !== 'string' || !capability.symbols.includes(v)) fail(`${where}: symbol not in capability allowlist`);
      return v;
    case 'endpoint': return endpoint(v, where);
    case 'members':
      if (!Array.isArray(v) || v.length < 2) fail(`${where}: needs at least two members`);
      v.forEach((m, k) => ref(m, `${where}[${k}]`));
      if (new Set(v.map((m) => JSON.stringify(m))).size !== v.length) fail(`${where}: duplicate references`);
      return v;
    case 'scope':
      if (!isObject(v)) fail(`${where}: must be an object`);
      if (v.kind === 'diagram') closed(v, { kind: 'string' }, where);
      else if (v.kind === 'group') { closed(v, { kind: 'string', target: 'ref' }, where); ref(v.target, `${where}.target`); }
      else fail(`${where}: unknown scope kind`);
      return v;
    default: {
      const allowed = Object.hasOwn(ENUMS, kind.replace(/\?$/, '')) ? ENUMS[kind.replace(/\?$/, '')] : null;
      if (!allowed) throw new Error(`registry declares unknown field kind ${kind}`);
      if (!allowed.includes(v)) fail(`${where}: must be one of ${allowed.join(', ')}`);
      return v;
    }
  }
}

function validateOperation(op, index, capability, vocabulary) {
  const where = `operations[${index}]`;
  if (!isObject(op)) fail(`${where} must be an object`);
  if (typeof op.op !== 'string') fail(`${where}: missing op`);
  // Robustness vocabulary variants rename the closed op names in the prompt;
  // map a response back to canonical names only for scoring.
  const canonical = vocabulary ? Object.keys(vocabulary).find((k) => vocabulary[k] === op.op) : op.op;
  if (typeof canonical !== 'string' || !Object.hasOwn(OPS, canonical)) fail(`${where}: unknown op "${op.op}"`);
  const spec = OPS[canonical];
  closed(op, { id: 'handle', op: 'string', ...spec.fields }, where);
  identifier(op.id, `${where}.id`);
  for (const [key, kind] of Object.entries(spec.fields)) {
    if (key in op) checkField(kind, op[key], `${where}.${key}`, capability);
  }
  if (canonical === 'node.add' && !Object.hasOwn(capability.nodeTypes, op.type)) fail(`${where}.type: not in capability allowlist`);
  if (canonical === 'edge.add') {
    if (!Object.hasOwn(capability.relationTypes, op.type)) fail(`${where}.type: not in capability allowlist`);
    if (!capability.edgeDirections.includes(op.direction)) fail(`${where}.direction: not advertised by capability`);
  }
  return { ...op, op: canonical };
}

// ---- reference resolution ------------------------------------------------------

function checkReferences(response, snapshot) {
  const bad = (message) => { throw new DecodeError('bad-references', message); };
  const nodes = new Set(snapshot.nodes.map((n) => n.ref));
  const relations = new Set(snapshot.relations.map((r) => r.ref));
  if (response.kind !== 'plan') {
    for (const list of [response.contextRefs ?? [], ...(response.choices ?? []).map((c) => c.refs)]) {
      for (const r of list) if (!nodes.has(r) && !relations.has(r)) bad(`unknown snapshot reference "${r}"`);
    }
    return;
  }
  const newNodes = new Set();
  const newRelations = new Set();
  const ids = new Set();
  const expectNode = (r, where) => {
    if ('existing' in r ? !nodes.has(r.existing) : !newNodes.has(r.new)) bad(`${where}: not a known node reference`);
  };
  const expectRelation = (r, where) => {
    if ('existing' in r ? !relations.has(r.existing) : !newRelations.has(r.new)) bad(`${where}: not a known relation reference`);
  };
  const expectEntity = (r, where) => {
    const ok = 'existing' in r ? nodes.has(r.existing) || relations.has(r.existing) : newNodes.has(r.new) || newRelations.has(r.new);
    if (!ok) bad(`${where}: not a known reference`);
  };
  const introduce = (set, handle, where) => {
    if (newNodes.has(handle) || newRelations.has(handle)) bad(`${where}: duplicate handle "${handle}"`);
    set.add(handle);
  };
  response.operations.forEach((op, k) => {
    const where = `operations[${k}]`;
    if (ids.has(op.id)) bad(`${where}: duplicate operation id "${op.id}"`);
    ids.add(op.id);
    switch (op.op) {
      case 'node.add':
        if (op.parent) expectNode(op.parent, `${where}.parent`);
        introduce(newNodes, op.as, where);
        break;
      case 'entity.label.set': case 'entity.label.unset': expectEntity(op.target, `${where}.target`); break;
      case 'edge.add':
        expectNode(op.first.node, `${where}.first`); expectNode(op.second.node, `${where}.second`);
        introduce(newRelations, op.as, where);
        break;
      case 'edge.remove': expectRelation(op.target, `${where}.target`); break;
      case 'node.remove': expectNode(op.target, `${where}.target`); break;
      case 'layout.relative': expectNode(op.subject, `${where}.subject`); expectNode(op.target, `${where}.target`); break;
      case 'layout.arrange': op.members.forEach((m, j) => expectNode(m, `${where}.members[${j}]`)); break;
      case 'layout.boundary':
        expectNode(op.subject, `${where}.subject`);
        if (op.scope.kind === 'group') expectNode(op.scope.target, `${where}.scope.target`);
        break;
    }
  });
}

// ---- entry point -----------------------------------------------------------------

/**
 * Decode raw response bytes against a snapshot. Returns the validated
 * response (op names canonical) or throws DecodeError. `vocabulary`
 * optionally maps canonical op names to the nonce spellings a robustness
 * variant advertised.
 */
export function decodeResponse(rawBytes, snapshot, vocabulary = null) {
  if (rawBytes.length > LIMITS.responseBytes) fail(`response longer than ${LIMITS.responseBytes} bytes`);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(rawBytes); // a BOM is content, hence rejected
  const value = parseStrictJson(text);
  if (!isObject(value)) fail('response must be an object');
  if (value.protocol !== PROTOCOL) fail(`protocol must be ${PROTOCOL}`);
  if (value.snapshot !== snapshot.snapshot) fail('snapshot token does not match');
  if (typeof value.kind !== 'string' || !Object.hasOwn(RESPONSE_KINDS, value.kind)) fail('kind must be plan, clarify or no_change');
  const kindSpec = RESPONSE_KINDS[value.kind];
  closed(value, { protocol: 'string', snapshot: 'string', kind: 'string', ...kindSpec.fields }, 'response');
  if (!Object.hasOwn(CAPABILITIES, snapshot.capabilities)) fail(`unknown capability manifest ${snapshot.capabilities}`);
  const capability = CAPABILITIES[snapshot.capabilities];

  if (value.kind === 'plan') {
    if (!Array.isArray(value.operations) || value.operations.length === 0) fail('operations must be a nonempty array');
    if (value.operations.length > LIMITS.operations) fail(`more than ${LIMITS.operations} operations`);
    const decoded = { ...value, operations: value.operations.map((op, k) => validateOperation(op, k, capability, vocabulary)) };
    checkReferences(decoded, snapshot);
    return decoded;
  }
  if (value.kind === 'clarify') {
    if (!CLARIFY_REASONS.includes(value.reason)) fail('clarify reason must be ambiguous or missing-context');
    if (typeof value.question !== 'string') fail('question must be a string');
    if (value.reason === 'ambiguous' && 'contextRefs' in value) fail('ambiguous clarification cannot request context');
    if (value.reason === 'missing-context') {
      if ('choices' in value) fail('missing-context clarification cannot offer choices');
      if (!Array.isArray(value.contextRefs) || value.contextRefs.length === 0) fail('missing-context requires contextRefs');
    }
    if ('choices' in value) {
      if (!Array.isArray(value.choices) || value.choices.length === 0) fail('choices must be a nonempty array');
      value.choices.forEach((c, k) => {
        closed(c, { label: 'string', refs: 'refs' }, `choices[${k}]`);
        if (typeof c.label !== 'string') fail(`choices[${k}].label must be a string`);
        if (!Array.isArray(c.refs) || c.refs.length === 0) fail(`choices[${k}].refs must be nonempty`);
        c.refs.forEach((r) => identifier(r, `choices[${k}].refs`));
        if (new Set(c.refs).size !== c.refs.length) fail(`choices[${k}].refs has duplicates`);
      });
    }
    if ('contextRefs' in value) {
      if (!Array.isArray(value.contextRefs)) fail('contextRefs must be an array');
      value.contextRefs.forEach((r) => identifier(r, 'contextRefs'));
      if (new Set(value.contextRefs).size !== value.contextRefs.length) fail('contextRefs has duplicates');
    }
    checkReferences(value, snapshot);
    return value;
  }
  if (!NO_CHANGE_REASONS.includes(value.reason)) fail('no_change reason must be already-satisfied, explanation or unsupported');
  if (typeof value.message !== 'string') fail('message must be a string');
  return value;
}
