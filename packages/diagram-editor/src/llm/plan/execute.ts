/**
 * Semantic executor and source compiler for decoded `coral-plan/1` plans
 * (0.2.10 design, "Deterministic validation and source compilation", steps
 * 3 to 6; plan slice 30).
 *
 * Pure and bounded: a plan of at most 32 operations runs against one capture
 * and returns a candidate source or one refusal; nothing live changes.
 *
 * 1. The semantic pass resolves every reference, allocates each new source ID
 *    once, records dependencies, refuses repeated writes, use after removal,
 *    add-then-remove and non-cascading removals with survivors, and applies
 *    each operation to a clone of the captured successor graph. That clone is
 *    the expected meaning; it is built without printing any source.
 * 2. The compile pass applies each operation, in order, with the existing
 *    source-owned edit helpers, which reparse after every edit. Each edit may
 *    change only bytes of its own target declaration, or insert new text.
 * 3. The reparsed candidate must equal the expected meaning, keep the
 *    captured newline convention, and pass the same port and export gates a
 *    capture does. There is no whole-source printing and no fallback.
 *
 * Spatial operations are refused until slice 60 supplies source-safe
 * placement.
 */
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  type SuccessorSourceEdge028, type SuccessorSourceGraph028, type SuccessorSourceNode028 } from '@coral-viz/render';
import {
  appendSourceOwnedEdge028, appendSourceOwnedNode028, canonicalJson, deleteSourceOwnedEdges028, deleteSourceOwnedLeafNode028,
  editSourceOwnedEdgeLabel028, editSourceOwnedNodeLabel028, portFinding029, removeSourceOwnedEdgeLabel028,
  removeSourceOwnedNodeLabel028, sourceOwnedGraphForExport028,
} from '../../sourceOwnedEdits028';
import type { ResolvedLayoutDiagnostic } from '@coral-viz/render/layout';
import type { PlanEndpoint, PlanOperation, PlanRef, PlanResponse } from './decode';
import { capabilityForProfile, PLAN_OPERATIONS, type PlanField } from './registry';
import { preorder, stubRefs, type EntityId, type EntityKind, type PlanCapture, type PlanRefusal } from './snapshot';

export interface PlanExecutionRefusal extends PlanRefusal { operation?: string; refs?: string[] }
export interface PlanExecution {
  /** The compiled candidate source. */
  source: string;
  /** The expected successor meaning, equal to the reparsed candidate. */
  graph: SuccessorSourceGraph028;
  /** False when the plan leaves the source unchanged: a no-change result. */
  changed: boolean;
  /** Plan handle to the source ID allocated for it. */
  allocations: Record<string, string>;
  /** Operation ID to the IDs of earlier operations it depends on. */
  dependencies: Record<string, string[]>;
  /**
   * Surviving unnamed connectors whose generated `edge-N` ID the plan
   * shifts, old ID to new. Editor state keyed by those IDs (selection,
   * inspector, pending focus) must be remapped or cleared on Apply.
   */
  renumbered: Record<string, string>;
  /**
   * Warnings from the final measured layout of a spatial plan (for example
   * `layout.route.degraded`); absent when there are none or nothing was measured.
   */
  layoutDiagnostics?: readonly ResolvedLayoutDiagnostic[];
  /** Base connector IDs the plan removes, so a review can keep them apart from new connectors. */
  removedEdges: string[];
  /**
   * Automatic nodes the bounded overlap repair moved clear of a placement
   * (owner, 2026-11-15), graph-absolute top-left before and after.
   */
  moved?: readonly { id: string; from: { x: number; y: number }; to: { x: number; y: number }; distance: number }[];
  /** Automatic nodes whose measured place was written unchanged, anchoring their frame. */
  anchored?: readonly string[];
}
export type ExecutionResult = { ok: true; execution: PlanExecution } | { ok: false; refusal: PlanExecutionRefusal };

