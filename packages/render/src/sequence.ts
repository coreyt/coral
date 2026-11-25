import { placeSequenceGroups028 } from './sequenceGroups028.js';
/**
 * Specialized UML sequence layout and scene (R-060 AC-2, Slice 70).
 *
 * Geometry is a pure function of the ordered interaction, the labels, and the
 * text-measurement options. Node positions, edge routes, ELK, and storage
 * order are never inputs. SVG and the canvas both draw `sequencePrimitives`
 * of the same scene, so neither computes geometry of its own.
 */

import { authoredEdgeLabelBox028, measureEdgeLabel028 } from './edgeLabelPlacement028.js';
import { placeSequenceLabels028 } from './sequenceLabelPlacement028.js';
import type { EdgeLabelPlacement, GraphEdge, GraphNode, Interaction, InteractionMessage, NotationProfile } from '@graph-ir/core';
import type { SuccessorSourceInteraction028 } from './successorSourceProjection028.js';
import { edgeProximity028, proximityClearance028 } from './proximityLayout028.js';
import { layoutSourceTimeline028 } from './sequenceTimeline028.js';
import { measureText } from './text/metrics.js';
import { effectiveGraphNotationId028 } from './graphNotation028.js';
import { inkRoutePath028, visualDashPattern028, visualStyle028, type RenderStyle028 } from './visualStyle028.js';
import {
  resolveDiagramFont,
  resolveFont,
  type DiagramRenderFontSettings,
  type EffectiveFontWeight,
  type FontFaceRequest,
  type RenderFontWeight,
} from './text/fonts.js';

export const UML_SEQUENCE_NOTATION = 'uml-sequence';

export interface SequenceGraph {
  id?: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: { notation?: string };
  profile?: NotationProfile;
  interaction?: Interaction;
  /** Read-only scene input derived from a validated GraphIR 4 source tree. */
  recursiveFragments028?: SequenceDisplayTree028;
  /** Derived, nonserialized source timeline for ordered notes/activations. */
  sourceTimeline028?: SuccessorSourceInteraction028;
}

export interface SequenceDisplayTree028 {
  items: readonly { kind: 'message' | 'fragment'; id: string }[];
  fragments: readonly {
    id: string;
    kind: 'alt';
    operands: readonly { id: string; guard: string;
      items: readonly { kind: 'message' | 'fragment'; id: string }[] }[];
  }[];
}

export type SequenceGroupStyle = 'shaded' | 'bordered';

export interface SequenceLayoutOptions {
  padding?: number;
  /** Explicit family and size; alone they keep the legacy unembedded text. */
  fontSize?: number;
  fontFamily?: string;
  /** Portable document fonts (R-033), resolved as the SVG serializer resolves node fonts. */
  fontSettings?: DiagramRenderFontSettings;
  fontWeight?: RenderFontWeight;
  /** Optional label face for messages, measured before column layout. */
  messageFontWeight?: RenderFontWeight;
  lineHeight?: number;
  /** Visual style for sequence regions, participant groups, and frames ('shaded' default, or 'bordered'). */
  groupStyle?: SequenceGroupStyle;
}

