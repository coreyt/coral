import type { DocumentSymbolDefinition, GraphEdge, GraphIR, GraphNode, InteractionMessage, RelationshipEnd, RouteIntentSuccessor, SpatialConstraintSuccessor, LayoutOptionsSuccessor } from '@graph-ir/core';
import { isDashedOpenArrow028 } from '@coral-viz/language';
import type { CandidateEdgeSyntax, CandidateFragmentSyntax, CandidateParticipantGroupSyntax,
  CandidatePortSyntax,
  CandidateSequenceItemSyntax } from '@coral-viz/language';
import type { DiagnosticRange, UserSymbolDefinition } from '@coral-viz/language';
import { projectPortAnchor028 } from './portAnchorProjection028.js';
import { parseInstalledDocument028 } from './installedDocument028.js';
import type { SuccessorGraphView028, SuccessorNodeView028 } from './successorInterpretation028.js';
import { successorRouteIntent028 } from './sourceRouteIntent028.js';
import { sourceEdgeDirection028, type SourceEdgeDirection028 } from './sourceDirection028.js';

type Direction028 = SourceEdgeDirection028;

export type SuccessorSourceNode028 = Omit<GraphNode, 'ports' | 'children'> & {
  semanticPorts?: SuccessorNodeView028['semanticPorts'];
  children?: SuccessorSourceNode028[];
};

export type SuccessorSourceEdge028 = Omit<GraphEdge,
  'source' | 'target' | 'sourcePort' | 'targetPort' | 'sourceEnd' | 'targetEnd' | 'routeIntent' | 'style'> & {
  first: { node: string; port?: string };
  second: { node: string; port?: string };
  direction: Direction028;
  routeIntent?: RouteIntentSuccessor;
  /** One shaft position requests closest, six farthest; layout owns realization. */
  proximityHint?: 1 | 2 | 3 | 4 | 5 | 6;
  firstEnd?: RelationshipEnd;
  secondEnd?: RelationshipEnd;
  style?: NonNullable<GraphEdge['style']> & {
    strokeColor?: string;
    strokeWeight?: 'regular' | 'thick';
    motion?: { kind: 'static' } | { kind: 'animated';
      direction: 'auto' | 'first-to-second' | 'second-to-first' };
  };
};

type SourceMessageKind028 = NonNullable<InteractionMessage['kind']> &
  ('synchronous' | 'asynchronous' | 'return' | 'create' | 'destroy');

type SuccessorSourceInteractionItem028 = { kind: 'message' | 'fragment' | 'note' |
  'activation-start' | 'activation-end' | 'region'; id: string };
type SuccessorSourceFragmentOperand028 = { id: string;
  guard?: { id: string; text: string }; items: SuccessorSourceInteractionItem028[] };
type SuccessorSourceFragment028 =
  | { id: string; kind: 'loop' | 'opt' | 'critical' | 'break';
      operands: [SuccessorSourceFragmentOperand028] }
  | { id: string; kind: 'alt' | 'par';
      operands: [SuccessorSourceFragmentOperand028, SuccessorSourceFragmentOperand028,
        ...SuccessorSourceFragmentOperand028[]] };

export interface SuccessorSourceInteraction028 {
  participants: Array<{ id: string; nodeId: string;
    createdByMessageId?: string; destroyedByMessageId?: string }>;
  participantOrder: string[];
  messages: Array<{ id: string; edgeId: string; kind: SourceMessageKind028;
    senderParticipantId: string; receiverParticipantId: string }>;
  fragments?: SuccessorSourceFragment028[];
  notes?: Array<{ id: string; text: string; participantIds?: string[]; messageIds?: string[] }>;
  activations?: Array<{ id: string; participantId: string }>;
  regions?: Array<{ id: string; label?: string; items: SuccessorSourceInteractionItem028[] }>;
  groups?: Array<{ id: string; label?: string; participantIds: string[] }>;
  items: SuccessorSourceInteractionItem028[];
}