export class Refusal extends Error {
  constructor(readonly refusal: PlanExecutionRefusal) { super(refusal.message); }
}
export const refuse = (code: string, message: string, operation?: string, refs?: string[]): never => {
  throw new Refusal({ code, message, ...(operation ? { operation } : {}), ...(refs ? { refs } : {}) });
};

/** Meaning of a written `->` connector: first-to-second, open arrow at the second end. */
const FLOW_CONNECTOR = { direction: 'first-to-second', proximityHint: 1, secondEnd: { marker: { kind: 'arrow', fill: 'open' } } } as const;
const BARE_WORD = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Binding extends EntityId { label: string; introducedBy?: string }
/** One operation with its references resolved: the source edit, and the declaration it owns. */
export interface Step { op: PlanOperation; write: (source: string) => string; owns?: { kind: EntityKind; id: string; block: boolean } }

function findNode(nodes: SuccessorSourceNode028[], id: string): SuccessorSourceNode028 | undefined {
  return preorder(nodes).find(node => node.id === id);
}

function removeNode(nodes: SuccessorSourceNode028[], id: string): SuccessorSourceNode028[] {
  return nodes.filter(node => node.id !== id).map(node => {
    if (!node.children) return node;
    const { children, ...rest } = node;
    const kept = removeNode(children, id);
    return kept.length ? { ...rest, children: kept } : rest;
  });
}

