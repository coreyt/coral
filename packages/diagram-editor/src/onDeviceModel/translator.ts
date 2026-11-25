/**
 * Compact snapshot rendering and reply translation for the on-device editing
 * model (R-066 AC-1, AC-5).
 *
 * A TypeScript port of dev/experiments/coralsmol/baseline/compact.mjs
 * (handleTable, renderCompactSnapshot, compactMessages, translate). The model
 * reads a line snapshot with shuffled ordinal handles and writes one line per
 * edit; translation turns the lines into `coral-plan/1` JSON for the shared
 * strict decoder. Translation rejects, never repairs.
 *
 * Product differences from the experiment: snapshots are always complete, so
 * there are no disclosures or released stages; Web Crypto replaces
 * node:crypto, so building a handle table is asynchronous; and any special
 * token left in a reply is rejected explicitly.
 */
import { FROZEN_CONTRACT, HOST_MESSAGES, UNCLEAR_QUESTION } from './contract';
import { PLAN_CAPABILITIES, PLAN_ENUMS, PLAN_PROTOCOL } from '../llm/plan/registry';
import type { PlanOperation, PlanRef, PlanResponse } from '../llm/plan/decode';
import type { CompactSnapshot, SnapshotEndpoint, SnapshotRelation } from '../llm/plan/snapshot';

type SnapshotNode = CompactSnapshot['nodes'][number];
const CAPABILITY_ID = 'flowchart-plan-v1';
const CAPABILITY = PLAN_CAPABILITIES[CAPABILITY_ID];
const NODE_TYPES = Object.keys(CAPABILITY.nodeTypes);
const RELATION_TYPES = Object.keys(CAPABILITY.relationTypes);

export interface HandleTable { toRef: Map<string, string>; toHandle: Map<string, string> }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

type Ref = PlanRef | null;

export class TranslateError extends Error {}
const fail = (message: string): never => { throw new TranslateError(message); };
const quote = (value: string) => JSON.stringify(value);

/** The one SHA-256 helper of the on-device model (Web Crypto, lowercase hex). */
export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// ---- handle table ---------------------------------------------------------

async function shuffled<T>(items: T[], seed: string): Promise<T[]> {
  const keyed = await Promise.all(items.map(async (item, i) => ({ item, key: await sha256Hex(`${seed}:${i}`) })));
  return keyed.sort((a, b) => a.key.localeCompare(b.key)).map(x => x.item);
}

/**
 * Assigns shuffled ordinal handles (n1.., e1..) to snapshot nodes and
 * relations. The seed matches training: `${requestId}:${snapshot token}`.
 */
export async function handleTable(requestId: string, snapshot: CompactSnapshot): Promise<HandleTable> {
  const seed = `${requestId}:${snapshot.snapshot}`;
  const toRef = new Map<string, string>(); const toHandle = new Map<string, string>();
  let nodes = 0; let edges = 0;
  const assign = (ref: string, prefix: 'n' | 'e') => {
    if (toHandle.has(ref)) return;
    const handle = prefix === 'n' ? `n${++nodes}` : `e${++edges}`;
    toRef.set(handle, ref); toHandle.set(ref, handle);
  };
  for (const n of await shuffled(snapshot.nodes, `${seed}:n`)) assign(n.ref, 'n');
  for (const r of await shuffled(snapshot.relations, `${seed}:e`)) assign(r.ref, 'e');
  return { toRef, toHandle };
}

const handleOf = (table: HandleTable, ref: string) => table.toHandle.get(ref) ?? fail(`No handle for ${ref}`);

// ---- rendering ------------------------------------------------------------

const ARROWS: Record<string, string> = { 'first-to-second': '->', 'second-to-first': '<-', both: '<->', none: '--' };
const KNOWN_SNAPSHOT = new Set(['snapshot', 'profile', 'capabilities', 'coverage', 'selected', 'comment', 'nodes', 'relations']);
const KNOWN_NODE = new Set(['ref', 'sourceId', 'type', 'label', 'parent', 'ports']);
const KNOWN_RELATION = new Set(['ref', 'type', 'first', 'second', 'direction', 'label']);

const endpointText = (table: HandleTable, endpoint: SnapshotEndpoint) =>
  handleOf(table, endpoint.node) + (endpoint.port ? `.${endpoint.port}` : '');