/** A document-local symbol definition without source positions. Coral-side
 * until GraphIR adoption: core validation refuses a graph that carries one. */
export type SuccessorUserSymbol029 = Omit<UserSymbolDefinition, 'range' | 'artwork'> & {
  artwork: { format: 'svg'; text: string };
};

/** A lossless projection of the currently parsed source subset; not a package release. */
export type SuccessorSourceGraph028 = Omit<GraphIR,
  'version' | 'profile' | 'nodes' | 'edges' | 'interaction' | 'constraints' | 'layoutOptions'> & {
  version: '4.0.0';
  constraints?:SpatialConstraintSuccessor[];
  layoutOptions?:LayoutOptionsSuccessor;
  profile: NonNullable<SuccessorGraphView028['profile']>;
  catalog: NonNullable<SuccessorGraphView028['catalog']>;
  conformanceLevel: 'none' | 'typical' | 'strict';
  conformanceExceptions?: Array<{ kind: 'explicit-symbol'; nodeId: string; symbol: string }>;
  nodes: SuccessorSourceNode028[];
  edges: SuccessorSourceEdge028[];
  interaction?: SuccessorSourceInteraction028;
  /** Edition 0.2.9 definitions in authored order. */
  userSymbols029?: SuccessorUserSymbol029[];
};

/** The GraphIR 4 candidate form of a projection: definitions travel as `documentCatalog`. */
export type SuccessorGraphIr029 = Omit<SuccessorSourceGraph028, 'userSymbols029'> & {
  documentCatalog?: DocumentSymbolDefinition[];
};

export interface SuccessorSourceProjection028 {
  graph?: SuccessorSourceGraph028;
  diagnostics: Array<{ code: string; message: string; range?: DiagnosticRange;
    related?: Array<{ message: string; range: DiagnosticRange }> }>;
}

function projectNode028(node: GraphNode, authoredLabels: ReadonlyMap<string,string>): SuccessorSourceNode028 | undefined {
  const { ports, children, label: _label, ...rest } = node;
  void _label;
  if (ports !== undefined) return undefined; // GraphIR 3 ports are geometric.
  const projectedChildren = children?.map(child=>projectNode028(child,authoredLabels));
  if (projectedChildren?.some((child) => child === undefined)) return undefined;
  return { ...rest, ...(authoredLabels.has(node.id)?{label:authoredLabels.get(node.id)!}:{}),
    ...(projectedChildren ? { children: projectedChildren as SuccessorSourceNode028[] } : {}) };
}


function addSourcePorts028(nodes: SuccessorSourceNode028[], ports: readonly CandidatePortSyntax[]): void {
  const byId = new Map<string, SuccessorSourceNode028>();
  const visit = (items: SuccessorSourceNode028[]): void => {
    for (const node of items) {
      byId.set(node.id, node);
      visit(node.children ?? []);
    }
  };
  visit(nodes);
  for (const port of ports) {
    const owner = byId.get(port.ownerQualifiedId ?? port.owner.value);
    if (!owner) continue;
    owner.semanticPorts = [...(owner.semanticPorts ?? []), { id: port.id.value,
      direction: port.direction.value as 'in' | 'out' | 'inout',
      ...(port.anchor ? { anchor: projectPortAnchor028(port.anchor.value) } : {}),
      ...(port.label ? { label: port.label.value } : {}),
      ...(port.maxConnections ? { maxConnections: Number(port.maxConnections.raw) } : {}),
    }];
  }
}

