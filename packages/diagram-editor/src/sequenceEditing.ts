/**
 * Pure UML sequence editor operations (R-060 AC-3, Slice 70 design "Editor
 * behavior"). Each operation returns one canonical, validated candidate graph
 * or a refusal; the caller commits the candidate as one transaction.
 */

import {
  UML_SEQUENCE_NOTATION,
  UML_SEQUENCE_PROFILE,
  SEQUENCE_MESSAGE_TOKENS,
  deriveSequenceCore,
  guardId,
  labelToId,
  operandId,
  sequenceMessageKind,
  sequenceMessageToken,
  sortCanonicalInteraction,
  validateSequenceInteraction,
  type GraphIR,
  type SequenceMessageToken,
} from '@coral-viz/language';

type Interaction = NonNullable<GraphIR['interaction']>;
type Fragment = NonNullable<Interaction['fragments']>[number];
type ParticipantKind = 'participant' | 'actor';

export type SequenceOperation =
  | { type: 'addParticipant'; kind: ParticipantKind; label?: string }
  | { type: 'updateParticipant'; id: string; label?: string; kind?: ParticipantKind }
  | { type: 'moveParticipant'; id: string; direction: -1 | 1 }
  | { type: 'deleteParticipant'; id: string }
  | { type: 'addMessage'; after?: string; source?: string; target?: string; kind?: SequenceMessageToken; label?: string }
  | { type: 'updateMessage'; id: string; source?: string; target?: string; kind?: SequenceMessageToken; label?: string }
  | { type: 'moveMessage'; id: string; direction: -1 | 1 }
  | { type: 'deleteMessage'; id: string }
  | { type: 'addActivation'; participantId: string; startMessageId: string; endMessageId: string }
  | { type: 'updateActivation'; id: string; startMessageId?: string; endMessageId?: string }
  | { type: 'deleteActivation'; id: string }
  | { type: 'addNote'; text: string; targets: string[] }
  | { type: 'updateNote'; id: string; text?: string; targets?: string[] }
  | { type: 'deleteNote'; id: string }
  | { type: 'addFragment'; kind: Fragment['kind']; firstMessageId: string; lastMessageId: string; guard?: string }
  | { type: 'updateGuard'; fragmentId: string; operandIndex: number; guard: string | undefined }
  | { type: 'splitOperand'; fragmentId: string; messageId: string }
  | { type: 'deleteFragment'; id: string };

export type SequenceOperationResult =
  | { ok: true; graph: GraphIR; focus?: { kind: 'participant' | 'message' | 'activation' | 'note' | 'fragment'; id: string } }
  | { ok: false; error: string };

/**
 * The message stream as source lines: messages interleaved with fragment
 * heads, `else` operands, and closing braces. Moving a message moves its line.
 */
type Token =
  | { kind: 'message'; id: string }
  | { kind: 'open'; fragment: Fragment; guard?: string }
  | { kind: 'else'; fragment: Fragment; guard?: string }
  | { kind: 'close'; fragment: Fragment };

function tokensOf(interaction: Interaction): Token[] {
  const owner = new Map<string, { fragment: Fragment; operand: number }>();
  for (const fragment of interaction.fragments ?? []) {
    fragment.operands.forEach((operand, index) => operand.messageIds.forEach((id) => owner.set(id, { fragment, operand: index })));
  }
  const tokens: Token[] = [];
  let open: { fragment: Fragment; operand: number } | undefined;
  const advance = (to: number) => {
    while (open && open.operand < to) {
      open.operand++;
      tokens.push({ kind: 'else', fragment: open.fragment, guard: open.fragment.operands[open.operand].guard?.text });
    }
  };
  const close = () => {
    if (!open) return;
    advance(open.fragment.operands.length - 1);
    tokens.push({ kind: 'close', fragment: open.fragment });
    open = undefined;
  };
  for (const id of interaction.messageOrder) {
    const owned = owner.get(id);
    if (open && owned?.fragment !== open.fragment) close();
    if (owned && !open) {
      tokens.push({ kind: 'open', fragment: owned.fragment, guard: owned.fragment.operands[0].guard?.text });
      open = { fragment: owned.fragment, operand: 0 };
    }
    if (owned) advance(owned.operand);
    tokens.push({ kind: 'message', id });
  }
  close();
  return tokens;
}