const portId = (p: unknown) => (p && typeof p === 'object' && Object.keys(p).join() === 'id'
  && typeof (p as { id: unknown }).id === 'string' ? (p as { id: string }).id : fail('Unrendered port shape'));
function checkFields(value: object, known: Set<string>, what: string) {
  for (const key of Object.keys(value)) if (!known.has(key)) fail(`Unrendered ${what} field ${key}`);
}
function nodeLine(table: HandleTable, n: SnapshotNode) {
  checkFields(n, KNOWN_NODE, 'node');
  return [handleOf(table, n.ref), n.type, ...(n.label !== undefined ? [quote(n.label)] : []),
    n.parent ? `in ${handleOf(table, n.parent)}` : 'root',
    ...(n.ports?.length ? [`ports ${n.ports.map(portId).join(',')}`] : []), `id ${n.sourceId}`].join(' ');
}
function relationLine(table: HandleTable, r: SnapshotRelation) {
  checkFields(r, KNOWN_RELATION, 'relation');
  return [handleOf(table, r.ref), r.type, endpointText(table, r.first), ARROWS[r.direction] ?? fail('Unknown direction'),
    endpointText(table, r.second), ...(r.label !== undefined ? [quote(r.label)] : [])].join(' ');
}

/** Renders the line snapshot; unknown fields are refused, never dropped. */
export function renderCompactSnapshot(snapshot: CompactSnapshot, table: HandleTable): string {
  checkFields(snapshot, KNOWN_SNAPSHOT, 'snapshot');
  const c = snapshot.coverage;
  const byHandle = <T extends { ref: string }>(list: T[]) =>
    [...list].sort((a, b) => Number(handleOf(table, a.ref).slice(1)) - Number(handleOf(table, b.ref).slice(1)));
  return [
    `snapshot ${snapshot.snapshot} ${snapshot.profile} ${snapshot.capabilities}`,
    `coverage nodes=${c.nodes} relations=${c.relations} hierarchy=${c.hierarchy} details=${c.details}`,
    `selected ${snapshot.selected?.length ? snapshot.selected.map(ref => handleOf(table, ref)).join(' ') : 'none'}`,
    ...(snapshot.comment !== undefined ? [`comment ${quote(snapshot.comment)}`] : []),
    'nodes:', ...byHandle(snapshot.nodes).map(n => nodeLine(table, n)),
    'relations:', ...byHandle(snapshot.relations).map(r => relationLine(table, r)),
  ].join('\n');
}

/** Training layout: frozen contract, the byte-exact request, the snapshot. */
export function compactMessages(request: string, snapshot: CompactSnapshot, table: HandleTable): ChatMessage[] {
  return [{ role: 'system', content: FROZEN_CONTRACT }, { role: 'user', content: request },
    { role: 'system', content: renderCompactSnapshot(snapshot, table) }];
}

// ---- host text ------------------------------------------------------------

function describe(snapshot: CompactSnapshot, ref: string) {
  const name = (n: SnapshotNode | undefined) => `"${n?.label ?? n?.sourceId ?? 'unknown'}"`;
  const node = snapshot.nodes.find(n => n.ref === ref);
  if (!node) {
    const r = snapshot.relations.find(x => x.ref === ref);
    return r ? `the arrow from ${name(snapshot.nodes.find(n => n.ref === r.first.node))} to ${name(snapshot.nodes.find(n => n.ref === r.second.node))}` : 'that item';
  }
  const parent = node.parent ? snapshot.nodes.find(n => n.ref === node.parent) : null;
  return `${name(node)}${parent ? ` inside ${name(parent)}` : ' at the top level'}`;
}

/**
 * A refusal names the entities it lists in `refs` by snapshot ref; show their
 * labels instead. Other words are left alone, so a source ID that happens to
 * look like a ref is never relabelled.
 */