/** A camelCase ASCII word from a label, else the type; never a taken ID. */
function allocateNodeId(label: string | undefined, type: string, parent: string | null, taken: Set<string>): string {
  const words = (label ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let base = words.map((word, k) => (k ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase())).join('').slice(0, 32);
  if (!BARE_WORD.test(base)) base = base ? `${type}${base[0].toUpperCase()}${base.slice(1)}` : type;
  const qualify = (local: string) => (parent ? `${parent}.${local}` : local);
  let local = base;
  for (let k = 2; taken.has(local) || taken.has(qualify(local)); k++) local = `${base}${k}`;
  taken.add(local).add(qualify(local));
  return qualify(local);
}


/** Every reference an operation names, read from its registry field kinds. */
function operationRefs(op: PlanOperation): PlanRef[] {
  const spec = PLAN_OPERATIONS[op.op] as { fields: Record<string, PlanField> };
  return Object.entries(spec.fields).flatMap(([key, field]): PlanRef[] => {
    const value = op[key] as unknown;
    if (value === undefined || value === null) return [];
    switch (field.kind) {
      case 'node-ref': case 'relation-ref': case 'entity-ref': case 'parent': return [value as PlanRef];
      case 'endpoint': return [(value as PlanEndpoint).node];
      case 'members': return value as PlanRef[];
      case 'scope': return (value as { kind: string }).kind === 'group' ? [(value as { target: PlanRef }).target] : [];
      default: return [];
    }
  });
}

/** Spatial constraints that name an entity, or its label: constraints are never edited by a plan. */
function constraintsNaming(graph: SuccessorSourceGraph028, kind: EntityKind, id: string, labelOnly: boolean): string[] {
  type Reference = { kind: string; nodeId?: string; edgeId?: string };
  const names = (reference: Reference) => (kind === 'node'
    ? (reference.kind === 'node-label' || !labelOnly && reference.kind === 'node') && reference.nodeId === id
    : (reference.kind === 'edge-label' || !labelOnly && reference.kind === 'edge') && reference.edgeId === id);
  return (graph.constraints ?? []).filter(constraint => {
    const references: Reference[] = constraint.kind === 'arrangement' ? constraint.subjects
      : constraint.kind === 'relative' ? [constraint.subject, constraint.target] : [constraint.subject,
        ...(constraint.scope.kind === 'node' && !labelOnly ? [{ kind: 'node', nodeId: constraint.scope.nodeId }] : [])];
    return references.some(names);
  }).map(constraint => `constraint:${constraint.id}`);
}

/** A validated spatial operation, resolved to source IDs; slice 60 places it after measurement. */
export interface SpatialIntent {
  op: PlanOperation;
  /** Nodes whose positions the operation writes, in order. */
  subjects: string[];
  /** The fixed node of a relative placement. */
  target?: string;
  /** The group of a boundary placement; null for the diagram. */
  scope?: string | null;
}

// ---- semantic pass ---------------------------------------------------------------------

function semanticPass(capture: PlanCapture, operations: PlanOperation[]) {
  const capability = capabilityForProfile(capture.graph.profile.id)!;
  const expected = structuredClone(capture.graph);
  const unnamed = unnamedRemovals(capture, operations);
  const unnamedIds = new Set(unnamed.map(removal => removal.id));
  // Unnamed connectors are numbered in source order. All unnamed removals
  // compile first, last ordinal first; the survivors then take their final
  // numbers, and each new connector is appended after them, unnamed. The
  // expected graph and bindings use those final IDs throughout, and a
  // removed connector a working ID that nothing else can take.
  const survivors = capture.graph.edges.map(edge => edge.id).filter(id => UNNAMED.test(id) && !unnamedIds.has(id));
  const working = new Map<string, string>([...survivors.map((id, k) => [id, `edge-${k + 1}`] as const),
    ...[...unnamedIds].map(id => [id, `removed:${id}`] as const)]);
  const work = (entity: EntityId) => (entity.kind === 'relation' ? working.get(entity.id) ?? entity.id : entity.id);
  for (const edge of expected.edges) edge.id = working.get(edge.id) ?? edge.id;
  let added = 0;
  const bindings = new Map<string, Binding>();
  // Snapshot refs appear bare in refusals; plan handles as `new:<handle>`, constraints as `constraint:<id>`.
  for (const [ref, entity] of capture.entities) bindings.set(`existing:${ref}`, { ...entity, id: work(entity), label: ref });
  const taken = new Set<string>();
  for (const node of preorder(capture.graph.nodes)) taken.add(node.id).add(node.id.split('.').pop()!);
  for (const edge of capture.graph.edges) taken.add(edge.id);
  for (const constraint of capture.graph.constraints ?? []) taken.add(constraint.id);
  const removedBy = new Map<string, string>();
  const removedEdges: string[] = [];
  const labelWrittenBy = new Map<string, string>();
  const allocations: Record<string, string> = {};
  const dependencies: Record<string, string[]> = {};
  const steps: Step[] = [];
  const spatial: SpatialIntent[] = [];
  const movedBy = new Map<string, string>();
  const stubs = stubRefs(capture);
  const key = (entity: EntityId) => `${entity.kind}:${entity.id}`;
  const labelOf = (kind: EntityKind, id: string) => [...bindings.values()].find(b => b.kind === kind && b.id === id)?.label ?? id;

  for (const op of operations) {
    const after = new Set<string>();
    const resolve = (ref: PlanRef, kind?: EntityKind): Binding => {
      const binding = bindings.get('existing' in ref ? `existing:${ref.existing}` : `new:${ref.new}`);
      if (!binding || (kind && binding.kind !== kind)) {
        return refuse('coral.plan.reference', `${JSON.stringify(ref)} is not a ${kind ?? 'known'} reference in this snapshot or plan.`, op.id);
      }
      const removal = removedBy.get(key(binding));
      if (removal) refuse('coral.plan.removed', `${binding.label} is used after operation ${removal} removed it.`, op.id, [binding.label]);
      if (binding.introducedBy) after.add(binding.introducedBy);
      return binding;
    };
    const spec = PLAN_OPERATIONS[op.op] as { writes: readonly string[] };
    for (const field of spec.writes) {
      const value = op[field];
      for (const ref of (Array.isArray(value) ? value : value ? [value] : []) as PlanRef[]) {
        if ('existing' in ref && stubs.has(ref.existing)) {
          refuse('coral.plan.stub', `${ref.existing} is shown only as an endpoint; request its context before editing it.`, op.id, [ref.existing]);
        }
      }
    }
    const writeLabel = (binding: Binding) => {
      const prior = labelWrittenBy.get(key(binding));
      if (prior) refuse('coral.plan.repeated-write', `Operations ${prior} and ${op.id} both write the label of ${binding.label}.`, op.id, [binding.label]);
      labelWrittenBy.set(key(binding), op.id);
    };
    const blockedBy = (binding: Binding, dependents: string[]) => {
      if (dependents.length) {
        refuse('coral.plan.dependency', `${binding.label} still has ${dependents.join(', ')}; remove them first. Removal never cascades.`, op.id, dependents);
      }
    };
    const remove = (binding: Binding) => {
      const moved = movedBy.get(binding.id);
      if (binding.kind === 'node' && moved) {
        refuse('coral.plan.cancellation', `Operation ${op.id} removes ${binding.label}, which operation ${moved} places.`, op.id, [binding.label]);
      }
      if (binding.introducedBy) {
        refuse('coral.plan.cancellation', `Operation ${op.id} removes ${binding.label}, which operation ${binding.introducedBy} adds.`, op.id, [binding.label]);
      }
      blockedBy(binding, constraintsNaming(capture.graph, binding.kind, binding.id, false));
      removedBy.set(key(binding), op.id);
    };
    const handle = (as: unknown) => `new:${as as string}`;
    let step: Omit<Step, 'op'>;
    switch (op.op) {
      case 'node.add': {
        if (op.symbol !== undefined) refuse('coral.plan.not-compiled', 'Coral cannot yet place a symbol on a new node.', op.id);
        const parent = op.parent ? resolve(op.parent as PlanRef, 'node') : null;
        const parentType = parent ? findNode(expected.nodes, parent.id)?.type : undefined;
        if (parent && !capability.containers.includes(parentType!)) {
          refuse('coral.plan.parent', `${parent.label} is a ${parentType}, not a container.`, op.id, [parent.label]);
        }
        const label = op.label as string | undefined;
        const type = op.type as string;
        const id = allocateNodeId(label, type, parent?.id ?? null, taken);
        const node: SuccessorSourceNode028 = { id, type, ...(parent ? { parent: parent.id } : {}), ...(label !== undefined ? { label } : {}) };
        if (parent) (findNode(expected.nodes, parent.id)!.children ??= []).push(node);
        else expected.nodes.push(node);
        bindings.set(`new:${op.as as string}`, { kind: 'node', id, label: handle(op.as), introducedBy: op.id });
        if (label !== undefined) labelWrittenBy.set(`node:${id}`, op.id);
        allocations[op.as as string] = id;
        step = { write: source => appendSourceOwnedNode028(source, { id: id.split('.').pop()!, type,
          ...(parent ? { parentId: parent.id } : {}), ...(label !== undefined ? { label } : {}) }) };
        break;
      }
      case 'entity.label.set': case 'entity.label.unset': {
        const target = resolve(op.target as PlanRef);
        if (target.kind === 'relation' && target.id.startsWith('removed:')) {
          refuse('coral.plan.removed', `${target.label} is an unnamed connector this plan removes; it cannot also be relabelled.`, op.id, [target.label]);
        }
        writeLabel(target);
        const entity: { label?: string } = target.kind === 'node'
          ? findNode(expected.nodes, target.id)! : expected.edges.find(edge => edge.id === target.id)!;
        const value = op.value as string | undefined;
        if (value === undefined || value === '') blockedBy(target, constraintsNaming(capture.graph, target.kind, target.id, true));
        if (value === undefined) delete entity.label;
        else {
          if (target.kind === 'relation' && value === '' && entity.label === undefined) {
            refuse('coral.plan.label.empty-connector', `Coral cannot write an empty label on the unlabelled connector ${target.label}.`, op.id, [target.label]);
          }
          entity.label = value;
        }
        const owns = { kind: target.kind, id: target.id, block: false };
        step = target.kind === 'node'
          ? { owns, write: source => (value === undefined ? removeSourceOwnedNodeLabel028(source, target.id) : editSourceOwnedNodeLabel028(source, target.id, value)) }
          : { owns, write: source => (value === undefined
            ? removeSourceOwnedEdgeLabel028(source, target.id) : editSourceOwnedEdgeLabel028(source, target.id, value)) };
        break;
      }
      case 'edge.add': {
        if (op.direction !== 'first-to-second') refuse('coral.plan.not-compiled', `Coral cannot yet write a ${String(op.direction)} connector.`, op.id);
        const [first, second] = ([op.first, op.second] as PlanEndpoint[]).map(end =>
          ({ node: resolve(end.node, 'node').id, ...(end.port ? { port: end.port } : {}) }));
        const type = op.type as string;
        const id = `edge-${survivors.length + ++added}`;
        const label = op.label as string | undefined;
        const typed = type !== capability.defaultRelationType ? { type } : {};
        expected.edges.push({ id, first, second, ...FLOW_CONNECTOR, ...typed, ...(label !== undefined ? { label } : {}) } as SuccessorSourceEdge028);
        bindings.set(`new:${op.as as string}`, { kind: 'relation', id, label: handle(op.as), introducedBy: op.id });
        if (label !== undefined) labelWrittenBy.set(`relation:${id}`, op.id);
        allocations[op.as as string] = id;
        step = { write: source => appendSourceOwnedEdge028(source, { sourceId: first.node, targetId: second.node,
          sourceHandle: first.port ?? null, targetHandle: second.port ?? null, ...typed, ...(label !== undefined ? { label } : {}) }) };
        break;
      }
      case 'edge.remove': {
        const target = resolve(op.target as PlanRef, 'relation');
        if (!target.introducedBy) removedEdges.push(target.id.startsWith('removed:') ? target.id.slice('removed:'.length) : target.id);
        remove(target);
        expected.edges = expected.edges.filter(edge => edge.id !== target.id);
        if (target.id.startsWith('removed:')) {
          dependencies[op.id] = [...after];
          continue;
        }
        step = { owns: { kind: 'relation', id: target.id, block: false }, write: source => deleteSourceOwnedEdges028(source, [target.id]) };
        break;
      }
      case 'node.remove': {
        const target = resolve(op.target as PlanRef, 'node');
        if (target.introducedBy) remove(target);
        const children = findNode(expected.nodes, target.id)!.children ?? [];
        const incident = expected.edges.filter(edge => edge.first.node === target.id || edge.second.node === target.id);
        blockedBy(target, [...children.map(child => labelOf('node', child.id)), ...incident.map(edge => labelOf('relation', edge.id))]);
        for (const [entity, by] of removedBy) {
          const [kind, id] = [entity.slice(0, entity.indexOf(':')), entity.slice(entity.indexOf(':') + 1)];
          const original = kind === 'node' ? findNode(capture.graph.nodes, id)?.parent === target.id
            : capture.graph.edges.some(edge => (working.get(edge.id) ?? edge.id) === id && (edge.first.node === target.id || edge.second.node === target.id));
          if (original) after.add(by);
        }
        remove(target);
        expected.nodes = removeNode(expected.nodes, target.id);
        step = { owns: { kind: 'node', id: target.id, block: true }, write: source => deleteSourceOwnedLeafNode028(source, target.id) };
        break;
      }
      default: {
        spatial.push(spatialIntent(op, expected, resolve, movedBy));
        dependencies[op.id] = [...after];
        continue;
      }
    }
    dependencies[op.id] = [...after];
    steps.push({ op, ...step });
  }
  const renumbering = renumberingRefusal(capture, unnamed);
  if (renumbering) throw new Refusal(renumbering);
  const removals: Step[] = [...unnamed].sort((a, b) => b.ordinal - a.ordinal).map(removal => ({ op: removal.op,
    owns: { kind: 'relation', id: removal.id, block: false },
    write: source => deleteSourceOwnedEdges028(source, [removal.id], { renumberUnnamed: RENUMBER_UNNAMED_CONNECTORS }) }));
  const renumbered = Object.fromEntries(survivors.map(id => [id, working.get(id)!]).filter(([from, to]) => from !== to));
  return { expected, allocations, dependencies, renumbered, removedEdges, steps: [...removals, ...steps], spatial };
}

/**
 * Owner policy, 2026-11-15: a removal may shift the generated `edge-N` IDs
 * of later unnamed connectors (spec section 3: they are not durable
 * references). Set to false to refuse such plans as `coral.plan.renumbering`.
 */
export const RENUMBER_UNNAMED_CONNECTORS: boolean = true;

/** Parser-generated connector IDs (`edge-N`); an authored ID cannot contain a hyphen. */
const UNNAMED = /^edge-\d+$/;

/** The plan's removals of captured unnamed connectors, with each connector's ordinal among them. */
function unnamedRemovals(capture: PlanCapture, operations: PlanOperation[]) {
  const unnamed = capture.graph.edges.filter(edge => UNNAMED.test(edge.id)).map(edge => edge.id);
  return operations.flatMap(op => {
    const target = op.op === 'edge.remove' && 'existing' in (op.target as PlanRef)
      ? capture.entities.get((op.target as { existing: string }).existing) : undefined;
    return target?.kind === 'relation' && unnamed.includes(target.id)
      ? [{ op, id: target.id, ordinal: unnamed.indexOf(target.id) }] : [];
  });
}

/**
 * The owner's rule (2026-11-15): a plan may not renumber a surviving unnamed
 * connector. Decided over the whole plan, so the order of removals is
 * irrelevant; the refusal names the removal of the earliest connector.
 */
function renumberingRefusal(capture: PlanCapture, removals: ReturnType<typeof unnamedRemovals>): PlanExecutionRefusal | undefined {
  if (RENUMBER_UNNAMED_CONNECTORS || !removals.length) return undefined;
  const removed = new Set(removals.map(removal => removal.id));
  const first = removals.reduce((a, b) => (b.ordinal < a.ordinal ? b : a));
  const refOf = new Map([...capture.entities].map(([ref, entity]) => [`${entity.kind}:${entity.id}`, ref]));
  const survivors = capture.graph.edges.map(edge => edge.id).filter(id => UNNAMED.test(id))
    .filter((id, ordinal) => ordinal > first.ordinal && !removed.has(id));
  if (!survivors.length) return undefined;
  const refs = survivors.map(id => refOf.get(`relation:${id}`)!);
  return { code: 'coral.plan.renumbering', operation: first.op.id, refs,
    message: `Removing ${refOf.get(`relation:${first.id}`)} would renumber the unnamed connector${refs.length > 1 ? 's' : ''} ${refs.join(', ')}. Remove them too, or name them in source.` };
}

/**
 * Validate one spatial operation against the expected structure: distinct
 * subjects and targets, no ancestor/descendant pairs, a boundary group that
 * contains its subject, one parent per arrangement, and each node placed at
 * most once with no ancestor or descendant also placed.
 */
function spatialIntent(op: PlanOperation, expected: SuccessorSourceGraph028,
  resolve: (ref: PlanRef, kind?: EntityKind) => Binding, movedBy: Map<string, string>): SpatialIntent {
  const node = (ref: unknown) => resolve(ref as PlanRef, 'node');
  const parentOf = (id: string) => findNode(expected.nodes, id)?.parent;
  const ancestors = (id: string): string[] => { const parent = parentOf(id); return parent ? [parent, ...ancestors(parent)] : []; };
  const nested = (a: string, b: string) => ancestors(a).includes(b) || ancestors(b).includes(a);
  const fail = (code: string, message: string, refs: Binding[]) => refuse(code, message, op.id, refs.map(binding => binding.label));
  let intent: SpatialIntent;
  let bindings: Binding[];
  if (op.op === 'layout.relative') {
    const [subject, target] = [node(op.subject), node(op.target)];
    if (subject.id === target.id) fail('coral.plan.spatial.self', `${subject.label} cannot be placed relative to itself.`, [subject]);
    if (nested(subject.id, target.id)) fail('coral.plan.spatial.nested', `${subject.label} and ${target.label} contain one another.`, [subject, target]);
    intent = { op, subjects: [subject.id], target: target.id };
    bindings = [subject];
  } else if (op.op === 'layout.boundary') {
    const subject = node(op.subject);
    const scope = (op.scope as { kind: string; target?: PlanRef });
    const group = scope.kind === 'group' ? node(scope.target) : null;
    if (group?.id === subject.id) fail('coral.plan.spatial.self', `${subject.label} cannot be placed inside its own boundary.`, [subject]);
    if (group && !ancestors(subject.id).includes(group.id)) {
      fail('coral.plan.spatial.scope', `${group.label} does not contain ${subject.label}.`, [subject, group]);
    }
    intent = { op, subjects: [subject.id], scope: group?.id ?? null };
    bindings = [subject];
  } else {
    bindings = (op.members as PlanRef[]).map(member => node(member));
    const ids = bindings.map(binding => binding.id);
    if (new Set(ids).size !== ids.length) fail('coral.plan.spatial.self', 'An arrangement lists the same node twice.', bindings);
    for (const a of bindings) for (const b of bindings) {
      if (a !== b && nested(a.id, b.id)) fail('coral.plan.spatial.nested', `${a.label} and ${b.label} contain one another.`, [a, b]);
    }
    if (new Set(ids.map(parentOf)).size > 1) fail('coral.plan.spatial.cross-parent', 'Arranged nodes must share one parent.', bindings);
    intent = { op, subjects: ids };
  }
  for (const binding of bindings) {
    const prior = movedBy.get(binding.id) ?? [...movedBy].find(([id]) => nested(id, binding.id))?.[1];
    if (prior) fail('coral.plan.repeated-write', `Operations ${prior} and ${op.id} both place ${binding.label} or a node containing it.`, [binding]);
  }
  for (const binding of bindings) movedBy.set(binding.id, op.id);
  return intent;
}

// ---- compile pass ----------------------------------------------------------------------

/** Line-aligned span of one declaration; a block only when the whole node is removed. */
function declarationSpan(source: string, owns: NonNullable<Step['owns']>) {
  const document = parseInstalledDocument028(source);
  const statements = document.syntax.statements;
  const edges = (document.graph ?? document.syntax.graph).edges;
  const declaration = owns.kind === 'node'
    ? statements.find(item => item.kind === 'node' && item.qualifiedId === owns.id)
    : statements.filter(item => item.kind === 'edge')[edges.findIndex(edge => edge.id === owns.id)];
  if (!declaration || (declaration.kind !== 'node' && declaration.kind !== 'edge')) return undefined;
  const first = declaration.kind === 'node' ? declaration.id : declaration.id ?? declaration.source;
  const last = declaration.kind === 'node' && owns.block && declaration.blockClose
    ? declaration.blockClose.range.end.offset : first.range.start.offset;
  const end = source.indexOf('\n', last);
  return { start: source.lastIndexOf('\n', first.range.start.offset - 1) + 1, end: end < 0 ? source.length : end + 1 };
}

export function compilePass(base: string, steps: Step[]): string {
  let draft = base;
  for (const step of steps) {
    const span = step.owns && declarationSpan(draft, step.owns);
    let next: string;
    try { next = step.write(draft); } catch (error) {
      const code = /^coral\.[\w.-]+(?=:)/.exec((error as Error).message)?.[0];
      if (!code) throw error;
      return refuse(code, (error as Error).message, step.op.id);
    }
    // Bytes before and after the owned span (or one insertion point) are unchanged.
    let start = span?.start ?? 0;
    if (!span) while (start < draft.length && draft[start] === next[start]) start++;
    const end = span?.end ?? start;
    const owned = next.startsWith(draft.slice(0, start)) && next.endsWith(draft.slice(end)) &&
      next.length >= start + draft.length - end;
    if (!owned) refuse('coral.plan.preservation', `Operation ${step.op.id} changed source outside its own declaration.`, step.op.id);
    draft = next;
  }
  return draft;
}

// ---- entry points ------------------------------------------------------------------------

/** Resolve and validate a decoded plan; throws a Refusal. */
export function preparePlan(capture: PlanCapture, response: PlanResponse) {
  if (response.kind !== 'plan') refuse('coral.plan.not-a-plan', `A ${response.kind} response never executes.`);
  if (response.snapshot !== capture.token) refuse('coral.plan.stale', 'The plan was written for another snapshot.');
  return semanticPass(capture, (response as Extract<PlanResponse, { kind: 'plan' }>).operations);
}

/** The final candidate gates; throws a Refusal, returns the reparsed graph. */
export function admitCandidate(capture: PlanCapture, source: string, expected: SuccessorSourceGraph028): SuccessorSourceGraph028 {
  const crlf = capture.source.includes('\r\n') && !capture.source.replace(/\r\n/g, '').includes('\n');
  if (crlf && source.replace(/\r\n/g, '').includes('\n')) refuse('coral.plan.newline', 'The compiled source mixes newline conventions.');
  const projected = projectInstalledSourceToSuccessor028(source);
  if (!projected.graph || projected.diagnostics.length || canonicalJson(projected.graph) !== canonicalJson(expected)) {
    refuse('coral.plan.loss', 'The compiled source does not mean exactly what the plan specifies.');
  }
  const port = portFinding029(source, projected.graph!);
  if (port) refuse('coral.plan.successor-invalid', port);
  try { sourceOwnedGraphForExport028(source, source, projected.graph); } catch (error) {
    refuse('coral.plan.successor-invalid', (error as Error).message);
  }
  return projected.graph!;
}

/**
 * Execute one decoded plan against its capture on a detached copy. Spatial
 * operations need staged measurement: use executePlanWithGeometry.
 */
export function executePlan(capture: PlanCapture, response: PlanResponse): ExecutionResult {
  try {
    const { expected, allocations, dependencies, renumbered, removedEdges, steps, spatial } = preparePlan(capture, response);
    if (spatial.length) {
      refuse('coral.plan.spatial.unmeasured', 'Spatial operations need staged measurement of the candidate.', spatial[0].op.id);
    }
    const source = compilePass(capture.source, steps);
    const graph = admitCandidate(capture, source, expected);
    return { ok: true, execution: { source, graph, changed: source !== capture.source, allocations, dependencies, renumbered, removedEdges } };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, refusal: error.refusal };
    throw error;
  }
}

