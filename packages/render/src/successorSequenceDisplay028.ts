import { validateGraphIRSuccessorWithCatalog, type GraphIR, type GraphNode } from '@graph-ir/core';
import type { CandidateFragmentSyntax } from '@coral-viz/language';
import type { SuccessorSourceGraph028 } from './successorSourceProjection028.js';
import { displayRouteIntent028 } from './sourceRouteIntent028.js';
import { withProximity028 } from './proximityLayout028.js';
import { successorCoreValidationInput029 } from './successorInterpretation028.js';
import type { SequenceDisplayTree028 } from './sequence.js';

type SourceInteraction028 = NonNullable<SuccessorSourceGraph028['interaction']>;

/** An activation or other timeline event must not become a GraphIR 3 message.
 * The rule-only view may inspect message-local rules across unsupported
 * fragments; the source and separate capability finding retain their meaning. */
function assertSupportedTimeline028(interaction: SourceInteraction028): void {
  for (const items of [interaction.items, ...(interaction.regions ?? []).map((region) => region.items),
    ...(interaction.fragments ?? []).flatMap((fragment) => fragment.operands.map((operand) => operand.items))])
    if (items.some((item) => !['message', 'fragment', 'region', 'note', 'activation-start', 'activation-end'].includes(item.kind)))
      throw new Error('Unsupported sequence timeline item');
}

function assertDisplayableFragments028(interaction: SourceInteraction028): void {
  for (const fragment of interaction.fragments ?? []) {
    if (fragment.kind !== 'alt')
      throw new Error(`Unsupported sequence fragment kind ${fragment.kind}; cannot display without loss`);
    for (const operand of fragment.operands)
      if (!operand.guard || typeof operand.guard.text !== 'string')
        throw new Error(`A guarded alt is required for sequence fragment ${fragment.id}`);
  }
}

function requiredAltGuard028(guard: { id: string; text: string } | undefined, fragmentId: string) {
  if (!guard || typeof guard.text !== 'string')
    throw new Error(`A guarded alt is required for sequence fragment ${fragmentId}`);
  return guard;
}

/** Locate an accepted fragment whose operands the current scene cannot draw. */
export function sequenceFragmentDisplayDiagnostics028(
  fragments: readonly CandidateFragmentSyntax[], source?: SuccessorSourceGraph028,
) {
  if (source) {
    try { verifiedMessageOrder028(source); return []; }
    catch { /* Keep a located fragment result for an unusable source tree. */ }
  }
  const all: CandidateFragmentSyntax[] = [];
  const seen = new Set<CandidateFragmentSyntax>();
  const collect = (items: readonly CandidateFragmentSyntax[]): void => {
    for (const fragment of items) {
      if (seen.has(fragment)) continue;
      seen.add(fragment);
      all.push(fragment);
      collect(fragment.operands.flatMap((operand) => operand.items.filter(
        (item): item is CandidateFragmentSyntax => item.kind === 'fragment')));
    }
  };
  collect(fragments);
  const empty = all.filter((fragment) => fragment.operands.some((operand) => operand.items.length === 0));
  return (empty.length ? empty : all).map((fragment) => ({ severity: 'error' as const,
    code: 'render.capability.sequence-fragment',
    message: empty.length
      ? 'This sequence fragment has an empty operand. Its source and portable meaning are preserved, but the scene cannot render that operand.'
      : 'This sequence fragment is preserved in source and the successor model, but this scene cannot render its operands yet.',
    range: fragment.fragmentKind.range,
  }));
}

/** The legacy sequence scene can show distinct flat alternatives. The
 * successor tree remains the only source of interaction meaning. */