export function readableRefusal(refusal: { message: string; refs?: readonly string[] }, snapshot: CompactSnapshot): string {
  const known = new Set([...snapshot.nodes, ...snapshot.relations].map(item => item.ref));
  const refs = (refusal.refs ?? []).filter(ref => known.has(ref));
  if (!refs.length) return refusal.message;
  const escaped = refs.map(ref => ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\w.:-])(${escaped.join('|')})(?![\\w.:-])`, 'g');
  return refusal.message.replace(pattern, ref => describe(snapshot, ref).replace(/ (inside "[^"]*"|at the top level)$/, ''));
}

// ---- translate (lines -> coral-plan/1) ------------------------------------

type Token = string | { string: string };

// Tokens: bare words, or one JSON string. Anything else is rejected.
function tokens(line: string): Token[] {
  const out: Token[] = []; let i = 0;
  while (i < line.length) {
    if (line[i] === ' ') { if (line[i + 1] === ' ' || i === 0) fail('Irregular spacing'); i++; continue; }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
      if (j >= line.length) fail('Unterminated string');
      let value: unknown;
      try { value = JSON.parse(line.slice(i, j + 1)); } catch { fail('Invalid string'); }
      out.push({ string: value as string }); i = j + 1;
      if (i < line.length && line[i] !== ' ') fail('Text after string');
    } else {
      const j = line.indexOf(' ', i) < 0 ? line.length : line.indexOf(' ', i);
      out.push(line.slice(i, j)); i = j;
    }
  }
  if (line.endsWith(' ')) fail('Trailing space');
  return out;
}

/** Special tokens such as `<|im_start|>`; the worker trims only a final EOS. */
const SPECIAL_TOKEN = /<\|[^\s|]*\|>/;

/**
 * Translates one model reply into a `coral-plan/1` response for this
 * snapshot. Throws TranslateError for any malformed reply.
 */
export function translate(text: string, snapshot: CompactSnapshot, table: HandleTable): PlanResponse {
  if (typeof text !== 'string' || !text.length || text !== text.trim()) fail('Empty or padded response');
  if (SPECIAL_TOKEN.test(text)) fail('Unexpected special token');
  if (snapshot.capabilities !== CAPABILITY_ID) fail(`Unknown capability ${snapshot.capabilities}`);
  const lines = text.split('\n');
  const base: { protocol: typeof PLAN_PROTOCOL; snapshot: string } = { protocol: PLAN_PROTOCOL, snapshot: snapshot.snapshot };
  const known = (h: string) => table.toRef.has(h);
  const existing = (h: string) => (known(h) ? table.toRef.get(h)! : fail(`Unknown handle ${h}`));
  const word = <T extends string>(t: Token | undefined, allowed: readonly T[]): T =>
    (typeof t === 'string' && (allowed as readonly string[]).includes(t) ? t as T : fail(`Expected one of ${allowed.join('|')}`));
  const first = tokens(lines[0]);
  if (first[0] === 'ask' || first[0] === 'no-change') {
    if (lines.length !== 1) fail('Clarify/no-change must be one line');
    if (first[0] === 'no-change') {
      if (first.length !== 2) fail('no-change takes one reason');
      const reason = word(first[1], Object.keys(HOST_MESSAGES) as (keyof typeof HOST_MESSAGES)[]);
      return { ...base, kind: 'no_change', reason, message: HOST_MESSAGES[reason] };
    }
    if (first[1] === 'unclear') {
      if (first.length !== 2) fail('ask unclear takes no handles');
      return { ...base, kind: 'clarify', reason: 'ambiguous', question: UNCLEAR_QUESTION };
    }
    const reason = word(first[1], ['ambiguous', 'missing-context'] as const);
    const rest = first.slice(2);
    if (!rest.length || rest.some(t => typeof t !== 'string')) fail('ask needs handles');
    const words = rest as string[];
    if (reason === 'missing-context') {
      return { ...base, kind: 'clarify', reason, contextRefs: words.map(existing),
        question: `Please show the details and connections of ${words.map(h => describe(snapshot, existing(h))).join(', ')} so I can finish the request.` };
    }
    const groups = words.join(' ').split(' | ').map(g => g.split(' '));
    if (groups.some(g => !g.length || g.some(h => !/^[ne]\d+$/.test(h)))) fail('Malformed choices');
    // A question that offers the same item twice cannot be answered.
    if (new Set(groups.flat()).size !== groups.flat().length) fail('Repeated choice');
    const choices = groups.map(g => ({ label: g.map(h => describe(snapshot, existing(h))).join(' and '), refs: g.map(existing) }));
    return { ...base, kind: 'clarify', reason, choices,
      question: `Which do you mean: ${choices.map(c => c.label).join(' or ')}?` };
  }
  const introduced = new Map<string, 'n' | 'e'>();
  const ref = (h: Token | undefined): Ref => (typeof h !== 'string' ? fail('Expected a handle')
    : introduced.has(h) ? { new: h } : known(h) ? { existing: table.toRef.get(h)! } : fail(`Unknown handle ${h}`));
  const nodeRef = (h: Token | undefined): Ref => (typeof h === 'string' && /^[nx]\d+$/.test(h) ? ref(h) : fail(`Expected a node handle, got ${h}`));
  const endpoint = (t: Token | undefined) => {
    if (typeof t !== 'string') fail('Expected an endpoint');
    const [h, port, extra] = (t as string).split('.');
    if (extra !== undefined || port === '') fail('Bad endpoint');
    return { node: nodeRef(h), ...(port ? { port } : {}) };
  };
  // A new node may take any unused nN or xN handle; a new arrow takes an unused
  // eN handle or none (compact/3 trains x1, x2, ... and handle-free arrows).
  const fresh = (pattern: RegExp) => (h: Token | undefined) =>
    (typeof h === 'string' && pattern.test(h) && !known(h) && !introduced.has(h) ? h : fail(`Bad new handle ${h}`));
  const enumOf = (t: Token | undefined, name: keyof typeof PLAN_ENUMS) => word(t, PLAN_ENUMS[name]);
  const operations = lines.map((line, i): PlanOperation => {
    const t = tokens(line); const id = `op${i}`;
    const arity = (min: number, max = min) => { if (t.length < min || t.length > max) fail(`Wrong arity on line ${i + 1}`); };
    switch (t[0]) {
      case 'add': {
        const labelled = typeof t[3] === 'object'; arity(labelled ? 6 : 5);
        const at = labelled ? 4 : 3;
        if (t[at] !== 'in') fail('add needs in PARENT|root');
        const op: PlanOperation = { id, op: 'node.add', as: fresh(/^[nx]\d+$/)(t[1]),
          parent: t[at + 1] === 'root' ? null : nodeRef(t[at + 1]), type: word(t[2], NODE_TYPES) };
        if (labelled) op.label = (t[3] as { string: string }).string;
        introduced.set(op.as as string, 'n'); return op;
      }
      case 'edge': {
        const named = typeof t[1] === 'string' && /^e\d+$/.test(t[1]); const s = named ? t.slice(1) : t;
        if (s.length < 5 || s.length > 6) fail(`Wrong arity on line ${i + 1}`);
        if (s[3] !== '->') fail('Arrows are written ->');
        const op: PlanOperation = { id, op: 'edge.add', as: named ? fresh(/^e\d+$/)(t[1]) : `arrow${i}`,
          type: word(s[1], RELATION_TYPES), first: endpoint(s[2]), second: endpoint(s[4]), direction: 'first-to-second' };
        if (s.length === 6) { if (typeof s[5] !== 'object') fail('Edge label must be a string'); op.label = (s[5] as { string: string }).string; }
        if (named) introduced.set(op.as as string, 'e'); // a handle-free arrow cannot be referenced later
        return op;
      }
      case 'label': arity(3); if (typeof t[2] !== 'object') fail('label needs a string');
        return { id, op: 'entity.label.set', target: ref(t[1]), value: (t[2] as { string: string }).string };
      case 'unlabel': arity(2); return { id, op: 'entity.label.unset', target: ref(t[1]) };
      case 'delete': arity(2);
        return { id, op: typeof t[1] === 'string' && /^e\d+$/.test(t[1]) ? 'edge.remove'
          : typeof t[1] === 'string' && /^[nx]\d+$/.test(t[1]) ? 'node.remove' : fail('delete needs a handle'), target: ref(t[1]) };
      case 'place': arity(5);
        return { id, op: 'layout.relative', subject: nodeRef(t[1]), relation: enumOf(t[2], 'relation'), target: nodeRef(t[3]), spacing: enumOf(t[4], 'spacing') };
      case 'arrange': if (t.length < 6) fail('arrange needs at least two nodes');
        return { id, op: 'layout.arrange', axis: enumOf(t[1], 'axis'), direction: enumOf(t[2], 'order'), spacing: enumOf(t[3], 'spacing'), members: t.slice(4).map(nodeRef) };
      case 'boundary': arity(5);
        return { id, op: 'layout.boundary', subject: nodeRef(t[1]), side: enumOf(t[2], 'side'),
          scope: t[3] === 'diagram' ? { kind: 'diagram' } : { kind: 'group', target: nodeRef(t[3]) }, spacing: enumOf(t[4], 'spacing') };
      default: return fail(`Unknown operation on line ${i + 1}`);
    }
  });
  return { ...base, kind: 'plan', operations };
}
