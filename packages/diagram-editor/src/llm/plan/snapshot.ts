/**
 * Source snapshot and capability adapter (0.2.10 design, "Diagram snapshot
 * and capabilities"; plan slice 20).
 *
 * A capture holds the full authority for one request: exact source, its
 * revisions, the complete successor projection and a map from snapshot-scoped
 * refs to source identities. The model-facing view carries only facts: refs,
 * qualified source IDs and labels as separate fields, types, hierarchy,
 * semantic ports and relations, with explicit coverage. A source that cannot
 * pass the editor's own export gate refuses editing. Editability is asked of
 * the source compiler (execute.ts), never read from the view.
 */
import { resolveSuccessorGraphNodes028, projectInstalledSourceToSuccessor028,
  type SuccessorSourceEdge028, type SuccessorSourceGraph028, type SuccessorSourceNode028 } from '@coral-viz/render';
import { portFinding029, sourceOwnedGraphForExport028 } from '../../sourceOwnedEdits028';
import { capabilityForProfile, PLAN_LIMITS } from './registry';

export interface SnapshotEndpoint { node: string; port?: string }
export interface SnapshotPort { id: string; direction: 'in' | 'out' | 'inout'; maxConnections?: number }
export interface SnapshotNode {
  ref: string; sourceId: string; type: string; label?: string; parent: string | null; ports?: SnapshotPort[];
}
/** An endpoint outside a partial view: identity only; its parent and ports are not shown. */
export interface SnapshotStub { ref: string; sourceId: string; type: string; label?: string; stub: true }
export interface SnapshotRelation {
  ref: string; type: string; first: SnapshotEndpoint; second: SnapshotEndpoint; direction: string; label?: string;
}
export type Coverage = 'complete' | 'partial';
export interface PlanSnapshot {
  snapshot: string;
  profile: string;
  capabilities: string;
  coverage: { nodes: Coverage; relations: Coverage; hierarchy: Coverage; details: 'complete' | 'selected-and-neighbors' };
  /** Present only on partial views: omission never means absence. */
  totals?: { nodes: number; relations: number };
  selected: string[];
  nodes: (SnapshotNode | SnapshotStub)[];
  relations: SnapshotRelation[];
}

/**
 * The shape the frozen on-device contract renders: complete coverage, ports
 * as IDs only. P3 (W-16, W-17) maps a PlanSnapshot onto it.
 */
export interface CompactSnapshot extends Omit<PlanSnapshot, 'nodes' | 'totals' | 'selected'> {
  selected?: string[];
  comment?: string;
  nodes: (Omit<SnapshotNode, 'ports'> & { ports?: { id: string }[] })[];
}

export type EntityKind = 'node' | 'relation';
export interface EntityId { kind: EntityKind; id: string }

export interface PlanCapture {
  readonly token: string;
  readonly requestId: string;
  readonly source: string;
  readonly sourceRevision: number;
  readonly geometryRevision?: number;
  /** The complete accepted successor projection; the executor works on this, never the view. */
  readonly graph: SuccessorSourceGraph028;
  readonly entities: ReadonlyMap<string, EntityId>;
  /** Selected refs, in view order. */
  readonly selection: readonly string[];
  /** Focused node IDs of a partial view. */
  readonly focus?: ReadonlySet<string>;
  readonly contextRounds: number;
  readonly view: PlanSnapshot;
}

export interface PlanRefusal { code: string; message: string }
export type CaptureResult = { ok: true; capture: PlanCapture } | { ok: false; refusal: PlanRefusal };

export interface CaptureInput {
  source: string;
  sourceRevision: number;
  geometryRevision?: number;
  requestId: string;
  /** Selected nodes and connectors; a node and a connector may share an ID. */
  selection?: readonly EntityId[];
  limits?: { nodes: number; relations: number };
}

const refuse = (code: string, message: string): CaptureResult => ({ ok: false, refusal: { code, message } });

/** Every token this session has issued, so no two captures share one. */
const issuedTokens = new Set<string>();

/**
 * A fresh `s` + 7 hex token (the shape the on-device model was trained on),
 * random and never reissued in this session, so a response written for one
 * capture cannot be admitted against another.
 */