export type OperationEditability = { operation: string; verdict: 'writable' | 'unchecked' } |
  { operation: string; verdict: 'refused'; refusal: PlanExecutionRefusal };

/**
 * Whether the source compiler can perform each operation on its own, with
 * its real values, against the captured source. An operation that uses a new
 * handle, or removes a node whose dependents the plan may remove first, is
 * `unchecked`: only the whole plan can decide it (executePlan).
 */
export function operationEditability(capture: PlanCapture, response: PlanResponse): OperationEditability[] {
  if (response.kind !== 'plan') return [];
  return response.operations.map((op): OperationEditability => {
    const usesNew = operationRefs(op).some(ref => 'new' in ref);
    const id = !usesNew && op.op === 'node.remove' ? capture.entities.get((op.target as { existing: string }).existing)?.id : undefined;
    const dependents = id !== undefined && (Boolean(findNode(capture.graph.nodes, id)?.children?.length) ||
      capture.graph.edges.some(edge => edge.first.node === id || edge.second.node === id));
    if (usesNew || dependents) return { operation: op.id, verdict: 'unchecked' };
    // An unnamed-connector removal is decided with the plan's other unnamed removals, as executePlan decides it.
    const unnamed = unnamedRemovals(capture, response.operations);
    const together = unnamed.some(removal => removal.op === op) ? unnamed.map(removal => removal.op) : [op];
    const result = executePlan(capture, { ...response, operations: together });
    if (result.ok) return { operation: op.id, verdict: 'writable' };
    return result.refusal.operation === op.id || together.length === 1
      ? { operation: op.id, verdict: 'refused', refusal: result.refusal } : { operation: op.id, verdict: 'unchecked' };
  });
}