/** A resolved text font; `lineHeight` is in pixels. `face` is set for a portable bundled face. */
export interface SequenceFont {
  cssFamily?: string;
  size: number;
  weight?: EffectiveFontWeight;
  lineHeight: number;
  face?: FontFaceRequest;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function sequenceParticipantVisualType(node: GraphNode | undefined): string | undefined {
  if (node?.symbol === 'uml-actor') return 'actor';
  if (node?.symbol === 'uml-participant') return 'participant';
  return node?.type;
}

/**
 * The diagram font, and each participant header's font after symbol or type
 * overrides (`uml-participant`/`uml-actor`, `participant`/`actor`).
 */
export function resolveSequenceFonts(graph: SequenceGraph, options: SequenceLayoutOptions = {}): {
  font: SequenceFont; messageFont: SequenceFont;
  participants: Map<string, SequenceFont>; faces: FontFaceRequest[];
} {
  const portable = options.fontSettings !== undefined || options.fontWeight !== undefined ||
    options.messageFontWeight !== undefined || options.lineHeight !== undefined;
  const resolve = (node?: GraphNode, weightOverride?: RenderFontWeight): SequenceFont => {
    if (!portable) {
      const size = positive(options.fontSize) ? options.fontSize : 12;
      return { ...(options.fontFamily ? { cssFamily: options.fontFamily } : {}), size, lineHeight: Math.ceil(size * 1.4) };
    }
    const base = resolveDiagramFont(options.fontSettings,
      node?.symbol ?? (node?.type ? `uml-${node.type}` : undefined), node?.type);
    const font = resolveFont({
      family: options.fontFamily?.trim() ? options.fontFamily : base.requestedFamily,
      size: positive(options.fontSize) ? options.fontSize : base.size,
      weight: weightOverride ?? options.fontWeight ?? base.weight,
      lineHeight: positive(options.lineHeight) ? options.lineHeight : base.lineHeight,
    });
    return {
      cssFamily: font.cssFamily, size: font.size, weight: font.weight,
      lineHeight: Math.ceil(font.size * font.lineHeight), face: { id: font.id, weight: font.weight },
    };
  };
  const font = resolve();
  const messageFont = options.messageFontWeight === undefined ? font
    : resolve(undefined, options.messageFontWeight);
  const participants = new Map(graph.nodes.map((node) => [node.id, resolve(node)] as const));
  const faces = new Map<string, FontFaceRequest>();
  for (const candidate of [font, messageFont, ...participants.values()]) {
    if (candidate.face) faces.set(`${candidate.face.id}:${candidate.face.weight}`, candidate.face);
  }
  // Fragment keywords draw in the bold face of the diagram font.
  if (font.face) faces.set(`${font.face.id}:700`, { id: font.face.id, weight: 700 });
  return { font, messageFont, participants, faces: [...faces.values()] };
}

export interface SequencePoint { x: number; y: number; }
export interface SequenceBox { x: number; y: number; width: number; height: number; }
export interface SequenceText { lines: string[]; x: number; y: number; anchor: 'start' | 'middle'; }

export interface SequenceSceneParticipant {
  id: string;
  /** The header label font (the diagram font unless a participant override applies). */
  font: SequenceFont;
  kind: 'participant' | 'actor';
  header: SequenceBox;
  label: SequenceText;
  lifeline: { x: number; y1: number; y2: number };
  accessibleName: string;
}

export interface SequenceSceneMessage {
  id: string;
  kind: 'synchronous' | 'asynchronous' | 'return' | 'create' | 'destroy';
  sourceId: string;
  targetId: string;
  self: boolean;
  points: SequencePoint[];
  dashed: boolean;
  head: 'filled' | 'open';
  label?: SequenceText;
  labelBounds?: SequenceBox;
  accessibleName: string;
}

export interface SequenceSceneActivation extends SequenceBox { id: string; participantId: string; accessibleName: string; }
export interface SequenceSceneNote extends SequenceBox { id: string; text: SequenceText; accessibleName: string; }
export interface SequenceSceneRegion extends SequenceBox {
  id: string;
  headingHeight: number;
  label?: SequenceText;
  accessibleName: string;
}
export interface SequenceSceneGroup extends SequenceBox {
  id: string;
  participantIds: string[];
  label?: SequenceText;
  /** Visible identity when there is no authored label; never a semantic label. */
  identifier?: SequenceText;
  members: Array<{ id: string; x: number }>;
  spans: Array<{ x1: number; x2: number; y: number }>;
  accessibleName: string;
}
export interface SequenceSceneFragment extends SequenceBox {
  id: string;
  kind: 'loop' | 'alt' | 'opt' | 'critical' | 'break' | 'par';
  tab: SequenceBox & { text: SequenceText };
  operands: { id: string; separatorY?: number; guard?: SequenceText }[];
  accessibleName: string;
}

export interface SequenceScene {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  /** The diagram text font. */
  font: SequenceFont;
  messageFont: SequenceFont;
  /** Portable faces the scene draws with; empty for legacy unembedded text. */
  faces: FontFaceRequest[];
  title: string;
  description: string;
  participants: SequenceSceneParticipant[];
  messages: SequenceSceneMessage[];
  activations: SequenceSceneActivation[];
  notes: SequenceSceneNote[];
  fragments: SequenceSceneFragment[];
  regions?: SequenceSceneRegion[];
  groups?: SequenceSceneGroup[];
  /** Visual rendering mode for sequence regions, participant groups, and frames ('shaded' default). */
  groupStyle?: SequenceGroupStyle;
}

export function isSequenceRenderGraph(graph: SequenceGraph): boolean {
  return effectiveGraphNotationId028(graph) === UML_SEQUENCE_NOTATION && graph.interaction !== undefined;
}

const KIND_NAME = { synchronous: 'synchronous', asynchronous: 'asynchronous', return: 'return', create: 'creation', destroy: 'destruction' } as const;

/**
 * Ids compare numerically on a shared `<prefix>-N` form, otherwise by code
 * unit. Kept identical to the language package's comparator (the packages do
 * not depend on each other); both are pinned by the same test cases.
 */
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

function invalid(reason: string): never {
  throw new Error(`coral.sequence.layout.invalid: ${reason}`);
}

/**
 * Structural preconditions of the layout. Meaning is never skipped: an
 * interaction that fails them is refused. The language validator is the
 * complete authority and callers must run it before rendering.
 */
function checkInteraction(graph: SequenceGraph, interaction: Interaction): void {
  const nodes = new Set(graph.nodes.map((node) => node.id));
  const edges = new Set(graph.edges.map((edge) => edge.id));
  const participants = new Set(interaction.participants.map((participant) => participant.id));
  const messages = new Map(interaction.messages.map((message) => [message.id, message]));
  const complete = (order: readonly string[], ids: Set<string> | Map<string, unknown>) =>
    order.length === ids.size && new Set(order).size === order.length && order.every((id) => ids.has(id));
  if (!complete(interaction.participantOrder, participants)) invalid('participantOrder is incomplete');
  if (!complete(interaction.messageOrder, messages)) invalid('messageOrder is incomplete');
  for (const participant of interaction.participants) if (!nodes.has(participant.nodeId)) invalid(`participant ${participant.id} has no node`);
  for (const message of interaction.messages) {
    if (message.kind !== undefined &&
      !['synchronous', 'asynchronous', 'return', 'create', 'destroy'].includes(message.kind))
      invalid(`unsupported sequence message kind ${message.kind}; cannot display without loss`);
    if (!edges.has(message.edgeId) || !participants.has(message.sourceParticipantId) || !participants.has(message.targetParticipantId)) {
      invalid(`message ${message.id} has an unresolved reference`);
    }
  }
  const terminal = new Map<string, number>();
  const order = interaction.messageOrder.map((id) => messages.get(id)!);
  for (const [index, message] of order.entries()) {
    if (terminal.has(message.sourceParticipantId) || terminal.has(message.targetParticipantId))
      invalid(`message ${message.id} uses a destroyed participant`);
    if (message.kind === 'destroy') terminal.set(message.targetParticipantId, index);
  }
  for (const activation of interaction.activations ?? []) {
    if (!participants.has(activation.participantId) || !messages.has(activation.startMessageId) || !messages.has(activation.endMessageId)) {
      invalid(`activation ${activation.id} has an unresolved reference`);
    }
    const end = interaction.messageOrder.indexOf(activation.endMessageId);
    if (terminal.has(activation.participantId) && end >= terminal.get(activation.participantId)!)
      invalid(`activation ${activation.id} reaches or passes its participant's destruction`);
  }
  for (const note of interaction.notes ?? []) {
    if (!(note.participantIds?.length || note.messageIds?.length)
        || (note.participantIds ?? []).some((id) => !participants.has(id)) || (note.messageIds ?? []).some((id) => !messages.has(id))) {
      invalid(`note ${note.id} is unanchored or has an unresolved target`);
    }
  }
  const position = new Map(interaction.messageOrder.map((id, index) => [id, index]));
  const owned = new Set<string>();
  for (const fragment of interaction.fragments ?? []) {
    const indexes = fragment.operands.flatMap((operand) => operand.messageIds.map((id) => position.get(id) ?? -1));
    if (indexes.length === 0 || indexes.some((index, at) => index < 0 || at > 0 && index !== indexes[at - 1] + 1)) {
      invalid(`fragment ${fragment.id} is not one contiguous message range`);
    }
    for (const operand of fragment.operands) {
      for (const id of operand.messageIds) {
        if (messages.get(id)?.kind === 'destroy') invalid(`destruction ${id} must occur in the root timeline`);
        if (owned.has(id)) invalid(`message ${id} belongs to more than one fragment`);
        owned.add(id);
      }
    }
  }
}

function placedSelfLoopWidth028(width: number, placement?: EdgeLabelPlacement, drop = 20): number {
  if (!placement || width === 0) return 30;
  const fraction = Math.min(placement.at ?? .5, 1 - (placement.at ?? .5));
  if (fraction <= 0) return 30;
  const left = placement.side === 'left' ? width + (placement.offset ?? 0) + 14 :
    placement.side === 'right' ? 14 : width / 2 + 14;
  const loop = Math.max(30, left, (left / fraction - drop) / 2);
  if (!Number.isFinite(loop)) invalid('authored self-message label requires non-finite lane spacing');
  return loop;
}

function placedSelfLoopDrop028(height: number, placement?: EdgeLabelPlacement): number {
  if (!placement) return 20;
  const extent = placement.side === 'above' || placement.side === 'below'
    ? 2 * (height + (placement.offset ?? 0)) : height;
  return Math.max(20, extent + 24);
}

/**
 * Lay out a sequence interaction. A structurally unusable interaction throws
 * `coral.sequence.layout.invalid`; callers run the language validator first.
 */
export function layoutSequence(graph: SequenceGraph, options: SequenceLayoutOptions = {}): SequenceScene {
  const authoredRoute = graph.edges.find((edge) => edge.routeIntent !== undefined);
  if (authoredRoute) throw new Error(`render.capability.scene-layout: Sequence message ${authoredRoute.id} authored route intent is not executable`);
  for (const edge of graph.edges) if (edge.labelPlacement)
    authoredEdgeLabelBox028([{ x: 0, y: 0 }], edge.labelPlacement, 0, 0);
  const unplaced = layoutSequenceUnplaced028(graph, options);
  const scene = graph.sourceTimeline028?.groups
    ? placeSequenceGroups028(unplaced, graph.sourceTimeline028.groups, options.padding ?? 24) : unplaced;
  const withStyle: SequenceScene = { ...scene, groupStyle: options.groupStyle ?? scene.groupStyle ?? 'shaded' };
  return graph.edges.some((edge) => edge.labelPlacement !== undefined)
    ? placeSequenceLabels028(withStyle, graph, options.padding ?? 24) : withStyle;
}

function layoutSequenceUnplaced028(graph: SequenceGraph, options: SequenceLayoutOptions): SequenceScene {
  if (graph.sourceTimeline028) {
    const base = layoutSequenceUnplaced028({ ...graph, sourceTimeline028: undefined, recursiveFragments028: undefined }, options);
    return layoutSourceTimeline028(base, graph.sourceTimeline028);
  }
  if (graph.recursiveFragments028) {
    const base = layoutSequenceUnplaced028({ ...graph, recursiveFragments028: undefined }, options);
    return layoutRecursiveFragments028(base, graph.recursiveFragments028);
  }
  const padding = options.padding ?? 24;
  const fonts = resolveSequenceFonts(graph, options);
  const font = fonts.font;
  const messageFont = fonts.messageFont;
  const fontSize = font.size;
  const lineHeight = font.lineHeight;
  const measure = (text: string, with_: SequenceFont = font) =>
    measureText({ text, fontSize: with_.size, fontFamily: with_.cssFamily, fontWeight: with_.weight });
  const measureMessage = (text: string, placement?: EdgeLabelPlacement) => placement
    ? measureEdgeLabel028({ text, fontSize: messageFont.size, fontFamily: messageFont.cssFamily,
      fontWeight: messageFont.weight, lineHeight: messageFont.lineHeight / messageFont.size })
    : measure(text, messageFont);
  const interaction = graph.interaction ?? { participants: [], participantOrder: [], messages: [], messageOrder: [] };
  checkInteraction(graph, interaction);

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const participantById = new Map(interaction.participants.map((participant) => [participant.id, participant]));
  const participantIds = interaction.participantOrder.filter((id) => participantById.has(id));
  const column = new Map(participantIds.map((id, index) => [id, index]));
  const messageById = new Map(interaction.messages.map((message) => [message.id, message]));
  // checkInteraction guarantees every reference below resolves.
  const messages = interaction.messageOrder.map((id) => messageById.get(id)!);
  const position = new Map(messages.map((message, index) => [message.id, index]));
  const labelOf = (id: string) => {
    const node = nodeById.get(participantById.get(id)?.nodeId ?? '');
    return node?.label ?? node?.id ?? id;
  };
  const messageLabel = (message: InteractionMessage) => edgeById.get(message.edgeId)?.label;

  // Headers and columns.
  const headers = participantIds.map((id) => {
    const node = nodeById.get(participantById.get(id)!.nodeId);
    const headerFont = fonts.participants.get(node?.id ?? '') ?? font;
    const text = measure(labelOf(id), headerFont);
    const actor = sequenceParticipantVisualType(node) === 'actor';
    const width = Math.max(96, text.width + 24);
    const boxHeight = Math.max(36, text.lines.length * headerFont.lineHeight + 18);
    return { id, actor, width, lines: text.lines, font: headerFont, height: (actor ? 30 : 0) + boxHeight };
  });
  const gaps = headers.slice(1).map((header, index) => (headers[index].width + header.width) / 2 + 40);
  const centers = () => {
    const result: number[] = [];
    headers.forEach((header, index) => result.push(index === 0 ? padding + header.width / 2 : result[index - 1] + gaps[index - 1]));
    return result;
  };
  for (const message of messages) {
    const label = messageLabel(message);
    const placement = edgeById.get(message.edgeId)?.labelPlacement;
    const measured = label ? measureMessage(label, placement) : undefined;
    const width = measured?.width ?? 0;
    const a = column.get(message.sourceParticipantId)!;
    const b = column.get(message.targetParticipantId)!;
    const x = centers();
    if (a === b) {
      if (a < gaps.length) gaps[a] += Math.max(0,
        placedSelfLoopWidth028(width, placement, placedSelfLoopDrop028(measured?.height ?? 0, placement)) + width + 22 - gaps[a]);
    } else {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const creationTargetHalfWidth = message.kind === 'create' ? headers[b].width / 2 : 0;
      let requiredWidth = Math.max(width + 32,
        edgeProximity028(edgeById.get(message.edgeId)!) > 1
          ? (headers[lo].width + headers[hi].width) / 2
            + proximityClearance028(40, edgeProximity028(edgeById.get(message.edgeId)!)) : 0);
      if (placement && width) {
        const fraction = a < b ? placement.at ?? .5 : 1 - (placement.at ?? .5);
        const offset = placement.offset ?? 0;
        const left = placement.side === 'left' ? width + offset + 14 :
          placement.side === 'right' ? 14 : width / 2 + 14;
        const right = placement.side === 'right' ? width + offset + 14 :
          placement.side === 'left' ? 14 : width / 2 + 14;
        // Endpoint/outward placements may deliberately live outside the lanes;
        // their exact postpass checks still apply. Interior placements reserve
        // enough lane distance for their measured box at the authored fraction.
        if (fraction > 0 && fraction < 1) requiredWidth = Math.max(requiredWidth,
          left / fraction, right / (1 - fraction));
      }
      if (!Number.isFinite(requiredWidth)) invalid('authored message label requires non-finite lane spacing');
      gaps[hi - 1] += Math.max(0, requiredWidth + creationTargetHalfWidth - (x[hi] - x[lo]));
    }
  }
  const x = centers();
  const headerBottom = padding + Math.max(0, ...headers.map((header) => header.height));

  // Anchors: notes by their last targeted message; participant-only notes at the top.
  const notes = [...(interaction.notes ?? [])].sort((a, b) => compareIds(a.id, b.id));
  const anchorOf = (note: (typeof notes)[number]) =>
    Math.max(-1, ...(note.messageIds ?? []).map((id) => position.get(id)!));
  const notesAt = new Map<number, typeof notes>();
  for (const note of notes) {
    const anchor = anchorOf(note);
    notesAt.set(anchor, [...(notesAt.get(anchor) ?? []), note]);
  }

  // Fragments by message range; operand index of each message.
  const fragmentInfo = (interaction.fragments ?? []).map((fragment) => {
    const indexes = fragment.operands.flatMap((operand) => operand.messageIds.map((id) => position.get(id)!));
    const operandOf = new Map<number, number>();
    fragment.operands.forEach((operand, index) => operand.messageIds.forEach((id) => operandOf.set(position.get(id)!, index)));
    return { fragment, start: Math.min(...indexes), end: Math.max(...indexes), operandOf };
  });
  const fragmentStarting = new Map(fragmentInfo.map((info) => [info.start, info]));
  const fragmentEnding = new Map(fragmentInfo.map((info) => [info.end, info]));

  const sceneNotes: SequenceSceneNote[] = [];
  const noteColumns = (note: (typeof notes)[number]) => [
    ...(note.participantIds ?? []).map((id) => x[column.get(id)!]),
    ...(note.messageIds ?? []).flatMap((id) => {
      const message = messages[position.get(id)!];
      return [x[column.get(message.sourceParticipantId)!], x[column.get(message.targetParticipantId)!]];
    }),
  ];
  let y = headerBottom + 20;
  const placeNote = (note: (typeof notes)[number]) => {
    const text = measure(note.text);
    const span = noteColumns(note);
    const minX = Math.min(...span);
    const maxX = Math.max(...span);
    const width = Math.max(80, text.width + 16, maxX - minX + 32);
    const height = text.lines.length * lineHeight + 12;
    const left = (minX + maxX) / 2 - width / 2;
    const targets = [
      ...(note.participantIds ?? []).map(labelOf),
      ...(note.messageIds ?? []).map((id) => `message ${position.get(id)! + 1}`),
    ];
    sceneNotes.push({
      id: note.id, x: left, y, width, height,
      text: { lines: text.lines, x: left + 8, y: y + 6 + lineHeight - 4, anchor: 'start' },
      accessibleName: `Note on ${targets.join(', ')}: ${note.text}`,
    });
    y += height + 10;
  };
  for (const note of notesAt.get(-1) ?? []) placeNote(note);

  const arrowY: { start: number; end: number }[] = [];
  const labels: (SequenceText | undefined)[] = [];
  const frames = new Map<string, { top: number; bottom: number; operands: SequenceSceneFragment['operands'] }>();
  const fragmentTabHeight = Math.max(20, lineHeight + 8);
  let current: { info: (typeof fragmentInfo)[number]; operand: number } | undefined;
  const openOperand = (info: (typeof fragmentInfo)[number], index: number, empty: boolean) => {
    const operand = info.fragment.operands[index];
    const record: SequenceSceneFragment['operands'][number] = { id: operand.id };
    if (index > 0) { record.separatorY = y; y += 8; }
    if (operand.guard) {
      const lines = measure(`[${operand.guard.text}]`).lines;
      record.guard = { lines, x: 0, y: y + lineHeight - 4, anchor: 'start' };
      y += (lines.length - 1) * lineHeight + 18;
    }
    if (empty) y += 24;
    frames.get(info.fragment.id)!.operands.push(record);
  };
  const advance = (to: number) => {
    while (current && current.operand < to) {
      current.operand++;
      openOperand(current.info, current.operand, current.operand < to || !current.info.operandOf.size
        || ![...current.info.operandOf.values()].includes(current.operand));
    }
  };

  messages.forEach((message, index) => {
    const starting = fragmentStarting.get(index);
    if (starting) {
      frames.set(starting.fragment.id, { top: y, bottom: y, operands: [] });
      y += fragmentTabHeight + 4;
      current = { info: starting, operand: -1 };
    }
    if (current) advance(current.info.operandOf.get(index) ?? current.operand);

    const label = messageLabel(message);
    const placement = edgeById.get(message.edgeId)?.labelPlacement;
    const text = label ? measureMessage(label, placement) : undefined;
    const lines = text?.lines.length ?? 0;
    const a = column.get(message.sourceParticipantId)!;
    const b = column.get(message.targetParticipantId)!;
    const lineY = y + Math.max(1, lines) * lineHeight + 10;
    const drop = placedSelfLoopDrop028(text?.height ?? 0, placement);
    if (a === b) {
      arrowY.push({ start: lineY, end: lineY + drop });
      labels.push(text ? { lines: text.lines, x: x[a] + 36, y: y + lineHeight, anchor: 'start' } : undefined);
      y = lineY + drop + 8;
    } else {
      arrowY.push({ start: lineY, end: lineY });
      const labelTargetX = message.kind === 'create'
        ? x[b] + (b > a ? -1 : 1) * headers[b].width / 2 : x[b];
      labels.push(text ? { lines: text.lines, x: (x[a] + labelTargetX) / 2,
        y: y + lineHeight, anchor: 'middle' } : undefined);
      y = lineY + 8;
    }
    if (text && placement) {
      const anchorY = lineY + (a === b ? drop : 0);
      const placed = authoredEdgeLabelBox028([{ x: 0, y: anchorY }], placement,
        text.width, text.height);
      y = Math.max(y, placed.y + placed.height + 12);
    }
    if (message.kind === 'create') y = Math.max(y, lineY + headers[b].height / 2 + 12);
    for (const note of notesAt.get(index) ?? []) placeNote(note);

    const ending = fragmentEnding.get(index);
    if (ending && current?.info === ending) {
      advance(ending.fragment.operands.length - 1);
      y += 12;
      frames.get(ending.fragment.id)!.bottom = y;
      y += 8;
      current = undefined;
    }
  });

  // Creation starts the receiving participant at the message row. Keep the
  // participant identity even when its declaration appears elsewhere.
  const createdAt = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.kind === 'create' && !createdAt.has(message.targetParticipantId)) {
      createdAt.set(message.targetParticipantId, index);
    }
  });
  const headerTop = (id: string) => {
    const index = createdAt.get(id);
    if (index === undefined) return padding;
    return arrowY[index].end - headers[column.get(id)!].height / 2;
  };

  // Activations in canonical order; each takes the smallest level unused by an
  // earlier intersecting activation of the same participant (DR70-D2).
  const activations = (interaction.activations ?? [])
    .map((activation) => ({ activation, start: position.get(activation.startMessageId)!, end: position.get(activation.endMessageId)! }))
    .sort((a, b) => a.start - b.start || a.end - b.end
      || column.get(a.activation.participantId)! - column.get(b.activation.participantId)!
      || compareIds(a.activation.id, b.activation.id));
  const sceneActivations: SequenceSceneActivation[] = [];
  const barAt = new Map<string, SequenceSceneActivation[]>();
  const levels: number[] = [];
  activations.forEach((entry, index) => {
    const { activation, start, end } = entry;
    const used = new Set(activations.slice(0, index).flatMap((other, at) => other.activation.participantId === activation.participantId
      && other.start <= end && start <= other.end ? [levels[at]] : []));
    let depth = 0;
    while (used.has(depth)) depth++;
    levels.push(depth);
    const top = start === end && messages[start].sourceParticipantId !== messages[start].targetParticipantId
      ? arrowY[start].start - 8 : arrowY[start].start;
    const bottom = start === end && messages[start].sourceParticipantId !== messages[start].targetParticipantId
      ? arrowY[end].end + 8 : arrowY[end].end;
    const bar: SequenceSceneActivation = {
      id: activation.id, participantId: activation.participantId,
      x: x[column.get(activation.participantId)!] - 5 + depth * 5, y: top, width: 10, height: bottom - top,
      accessibleName: `Activation of ${labelOf(activation.participantId)} from message ${start + 1} to message ${end + 1}`,
    };
    sceneActivations.push(bar);
    for (let k = start; k <= end; k++) {
      const key = `${activation.participantId}|${k}`;
      barAt.set(key, [...(barAt.get(key) ?? []), bar]);
    }
  });
  const edgeX = (participant: string, index: number, side: 'left' | 'right') => {
    const bars = barAt.get(`${participant}|${index}`);
    const center = x[column.get(participant)!];
    if (!bars?.length) return center;
    const bar = bars.reduce((deepest, candidate) => (candidate.x > deepest.x ? candidate : deepest));
    return side === 'left' ? bar.x : bar.x + bar.width;
  };

  const sceneMessages: SequenceSceneMessage[] = messages.map((message, index) => {
    const a = column.get(message.sourceParticipantId)!;
    const b = column.get(message.targetParticipantId)!;
    const kind = message.kind === 'asynchronous' || message.kind === 'return' || message.kind === 'create' || message.kind === 'destroy'
      ? message.kind : 'synchronous';
    let points: SequencePoint[];
    if (a === b) {
      const from = edgeX(message.sourceParticipantId, index, 'right');
      // The loop stays at least 25 px wide beyond the deepest active bar.
      const loop = Math.max(x[a] + placedSelfLoopWidth028(
        measureMessage(messageLabel(message) ?? '', edgeById.get(message.edgeId)?.labelPlacement).width,
        edgeById.get(message.edgeId)?.labelPlacement, arrowY[index].end - arrowY[index].start), from + 25);
      // The label follows its loop so deep stacking never draws it over the loop.
      if (labels[index]) labels[index] = { ...labels[index]!, x: loop + 6 };
      points = [
        { x: from, y: arrowY[index].start }, { x: loop, y: arrowY[index].start },
        { x: loop, y: arrowY[index].end }, { x: kind === 'destroy' ? x[a] : from, y: arrowY[index].end },
      ];
    } else {
      const rightward = b > a;
      const targetX = kind === 'create'
        ? x[b] + (rightward ? -1 : 1) * headers[b].width / 2
        : kind === 'destroy' ? x[b] : edgeX(message.targetParticipantId, index, rightward ? 'left' : 'right');
      points = [
        { x: edgeX(message.sourceParticipantId, index, rightward ? 'right' : 'left'), y: arrowY[index].start },
        { x: targetX, y: arrowY[index].end },
      ];
    }
    const label = messageLabel(message);
    return {
      id: message.id, kind, sourceId: message.sourceParticipantId, targetId: message.targetParticipantId,
      self: a === b, points, dashed: kind === 'return' || kind === 'create', head: kind === 'synchronous' ? 'filled' : 'open',
      ...(labels[index] ? { label: labels[index] } : {}),
      accessibleName: `Message ${index + 1} of ${messages.length}: ${labelOf(message.sourceParticipantId)} to `
        + `${labelOf(message.targetParticipantId)}, ${KIND_NAME[kind]}${label ? `, "${label}"` : ''}`,
    };
  });

  // Fragment frames cover their messages, anchored notes, labels, and guards.
  const sceneFragments: SequenceSceneFragment[] = fragmentInfo.map((info) => {
    const frame = frames.get(info.fragment.id)!;
    let left = Infinity;
    let right = -Infinity;
    const firstLifeline = Math.min(...x);
    for (let index = info.start; index <= info.end; index++) {
      const message = messages[index];
      for (const participant of [message.sourceParticipantId, message.targetParticipantId]) {
        const lifeline = x[column.get(participant)!];
        left = Math.min(left, lifeline - 24);
        right = Math.max(right, lifeline + 24);
      }
      const label = sceneMessages[index].label;
      if (message.sourceParticipantId === message.targetParticipantId) {
        const width = label ? Math.max(...label.lines.map((line) => measureMessage(line).width)) : 0;
        right = Math.max(right, (label?.x ?? x[column.get(message.sourceParticipantId)!] + 36) + width + 8);
      }
    }
    for (const note of sceneNotes) {
      const source = notes.find((candidate) => candidate.id === note.id)!;
      const anchor = anchorOf(source);
      if (anchor >= info.start && anchor <= info.end) {
        left = Math.min(left, note.x - 8);
        right = Math.max(right, note.x + note.width + 8);
      }
    }
    const tabText = measure(info.fragment.kind, { ...font, weight: font.weight === undefined ? undefined : 700 });
    const tab = { width: tabText.width + 16, height: fragmentTabHeight };
    const guardWidth = Math.max(0, ...frame.operands.map((operand) =>
      operand.guard ? Math.max(...operand.guard.lines.map((line) => measure(line).width)) : 0));
    // Guards occupy the margin before the first involved lifeline. Reserve
    // their measured text width instead of painting through that lifeline.
    left = Math.min(left, firstLifeline - guardWidth - 16);
    right = Math.max(right, left + Math.max(tab.width, guardWidth + 16) + 24);
    for (const operand of frame.operands) if (operand.guard) operand.guard.x = left + 8;
    const guards = info.fragment.operands.map((operand) => (operand.guard ? `[${operand.guard.text}]` : 'no guard'));
    return {
      id: info.fragment.id, kind: info.fragment.kind, x: left, y: frame.top, width: right - left, height: frame.bottom - frame.top,
      tab: { x: left, y: frame.top, ...tab, text: { lines: [info.fragment.kind], x: left + 8, y: frame.top + lineHeight - 1, anchor: 'start' } },
      operands: frame.operands,
      accessibleName: `${info.fragment.kind} fragment, messages ${info.start + 1} to ${info.end + 1}, operands: ${guards.join(', ')}`,
    };
  });

  const destroyedAt = new Map(messages.flatMap((message, index) => message.kind === 'destroy'
    ? [[message.targetParticipantId, { id: message.id, index }] as const] : []));
  const lifelineEnd = Math.max(y + 8, headerBottom + 48,
    ...participantIds.map((id) => headerTop(id) + headers[column.get(id)!].height + 48));
  const participants: SequenceSceneParticipant[] = headers.map((header, index) => {
    const top = headerTop(header.id);
    const boxTop = top + (header.actor ? 30 : 0);
    const boxHeight = header.height - (header.actor ? 30 : 0);
    return {
      id: header.id,
      font: header.font,
      kind: header.actor ? 'actor' : 'participant',
      header: { x: x[index] - header.width / 2, y: top, width: header.width, height: header.height },
      label: {
        lines: header.lines, x: x[index],
        y: boxTop + (boxHeight - header.lines.length * header.font.lineHeight) / 2 + header.font.lineHeight - 4, anchor: 'middle',
      },
      lifeline: { x: x[index], y1: top + header.height,
        y2: destroyedAt.has(header.id) ? arrowY[destroyedAt.get(header.id)!.index].end : lifelineEnd },
      accessibleName: `${header.actor ? 'Actor' : 'Participant'} ${index + 1} of ${headers.length}: ${labelOf(header.id)}${destroyedAt.has(header.id)
        ? `, lifeline destroyed by message ${destroyedAt.get(header.id)!.id}` : ''}`,
    };
  });

  // Normalize: shift so nothing sits left of the padding, and round.
  const lefts = [
    ...participants.map((participant) => participant.header.x),
    ...sceneNotes.map((note) => note.x),
    ...sceneFragments.map((fragment) => fragment.x),
    ...sceneMessages.flatMap((message) => message.label?.anchor === 'middle'
      ? message.label.lines.map((line) => message.label!.x - measureMessage(line).width / 2) : []),
  ];
  const shift = padding - Math.min(padding, ...lefts);
  const rights = [
    ...participants.map((participant) => participant.header.x + participant.header.width),
    ...sceneNotes.map((note) => note.x + note.width),
    ...sceneFragments.map((fragment) => fragment.x + fragment.width),
    ...sceneMessages.flatMap((message) => message.label ? message.label.lines.map((line) =>
      message.label!.x + (message.label!.anchor === 'middle' ? measureMessage(line).width / 2 : measureMessage(line).width)) : []),
    ...sceneMessages.flatMap((message) => message.points.map((point) => point.x)),
  ];
  const r = (value: number) => Math.round(value);
  const moveText = (text: SequenceText): SequenceText => ({ ...text, x: r(text.x + shift), y: r(text.y) });
  const moveBox = <T extends SequenceBox>(box: T): T => ({
    ...box, x: r(box.x + shift), y: r(box.y), width: r(box.width), height: r(box.height),
  });

  return {
    width: r(Math.max(...rights, padding) + shift + padding),
    height: r(lifelineEnd + padding),
    fontSize,
    lineHeight,
    font,
    messageFont,
    faces: fonts.faces,
    title: graph.name ?? graph.id ?? 'Sequence diagram',
    description: `Sequence diagram with ${participants.length} participant${participants.length === 1 ? '' : 's'} and ${messages.length} message${messages.length === 1 ? '' : 's'}`,
    participants: participants.map((participant) => ({
      ...participant,
      header: moveBox(participant.header),
      label: moveText(participant.label),
      lifeline: { x: r(participant.lifeline.x + shift), y1: r(participant.lifeline.y1), y2: r(participant.lifeline.y2) },
    })),
    messages: sceneMessages.map((message) => ({
      ...message,
      points: message.points.map((point) => ({ x: r(point.x + shift), y: r(point.y) })),
      ...(message.label ? { label: moveText(message.label) } : {}),
    })),
    activations: sceneActivations.map(moveBox),
    notes: sceneNotes.map((note) => ({ ...moveBox(note), text: moveText(note.text) })),
    fragments: sceneFragments.map((fragment) => ({
      ...moveBox(fragment),
      tab: { ...moveBox(fragment.tab), text: moveText(fragment.tab.text) },
      operands: fragment.operands.map((operand) => ({
        id: operand.id,
        ...(operand.separatorY !== undefined ? { separatorY: r(operand.separatorY) } : {}),
        ...(operand.guard ? { guard: moveText(operand.guard) } : {}),
      })),
    })),
  };
}