function projectEdge028(edge: GraphEdge, syntax: CandidateEdgeSyntax): SuccessorSourceEdge028 | undefined {
  const firstNode = syntax.resolvedSource ?? syntax.source.value;
  const secondNode = syntax.resolvedTarget ?? syntax.target.value;
  if (edge.source !== firstNode || edge.target !== secondNode) return undefined;
  const style = { ...edge.style, ...syntax.styleIntent };
  return {
    id: edge.id,
    first: { node: firstNode,
      ...(syntax.sourcePort ? { port: syntax.sourcePort.value } : {}) },
    second: { node: secondNode,
      ...(syntax.targetPort ? { port: syntax.targetPort.value } : {}) },
    direction: sourceEdgeDirection028(syntax),
    ...(syntax.connector?.dashCount ? { proximityHint: syntax.connector.dashCount } : {}),
    ...(edge.type !== undefined ? { type: edge.type } : {}),
    ...(edge.label !== undefined ? { label: edge.label } : {}),
    ...(edge.description !== undefined ? { description: edge.description } : {}),
    ...(edge.labelPlacement !== undefined ? { labelPlacement: edge.labelPlacement } : {}),
    ...(edge.routeIntent !== undefined ? { routeIntent: successorRouteIntent028(edge.routeIntent) } : {}),
    ...(edge.properties !== undefined ? { properties: edge.properties } : {}),
    ...(Object.keys(style).length ? { style } : {}),
    ...(edge.sourceInfo !== undefined ? { sourceInfo: edge.sourceInfo } : {}),
    // An absent end is unspecified. A written shaft or keyed `none` is an
    // explicit mark choice and must survive independently of its geometry.
    ...((syntax.operatorConnector?.firstEndAuthored || syntax.firstEnd) && edge.sourceEnd
      ? { firstEnd: edge.sourceEnd } : {}),
    ...((syntax.operatorConnector?.secondEndAuthored || syntax.secondEnd) && edge.targetEnd
      ? { secondEnd: edge.targetEnd } : {}),
  };
}

function projectInteraction028(graph: GraphIR): SuccessorSourceInteraction028 | undefined {
  const interaction = graph.interaction;
  if (!interaction) return undefined;
  // This parser emits only a flat message timeline. Do not silently flatten
  // recursive fragments/activations/notes from another source or graph path.
  if (interaction.fragments?.length || interaction.activations?.length || interaction.notes?.length ||
    interaction.messages.some((message) => !message.kind || !message.edgeId ||
      !message.sourceParticipantId || !message.targetParticipantId)) return undefined;
  const byId = new Map(interaction.messages.map((message) => [message.id, message]));
  if (byId.size !== interaction.messages.length ||
    interaction.messageOrder.length !== interaction.messages.length ||
    interaction.messageOrder.some((id) => !byId.has(id))) return undefined;
  return {
    participants: interaction.participants.map(({ id, nodeId }) => ({ id, nodeId })),
    participantOrder: [...interaction.participantOrder],
    messages: interaction.messages.map((message) => ({
      id: message.id, edgeId: message.edgeId!, kind: message.kind as SourceMessageKind028,
      senderParticipantId: message.sourceParticipantId!,
      receiverParticipantId: message.targetParticipantId!,
    })),
    items: interaction.messageOrder.map((id) => ({ kind: 'message', id })),
  };
}