function mintSnapshotToken(): string {
  for (;;) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4));
    const token = `s${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 7)}`;
    if (!issuedTokens.has(token)) { issuedTokens.add(token); return token; }
  }
}

export function preorder(nodes: readonly SuccessorSourceNode028[]): SuccessorSourceNode028[] {
  return nodes.flatMap(node => [node, ...preorder(node.children ?? [])]);
}

/**
 * Capture one request's authority and build its view. Refuses an invalid,
 * unprojectable or non-exportable source, and a profile without a capability.
 */
export function capturePlanSnapshot(input: CaptureInput): CaptureResult {
  const projected = projectInstalledSourceToSuccessor028(input.source);
  const graph = projected.graph;
  if (!graph || projected.diagnostics.length) {
    const [first] = projected.diagnostics;
    return refuse('coral.plan.snapshot.invalid', first ? `${first.code}: ${first.message}` : 'The source has no complete semantic projection.');
  }
  const capability = capabilityForProfile(graph.profile.id);
  if (!capability) return refuse('coral.plan.snapshot.profile', `AI editing does not support the ${graph.profile.id} profile.`);
  const port = portFinding029(input.source, graph);
  if (port) return refuse('coral.plan.snapshot.invalid', port);
  try { sourceOwnedGraphForExport028(input.source, input.source, graph); } catch (error) {
    return refuse('coral.plan.snapshot.invalid', (error as Error).message);
  }
  const entities = new Map<string, EntityId>();
  preorder(graph.nodes).forEach((node, k) => entities.set(`n${k + 1}`, { kind: 'node', id: node.id }));
  graph.edges.forEach((edge, k) => entities.set(`e${k + 1}`, { kind: 'relation', id: edge.id }));
  const chosen = new Set((input.selection ?? []).map(({ kind, id }) => `${kind}:${id}`));
  const selection = [...entities].filter(([, { kind, id }]) => chosen.has(`${kind}:${id}`)).map(([ref]) => ref);
  const capture = { token: mintSnapshotToken(), requestId: input.requestId, source: input.source, sourceRevision: input.sourceRevision,
    ...(input.geometryRevision !== undefined ? { geometryRevision: input.geometryRevision } : {}),
    graph, entities, selection, contextRounds: 0 };
  const limits = input.limits ?? { nodes: PLAN_LIMITS.snapshotNodes, relations: PLAN_LIMITS.snapshotRelations };
  if (entities.size - graph.edges.length <= limits.nodes && graph.edges.length <= limits.relations) {
    return { ok: true, capture: { ...capture, view: buildView(capture, capability.id, capability.defaultRelationType) } };
  }
  const focus = focusOf(capture, selection, new Set());
  if (!focus.size) return refuse('coral.plan.snapshot.too-large', 'The diagram is too large to describe whole. Select the part to edit.');
  return partial(capture, focus, limits, capability.id, capability.defaultRelationType);
}

type CaptureBase = Omit<PlanCapture, 'view'>;

/** Nodes to describe in full: listed nodes, and both endpoints of listed relations. */
function focusOf(capture: CaptureBase, refs: readonly string[], prior: ReadonlySet<string>): Set<string> {
  const focus = new Set(prior);
  for (const ref of refs) {
    const entity = capture.entities.get(ref)!;
    const edge = entity.kind === 'relation' ? capture.graph.edges.find(item => item.id === entity.id)! : undefined;
    for (const id of edge ? [edge.first.node, edge.second.node] : [entity.id]) focus.add(id);
  }
  return focus;
}

function partial(capture: CaptureBase, focus: Set<string>, limits: { nodes: number; relations: number },
  capabilityId: string, defaultRelationType: string): CaptureResult {
  const view = buildView({ ...capture, focus }, capabilityId, defaultRelationType);
  if (view.nodes.length > limits.nodes || view.relations.length > limits.relations) {
    return refuse('coral.plan.snapshot.too-large', 'The selected part of the diagram is too large to describe. Select fewer items.');
  }
  return { ok: true, capture: { ...capture, focus, view } };
}