/** Add recursive, source-ordered alternative frames to the common sequence
 * scene. The baseline lays out each message once; this pass reserves space for
 * nested tabs, guards, and separators without changing message identity. */
function layoutRecursiveFragments028(base: SequenceScene, tree: SequenceDisplayTree028): SequenceScene {
  if (base.notes.length || base.activations.length || base.fragments.length) {
    invalid('recursive alternatives cannot be combined with legacy sequence decorations');
  }
  const byFragment = new Map(tree.fragments.map((fragment) => [fragment.id, fragment]));
  if (byFragment.size !== tree.fragments.length) invalid('duplicate recursive fragment identity');
  const events: Array<
    | { kind: 'open' | 'close'; id: string; depth: number }
    | { kind: 'operand'; id: string; index: number; depth: number }
    | { kind: 'message'; id: string; depth: number }
  > = [];
  const visited = new Set<string>();
  const walk = (items: SequenceDisplayTree028['items'], depth: number): void => {
    for (const item of items) {
      if (item.kind === 'message') {
        events.push({ kind: 'message', id: item.id, depth });
        continue;
      }
      const fragment = byFragment.get(item.id);
      if (!fragment || visited.has(item.id) || fragment.kind !== 'alt' || fragment.operands.length < 2) {
        invalid('unresolved or repeated recursive alternative');
      }
      visited.add(item.id);
      events.push({ kind: 'open', id: fragment.id, depth });
      fragment.operands.forEach((operand, index) => {
        if (!operand.items.length) invalid(`alternative ${fragment.id} has an empty operand`);
        events.push({ kind: 'operand', id: fragment.id, index, depth });
        walk(operand.items, depth + 1);
      });
      events.push({ kind: 'close', id: fragment.id, depth });
    }
  };
  walk(tree.items, 0);
  if (visited.size !== byFragment.size) invalid('recursive alternative is omitted from the timeline');
  const orderedIds = events.filter((event) => event.kind === 'message').map((event) => event.id);
  if (orderedIds.length !== base.messages.length ||
    orderedIds.some((id, index) => id !== base.messages[index].id)) {
    invalid('recursive alternative changes message order');
  }
  const rowTops = base.messages.map((message) =>
    Math.min(...message.points.map((point) => point.y)) - base.lineHeight - 10);
  const fragmentTabHeight = Math.max(20, base.lineHeight + 8);
  const records = new Map<string, {
    top: number; bottom: number; depth: number;
    operands: SequenceSceneFragment['operands'];
  }>();
  const offsets = new Map<string, number>();
  let offset = 0;
  let index = 0;
  const anchor = () => (rowTops[index] ?? base.height - 24) + offset;
  for (const event of events) {
    if (event.kind === 'open') {
      // Keep the preceding message shaft clear of the new frame's top edge.
      if (index > 0) offset += 8;
      records.set(event.id, { top: anchor() - 4, bottom: 0, depth: event.depth, operands: [] });
      offset += fragmentTabHeight + 4;
    } else if (event.kind === 'operand') {
      const record = records.get(event.id)!;
      const operand = byFragment.get(event.id)!.operands[event.index];
      const display: SequenceSceneFragment['operands'][number] = { id: operand.id };
      if (event.index > 0) {
        display.separatorY = anchor();
        offset += 8;
      }
      const measured = measureText({ text: `[${operand.guard}]`, fontSize: base.font.size,
        fontFamily: base.font.cssFamily, fontWeight: base.font.weight });
      display.guard = { lines: measured.lines, x: 0,
        y: anchor() + base.lineHeight - 4, anchor: 'start' };
      offset += measured.lines.length * base.lineHeight + 12;
      record.operands.push(display);
    } else if (event.kind === 'message') {
      offsets.set(event.id, offset);
      index++;
    } else {
      records.get(event.id)!.bottom = anchor() + 4;
      offset += 18;
    }
  }
  const maxDepth = Math.max(0, ...[...records.values()].map((record) => record.depth));
  const baseMsgById = new Map(base.messages.map((m) => [m.id, m] as const));
  const fragScope = new Map<string, { participants: Set<string>; messages: Set<string> }>();
  const collectFragScope = (items: SequenceDisplayTree028['items']): { participants: Set<string>; messages: Set<string> } => {
    const scope = { participants: new Set<string>(), messages: new Set<string>() };
    for (const item of items) {
      if (item.kind === 'message') {
        scope.messages.add(item.id);
        const msg = baseMsgById.get(item.id);
        if (msg) { scope.participants.add(msg.sourceId); scope.participants.add(msg.targetId); }
      } else {
        const frag = byFragment.get(item.id)!;
        const sub = { participants: new Set<string>(), messages: new Set<string>() };
        for (const op of frag.operands) {
          const opScope = collectFragScope(op.items);
          for (const p of opScope.participants) sub.participants.add(p);
          for (const m of opScope.messages) sub.messages.add(m);
        }
        fragScope.set(item.id, sub);
        for (const p of sub.participants) scope.participants.add(p);
        for (const m of sub.messages) scope.messages.add(m);
      }
    }
    return scope;
  };
  collectFragScope(tree.items);

  const firstParticipant = base.participants.reduce((a, b) => (a.lifeline.x <= b.lifeline.x ? a : b));
  const firstLifeline = firstParticipant.lifeline.x;
  const col0GuardRight = Math.max(0, ...tree.fragments
    .filter((fragment) => {
      const ps = fragScope.get(fragment.id)?.participants;
      return !ps || ps.size === 0 || ps.has(firstParticipant.id);
    })
    .flatMap((fragment) => fragment.operands.map((operand) =>
      16 + records.get(fragment.id)!.depth * 12 + measureText({ text: `[${operand.guard}]`,
        fontSize: base.font.size, fontFamily: base.font.cssFamily,
        fontWeight: base.font.weight }).width)));
  const anyCol0 = tree.fragments.some((fragment) => {
    const ps = fragScope.get(fragment.id)?.participants;
    return !ps || ps.size === 0 || ps.has(firstParticipant.id);
  });
  const horizontalInset = col0GuardRight > 0
    ? Math.max((maxDepth + 1) * 12, col0GuardRight + 8 - firstLifeline)
    : anyCol0 ? (maxDepth + 1) * 12 : 0;
  const shiftedLifelineX = new Map(base.participants.map((p) => [p.id, p.lifeline.x + horizontalInset] as const));
  const sortedLifelines = [...base.participants].map((p) => ({ id: p.id, x: p.lifeline.x + horizontalInset }))
    .sort((a, b) => a.x - b.x);

  const fragments: SequenceSceneFragment[] = tree.fragments.map((fragment) => {
    const record = records.get(fragment.id)!;
    const scope = fragScope.get(fragment.id);
    const xs = scope ? [...scope.participants].map((id) => shiftedLifelineX.get(id)).filter((v): v is number => v !== undefined) : [];
    const hasPs = xs.length > 0;
    const minLifelineX = hasPs ? Math.min(...xs) : (sortedLifelines[0]?.x ?? 40);
    const maxLifelineX = hasPs ? Math.max(...xs) : (sortedLifelines.at(-1)?.x ?? base.width + horizontalInset - 24);
    const pad = Math.max(20, 28 - record.depth * 4);
    let minContentX = minLifelineX - pad;
    let maxContentX = maxLifelineX + pad;
    if (scope) {
      for (const mid of scope.messages) {
        const m = baseMsgById.get(mid);
        if (!m) continue;
        for (const pt of m.points) {
          minContentX = Math.min(minContentX, pt.x + horizontalInset - 14);
          maxContentX = Math.max(maxContentX, pt.x + horizontalInset + 14);
        }
        if (m.self && m.label) {
          const mw = measureText({ text: m.label.lines.join('\n'),
            fontSize: base.messageFont.size, fontFamily: base.messageFont.cssFamily,
            fontWeight: base.messageFont.weight }).width;
          maxContentX = Math.max(maxContentX, m.label.x + horizontalInset + mw + 12);
        }
      }
    }
    const tabWidth = measureText({ text: fragment.kind, fontSize: base.font.size,
      fontFamily: base.font.cssFamily, fontWeight: base.font.weight === undefined ? 700 : base.font.weight }).width + 16;
    const maxGuardW = Math.max(0, ...fragment.operands.map((operand) =>
      measureText({ text: `[${operand.guard}]`, fontSize: base.font.size,
        fontFamily: base.font.cssFamily, fontWeight: base.font.weight }).width));
    const includesCol0 = !hasPs || scope!.participants.has(firstParticipant.id);
    let left: number;
    let guardX: number;
    if (includesCol0) {
      left = 8 + record.depth * 12;
      guardX = left + 8;
    } else {
      const prevLifeline = [...sortedLifelines].reverse().find((l) => l.x < minLifelineX - 1);
      const minAllowedLeft = prevLifeline ? prevLifeline.x + 16 : 8 + record.depth * 12;
      left = Math.max(minAllowedLeft, Math.min(minContentX, minLifelineX - Math.max(tabWidth + 10, 44)));
      guardX = Math.max(left + 8, minLifelineX + 10);
    }
    const right = Math.max(maxContentX, left + tabWidth + 24, guardX + maxGuardW + 14);
    const guards = fragment.operands.map((operand) => `[${operand.guard}]`);
    return { id: fragment.id, kind: fragment.kind, x: left, y: record.top,
      width: right - left, height: record.bottom - record.top,
      tab: { x: left, y: record.top, width: tabWidth, height: fragmentTabHeight,
        text: { lines: [fragment.kind], x: left + 8,
          y: record.top + base.lineHeight - 1, anchor: 'start' } },
      operands: record.operands.map((operand) => ({ ...operand,
        ...(operand.guard ? { guard: { ...operand.guard, x: guardX } } : {}) })),
      accessibleName: `alt fragment ${fragment.id}, operands: ${guards.join(', ')}`,
    };
  });
  const width = Math.max(
    base.width + horizontalInset,
    ...fragments.map((f) => f.x + f.width + 16),
  );
  // A creation header is anchored to its message row. Recursive frames add
  // space before that row, so its label and lifeline start move with it.
  const creationOffsets = new Map(base.messages.filter((message) => message.kind === 'create')
    .map((message) => [message.targetId, offsets.get(message.id)!]));
  return { ...base, width, height: base.height + offset,
    description: `${base.description}, with ${fragments.length} alternative${fragments.length === 1 ? '' : 's'}`,
    participants: base.participants.map((participant) => {
      const dy = creationOffsets.get(participant.id) ?? 0;
      return { ...participant,
        header: { ...participant.header, x: participant.header.x + horizontalInset,
          y: participant.header.y + dy },
        label: { ...participant.label, x: participant.label.x + horizontalInset,
          y: participant.label.y + dy },
        lifeline: { x: participant.lifeline.x + horizontalInset,
          y1: participant.lifeline.y1 + dy, y2: participant.lifeline.y2 + offset },
      };
    }),
    messages: base.messages.map((message) => {
      const dy = offsets.get(message.id)!;
      return { ...message,
        points: message.points.map((point) => ({ x: point.x + horizontalInset, y: point.y + dy })),
        ...(message.label ? { label: { ...message.label,
          x: message.label.x + horizontalInset, y: message.label.y + dy } } : {}),
      };
    }),
    fragments,
  };
}