/** Rebuild message order and fragment membership from the token stream. */
function fromTokens(tokens: Token[]): { messageOrder: string[]; fragments: Fragment[] } {
  const messageOrder: string[] = [];
  const fragments: Fragment[] = [];
  let current: Fragment | undefined;
  const operand = (fragment: Fragment, guard: string | undefined) => {
    const index = fragment.operands.length;
    fragment.operands.push({
      id: operandId(fragment.id, index),
      ...(guard ? { guard: { id: guardId(fragment.id, index), text: guard } } : {}),
      messageIds: [],
    });
  };
  for (const token of tokens) {
    if (token.kind === 'open') {
      current = { id: token.fragment.id, kind: token.fragment.kind, operands: [] };
      operand(current, token.guard);
      fragments.push(current);
    } else if (token.kind === 'else') {
      if (current) operand(current, token.guard);
    } else if (token.kind === 'close') {
      current = undefined;
    } else {
      messageOrder.push(token.id);
      current?.operands[current.operands.length - 1].messageIds.push(token.id);
    }
  }
  return { messageOrder, fragments };
}

function firstFree(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  let index = 1;
  while (taken.has(`${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}

function uniqueId(base: string, used: Iterable<string>): string {
  const taken = new Set(used);
  const root = base || 'item';
  if (!taken.has(root)) return root;
  let index = 2;
  while (taken.has(`${root}_${index}`)) index++;
  return `${root}_${index}`;
}

/** Nodes by participantOrder, edges by messageOrder, interaction arrays canonical. */
export function canonicalizeSequenceGraph(graph: GraphIR): GraphIR {
  const interaction = graph.interaction;
  if (!interaction) return graph;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const participants = new Map(interaction.participants.map((item) => [item.id, item]));
  const messages = new Map(interaction.messages.map((item) => [item.id, item]));
  const derived = deriveSequenceCore(
    interaction.participantOrder.flatMap((id) => nodes.get(id) ?? []),
    interaction.messageOrder.flatMap((id) => edges.get(id) ?? []),
  );
  const next = sortCanonicalInteraction({
    ...interaction,
    participants: derived.participants.map((item) => participants.get(item.id) ?? item),
    messages: derived.messages.map((item) => messages.get(item.id) ?? item),
  });
  return {
    ...graph,
    nodes: interaction.participantOrder.flatMap((id) => nodes.get(id) ?? []),
    edges: interaction.messageOrder.flatMap((id) => edges.get(id) ?? []),
    interaction: next,
  };
}

function refuse(error: string): SequenceOperationResult {
  return { ok: false, error };
}

/** Apply one operation. The input graph is never mutated. */
export function applySequenceOperation(input: GraphIR, operation: SequenceOperation): SequenceOperationResult {
  if (input.metadata?.notation !== UML_SEQUENCE_NOTATION || !input.interaction) {
    return refuse('Sequence operations need a UML sequence document.');
  }
  const [inputIssue] = validateSequenceInteraction(input);
  if (inputIssue) return refuse(`Sequence source cannot safely edit ${inputIssue.message} (${inputIssue.code}).`);
  const inputEdges = new Map(input.edges.map((edge) => [edge.id, edge]));
  if (input.interaction.messages.some((message) =>
    inputEdges.get(message.edgeId)?.type !== sequenceMessageToken(message.kind))) {
    return refuse('Current Coral source cannot preserve a message whose operator kind differs from its explicit type.');
  }
  const graph = structuredClone(input);
  const interaction = graph.interaction!;
  const messageIds = () => new Set(graph.edges.map((edge) => edge.id));
  let focus: Extract<SequenceOperationResult, { ok: true }>['focus'];
  let tokens = tokensOf(interaction);
  const commitTokens = () => {
    const rebuilt = fromTokens(tokens);
    interaction.messageOrder = rebuilt.messageOrder;
    interaction.fragments = rebuilt.fragments;
  };
  const participantLabel = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;

  switch (operation.type) {
    case 'addParticipant': {
      const label = operation.label?.trim() || (operation.kind === 'actor' ? 'Actor' : 'Participant');
      const id = uniqueId(labelToId(label), graph.nodes.map((node) => node.id));
      graph.nodes.push({ id, type: operation.kind, label });
      interaction.participantOrder.push(id);
      focus = { kind: 'participant', id };
      break;
    }
    case 'updateParticipant': {
      const node = graph.nodes.find((candidate) => candidate.id === operation.id);
      if (!node) return refuse(`Participant ${operation.id} does not exist.`);
      if (operation.label !== undefined) {
        if (!operation.label.trim()) return refuse('A participant needs a name.');
        node.label = operation.label;
      }
      if (operation.kind) node.type = operation.kind;
      focus = { kind: 'participant', id: node.id };
      break;
    }
    case 'moveParticipant': {
      const order = interaction.participantOrder;
      const index = order.indexOf(operation.id);
      const target = index + operation.direction;
      if (index < 0 || target < 0 || target >= order.length) return refuse('The participant cannot move further.');
      [order[index], order[target]] = [order[target], order[index]];
      focus = { kind: 'participant', id: operation.id };
      break;
    }
    case 'deleteParticipant': {
      const id = operation.id;
      const referenced = graph.edges.some((edge) => edge.source === id || edge.target === id)
        || (interaction.activations ?? []).some((activation) => activation.participantId === id)
        || (interaction.notes ?? []).some((note) => note.participantIds?.includes(id));
      if (referenced) return refuse(`${participantLabel(id)} is still referenced by a message, activation, or note.`);
      graph.nodes = graph.nodes.filter((node) => node.id !== id);
      interaction.participantOrder = interaction.participantOrder.filter((candidate) => candidate !== id);
      break;
    }
    case 'addMessage': {
      const order = interaction.participantOrder;
      if (order.length === 0) return refuse('Add a participant before adding a message.');
      const source = operation.source ?? order[0];
      const target = operation.target ?? order[Math.min(order.indexOf(source) + 1, order.length - 1)] ?? source;
      const id = uniqueId(`${labelToId(source)}_to_${labelToId(target)}`, messageIds());
      const label = operation.label?.trim();
      graph.edges.push({ id, source, target, type: operation.kind ?? 'sync', ...(label ? { label } : {}) });
      const token: Token = { kind: 'message', id };
      const at = operation.after === undefined ? -1 : tokens.findIndex((candidate) => candidate.kind === 'message' && candidate.id === operation.after);
      if (operation.after !== undefined && at < 0) return refuse(`Message ${operation.after} does not exist.`);
      if (at < 0) tokens.push(token);
      else tokens.splice(at + 1, 0, token);
      commitTokens();
      focus = { kind: 'message', id };
      break;
    }
    case 'updateMessage': {
      const edge = graph.edges.find((candidate) => candidate.id === operation.id);
      if (!edge) return refuse(`Message ${operation.id} does not exist.`);
      if (operation.source !== undefined) edge.source = operation.source;
      if (operation.target !== undefined) edge.target = operation.target;
      if (operation.kind !== undefined) edge.type = operation.kind;
      if (operation.label !== undefined) {
        if (operation.label.trim()) edge.label = operation.label;
        else delete edge.label;
      }
      if (!sequenceMessageKind(edge.type)) return refuse(`Choose one of ${Object.keys(SEQUENCE_MESSAGE_TOKENS).join(', ')}.`);
      const message = interaction.messages.find((candidate) => candidate.edgeId === edge.id);
      if (!message) return refuse(`Message ${edge.id} is missing its interaction record.`);
      message.sourceParticipantId = edge.source;
      message.targetParticipantId = edge.target;
      message.kind = sequenceMessageKind(edge.type);
      focus = { kind: 'message', id: edge.id };
      break;
    }
    case 'moveMessage': {
      const index = tokens.findIndex((token) => token.kind === 'message' && token.id === operation.id);
      const target = index + operation.direction;
      if (index < 0 || target < 0 || target >= tokens.length) return refuse('The message cannot move further.');
      [tokens[index], tokens[target]] = [tokens[target], tokens[index]];
      commitTokens();
      focus = { kind: 'message', id: operation.id };
      break;
    }
    case 'deleteMessage': {
      graph.edges = graph.edges.filter((edge) => edge.id !== operation.id);
      tokens = tokens.filter((token) => !(token.kind === 'message' && token.id === operation.id));
      commitTokens();
      interaction.notes = (interaction.notes ?? []).map((note) => {
        if (!note.messageIds?.includes(operation.id)) return note;
        const next: typeof note = { ...note, messageIds: note.messageIds.filter((id) => id !== operation.id) };
        if (next.messageIds?.length === 0) delete next.messageIds;
        return next;
      });
      break;
    }
    case 'addActivation': {
      const id = firstFree('activation', (interaction.activations ?? []).map((activation) => activation.id));
      interaction.activations = [...(interaction.activations ?? []), {
        id, participantId: operation.participantId, startMessageId: operation.startMessageId, endMessageId: operation.endMessageId,
      }];
      focus = { kind: 'activation', id };
      break;
    }
    case 'updateActivation': {
      const activation = interaction.activations?.find((candidate) => candidate.id === operation.id);
      if (!activation) return refuse(`Activation ${operation.id} does not exist.`);
      if (operation.startMessageId !== undefined) activation.startMessageId = operation.startMessageId;
      if (operation.endMessageId !== undefined) activation.endMessageId = operation.endMessageId;
      focus = { kind: 'activation', id: activation.id };
      break;
    }
    case 'deleteActivation':
      interaction.activations = (interaction.activations ?? []).filter((activation) => activation.id !== operation.id);
      break;
    case 'addNote':
    case 'updateNote': {
      const existing = operation.type === 'updateNote'
        ? interaction.notes?.find((candidate) => candidate.id === operation.id) : undefined;
      if (operation.type === 'updateNote' && !existing) return refuse(`Note ${operation.id} does not exist.`);
      const text = operation.text ?? existing!.text;
      if (!text.trim()) return refuse('A note needs text.');
      const targets = operation.targets ?? [...(existing?.participantIds ?? []), ...(existing?.messageIds ?? [])];
      const participants = new Set(interaction.participantOrder);
      const messages = messageIds();
      for (const target of targets) {
        if (participants.has(target) && messages.has(target)) return refuse(`${target} names both a participant and a message.`);
        if (!participants.has(target) && !messages.has(target)) return refuse(`${target} is not a participant or message.`);
      }
      const participantIds = targets.filter((target) => participants.has(target));
      const noteMessageIds = targets.filter((target) => messages.has(target));
      const id = existing?.id ?? firstFree('note', (interaction.notes ?? []).map((note) => note.id));
      const note = {
        id, text,
        ...(participantIds.length ? { participantIds } : {}),
        ...(noteMessageIds.length ? { messageIds: noteMessageIds } : {}),
      };
      interaction.notes = [...(interaction.notes ?? []).filter((candidate) => candidate.id !== id), note];
      focus = { kind: 'note', id };
      break;
    }
    case 'deleteNote':
      interaction.notes = (interaction.notes ?? []).filter((note) => note.id !== operation.id);
      break;
    case 'addFragment': {
      const first = tokens.findIndex((token) => token.kind === 'message' && token.id === operation.firstMessageId);
      const last = tokens.findIndex((token) => token.kind === 'message' && token.id === operation.lastMessageId);
      if (first < 0 || last < 0 || first > last) return refuse('Choose a first and last message in order.');
      const depthBefore = tokens.slice(0, first).reduce((depth, token) =>
        depth + (token.kind === 'open' ? 1 : token.kind === 'close' ? -1 : 0), 0);
      if (depthBefore > 0 || tokens.slice(first, last + 1).some((token) => token.kind !== 'message')) {
        return refuse('Fragments cannot be nested or overlap another fragment in Coral 0.2.6.');
      }
      const id = firstFree('fragment', (interaction.fragments ?? []).map((fragment) => fragment.id));
      const fragment: Fragment = { id, kind: operation.kind, operands: [] };
      const guard = operation.guard?.trim() || undefined;
      tokens.splice(last + 1, 0, { kind: 'close', fragment });
      // GraphIR 3 alt fragments have at least two operands; start with an empty else.
      if (operation.kind === 'alt') tokens.splice(last + 1, 0, { kind: 'else', fragment });
      tokens.splice(first, 0, { kind: 'open', fragment, guard });
      commitTokens();
      focus = { kind: 'fragment', id };
      break;
    }
    case 'updateGuard': {
      const heads = tokens.filter((token) => (token.kind === 'open' || token.kind === 'else') && token.fragment.id === operation.fragmentId);
      const head = heads[operation.operandIndex] as Extract<Token, { kind: 'open' | 'else' }> | undefined;
      if (!head) return refuse('That operand does not exist.');
      head.guard = operation.guard?.trim() || undefined;
      commitTokens();
      focus = { kind: 'fragment', id: operation.fragmentId };
      break;
    }
    case 'splitOperand': {
      const fragment = interaction.fragments?.find((candidate) => candidate.id === operation.fragmentId);
      if (!fragment) return refuse(`Fragment ${operation.fragmentId} does not exist.`);
      if (fragment.kind !== 'alt') return refuse('Only an alt fragment has more than one operand.');
      if (!fragment.operands.some((operand) => operand.messageIds.includes(operation.messageId))) {
        return refuse('Split at a message inside the fragment.');
      }
      const at = tokens.findIndex((token) => token.kind === 'message' && token.id === operation.messageId);
      tokens.splice(at, 0, { kind: 'else', fragment });
      commitTokens();
      focus = { kind: 'fragment', id: fragment.id };
      break;
    }
    case 'deleteFragment':
      tokens = tokens.filter((token) => token.kind === 'message' || token.fragment.id !== operation.id);
      commitTokens();
      break;
  }

  if (!interaction.activations?.length) delete interaction.activations;
  if (!interaction.notes?.length) delete interaction.notes;
  if (!interaction.fragments?.length) delete interaction.fragments;
  const candidate = canonicalizeSequenceGraph(graph);
  const [issue] = validateSequenceInteraction(candidate);
  if (issue) return refuse(issue.message);
  return { ok: true, graph: candidate, ...(focus ? { focus } : {}) };
}

/**
 * Entering UML sequence notation (DR70-D7.5): allowed for an empty graph or a
 * graph already shaped as a sequence; storage order becomes the explicit order.
 */
export function canEnterSequenceNotation(graph: GraphIR): { ok: true; graph: GraphIR } | { ok: false; error: string } {
  const candidate: GraphIR = {
    ...graph,
    metadata: { ...graph.metadata, notation: UML_SEQUENCE_NOTATION },
    profile: UML_SEQUENCE_PROFILE,
    interaction: deriveSequenceCore(graph.nodes, graph.edges),
  };
  const [issue] = validateSequenceInteraction(candidate);
  return issue
    ? { ok: false, error: `This diagram cannot become a UML sequence: ${issue.message}` }
    : { ok: true, graph: candidate };
}

const NODE_FIELDS = ['id', 'type', 'label', 'description', 'properties'] as const;
const EDGE_FIELDS = ['id', 'source', 'target', 'type', 'label', 'description', 'properties'] as const;

function pick<T extends object>(value: T, fields: readonly string[]): T {
  return Object.fromEntries(fields.flatMap((field) => {
    const entry = (value as Record<string, unknown>)[field];
    return entry === undefined ? [] : [[field, entry]];
  })) as T;
}

/**
 * The canonical sequence graph from a parsed or projected envelope, nodes, and
 * edges. Canvas projections add geometry, styles, and routes that are not
 * sequence fields; only the closed field lists survive (DR70-D6).
 */
export function sequenceCanonicalGraph(
  envelope: Omit<GraphIR, 'nodes' | 'edges'>,
  nodes: readonly GraphIR['nodes'][number][],
  edges: readonly GraphIR['edges'][number][],
): GraphIR {
  return {
    ...envelope,
    nodes: nodes.map((node) => pick(node, NODE_FIELDS)),
    edges: edges.map((edge) => pick(edge, EDGE_FIELDS)),
  };
}