function projectSequenceSyntax028(
  graph: GraphIR, edges: readonly CandidateEdgeSyntax[],
  sourceItems: readonly CandidateSequenceItemSyntax[],
  sourceGroups: readonly CandidateParticipantGroupSyntax[],
): { edges: SuccessorSourceEdge028[]; interaction: SuccessorSourceInteraction028;
    diagnostics: SuccessorSourceProjection028['diagnostics'] } {
  const projected: SuccessorSourceEdge028[] = [];
  const messages: SuccessorSourceInteraction028['messages'] = [];
  const diagnostics: SuccessorSourceProjection028['diagnostics'] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  const namedMessageIds = new Set<string>();
  const edgeIdBySyntax = new Map<CandidateEdgeSyntax, string>();
  const creationByParticipant = new Map<string, { messageId: string; offset: number }>();
  const destructionByParticipant = new Map<string, { messageId: string; offset: number }>();
  let ordinal = 0;
  for (const syntax of edges) {
    const id = syntax.qualifiedId ?? `edge-${++ordinal}`;
    if (edgeIds.has(id)) diagnostics.push({ code: 'coral.identity.edge.duplicate',
      message: `Duplicate edge ID: ${id}`, range: (syntax.id ?? syntax.source).range });
    edgeIds.add(id);
    edgeIdBySyntax.set(syntax, id);
    if (!nodeIds.has(syntax.source.value)) diagnostics.push({
      code: 'coral.reference.edge.source.unresolved',
      message: `Unresolved source endpoint: ${syntax.source.value}`, range: syntax.source.range,
    });
    if (!nodeIds.has(syntax.target.value)) diagnostics.push({
      code: 'coral.reference.edge.target.unresolved',
      message: `Unresolved target endpoint: ${syntax.target.value}`, range: syntax.target.range,
    });
    const connector = syntax.connector;
    const operatorConnector = syntax.operatorConnector ?? connector;
    const direction = sourceEdgeDirection028(syntax);
    // Lost/found reserve an explicitly missing endpoint in the successor;
    // this source spelling still names two ordinary endpoints. Do not invent
    // a missing participant or project it as an asynchronous message.
    if (syntax.edgeType && (syntax.edgeType.value === 'lost' ||
      syntax.edgeType.value === 'found')) {
      diagnostics.push({ code: 'render.capability.sequence-message-kind',
        message: `Sequence ${syntax.edgeType.value} requires interaction geometry not yet supported by this renderer.`,
        range: syntax.edgeType.range });
      continue;
    }
    if (!connector || direction !== 'first-to-second' && direction !== 'second-to-first') {
      diagnostics.push({ code: 'coral.sequence.operator.unsupported',
        message: 'A UML sequence message requires exactly one arrow-ended connector.',
        range: syntax.operator.range });
      continue;
    }
    const create = isDashedOpenArrow028(operatorConnector) && syntax.edgeType?.value === 'create';
    const destroy = syntax.edgeType?.value === 'destroy';
    const kind: SourceMessageKind028 = create ? 'create' : destroy ? 'destroy'
      : operatorConnector?.stroke === 'dashed' ? 'return'
        : operatorConnector?.secondEnd.kind === 'arrow' && operatorConnector.secondEnd.fill === 'filled'
          ? 'synchronous' : 'asynchronous';
    const firstEnd: RelationshipEnd = { marker: connector.firstEnd };
    const secondEnd: RelationshipEnd = { marker: connector.secondEnd.kind === 'arrow' &&
      connector.secondEnd.fill === 'filled'
      ? { kind: 'triangle', fill: 'filled' } : connector.secondEnd };
    projected.push({ id,
      first: { node: syntax.source.value,
        ...(syntax.sourcePort ? { port: syntax.sourcePort.value } : {}) },
      second: { node: syntax.target.value,
        ...(syntax.targetPort ? { port: syntax.targetPort.value } : {}) },
      direction,
      ...((operatorConnector?.firstEndAuthored || syntax.firstEnd) ? { firstEnd } : {}),
      ...((operatorConnector?.secondEndAuthored || syntax.secondEnd) ? { secondEnd } : {}),
      ...(connector.dashCount ? { proximityHint: connector.dashCount } : {}),
      type: syntax.edgeType?.value ?? (kind === 'synchronous' ? 'sync'
        : kind === 'asynchronous' ? 'async' : kind),
      ...(syntax.label ? { label: syntax.label.value } : {}),
      ...(syntax.styleIntent && Object.keys(syntax.styleIntent).length
        ? { style: { ...(connector.stroke === 'dashed' ? { lineStyle: 'dashed' as const } : {}),
          ...syntax.styleIntent } }
        : connector.stroke === 'dashed' ? { style: { lineStyle: 'dashed' as const } } : {}),
    });
    messages.push({ id, edgeId: id, kind,
      senderParticipantId: direction === 'first-to-second' ? syntax.source.value : syntax.target.value,
      receiverParticipantId: direction === 'first-to-second' ? syntax.target.value : syntax.source.value });
    if (syntax.id) namedMessageIds.add(id);
    if (create) {
      if (creationByParticipant.has(syntax.target.value)) diagnostics.push({
        code: 'coral.sequence.create.duplicate',
        message: `Participant ${syntax.target.value} already has a creation message`,
        range: syntax.edgeType!.range,
      });
      else creationByParticipant.set(syntax.target.value, {
        messageId: id, offset: syntax.operator.range.start.offset,
      });
    }
    if (destroy) {
      const receiver = direction === 'first-to-second' ? syntax.target.value : syntax.source.value;
      if (destructionByParticipant.has(receiver)) diagnostics.push({
        code: 'coral.sequence.destroy.duplicate',
        message: `Participant ${receiver} already has a destruction message`,
        range: syntax.edgeType!.range,
      });
      else destructionByParticipant.set(receiver, {
        messageId: id, offset: syntax.operator.range.start.offset,
      });
    }
  }
  const fragments: NonNullable<SuccessorSourceInteraction028['fragments']> = [];
  const regions: NonNullable<SuccessorSourceInteraction028['regions']> = [];
  const notes: NonNullable<SuccessorSourceInteraction028['notes']> = [];
  const activations: NonNullable<SuccessorSourceInteraction028['activations']> = [];
  let noteOrdinal = 0;
  let activationOrdinal = 0;
  const identities = new Set([...nodeIds, ...edgeIds]);
  let fragmentOrdinal = 0;
  let regionOrdinal = 0;
  const namedMessageScopes = new Map<string, readonly CandidateSequenceItemSyntax[]>();
  const collectMessageScopes = (items: readonly CandidateSequenceItemSyntax[],
    timelineScope = items): void => {
    for (const item of items) {
      if (item.kind === 'edge' && item.id) namedMessageScopes.set(item.id.value, timelineScope);
      else if (item.kind === 'fragment')
        for (const operand of item.operands) collectMessageScopes(operand.items);
      else if (item.kind === 'region') collectMessageScopes(item.items);
      else if (item.kind === 'activation') collectMessageScopes(item.items, timelineScope);
    }
  };
  collectMessageScopes(sourceItems);
  const projectItems = (items: readonly CandidateSequenceItemSyntax[], timelineScope = items):
    SuccessorSourceInteraction028['items'] => {
    const result: SuccessorSourceInteraction028['items'] = [];
    for (const item of items) {
      if (item.kind === 'edge') {
        const id = edgeIdBySyntax.get(item);
        if (id) result.push({ kind: 'message', id });
        for (const participant of new Set([item.source.value, item.target.value])) {
          const destruction = destructionByParticipant.get(participant);
          if (destruction && item.operator.range.start.offset > destruction.offset)
            diagnostics.push({ code: 'coral.sequence.message.outside-participant-lifetime',
              message: `Message references ${participant} after its destruction`,
              range: item.operator.range });
        }
        if ((item.edgeType?.value === 'create' || item.edgeType?.value === 'destroy') &&
          timelineScope !== sourceItems)
          diagnostics.push({ code: item.edgeType.value === 'create'
            ? 'coral.sequence.create.root-only' : 'coral.sequence.destroy.root-only',
            message: 'A lifecycle message must occur directly in the root sequence timeline',
            range: item.edgeType.range });
        continue;
      }
      if (item.kind === 'note') {
        const id = item.id?.value ?? `note-${++noteOrdinal}`;
        if (identities.has(id)) diagnostics.push({ code: 'coral.identity.note.duplicate',
          message: `Duplicate sequence identity: ${id}`,
          range: (item.id ?? item.noteKeyword).range });
        identities.add(id);
        const targets = item.targets;
        for (const target of targets) {
          const participant = nodeIds.has(target.value);
          const message = namedMessageIds.has(target.value);
          if (participant && message) diagnostics.push({
            code: 'coral.sequence.note.target-ambiguous',
            message: `Note target ${target.value} names both a participant and a message`,
            range: target.range });
          else if (!participant && !message) diagnostics.push({
            code: 'coral.sequence.note.target-unresolved',
            message: `Unknown note target: ${target.value}`, range: target.range });
          else if (message && namedMessageScopes.get(target.value) !== timelineScope)
            diagnostics.push({ code: 'coral.sequence.note.message-scope',
              message: `Note target ${target.value} belongs to another timeline scope`,
              range: target.range });
          const creation = creationByParticipant.get(target.value);
          if (participant && creation && item.noteKeyword.range.start.offset < creation.offset)
            diagnostics.push({ code: 'coral.sequence.note.outside-participant-lifetime',
              message: `Note targets ${target.value} before its creation message`,
              range: target.range });
          const destruction = destructionByParticipant.get(target.value);
          if (participant && destruction && item.noteKeyword.range.start.offset > destruction.offset)
            diagnostics.push({ code: 'coral.sequence.note.outside-participant-lifetime',
              message: `Note targets ${target.value} after its destruction message`,
              range: target.range });
        }
        const messageTargets = targets.filter((target) => namedMessageIds.has(target.value));
        if (targets.length > 1 && messageTargets.length)
          diagnostics.push({ code: 'coral.sequence.note.targets-mixed',
            message: 'A multi-target note must name participants only',
            range: messageTargets.at(-1)!.range });
        notes.push({ id, text: item.text.value,
          ...(targets.length === 1 && messageTargets.length
            ? { messageIds: [targets[0]!.value] }
            : { participantIds: targets.map((target) => target.value) }),
        });
        result.push({ kind: 'note', id });
        continue;
      }
      if (item.kind === 'activation') {
        const destruction = destructionByParticipant.get(item.participant.value);
        if (destruction && (item.activationKeyword.range.start.offset > destruction.offset ||
          item.blockClose && item.blockClose.range.start.offset > destruction.offset))
          diagnostics.push({ code: 'coral.sequence.activation.outside-participant-lifetime',
            message: `Activation of ${item.participant.value} extends beyond its destruction message`,
            range: item.participant.range });
        const id = item.id?.value ?? `activation-${++activationOrdinal}`;
        if (identities.has(id)) diagnostics.push({ code: 'coral.identity.activation.duplicate',
          message: `Duplicate sequence identity: ${id}`,
          range: (item.id ?? item.activationKeyword).range });
        identities.add(id);
        activations.push({ id, participantId: item.participant.value });
        result.push({ kind: 'activation-start', id });
        result.push(...projectItems(item.items, timelineScope));
        result.push({ kind: 'activation-end', id });
        continue;
      }
      if (item.kind === 'region') {
        const id = item.id?.value ?? `region-${++regionOrdinal}`;
        if (identities.has(id)) diagnostics.push({ code: 'coral.identity.region.duplicate',
          message: `Duplicate sequence identity: ${id}`,
          range: (item.id ?? item.regionKeyword).range });
        identities.add(id);
        regions.push({ id, ...(item.label ? { label: item.label.value } : {}),
          items: projectItems(item.items) });
        result.push({ kind: 'region', id });
        continue;
      }
      const fragment: CandidateFragmentSyntax = item;
      const id = fragment.id?.value ?? `fragment-${++fragmentOrdinal}`;
      if (identities.has(id)) diagnostics.push({ code: 'coral.identity.fragment.duplicate',
        message: `Duplicate sequence identity: ${id}`,
        range: (fragment.id ?? fragment.fragmentKind).range });
      identities.add(id);
      const position = fragments.length;
      const operands = fragment.operands.map((operand, index) => ({
        id: `${id}-operand-${index + 1}`,
        ...(operand.guard ? { guard: { id: `${id}-guard-${index + 1}`,
          text: operand.guard.value } } : {}),
        items: projectItems(operand.items),
      }));
      const kind = fragment.fragmentKind.value as SuccessorSourceFragment028['kind'];
      const multi = kind === 'alt' || kind === 'par';
      if (multi ? operands.length < 2 : operands.length !== 1)
        diagnostics.push({ code: 'coral.sequence.fragment.operands',
          message: `${kind} has an invalid number of operands`,
          range: fragment.fragmentKind.range });
      else if (multi) fragments.splice(position, 0, { id, kind,
        operands: operands as [SuccessorSourceFragmentOperand028,
          SuccessorSourceFragmentOperand028, ...SuccessorSourceFragmentOperand028[]] });
      else fragments.splice(position, 0, { id, kind,
        operands: operands as [SuccessorSourceFragmentOperand028] });
      result.push({ kind: 'fragment', id });
    }
    return result;
  };
  const items = projectItems(sourceItems);
  const groups: NonNullable<SuccessorSourceInteraction028['groups']> = [];
  const groupedMembers = new Set<string>();
  let groupOrdinal = 0;
  sourceGroups.forEach((group) => {
    const id = group.id?.value ?? `group-${++groupOrdinal}`;
    if (identities.has(id)) diagnostics.push({ code: 'coral.identity.group.duplicate',
      message: `Duplicate sequence identity: ${id}`,
      range: (group.id ?? group.participantsKeyword).range });
    identities.add(id);
    const seenMembers = new Set<string>();
    for (const member of group.members) {
      if (!nodeIds.has(member.value)) diagnostics.push({ code: 'coral.sequence.group.participant-unresolved',
        message: `Unknown group participant: ${member.value}`, range: member.range });
      if (seenMembers.has(member.value)) diagnostics.push({ code: 'coral.sequence.group.participant-duplicate',
        message: `Group ${id} repeats participant ${member.value}`, range: member.range });
      else if (groupedMembers.has(member.value)) diagnostics.push({
        code: 'coral.sequence.group.participant-multiple-groups',
        message: `Participant ${member.value} belongs to more than one group`, range: member.range });
      seenMembers.add(member.value);
      groupedMembers.add(member.value);
    }
    groups.push({ id, ...(group.label ? { label: group.label.value } : {}),
      participantIds: group.members.map((member) => member.value) });
  });
  return { edges: projected,
    interaction: {
      participants: graph.nodes.map((node) => ({ id: node.id, nodeId: node.id,
        ...(creationByParticipant.has(node.id)
          ? { createdByMessageId: creationByParticipant.get(node.id)!.messageId } : {}),
        ...(destructionByParticipant.has(node.id)
          ? { destroyedByMessageId: destructionByParticipant.get(node.id)!.messageId } : {}),
      })),
      participantOrder: graph.interaction?.participantOrder ?? graph.nodes.map((node) => node.id),
      messages,
      ...(fragments.length ? { fragments } : {}), items,
      ...(notes.length ? { notes } : {}),
      ...(activations.length ? { activations } : {}),
      ...(regions.length ? { regions } : {}),
      ...(groups.length ? { groups } : {}),
    }, diagnostics };
}