function flatSequenceFragments028(source: SuccessorSourceGraph028): NonNullable<
  NonNullable<GraphIR['interaction']>['fragments']> | undefined {
  const interaction = source.interaction;
  if (!interaction) return undefined;
  const fragments = new Map((interaction.fragments ?? []).map((fragment) => [fragment.id, fragment]));
  const referenced = interaction.items.filter((item) => item.kind === 'fragment');
  if (fragments.size !== (interaction.fragments?.length ?? 0) ||
    referenced.length !== fragments.size ||
    new Set(referenced.map((item) => item.id)).size !== referenced.length ||
    interaction.items.some((item) => item.kind !== 'message' && item.kind !== 'fragment')) return undefined;
  const display: NonNullable<NonNullable<GraphIR['interaction']>['fragments']> = [];
  for (const item of referenced) {
    const fragment = fragments.get(item.id);
    if (!fragment || fragment.kind !== 'alt' || fragment.operands.length < 2 ||
      fragment.operands.some((operand) => !operand.guard || operand.items.length === 0 ||
        operand.items.some((child) => child.kind !== 'message'))) return undefined;
    display.push({ id: fragment.id, kind: fragment.kind,
      operands: fragment.operands.map((operand) => ({ id: operand.id,
        guard: requiredAltGuard028(operand.guard, fragment.id),
        messageIds: operand.items.map((child) => child.id),
      })) });
  }
  return display;
}

/** A display-only copy of the accepted tree; the successor keeps all portable
 * identities and order. Empty operands still fail closed in this scene. */
function recursiveSequenceTree028(source: SuccessorSourceGraph028): SequenceDisplayTree028 | undefined {
  const interaction = source.interaction;
  if (!interaction) return undefined;
  const fragments = new Map((interaction.fragments ?? []).map((fragment) => [fragment.id, fragment]));
  const messages = new Set(interaction.messages.map((message) => message.id));
  if (fragments.size !== (interaction.fragments?.length ?? 0) || messages.size !== interaction.messages.length)
    return undefined;
  const seenFragments = new Set<string>();
  const seenMessages = new Set<string>();
  const visit = (items: typeof interaction.items): boolean => items.every((item) => {
    if (item.kind === 'message') {
      if (!messages.has(item.id) || seenMessages.has(item.id)) return false;
      seenMessages.add(item.id);
      return true;
    }
    if (item.kind !== 'fragment') return false;
    const fragment = fragments.get(item.id);
    if (!fragment || seenFragments.has(item.id) || fragment.kind !== 'alt' || fragment.operands.length < 2 ||
      fragment.operands.some((operand) => !operand.guard || operand.items.length === 0)) return false;
    seenFragments.add(item.id);
    return fragment.operands.every((operand) => visit(operand.items));
  });
  if (!visit(interaction.items) || seenFragments.size !== fragments.size ||
    seenMessages.size !== messages.size) return undefined;
  const displayItem = (item: typeof interaction.items[number]):
    { kind: 'message' | 'fragment'; id: string } => {
    if (item.kind !== 'message' && item.kind !== 'fragment')
      throw new Error('Unsupported sequence timeline item');
    return { kind: item.kind, id: item.id };
  };
  return { items: interaction.items.map(displayItem),
    fragments: (interaction.fragments ?? []).map((fragment) => {
      if (fragment.kind !== 'alt')
        throw new Error(`Unsupported sequence fragment kind ${fragment.kind}; cannot display without loss`);
      return { id: fragment.id, kind: fragment.kind,
        operands: fragment.operands.map((operand) => ({ id: operand.id,
          guard: requiredAltGuard028(operand.guard, fragment.id).text,
          items: operand.items.map(displayItem) })) };
    }) };
}

/** Read-only GraphIR 3 sequence scene input. Source and successor graph remain
 * authoritative; this is never printed or saved as Coral meaning. */