/** One SVG element, JSON-safe, drawn identically by the SVG serializer and the canvas. */
export interface SequencePrimitive {
  tag: 'g' | 'rect' | 'line' | 'polyline' | 'path' | 'text' | 'tspan' | 'title' | 'circle';
  attrs: Record<string, string | number>;
  text?: string;
  children?: SequencePrimitive[];
}

export interface SequenceTheme {
  background: string;
  fill: string;
  stroke: string;
  text: string;
  edge: string;
  noteFill: string;
}

function textPrimitive(text: SequenceText, font: SequenceFont, color: string, extra: Record<string, string | number> = {}): SequencePrimitive {
  return {
    tag: 'text',
    attrs: {
      class: 'coral-font-text',
      x: text.x, y: text.y,
      ...(font.cssFamily ? { 'font-family': font.cssFamily } : {}),
      'font-size': font.size,
      ...(font.weight !== undefined ? { 'font-weight': font.weight } : {}),
      fill: color, 'text-anchor': text.anchor, ...extra,
    },
    children: text.lines.map((line, index) => ({
      tag: 'tspan', attrs: { x: text.x, y: text.y + index * font.lineHeight }, text: line,
    })),
  };
}

function headPrimitive(message: SequenceSceneMessage, color: string, strokeWidth: number): SequencePrimitive {
  const [from, to] = message.points.slice(-2);
  const direction = Math.sign(to.x - from.x) || 1;
  const back = to.x - direction * 9;
  const d = `M ${back} ${to.y - 5} L ${to.x} ${to.y} L ${back} ${to.y + 5}`;
  return message.head === 'filled'
    ? { tag: 'path', attrs: { d: `${d} Z`, fill: color, stroke: color, 'stroke-width': strokeWidth } }
    : { tag: 'path', attrs: { d, fill: 'none', stroke: color, 'stroke-width': strokeWidth } };
}