function buildView(capture: CaptureBase, capabilityId: string, defaultRelationType: string): PlanSnapshot {
  const { graph, focus } = capture;
  const refOf = new Map<string, string>();
  for (const [ref, entity] of capture.entities) refOf.set(`${entity.kind}:${entity.id}`, ref);
  const nodeRef = (id: string) => refOf.get(`node:${id}`)!;
  const all = preorder(graph.nodes);
  const byId = new Map(all.map(node => [node.id, node]));
  const interpretations = resolveSuccessorGraphNodes028(graph);
  const ancestors = (id: string): string[] => {
    const parent = byId.get(id)?.parent;
    return parent ? [parent, ...ancestors(parent)] : [];
  };
  const included = focus ? new Set([...focus].flatMap(id => [id, ...ancestors(id)])) : undefined;
  const edges = focus ? graph.edges.filter(edge => focus.has(edge.first.node) || focus.has(edge.second.node)) : graph.edges;
  const stubs = new Set(edges.flatMap(edge => [edge.first.node, edge.second.node]).filter(id => included && !included.has(id)));
  const label = (item: { label?: string }) => (item.label !== undefined ? { label: item.label } : {});
  const nodes = all.filter(node => !included || included.has(node.id) || stubs.has(node.id)).map((node): SnapshotNode | SnapshotStub => {
    const base = { ref: nodeRef(node.id), sourceId: node.id, type: node.type, ...label(node) };
    if (stubs.has(node.id)) return { ...base, stub: true };
    const ports = (interpretations.get(node.id)?.semanticPorts ?? []).map(({ id, direction, maxConnections }) =>
      ({ id, direction, ...(maxConnections !== undefined ? { maxConnections } : {}) }));
    return { ...base, parent: node.parent ? nodeRef(node.parent) : null, ...(ports.length ? { ports } : {}) };
  });
  const endpoint = (end: SuccessorSourceEdge028['first']): SnapshotEndpoint => ({ node: nodeRef(end.node), ...(end.port ? { port: end.port } : {}) });
  const coverage: Coverage = focus ? 'partial' : 'complete';
  return {
    snapshot: capture.token, profile: graph.profile.id, capabilities: capabilityId,
    coverage: { nodes: coverage, relations: coverage, hierarchy: coverage, details: focus ? 'selected-and-neighbors' : 'complete' },
    ...(focus ? { totals: { nodes: all.length, relations: graph.edges.length } } : {}),
    selected: [...capture.selection],
    nodes,
    relations: edges.map(edge => ({ ref: refOf.get(`relation:${edge.id}`)!, type: edge.type ?? defaultRelationType,
      first: endpoint(edge.first), second: endpoint(edge.second), direction: edge.direction, ...label(edge) })),
  };
}

/**
 * Read-only context expansion within the same snapshot, at most
 * PLAN_LIMITS.contextRounds rounds whatever the coverage. A complete view
 * has nothing to add but still spends a round.
 */
export function expandPlanContext(capture: PlanCapture, refs: readonly string[],
  limits = { nodes: PLAN_LIMITS.snapshotNodes, relations: PLAN_LIMITS.snapshotRelations }): CaptureResult {
  if (capture.contextRounds >= PLAN_LIMITS.contextRounds) {
    return refuse('coral.plan.context.rounds', 'More context was requested than this exchange allows. Narrow the request.');
  }
  const unknown = refs.find(ref => !capture.entities.has(ref));
  if (unknown !== undefined) return refuse('coral.plan.context.unknown', `${unknown} is not in this snapshot.`);
  const contextRounds = capture.contextRounds + 1;
  if (!capture.focus) return { ok: true, capture: { ...capture, contextRounds } };
  const capability = capabilityForProfile(capture.graph.profile.id)!;
  return partial({ ...capture, contextRounds }, focusOf(capture, refs, capture.focus), limits,
    capability.id, capability.defaultRelationType);
}

/** Refs the view shows only as endpoint stubs; no operation may write them. */
export function stubRefs(capture: PlanCapture): Set<string> {
  return new Set(capture.view.nodes.filter(node => 'stub' in node).map(node => node.ref));
}

/** A capture is current only for the exact source and revisions it was taken from. */
export function planCaptureIsCurrent(capture: PlanCapture,
  current: { source: string; sourceRevision: number; geometryRevision?: number }): boolean {
  return current.source === capture.source && current.sourceRevision === capture.sourceRevision &&
    current.geometryRevision === capture.geometryRevision;
}