function sequenceView028(source: SuccessorSourceGraph028, messageOrder: string[],
  fragments?: NonNullable<NonNullable<GraphIR['interaction']>['fragments']>,
  recursiveFragments028?: SequenceDisplayTree028, ruleOnly = false): GraphIR {
  if (source.profile.id !== 'uml' || source.profile.kind !== 'sequence' ||
    source.profile.version !== '1.0.0' || !source.interaction)
    throw new Error('A UML sequence successor graph is required');
  const hasPorts = (nodes: SuccessorSourceGraph028['nodes']): boolean => nodes.some((node) =>
    'ports' in node || 'semanticPorts' in node || (node.children !== undefined && hasPorts(node.children)));
  if (hasPorts(source.nodes) && !ruleOnly) {
    throw new Error('Sequence semantic ports have no supported display/layout path');
  }
  const ruleNodes = (nodes: SuccessorSourceGraph028['nodes']): GraphNode[] => nodes.map(
    ({ semanticPorts: _semanticPorts, children, ...node }) => ({ ...node,
      ...(children ? { children: ruleNodes(children) } : {}),
    }));
  const edges: GraphIR['edges'] = source.edges.map((edge) => {
    if (edge.direction !== 'first-to-second' && edge.direction !== 'second-to-first')
      throw new Error(`Sequence message ${edge.id} needs one directed sender`);
    const reverse = edge.direction === 'second-to-first';
    const sender = reverse ? edge.second : edge.first;
    const receiver = reverse ? edge.first : edge.second;
    const sourceEnd = reverse ? edge.secondEnd : edge.firstEnd;
    const targetEnd = reverse ? edge.firstEnd : edge.secondEnd;
    return withProximity028({ id: edge.id, source: sender.node, target: receiver.node,
      ...(sender.port ? { sourcePort: sender.port } : {}),
      ...(receiver.port ? { targetPort: receiver.port } : {}),
      ...(edge.type !== undefined ? { type: edge.type } : {}),
      ...(edge.label !== undefined ? { label: edge.label } : {}),
      ...(edge.description !== undefined ? { description: edge.description } : {}),
      ...(edge.labelPlacement !== undefined ? { labelPlacement: { ...edge.labelPlacement,
        ...(reverse && edge.labelPlacement.at !== undefined ? { at: 1 - edge.labelPlacement.at } : {}) } } : {}),
      ...(edge.routeIntent !== undefined && !edge.routeIntent.waypoints.some(w=>w.placement.kind==='relative'&&w.placement.anchor.kind==='waypoint') ? { routeIntent: displayRouteIntent028(edge.routeIntent, reverse) } : {}),
      ...(edge.properties !== undefined ? { properties: edge.properties } : {}),
      ...(edge.style !== undefined ? { style: edge.style } : {}),
      ...(edge.sourceInfo !== undefined ? { sourceInfo: edge.sourceInfo } : {}),
      ...(sourceEnd !== undefined ? { sourceEnd } : {}),
      ...(targetEnd !== undefined ? { targetEnd } : {}),
    }, ruleOnly ? undefined : edge.proximityHint);
  });
  const display: GraphIR = { version: '3.0.0', id: source.id,
    ...(source.name !== undefined ? { name: source.name } : {}),
    nodes: ruleOnly ? ruleNodes(source.nodes) : source.nodes.map(node=>({...node,label:node.label??node.id})) as GraphNode[], edges,
    ...(source.constraints !== undefined ? { spatialConstraints028: source.constraints } : {}),
    ...(source.metadata !== undefined ? { metadata: source.metadata } : {}),
    ...(source.layoutOptions !== undefined ? { layoutOptions028: source.layoutOptions } : {}),
    profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
    interaction: {
      // Lifecycle links are GraphIR 4 successor fields. GraphIR 3 derives
      // creation/destruction from message kinds and rejects these properties;
      // keep the exact links in the source-owned successor, not this display.
      participants: source.interaction.participants.map((participant) => ({
        id: participant.id, nodeId: participant.nodeId,
      })),
      participantOrder: [...source.interaction.participantOrder],
      messages: source.interaction.messages.map((message) => ({
        id: message.id, edgeId: message.edgeId, kind: message.kind,
        sourceParticipantId: message.senderParticipantId,
        targetParticipantId: message.receiverParticipantId,
      })),
      messageOrder,
      ...(fragments?.length ? { fragments } : {}),
    },
  };
  // This is derived scene input, not a GraphIR 3 field. Keep it available to
  // the shared renderer but absent from JSON, schema checks, and graph export.
  if (recursiveFragments028) Object.defineProperty(display, 'recursiveFragments028', {
    value: recursiveFragments028, enumerable: false,
  });
  return display;
}