/** The element tree for a sequence scene, in paint order. */
export function sequencePrimitives(scene: SequenceScene, theme: SequenceTheme,
  style: RenderStyle028 = 'lowfi', groupStyleOverride?: SequenceGroupStyle): SequencePrimitive[] {
  const { strokeWidth } = visualStyle028(style);
  const { font } = scene;
  const groupStyle: SequenceGroupStyle = groupStyleOverride ?? scene.groupStyle ?? 'shaded';
  const shaded = groupStyle === 'shaded';
  const isDark = theme.background.toLowerCase().startsWith('#1') || theme.background.toLowerCase().startsWith('#0') || theme.background.toLowerCase().startsWith('#2');
  const groupFill = isDark ? '#1e293b' : '#edf2f7';
  const groupBorder = isDark ? '#475569' : '#cbd5e1';
  const regionTints = isDark ? ['#1e293b', '#172554'] : ['#f1f5f9', '#eaf1f8'];
  const regionBadgeFill = isDark ? '#334155' : '#e2e8f0';
  const regionBadgeBorder = isDark ? '#64748b' : '#94a3b8';
  const fragmentFill = isDark ? '#0f172a' : '#f8fafc';
  const fragmentTabFill = isDark ? '#334155' : '#e2e8f0';
  const maxLifelineY2 = scene.participants.length
    ? Math.max(...scene.participants.map((p) => p.lifeline.y2))
    : scene.height - 24;
  const title = (text: string): SequencePrimitive => ({ tag: 'title', attrs: {}, text });
  const group = (kind: string, id: string, name: string, children: SequencePrimitive[]): SequencePrimitive => ({
    tag: 'g', attrs: { [`data-coral-sequence-${kind}`]: id, 'aria-label': name }, children: [title(name), ...children],
  });
  // Paint enclosing containers BEFORE lifelines so vertical dashed lifelines
  // always flow continuously without interruption. Region title badges sit in
  // the clear lane between lifelines (tightly sized around the title text).
  const containers = [
    ...(scene.regions ?? []).map((region, rIdx) => {
      const labelMeasured = region.label
        ? measureText({ text: region.label.lines.join('\n'), fontSize: font.size,
          fontFamily: font.cssFamily, fontWeight: font.weight })
        : undefined;
      const badgePadX = 8;
      const badgePadY = 3;
      const badgeW = labelMeasured ? labelMeasured.width + badgePadX * 2 : 0;
      const badgeH = region.label ? region.label.lines.length * font.lineHeight + badgePadY * 2 : 0;
      const badgeX = region.label ? region.label.x - badgePadX : region.x + 8;
      const badgeY = region.label ? region.label.y - font.size - badgePadY + 1 : region.y + 4;
      return { bounds: region, part: group('region', region.id, region.accessibleName, [
        { tag: 'rect', attrs: {
          x: region.x, y: region.y, width: region.width, height: region.height, rx: shaded ? 4 : 0,
          fill: shaded ? regionTints[rIdx % regionTints.length]! : 'none',
          ...(shaded ? { 'fill-opacity': 0.85 } : {}),
          stroke: shaded ? groupBorder : theme.stroke,
          'stroke-width': shaded ? 1 : strokeWidth,
        } },
        ...(region.label ? [
          { tag: 'rect' as const, attrs: {
            x: badgeX, y: badgeY, width: badgeW, height: badgeH, rx: 3,
            fill: shaded ? regionBadgeFill : theme.background,
            stroke: shaded ? regionBadgeBorder : theme.stroke,
            'stroke-width': 1,
          } },
          textPrimitive(region.label, font, theme.text, { 'font-weight': 600 }),
        ] : []),
      ]) };
    }),
    ...scene.fragments.map((fragment) => ({ bounds: fragment, part: group('fragment', fragment.id, fragment.accessibleName, [
      { tag: 'g', attrs: { 'data-coral-fragment-frame': fragment.id,
        'aria-label': `Select ${fragment.accessibleName}` }, children: [
        { tag: 'rect', attrs: {
          x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height,
          fill: shaded ? fragmentFill : 'none',
          ...(shaded ? { 'fill-opacity': 0.45 } : {}),
          stroke: theme.stroke, 'stroke-width': strokeWidth,
        } },
        { tag: 'path', attrs: {
          d: `M ${fragment.tab.x} ${fragment.tab.y} H ${fragment.tab.x + fragment.tab.width} V ${fragment.tab.y + fragment.tab.height - 6} L ${fragment.tab.x + fragment.tab.width - 6} ${fragment.tab.y + fragment.tab.height} H ${fragment.tab.x} Z`,
          fill: shaded ? fragmentTabFill : 'none', stroke: theme.stroke, 'stroke-width': strokeWidth,
        } },
        textPrimitive(fragment.tab.text, font, theme.text, { 'font-weight': font.weight === undefined ? 600 : 700 }),
      ] },
      ...fragment.operands.map((operand, index) => group('operand', operand.id,
        `Operand ${index + 1} of ${fragment.kind} fragment ${fragment.id}`, [
        ...(operand.separatorY !== undefined ? [{ tag: 'line' as const, attrs: {
          x1: fragment.x, y1: operand.separatorY, x2: fragment.x + fragment.width, y2: operand.separatorY,
          stroke: theme.stroke, 'stroke-width': strokeWidth, 'stroke-dasharray': '4 3',
        } }] : []),
        ...(operand.guard ? [textPrimitive(operand.guard, font, theme.text, { 'data-coral-sequence-guard': operand.id })] : []),
      ])),
    ]) })),
  ].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x ||
    b.bounds.height - a.bounds.height).map(({ part }) => part);
  return [
    { tag: 'rect', attrs: { x: 0, y: 0, width: scene.width, height: scene.height, fill: theme.background } },
    ...(scene.groups ?? []).map((entry) => {
      const hasVerticalColumn = entry.spans.length > 0 && scene.participants.length > 0;
      const singleSpan = entry.spans.length === 1;
      const centeredLabel = entry.label && singleSpan
        ? { ...entry.label, x: Math.round((entry.spans[0]!.x1 + entry.spans[0]!.x2) / 2), anchor: 'middle' as const }
        : entry.label;
      const centeredIdent = entry.identifier && singleSpan
        ? { ...entry.identifier, x: Math.round((entry.spans[0]!.x1 + entry.spans[0]!.x2) / 2), anchor: 'middle' as const }
        : entry.identifier;
      return group('group', entry.id, entry.accessibleName, [
        ...(hasVerticalColumn ? entry.spans.map((span): SequencePrimitive => ({
          tag: 'rect',
          attrs: {
            x: span.x1 - 10,
            y: entry.y,
            width: span.x2 - span.x1 + 20,
            height: Math.max(entry.height, maxLifelineY2 + 12 - entry.y),
            rx: shaded ? 4 : 3,
            fill: shaded ? groupFill : 'none',
            stroke: shaded ? groupBorder : theme.stroke,
            'stroke-width': shaded ? 1 : strokeWidth,
          },
        })) : []),
        ...(centeredLabel ? [textPrimitive(centeredLabel, font, theme.text, { 'font-weight': 600 })] : []),
        ...(centeredIdent ? [textPrimitive(centeredIdent, font, theme.text,
          { 'data-coral-group-identifier': entry.id, 'font-weight': 600 })] : []),
        ...(!hasVerticalColumn ? entry.spans.map((span): SequencePrimitive => ({ tag: 'path', attrs: {
          d: `M ${span.x1} ${span.y + 6} V ${span.y} H ${span.x2} V ${span.y + 6}`,
          fill: 'none', stroke: theme.stroke, 'stroke-width': strokeWidth,
        } })) : []),
        ...entry.members.map((member): SequencePrimitive => ({ tag: 'line', attrs: {
          'data-coral-group-member': member.id,
          x1: member.x, x2: member.x, y1: entry.y + entry.height - 8, y2: entry.y + entry.height - 2,
          stroke: hasVerticalColumn ? 'none' : theme.stroke, 'stroke-width': strokeWidth,
        } })),
      ]);
    }),
    ...containers,
    ...scene.participants.map((participant) => group('participant', participant.id, participant.accessibleName, [
      { tag: 'line', attrs: {
        x1: participant.lifeline.x, y1: participant.lifeline.y1, x2: participant.lifeline.x, y2: participant.lifeline.y2,
        stroke: theme.edge, 'stroke-width': strokeWidth, 'stroke-dasharray': '5 4',
      } },
      ...(participant.kind === 'actor' ? actorFigure(participant, theme.stroke) : []),
      { tag: 'rect', attrs: {
        x: participant.header.x, y: participant.header.y + (participant.kind === 'actor' ? 30 : 0),
        width: participant.header.width, height: participant.header.height - (participant.kind === 'actor' ? 30 : 0),
        rx: participant.kind === 'actor' ? 0 : 3,
        fill: participant.kind === 'actor' ? 'none' : theme.fill,
        stroke: participant.kind === 'actor' ? 'none' : theme.stroke, 'stroke-width': strokeWidth,
      } },
      // Legacy text keeps its bold header; a document font keeps its own weight.
      textPrimitive(participant.label, participant.font, theme.text, participant.font.weight === undefined ? { 'font-weight': 600 } : {}),
    ])),
    ...scene.activations.map((activation) => group('activation', activation.id, activation.accessibleName, [
      { tag: 'rect', attrs: { x: activation.x, y: activation.y, width: activation.width, height: activation.height, fill: theme.fill, stroke: theme.stroke, 'stroke-width': strokeWidth } },
    ])),
    ...scene.messages.map((message) => group('message', message.id, message.accessibleName, [
      { tag: 'path', attrs: {
        d: inkRoutePath028(message.points, style), fill: 'none', stroke: theme.edge, 'stroke-width': strokeWidth,
        ...(message.dashed ? { 'stroke-dasharray': visualDashPattern028(message.id, style, 'dashed')! } : {}),
      } },
      headPrimitive(message, theme.edge, strokeWidth),
      ...(message.kind === 'destroy' ? [{ tag: 'path' as const, attrs: {
        'data-coral-destruction': message.targetId, 'data-coral-destruction-message': message.id,
        d: (() => { const p = message.points.at(-1)!;
          return `M ${p.x - 8} ${p.y - 8} L ${p.x + 8} ${p.y + 8} M ${p.x - 8} ${p.y + 8} L ${p.x + 8} ${p.y - 8}`; })(),
        fill: 'none', stroke: theme.edge, 'stroke-width': strokeWidth,
      } }] : []),
      ...(message.labelBounds ? [{ tag: 'rect' as const, attrs: {
        'data-coral-message-label-background': message.id, ...message.labelBounds, fill: theme.background,
      } }] : message.label && message.label.lines.length > 0 ? (() => {
        const measured = measureText({
          text: message.label.lines.join('\n'),
          fontSize: scene.messageFont.size,
          fontFamily: scene.messageFont.cssFamily,
          fontWeight: scene.messageFont.weight,
        });
        const padX = 4;
        const padY = 1;
        const boxW = measured.width + padX * 2;
        const boxH = message.label.lines.length * scene.messageFont.lineHeight + padY * 2;
        const boxX = message.label.anchor === 'middle' ? message.label.x - boxW / 2 : message.label.x - padX;
        const boxY = message.label.y - scene.messageFont.size - padY;
        // Only emit a backdrop halo when a vertical lifeline actually intersects the label box
        // (avoids white cutout boxes over shaded regions on clean adjacent-column messages).
        const crossesLifeline = scene.participants.some((p) =>
          p.lifeline.x >= boxX - 2 && p.lifeline.x <= boxX + boxW + 2
          && boxY + boxH >= p.lifeline.y1 && boxY <= p.lifeline.y2);
        return crossesLifeline
          ? [{ tag: 'rect' as const, attrs: { x: boxX, y: boxY, width: boxW, height: boxH, rx: 2, fill: theme.background } }]
          : [];
      })() : []),
      ...(message.label ? [textPrimitive(message.label, scene.messageFont, theme.text)] : []),
    ])),
    ...scene.notes.map((note) => group('note', note.id, note.accessibleName, [
      { tag: 'path', attrs: {
        d: `M ${note.x} ${note.y} H ${note.x + note.width - 8} L ${note.x + note.width} ${note.y + 8} V ${note.y + note.height} H ${note.x} Z`,
        fill: theme.noteFill, stroke: theme.stroke, 'stroke-width': strokeWidth,
      } },
      textPrimitive(note.text, font, theme.text),
    ])),
  ];
}

