import type { GraphIR, Interaction, InteractionMessage } from './types.js';

/** The core UML sequence subset backed by GraphIR 3 (R-060). */
export const UML_SEQUENCE_NOTATION = 'uml-sequence';
export const UML_SEQUENCE_PROFILE = { id: 'uml', kind: 'sequence', version: '1.0.0' } as const;
export const SEQUENCE_PARTICIPANT_TYPES = ['participant', 'actor'] as const;

/** The one authored message-kind spelling (F9): the edge relation token. */
export const SEQUENCE_MESSAGE_TOKENS = {
  sync: 'synchronous',
  async: 'asynchronous',
  return: 'return',
  create: 'create',
  destroy: 'destroy',
} as const;
export type SequenceMessageToken = keyof typeof SEQUENCE_MESSAGE_TOKENS;
export type SequenceMessageKind = (typeof SEQUENCE_MESSAGE_TOKENS)[SequenceMessageToken];

export function sequenceMessageKind(token: string | undefined): SequenceMessageKind | undefined {
  return token !== undefined && Object.prototype.hasOwnProperty.call(SEQUENCE_MESSAGE_TOKENS, token)
    ? SEQUENCE_MESSAGE_TOKENS[token as SequenceMessageToken] : undefined;
}

export function sequenceMessageToken(kind: InteractionMessage['kind']): SequenceMessageToken | undefined {
  return (Object.keys(SEQUENCE_MESSAGE_TOKENS) as SequenceMessageToken[])
    .find((token) => SEQUENCE_MESSAGE_TOKENS[token] === kind);
}

export function operandId(fragmentId: string, index: number): string {
  return `${fragmentId}-operand-${index + 1}`;
}

export function guardId(fragmentId: string, index: number): string {
  return `${fragmentId}-guard-${index + 1}`;
}

export type SequenceEntityKind = 'graph' | 'node' | 'edge' | 'activation' | 'note' | 'fragment';

/** One violation of the Coral sequence subset, attributed to one entity. */
export interface SequenceIssue {
  code: string;
  message: string;
  entity: { kind: SequenceEntityKind; id: string };
}

export function isSequenceGraph(graph: Pick<GraphIR, 'metadata' | 'profile'>): boolean {
  if (graph.profile) return graph.profile.id === 'uml' && graph.profile.kind === 'sequence';
  return graph.metadata?.notation === UML_SEQUENCE_NOTATION;
}

/**
 * The participant and message records derived from ordered nodes and edges.
 * Used by the parser and editor so that identity is never allocated twice.
 */
export function deriveSequenceCore(
  nodes: readonly GraphIR['nodes'][number][],
  edges: readonly GraphIR['edges'][number][],
): Pick<Interaction, 'participants' | 'participantOrder' | 'messages' | 'messageOrder'> {
  return {
    participants: nodes.map((node) => ({ id: node.id, nodeId: node.id })),
    participantOrder: nodes.map((node) => node.id),
    messages: edges.map((edge) => {
      const kind = sequenceMessageKind(edge.type);
      return {
        id: edge.id, edgeId: edge.id, sourceParticipantId: edge.source, targetParticipantId: edge.target,
        ...(kind ? { kind } : {}),
      };
    }),
    messageOrder: edges.map((edge) => edge.id),
  };
}

/** The closed field lists of a sequence participant node and message edge (DR70-D6). */
const NODE_FIELDS = new Set(['id', 'type', 'label', 'description', 'properties', 'sourceInfo', 'children', 'parent']);
const EDGE_FIELDS = new Set(['id', 'source', 'target', 'type', 'label', 'description', 'properties',
  'sourceInfo', 'sourceEnd', 'targetEnd', 'style']);

type Activation = NonNullable<Interaction['activations']>[number];
type Note = NonNullable<Interaction['notes']>[number];
type Fragment = NonNullable<Interaction['fragments']>[number];