/** Derived display for the accepted source timeline; the successor retains meaning. */
export function successorSequenceDisplay028(source: SuccessorSourceGraph028): GraphIR {
  const interaction = source.interaction;
  if (interaction?.regions?.length || interaction?.groups?.length) {
    const core = successorCoreValidationInput029(source);
    const checked = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
    if (!checked.valid) throw new Error(`Invalid successor sequence: ${checked.errors.map((item) => item.message).join('; ')}`);
  }
  if (interaction && (interaction.messages.some((message) => message.kind === 'destroy') || interaction.notes?.length || interaction.activations?.length || interaction.regions?.length || interaction.groups?.length ||
    interaction.fragments?.some((fragment) => fragment.kind !== 'alt' ||
      fragment.operands.some((operand) => operand.items.length === 0 || operand.guard === undefined)))) {
    assertSupportedTimeline028(interaction);
    const display = sequenceView028(source, verifiedMessageOrder028(source));
    Object.defineProperty(display, 'sourceTimeline028', {
      value: structuredClone(interaction), enumerable: false,
    });
    return display;
  }
  if (interaction) {
    assertSupportedTimeline028(interaction);
    assertDisplayableFragments028(interaction);
  }
  const fragments = flatSequenceFragments028(source);
  const recursive = fragments ? undefined : recursiveSequenceTree028(source);
  if (!interaction || !fragments && !recursive)
    throw new Error('The successor sequence timeline cannot be displayed without loss');
  return sequenceView028(source, verifiedMessageOrder028(source), fragments, recursive);
}

/** Read-only evidence for message-local rules. Recursive fragments are
 * traversed, never changed into saved or rendered sequential meaning. */
export function successorSequenceRuleView028(source: SuccessorSourceGraph028): GraphIR {
  if (source.interaction) assertSupportedTimeline028(source.interaction);
  return sequenceView028(source, verifiedMessageOrder028(source, false), undefined, undefined, true);
}