function actorFigure(participant: SequenceSceneParticipant, color: string): SequencePrimitive[] {
  const cx = participant.lifeline.x;
  const top = participant.header.y;
  const stroke = { fill: 'none', stroke: color, 'stroke-width': 1.5 };
  return [
    { tag: 'circle', attrs: { cx, cy: top + 5, r: 5, ...stroke } },
    { tag: 'path', attrs: { d: `M ${cx} ${top + 10} V ${top + 20} M ${cx - 8} ${top + 14} H ${cx + 8} M ${cx} ${top + 20} L ${cx - 7} ${top + 28} M ${cx} ${top + 20} L ${cx + 7} ${top + 28}`, ...stroke } },
  ];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function serializeSequencePrimitive(primitive: SequencePrimitive): string {
  // XML normalizes literal attribute whitespace; character references retain
  // the same authored accessible name that React sets on the live canvas.
  const attrs = Object.entries(primitive.attrs).map(([name, value]) => ` ${name}="${escapeXml(String(value))
    .replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;')}"`).join('');
  const body = (primitive.text !== undefined ? escapeXml(primitive.text) : '')
    + (primitive.children ?? []).map(serializeSequencePrimitive).join('');
  return `<${primitive.tag}${attrs}>${body}</${primitive.tag}>`;
}