/** Project approved source directly, without treating GraphIR 3 migration as meaning. */
export function projectInstalledSourceToSuccessor028(
  source: string | ReturnType<typeof parseInstalledDocument028>,
): SuccessorSourceProjection028 {
  const document = typeof source === 'string' ? parseInstalledDocument028(source) : source;
  const edges = document.syntax.statements.filter((item): item is CandidateEdgeSyntax => item.kind === 'edge');
  const sequence = document.header.header?.diagramType === 'uml-sequence';
  const diagnostics = [...document.header.diagnostics, ...document.syntax.diagnostics]
    .map(({ code, message, range, related }) => ({ code, message,
      ...(range ? { range } : {}),
      ...(related?.length ? { related: related.flatMap((item) => {
        const location = item.range ?? ('position' in item
          ? { start: item.position, end: item.position } : undefined);
        return location ? [{ message: item.message, range: location }] : [];
      }) } : {}) }));
  if (diagnostics.length || !document.header.header ||
    !document.graph && document.syntax.diagnostics.some((item) => item.severity === 'error'))
    return { diagnostics };
  // The installed reader withholds a GraphIR 3 graph when a successor-only
  // color is authored. The syntax graph is only a structural staging input.
  const graph = document.graph ?? document.syntax.graph;
  const authoredExceptions = document.syntax.statements.flatMap((item) =>
    item.kind === 'node' && item.conformanceException
      ? [{ kind: 'explicit-symbol' as const, nodeId: item.qualifiedId ?? item.id.value,
        symbol: item.conformanceException.value }] : []);
  if (!sequence && edges.length !== graph.edges.length) return { diagnostics: [{
    code: 'coral.successor.projection.edge-order',
    message: 'Source edge identities cannot be paired with the intermediate graph.',
  }] };
  const authoredLabels=new Map(document.syntax.statements.flatMap(item=>item.kind==='node'&&item.label?[[item.qualifiedId??item.id.value,item.label.value] as const]:[]));
  const projectedNodes = graph.nodes.map(node=>projectNode028(node,authoredLabels));
  if (projectedNodes.every((node) => node !== undefined)) addSourcePorts028(
    projectedNodes as SuccessorSourceNode028[], document.syntax.statements.filter(
      (item): item is CandidatePortSyntax => item.kind === 'port'));
  const sequenceProjection = sequence ? projectSequenceSyntax028(graph, edges,
    document.syntax.sequenceItems, document.syntax.statements.filter(
      (item): item is CandidateParticipantGroupSyntax => item.kind === 'participant-group')) : undefined;
  if (sequenceProjection?.diagnostics.length) return {
    diagnostics: sequenceProjection.diagnostics };
  const projectedEdges = sequenceProjection?.edges ??
    graph.edges.map((edge, index) => projectEdge028(edge, edges[index]!));
  const projectedInteraction = sequenceProjection?.interaction ?? projectInteraction028(graph);
  if (projectedNodes.some((node) => node === undefined) ||
    projectedEdges.some((edge) => edge === undefined) ||
    graph.interaction && !projectedInteraction) return { diagnostics: [{
    code: 'coral.successor.projection.unsupported',
    message: 'The source contains a model feature that cannot be projected without loss.',
  }] };
  const { version: _version, nodes: _nodes, edges: _edges, profile: _profile,
    interaction: _interaction, constraints: _constraints, layoutOptions: _layoutOptions, ...retained } = graph;
  void [_version, _nodes, _edges, _profile, _interaction, _constraints, _layoutOptions];
  const header = document.header.header;
  return { diagnostics, graph: {
    ...retained, ...(document.syntax.spatialConstraints028?{constraints:document.syntax.spatialConstraints028}:{}), ...(document.syntax.layoutOptions028?{layoutOptions:document.syntax.layoutOptions028}:{}), version: '4.0.0', profile: { ...header.profile }, catalog: { ...header.catalog },
    conformanceLevel: header.conformanceLevel,
    ...(authoredExceptions.length ? { conformanceExceptions: authoredExceptions } : {}),
    nodes: projectedNodes as SuccessorSourceNode028[],
    edges: (projectedEdges as SuccessorSourceEdge028[]).map(edge=>({...edge,...(document.syntax.routeIntents028&&Object.hasOwn(document.syntax.routeIntents028,edge.id)?{routeIntent:document.syntax.routeIntents028[edge.id]}:{})})),
    ...(projectedInteraction ? { interaction: projectedInteraction } : {}),
    ...(document.definitions ? { userSymbols029: document.definitions.map(({ range: _range, artwork, ...rest }) =>
      ({ ...structuredClone(rest), artwork: { format: artwork.format, text: artwork.text } })) } : {}),
  } };
}