function verifiedMessageOrder028(source: SuccessorSourceGraph028, verifyGuards = true): string[] {
  const interaction = source.interaction;
  if (!interaction) throw new Error('A sequence interaction is required');
  const messages = new Map(interaction.messages.map((message) => [message.id, message]));
  const fragments = new Map((interaction.fragments ?? []).map((fragment) => [fragment.id, fragment]));
  const edges = new Map(source.edges.map((edge) => [edge.id, edge]));
  const participants = new Map(interaction.participants.map((participant) => [participant.id, participant]));
  const regions = new Map((interaction.regions ?? []).map((region) => [region.id, region]));
  const notes = new Map((interaction.notes ?? []).map((note) => [note.id, note]));
  const activations = new Map((interaction.activations ?? []).map((activation) => [activation.id, activation]));
  if (messages.size !== interaction.messages.length || fragments.size !== (interaction.fragments?.length ?? 0) ||
    edges.size !== source.edges.length || participants.size !== interaction.participants.length ||
    new Set(interaction.participantOrder).size !== interaction.participantOrder.length ||
    interaction.participantOrder.length !== participants.size ||
    interaction.participantOrder.some((id) => !participants.has(id)) ||
    regions.size !== (interaction.regions?.length ?? 0) ||
    notes.size !== (interaction.notes?.length ?? 0) || activations.size !== (interaction.activations?.length ?? 0))
    throw new Error('The successor sequence has duplicate or missing identities');
  const seenMessages = new Set<string>();
  const seenFragments = new Set<string>();
  const seenRegions = new Set<string>();
  const seenNotes = new Set<string>();
  const started = new Set<string>();
  const ended = new Set<string>();
  const order: string[] = [];
  let count = 0;
  const visit = (items: typeof interaction.items, active: readonly string[] = [], depth = 0): void => {
    if (depth > 128 || (count += items.length) > 10000) throw new Error('Sequence timeline exceeds safe traversal limits');
    const scopeMessages = new Set(items.filter((item) => item.kind === 'message').map((item) => item.id));
    const stack = [...active];
    for (const item of items) {
      if (item.kind === 'message') {
        const message = messages.get(item.id);
        if (!message || seenMessages.has(item.id)) throw new Error('Invalid sequence message reference');
        const edge = edges.get(message.edgeId);
        const sender = participants.get(message.senderParticipantId);
        const receiver = participants.get(message.receiverParticipantId);
        if (!edge || !sender || !receiver ||
          (edge.direction !== 'first-to-second' && edge.direction !== 'second-to-first') ||
          (edge.direction === 'first-to-second'
            ? edge.first.node !== sender.nodeId || edge.second.node !== receiver.nodeId
            : edge.second.node !== sender.nodeId || edge.first.node !== receiver.nodeId))
          throw new Error('Sequence message endpoints do not match the authored direction');
        if (depth > 0 && (message.kind === 'create' || message.kind === 'destroy'))
          throw new Error('Sequence lifecycle messages must occur in the root timeline');
        seenMessages.add(item.id);
        order.push(item.id);
      } else if (item.kind === 'fragment') {
        const fragment = fragments.get(item.id);
        if (!fragment || seenFragments.has(item.id) ||
          !['alt', 'par', 'loop', 'opt', 'critical', 'break'].includes(fragment.kind) ||
          (fragment.kind === 'alt' || fragment.kind === 'par'
            ? fragment.operands.length < 2 : fragment.operands.length !== 1))
          throw new Error('Invalid recursive sequence fragment reference');
        if (verifyGuards && fragment.operands.some((operand) => operand.guard !== undefined && typeof operand.guard.text !== 'string'))
          throw new Error('Malformed sequence fragment guard');
        seenFragments.add(item.id);
        for (const operand of fragment.operands) visit(operand.items, stack, depth + 1);
      } else if (item.kind === 'region') {
        const region = regions.get(item.id);
        if (!region || seenRegions.has(item.id) || (region.label !== undefined && typeof region.label !== 'string'))
          throw new Error('Invalid recursive sequence region reference');
        seenRegions.add(item.id);
        visit(region.items, stack, depth + 1);
      } else if (item.kind === 'note') {
        const note = notes.get(item.id);
        if (!note || seenNotes.has(item.id) ||
          note.participantIds?.some((id) => !participants.has(id)) || note.messageIds?.some((id) => !messages.has(id) || !scopeMessages.has(id)))
          throw new Error('Invalid source sequence note reference');
        seenNotes.add(item.id);
      } else if (item.kind === 'activation-start') {
        const activation = activations.get(item.id);
        if (!activation || !participants.has(activation.participantId) || started.has(item.id))
          throw new Error('Invalid source sequence activation start');
        started.add(item.id); stack.push(item.id);
      } else if (item.kind === 'activation-end') {
        const activation = activations.get(item.id);
        const last = stack.map((id) => activations.get(id)?.participantId).lastIndexOf(activation?.participantId);
        if (!activation || last < 0 || stack[last] !== item.id || ended.has(item.id))
          throw new Error('Invalid source sequence activation end');
        stack.splice(last, 1); ended.add(item.id);
      } else throw new Error('Unsupported sequence timeline item');
    }
    if (stack.length !== active.length || stack.some((id, index) => id !== active[index]))
      throw new Error('A sequence activation crosses an operand boundary');
  };
  visit(interaction.items);
  if (seenMessages.size !== messages.size || seenFragments.size !== fragments.size || seenRegions.size !== regions.size ||
    messages.size !== edges.size || seenNotes.size !== notes.size ||
    started.size !== activations.size || ended.size !== activations.size ||
    new Set(interaction.messages.map((message) => message.edgeId)).size !== edges.size)
    throw new Error('The successor sequence timeline omits or repeats meaning');
  return order;
}