/** Ids compare numerically on a shared `<prefix>-N` form, otherwise by code unit. */
function compareIds(a: string, b: string): number {
  const left = /^(.*-)(\d+)$/.exec(a);
  const right = /^(.*-)(\d+)$/.exec(b);
  if (left && right && left[1] === right[1]) {
    // Compare the digit strings exactly: Number() loses precision past 2^53.
    const l = left[2].replace(/^0+(?=\d)/, '');
    const r = right[2].replace(/^0+(?=\d)/, '');
    if (l.length !== r.length) return l.length - r.length;
    if (l !== r) return l < r ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Canonical sort keys (DR70-D1); ids break remaining ties by code unit. */
export function sequenceOrderKeys(interaction: Pick<Interaction, 'participantOrder' | 'messageOrder'>) {
  const message = new Map(interaction.messageOrder.map((id, index) => [id, index]));
  const participant = new Map(interaction.participantOrder.map((id, index) => [id, index]));
  const at = (id: string) => message.get(id) ?? Number.MAX_SAFE_INTEGER;
  return {
    activation: (value: Activation): number[] =>
      [at(value.startMessageId), at(value.endMessageId), participant.get(value.participantId) ?? Number.MAX_SAFE_INTEGER],
    note: (value: Note): number[] => [value.messageIds?.length ? Math.max(...value.messageIds.map(at)) : -1],
    fragment: (value: Fragment): number[] => {
      const members = value.operands.flatMap((operand) => operand.messageIds.map(at));
      return [members.length ? Math.min(...members) : Number.MAX_SAFE_INTEGER];
    },
  };
}

function compareKeys(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

/**
 * Sort by canonical key only (stable), for assigning derived ids to entries
 * in source or import order. `sortCanonicalInteraction` then adds id ties.
 */
export function sortByCanonicalKey<T>(values: readonly T[], key: (value: T) => number[]): T[] {
  return values.map((value, index) => ({ value, index, key: key(value) }))
    .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
    .map((entry) => entry.value);
}

/**
 * Give every activation, note, and fragment without an explicit id its derived
 * id at its canonical position, then return the canonical interaction (DR70-D1).
 * Entries keep their input order as the tie-break before ids exist.
 */
export function finalizeSequenceInteraction(interaction: Omit<Interaction, 'activations' | 'notes' | 'fragments'> & {
  activations?: (Omit<Activation, 'id'> & { id?: string })[];
  notes?: (Omit<Note, 'id'> & { id?: string })[];
  fragments?: Fragment[];
}): Interaction {
  const keys = sequenceOrderKeys(interaction);
  const derive = <T extends { id?: string }>(values: T[] | undefined, prefix: string, key: (value: T & { id: string }) => number[]) =>
    values === undefined ? undefined
      : sortByCanonicalKey(values, (value) => key(value as T & { id: string }))
        .map((value, index) => ({ ...value, id: value.id ?? `${prefix}-${index + 1}` }));
  const activations = derive(interaction.activations, 'activation', keys.activation);
  const notes = derive(interaction.notes, 'note', keys.note);
  const { participants, participantOrder, messages, messageOrder, fragments } = interaction;
  return sortCanonicalInteraction({
    participants, participantOrder, messages, messageOrder,
    ...(activations?.length ? { activations } : {}),
    ...(fragments?.length ? { fragments } : {}),
    ...(notes?.length ? { notes } : {}),
  });
}

/** A copy of the interaction with activations, notes, and fragments in canonical order. */
export function sortCanonicalInteraction(interaction: Interaction): Interaction {
  const keys = sequenceOrderKeys(interaction);
  const sort = <T extends { id: string }>(values: readonly T[] | undefined, key: (value: T) => number[]) =>
    values === undefined ? undefined
      : [...values].sort((a, b) => compareKeys(key(a), key(b)) || compareIds(a.id, b.id));
  const activations = sort(interaction.activations, keys.activation);
  const notes = sort(interaction.notes, keys.note);
  const fragments = sort(interaction.fragments, keys.fragment);
  return {
    ...interaction,
    ...(activations ? { activations } : {}),
    ...(notes ? { notes } : {}),
    ...(fragments ? { fragments } : {}),
  };
}

/**
 * Check the structural Coral sequence subset. A well-formed difference between
 * the operator-derived message kind and explicit edge type belongs to U2;
 * individual source printers must separately reject a lossy projection.
 * Returns no issues for a graph whose notation is not `uml-sequence`.
 */
export function validateSequenceInteraction(graph: GraphIR): SequenceIssue[] {
  if (!isSequenceGraph(graph)) return [];
  const issues: SequenceIssue[] = [];
  const add = (code: string, message: string, kind: SequenceEntityKind, id: string) =>
    issues.push({ code, message, entity: { kind, id } });

  const profile = graph.profile;
  if (!profile || profile.id !== UML_SEQUENCE_PROFILE.id || profile.kind !== UML_SEQUENCE_PROFILE.kind
      || profile.version !== UML_SEQUENCE_PROFILE.version) {
    add('coral.sequence.profile.invalid', 'A UML sequence graph must carry the exact uml/sequence/1.0.0 profile', 'graph', graph.id);
  }
  const interaction = graph.interaction;
  if (!interaction) {
    add('coral.sequence.profile.invalid', 'A UML sequence graph must carry an interaction record', 'graph', graph.id);
    return issues;
  }
  if (graph.constraints?.length) {
    add('coral.sequence.field.unsupported', 'Spatial constraints are not sequence semantics', 'graph', graph.id);
  }

  // Participants: exactly the top-level participant/actor nodes, same identity.
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const participantIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!(SEQUENCE_PARTICIPANT_TYPES as readonly string[]).includes(node.type) || node.children?.length || node.parent) {
      add('coral.sequence.participant.invalid', `Node "${node.id}" must be a top-level participant or actor without children`, 'node', node.id);
    }
    for (const field of Object.keys(node)) {
      if (!NODE_FIELDS.has(field)) add('coral.sequence.field.unsupported', `Participant "${node.id}" carries ${field}, which is not sequence semantics`, 'node', node.id);
    }
  }
  for (const participant of interaction.participants) {
    if (participant.id !== participant.nodeId || !nodeById.has(participant.nodeId) || participantIds.has(participant.id)) {
      add('coral.sequence.participant.invalid', `Participant "${participant.id}" must reuse exactly one node identity`, 'node', participant.nodeId ?? participant.id);
    }
    participantIds.add(participant.id);
  }
  for (const node of graph.nodes) {
    if (!participantIds.has(node.id)) add('coral.sequence.participant.invalid', `Node "${node.id}" is not an interaction participant`, 'node', node.id);
  }

  // Messages: exactly the edges, same identity/endpoints, supported kind/token.
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const messageByEdgeId = new Map(interaction.messages.map((message) => [message.edgeId, message]));
  const messageIds = new Set<string>();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const message of interaction.messages) {
    const edge = edgeById.get(message.edgeId);
    if (edge && (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
      add('coral.sequence.reference.unresolved.invalid', `Message "${message.id}" connects ${edge.source} to ${edge.target}, which are not both participants`, 'edge', edge.id);
      messageIds.add(message.id);
      continue;
    }
    const token = sequenceMessageToken(message.kind);
    if (message.id !== message.edgeId || !edge || messageIds.has(message.id)
        || edge.source !== message.sourceParticipantId || edge.target !== message.targetParticipantId
        || !token || !sequenceMessageKind(edge.type)) {
      add('coral.sequence.message.invalid', `Message "${message.id}" must reuse one edge identity and endpoints and have a supported kind and edge type`, 'edge', message.edgeId ?? message.id);
    }
    messageIds.add(message.id);
  }
  for (const edge of graph.edges) {
    if (!messageIds.has(edge.id)) {
      add('coral.sequence.message.invalid', `Edge "${edge.id}" must be a message with a supported message kind`, 'edge', edge.id);
    }
    for (const field of Object.keys(edge)) {
      if (!EDGE_FIELDS.has(field)) add('coral.sequence.field.unsupported', `Message "${edge.id}" carries ${field}, which is not sequence semantics`, 'edge', edge.id);
    }
    if (edge.sourceEnd && (edge.sourceEnd.marker?.kind !== 'none' ||
      Object.keys(edge.sourceEnd).some((field) => field !== 'marker'))) {
      add('coral.sequence.message.invalid', `Message "${edge.id}" cannot have a decorated source end`, 'edge', edge.id);
    }
    if (edge.style) {
      const kind = messageByEdgeId.get(edge.id)?.kind;
      const expected = kind === 'return' || kind === 'create' ? 'dashed' : 'solid';
      if (Object.keys(edge.style).some((field) => field !== 'lineStyle') ||
        (edge.style.lineStyle !== undefined && edge.style.lineStyle !== expected)) {
        add('coral.sequence.style.invalid', `Message "${edge.id}" style conflicts with its ${kind ?? 'unknown'} kind`, 'edge', edge.id);
      }
    }
  }

  const completeOrder = (order: readonly string[], ids: Set<string>) =>
    order.length === ids.size && new Set(order).size === order.length && order.every((id) => ids.has(id));
  if (!completeOrder(interaction.participantOrder, participantIds)) {
    add('coral.sequence.order.invalid', 'participantOrder must list every participant exactly once', 'graph', graph.id);
  }
  if (!completeOrder(interaction.messageOrder, messageIds)) {
    add('coral.sequence.order.invalid', 'messageOrder must list every message exactly once', 'graph', graph.id);
  }
  const position = new Map(interaction.messageOrder.map((id, index) => [id, index]));
  const messageById = new Map(interaction.messages.map((message) => [message.id, message]));

  const duplicateIds = (kind: 'activation' | 'note' | 'fragment', ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
        add('coral.sequence.identity.duplicate', `The ${kind} identity "${id}" is empty or repeated`, kind, id);
      }
      seen.add(id);
    }
  };

  const destroyedAt = new Map<string, number>();
  for (const [index, id] of interaction.messageOrder.entries()) {
    const message = messageById.get(id);
    if (!message) continue;
    if (destroyedAt.has(message.sourceParticipantId) || destroyedAt.has(message.targetParticipantId))
      add('coral.sequence.participant.after-destruction', `Message "${id}" uses a destroyed participant`, 'edge', message.edgeId);
    if (message.kind === 'destroy') destroyedAt.set(message.targetParticipantId, index);
  }

  // Activations.
  duplicateIds('activation', (interaction.activations ?? []).map((activation) => activation.id));
  for (const activation of interaction.activations ?? []) {
    const start = messageById.get(activation.startMessageId);
    const end = messageById.get(activation.endMessageId);
    if (!participantIds.has(activation.participantId) || !start || !end) {
      add('coral.sequence.reference.unresolved.invalid', `Activation "${activation.id}" references a missing participant or message`, 'activation', activation.id);
      continue;
    }
    const terminal = destroyedAt.get(activation.participantId);
    if (terminal !== undefined && (position.get(end.id) ?? Infinity) >= terminal)
      add('coral.sequence.activation.outside-participant-lifetime',
        `Activation "${activation.id}" reaches or passes its participant's destruction`, 'activation', activation.id);
    const involves = (message: InteractionMessage) =>
      message.sourceParticipantId === activation.participantId || message.targetParticipantId === activation.participantId;
    if (!involves(start) || !involves(end)) {
      add('coral.sequence.activation.invalid', `Activation "${activation.id}" is bounded by a message that does not involve ${activation.participantId}`, 'activation', activation.id);
    } else if ((position.get(start.id) ?? 0) > (position.get(end.id) ?? 0)) {
      add('coral.sequence.activation.invalid', `Activation "${activation.id}" starts after it ends`, 'activation', activation.id);
    }
  }

  // Notes: text plus at least one unambiguous participant/message target.
  duplicateIds('note', (interaction.notes ?? []).map((note) => note.id));
  for (const note of interaction.notes ?? []) {
    const targets = [...(note.participantIds ?? []), ...(note.messageIds ?? [])];
    if (typeof note.text !== 'string' || note.text.trim().length === 0 || targets.length === 0
        || note.participantIds?.length === 0 || note.messageIds?.length === 0) {
      add('coral.sequence.note.invalid', `Note "${note.id}" needs text and at least one target`, 'note', note.id);
      continue;
    }
    if ((note.participantIds ?? []).some((id) => !participantIds.has(id))
        || (note.messageIds ?? []).some((id) => !messageIds.has(id))) {
      add('coral.sequence.reference.unresolved.invalid', `Note "${note.id}" references a missing participant or message`, 'note', note.id);
    } else if (targets.some((id) => participantIds.has(id) && messageIds.has(id))) {
      add('coral.sequence.reference.ambiguous.invalid', `Note "${note.id}" targets an identity that names both a participant and a message`, 'note', note.id);
    } else if (new Set(note.participantIds ?? []).size !== (note.participantIds ?? []).length
        || new Set(note.messageIds ?? []).size !== (note.messageIds ?? []).length) {
      add('coral.sequence.note.invalid', `Note "${note.id}" repeats a target`, 'note', note.id);
    }
  }

  // Fragments: flat, non-empty, contiguous, operand-ordered, non-overlapping.
  duplicateIds('fragment', (interaction.fragments ?? []).map((fragment) => fragment.id));
  const owner = new Map<string, string>();
  for (const fragment of interaction.fragments ?? []) {
    const fail = (why: string) => add('coral.sequence.fragment.invalid', `Fragment "${fragment.id}" ${why}`, 'fragment', fragment.id);
    if (!['loop', 'alt', 'opt'].includes(fragment.kind)) { fail('has an unsupported kind'); continue; }
    // GraphIR 3 requires two or more alt operands and exactly one for loop/opt.
    if (fragment.kind === 'alt' ? fragment.operands.length < 2 : fragment.operands.length !== 1) {
      fail(fragment.kind === 'alt' ? 'needs at least two operands (add an else branch)' : `must have exactly one operand as a ${fragment.kind}`);
      continue;
    }
    const derived = fragment.operands.every((operand, index) => operand.id === operandId(fragment.id, index)
      && (operand.guard === undefined || operand.guard.id === guardId(fragment.id, index)
        && typeof operand.guard.text === 'string' && operand.guard.text.length > 0));
    if (!derived) { fail('uses operand or guard identities or guard text that Coral cannot spell'); continue; }
    const members = fragment.operands.flatMap((operand) => operand.messageIds);
    if (members.some((id) => messageById.get(id)?.kind === 'destroy'))
      fail('contains a destruction that must occur in the root timeline');
    if (members.length === 0) { fail('owns no message'); continue; }
    if (members.some((id) => !position.has(id))) { fail('references a missing message'); continue; }
    const indexes = members.map((id) => position.get(id)!);
    const contiguous = indexes.every((value, index) => index === 0 || value === indexes[index - 1] + 1);
    if (!contiguous) { fail('must own one contiguous message range in operand order'); continue; }
    const shared = members.find((id) => owner.has(id));
    if (shared) { fail(`shares message "${shared}" with fragment "${owner.get(shared)}"`); continue; }
    for (const id of members) owner.set(id, fragment.id);
  }

  return issues;
}
