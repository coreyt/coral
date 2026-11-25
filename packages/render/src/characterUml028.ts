/** Bounded, source-driven UML character diagrams for Graph IR 3. */
import type { GraphIR } from '@graph-ir/core';
import {
  CharacterRenderError, characterFieldLines028, encodeCharacterField028,
  type CharacterCharset028, type CharacterColumns028, type CharacterDiagnostic028,
} from './characters028.js';
import { finalizeCharacterPreview028 } from './characterRouted028.js';
import { CHARACTER_GLYPH_ROLES_028 as glyph } from './characterGlyphRoles028.js';
import { getEndpointGlyph029 } from './characterEndpoint029.js';
import { renderClassPicture028, type ClassPictureNode028 } from './characterClassPicture028.js';

type RecordValue = Record<string, unknown>;
type Result = ReturnType<typeof finalizeCharacterPreview028>;

function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('character.field.invalid', 'Expected a record.', path);
  }
  return value as RecordValue;
}
function only(value: RecordValue, fields: readonly string[], path: string): void {
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) fail('character.field.unsupported', `Unsupported field ${field}.`, `${path}.${field}`);
  }
}
function name(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.length > 2048) {
    fail('character.field.invalid', 'Expected a bounded nonempty string.', path);
  }
  encodeCharacterField028(value);
  return value;
}
function field(lines: string[], key: string, value: string, columns: number): void {
  lines.push(key);
  lines.push(...characterFieldLines028('L', value, columns));
}
function profile(graph: GraphIR, kind: string): void {
  const root = object(graph, 'graph');
  only(root, kind === 'sequence' ? ['version', 'id', 'name', 'nodes', 'edges', 'metadata', 'profile', 'interaction']
    : ['version', 'id', 'name', 'nodes', 'edges', 'metadata', 'profile'], 'graph');
  const metadata = object(graph.metadata, 'metadata');
  only(metadata, ['notation'], 'metadata');
  const declaredProfile = object(graph.profile, 'profile');
  only(declaredProfile, ['id', 'kind', 'version'], 'profile');
  if (graph.version !== '3.0.0' || graph.metadata?.notation !== `uml-${kind}` ||
      graph.profile?.id !== 'uml' || graph.profile.kind !== kind || graph.profile.version !== '1.0.0') {
    fail('character.profile.unsupported', `Exact UML ${kind} Graph IR 3 profile required.`, 'profile');
  }
  if (graph.nodes.length < 1 || graph.nodes.length > 40 || graph.edges.length > 80) {
    fail('character.size.unsupported', 'Preview accepts 1–40 nodes and at most 80 edges.');
  }
  name(graph.id, 'id');
  if (graph.name !== undefined) name(graph.name, 'name');
}
interface ClassNode extends ClassPictureNode028 { label: string; details: string[] }
function classNode(raw: unknown, index: number): ClassNode {
  const path = `nodes.${index}`;
  const node = object(raw, path);
  only(node, ['id', 'type', 'label', 'classifier'], path);
  const id = name(node.id, `${path}.id`);
  const label = name(node.label, `${path}.label`);
  if (node.type !== 'class') fail('character.role.unsupported', 'Only flat classes are admitted.', `${path}.type`);
  const classifier = object(node.classifier, `${path}.classifier`);
  only(classifier, ['kind', 'name', 'compartments'], `${path}.classifier`);
  if (classifier.kind !== 'class' || classifier.name !== label || !Array.isArray(classifier.compartments)) {
    fail('character.class.invalid', 'Class identity and classifier must agree.', `${path}.classifier`);
  }
  const sections = [[id === label ? `[${encodeCharacterField028(id)}]`
    : `[${encodeCharacterField028(id)}] ${encodeCharacterField028(label)}`]];
  const details: string[] = [];
  for (const [partIndex, rawPart] of classifier.compartments.entries()) {
    const partPath = `${path}.classifier.compartments.${partIndex}`;
    const part = object(rawPart, partPath);
    only(part, ['id', 'kind', 'items'], partPath);
    const partId = name(part.id, `${partPath}.id`);
    const kind = name(part.kind, `${partPath}.kind`);
    if (partIndex === 0 && (kind !== 'name' || part.items !== undefined) ||
        partIndex > 0 && !['attributes', 'operations'].includes(kind)) {
      fail('character.class.compartment', 'Unsupported class compartment.', partPath);
    }
    details.push(`COMPARTMENT ${partId} ${kind}`);
    if (partIndex > 0) sections.push([]);
    if (part.items === undefined) continue;
    if (!Array.isArray(part.items)) fail('character.class.member', 'Items must be an array.', `${partPath}.items`);
    for (const [itemIndex, rawItem] of part.items.entries()) {
      const itemPath = `${partPath}.items.${itemIndex}`;
      const item = object(rawItem, itemPath);
      const isAttribute = kind === 'attributes';
      only(item, isAttribute ? ['id', 'kind', 'visibility', 'name', 'type']
        : ['id', 'kind', 'visibility', 'name', 'parameters', 'returnType'], itemPath);
      const itemId = name(item.id, `${itemPath}.id`);
      const itemName = name(item.name, `${itemPath}.name`);
      if (item.kind !== (isAttribute ? 'attribute' : 'operation')) {
        fail('character.class.member', 'Member kind disagrees with compartment.', itemPath);
      }
      const visibility = item.visibility ?? 'public';
      if (isAttribute ? visibility !== 'public' : !['public', 'private', 'protected', 'package'].includes(String(visibility))) {
        fail('character.class.visibility', 'Unsupported member visibility.', `${itemPath}.visibility`);
      }
      const prefix: Record<string, string> = { public: '+', private: '-', protected: '#', package: '~' };
      let signature: string;
      if (isAttribute) {
        signature = `${prefix[String(visibility)]} ${itemName}: ${name(item.type, `${itemPath}.type`)}`;
      } else {
        const parameters = item.parameters ?? [];
        if (!Array.isArray(parameters)) fail('character.class.member', 'Parameters must be an array.', `${itemPath}.parameters`);
        const argumentsText = parameters.map((rawParameter, parameterIndex) => {
          const parameterPath = `${itemPath}.parameters.${parameterIndex}`;
          const parameter = object(rawParameter, parameterPath);
          only(parameter, ['name', 'type'], parameterPath);
          return `${name(parameter.name, `${parameterPath}.name`)}: ${name(parameter.type, `${parameterPath}.type`)}`;
        }).join(', ');
        signature = `${prefix[String(visibility)]} ${itemName}(${argumentsText})` +
          (item.returnType === undefined ? '' : `: ${name(item.returnType, `${itemPath}.returnType`)}`);
      }
      sections.at(-1)!.push(encodeCharacterField028(signature));
      details.push(`MEMBER ${itemId} ${signature}`);
    }
  }
  return { id, label, sections, details };
}

interface ClassRelation { id: string; source: string; target: string; type: string; sourceMarker: string; targetMarker: string }
function marker(raw: unknown, path: string): string {
  const end = object(raw, path);
  only(end, ['marker'], path);
  const mark = object(end.marker, `${path}.marker`);
  only(mark, ['kind', 'fill'], `${path}.marker`);
  const result = `${mark.kind}/${mark.fill}`;
  if (!['none/unspecified', 'diamond/filled', 'triangle/open', 'triangle/filled', 'arrow/open'].includes(result)) {
    fail('character.edge.marker', 'Unsupported relation endpoint marker.', path);
  }
  return result;
}
function classRelation(raw: unknown, index: number, ids: Set<string>): ClassRelation {
  const path = `edges.${index}`;
  const edge = object(raw, path);
  only(edge, ['id', 'source', 'target', 'type', 'sourceEnd', 'targetEnd'], path);
  const id = name(edge.id, `${path}.id`);
  const source = name(edge.source, `${path}.source`);
  const target = name(edge.target, `${path}.target`);
  if (!ids.has(source) || !ids.has(target) || source === target) {
    fail('character.edge.endpoint', 'Class relation needs two distinct classes.', path);
  }
  const type = name(edge.type, `${path}.type`);
  if (!['association', 'composition', 'inheritance'].includes(type)) {
    fail('character.edge.unsupported', 'Unsupported class relation.', `${path}.type`);
  }
  const sourceMarker = marker(edge.sourceEnd, `${path}.sourceEnd`);
  const targetMarker = marker(edge.targetEnd, `${path}.targetEnd`);
  const markers = [sourceMarker, targetMarker];
  if (type === 'association' && markers.some((value) => value !== 'none/unspecified') ||
      type === 'composition' && (markers.filter((value) => value === 'diamond/filled').length !== 1 ||
        markers.some((value) => value !== 'diamond/filled' && value !== 'none/unspecified')) ||
      type === 'inheritance' && markers.some((value) => !['none/unspecified', 'triangle/open', 'arrow/open'].includes(value))) {
    fail('character.edge.marker', 'Relation kind and endpoints disagree.', path);
  }
  return { id, source, target, type, sourceMarker, targetMarker };
}

export async function renderUmlClassCharacters028(graph: GraphIR, columns: CharacterColumns028,
  charset: CharacterCharset028): Promise<Result> {
  profile(graph, 'class');
  const nodes = graph.nodes.map(classNode);
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) fail('character.id.duplicate', 'Duplicate class ID.');
  const relations = graph.edges.map((edge, index) => classRelation(edge, index, ids));
  const { picture, diagnostics } = await renderClassPicture028(nodes, relations, columns, charset);
  const lines = [`CHAR-PREVIEW/1 uml-class ${charset}`, 'PICTURE', ...picture.split('\n')];
  lines.push('GRAPH', ...characterFieldLines028('I', graph.id, columns));
  if (graph.name !== undefined) lines.push(...characterFieldLines028('L', graph.name, columns));
  lines.push('NODES');
  for (const node of nodes) {
    field(lines, 'CLASS ID', node.id, columns);
    field(lines, 'CLASS LABEL', node.label, columns);
    for (const detail of node.details) field(lines, 'CLASS DETAIL', detail, columns);
  }
  lines.push('EDGES');
  for (const edge of relations) {
    lines.push('[routed]');
    for (const [key, value] of Object.entries(edge)) field(lines, key.toUpperCase(), value, columns);
    for (const [end, value] of [['source', edge.sourceMarker], ['target', edge.targetMarker]] as const) {
      if (value === 'none/unspecified') continue;
      const readable = { 'diamond/filled': 'filled diamond', 'triangle/open': 'open triangle',
        'arrow/open': 'open arrow' }[value];
      if (!readable) fail('character.edge.marker', 'Unsupported class endpoint marker.', `edges.${edge.id}.${end}End`);
      field(lines, 'MARKER', `${readable} at ${end}`, columns);
    }
  }
  return finalizeCharacterPreview028(lines, columns, charset, diagnostics);
}

interface SequenceEntry { id: string; kind: string; source: string; target: string; label: string }
export function renderUmlSequenceCharacters028(graph: GraphIR, columns: CharacterColumns028,
  charset: CharacterCharset028): Result {
  profile(graph, 'sequence');
  const interaction = object(graph.interaction, 'interaction');
  only(interaction, ['participants', 'participantOrder', 'messages', 'messageOrder'], 'interaction');
  if (!Array.isArray(interaction.participants) || !Array.isArray(interaction.messages) ||
      !Array.isArray(interaction.participantOrder) || !Array.isArray(interaction.messageOrder)) {
    fail('character.sequence.invalid', 'Sequence interaction lists are required.', 'interaction');
  }
  const participants = graph.nodes.map((raw, index) => {
    const path = `nodes.${index}`;
    const node = object(raw, path);
    only(node, ['id', 'type', 'label'], path);
    if (node.type !== 'participant') fail('character.role.unsupported', 'Only participant nodes are admitted.', path);
    return { id: name(node.id, `${path}.id`), label: name(node.label, `${path}.label`) };
  });
  const byId = new Map(participants.map((person) => [person.id, person]));
  if (byId.size !== participants.length || interaction.participants.length !== participants.length) {
    fail('character.sequence.invalid', 'Participant identities must be unique and complete.', 'interaction.participants');
  }
  const seenParticipantRecords = new Set<string>();
  for (const [index, raw] of interaction.participants.entries()) {
    const path = `interaction.participants.${index}`;
    const participant = object(raw, path);
    only(participant, ['id', 'nodeId'], path);
    if (participant.id !== participant.nodeId || !byId.has(String(participant.id)) ||
        seenParticipantRecords.has(String(participant.id))) {
      fail('character.sequence.invalid', 'Participant and node identities disagree.', path);
    }
    seenParticipantRecords.add(String(participant.id));
  }
  const order = interaction.participantOrder.map(String);
  if (order.length !== byId.size || new Set(order).size !== byId.size || order.some((id) => !byId.has(id))) {
    fail('character.sequence.order', 'Participant order must be a complete permutation.', 'interaction.participantOrder');
  }
  const messages = graph.edges.map((raw, index): SequenceEntry => {
    const path = `edges.${index}`;
    const edge = object(raw, path);
    only(edge, ['id', 'source', 'target', 'type', 'label', 'sourceEnd', 'targetEnd', 'style'], path);
    const id = name(edge.id, `${path}.id`);
    const source = name(edge.source, `${path}.source`);
    const target = name(edge.target, `${path}.target`);
    if (!byId.has(source) || !byId.has(target)) fail('character.edge.endpoint', 'Unknown participant.', path);
    if (source === target) fail('character.sequence.self-message', 'Self-message loop is not admitted.', path);
    const kind = name(edge.type, `${path}.type`);
    if (!['sync', 'async', 'return'].includes(kind)) fail('character.edge.unsupported', 'Unsupported message kind.', path);
    const sourceMarker = marker(edge.sourceEnd, `${path}.sourceEnd`);
    const targetMarker = marker(edge.targetEnd, `${path}.targetEnd`);
    if (sourceMarker !== 'none/unspecified' ||
        targetMarker !== (kind === 'sync' ? 'triangle/filled' : 'arrow/open')) {
      fail('character.sequence.kind-conflict', 'Message marker disagrees with kind.', path);
    }
    const style = edge.style === undefined ? undefined : object(edge.style, `${path}.style`);
    if (style) only(style, ['lineStyle'], `${path}.style`);
    if (kind === 'return' ? style?.lineStyle !== 'dashed' : style !== undefined) {
      fail('character.sequence.stroke', 'Message stroke disagrees with kind.', `${path}.style`);
    }
    return { id, kind, source, target, label: edge.label === undefined ? '' : name(edge.label, `${path}.label`) };
  });
  const byMessageId = new Map(messages.map((message) => [message.id, message]));
  if (byMessageId.size !== messages.length || interaction.messages.length !== messages.length) {
    fail('character.sequence.invalid', 'Message identities must be unique and complete.', 'interaction.messages');
  }
  const seenMessageRecords = new Set<string>();
  for (const [index, raw] of interaction.messages.entries()) {
    const path = `interaction.messages.${index}`;
    const item = object(raw, path);
    only(item, ['id', 'edgeId', 'sourceParticipantId', 'targetParticipantId', 'kind'], path);
    const edge = byMessageId.get(String(item.id));
    const expected = { sync: 'synchronous', async: 'asynchronous', return: 'return' }[edge?.kind ?? ''];
    if (!edge || seenMessageRecords.has(edge.id) || item.edgeId !== edge.id || item.sourceParticipantId !== edge.source ||
        item.targetParticipantId !== edge.target || item.kind !== expected) {
      fail('character.sequence.kind-conflict', 'Message interaction disagrees with edge or connector.', path);
    }
    seenMessageRecords.add(edge.id);
  }
  const messageOrder = interaction.messageOrder.map(String);
  if (messageOrder.length !== byMessageId.size || new Set(messageOrder).size !== byMessageId.size || messageOrder.some((id) => !byMessageId.has(id))) {
    fail('character.sequence.order', 'Message order must be a complete permutation.', 'interaction.messageOrder');
  }
  const titles = order.map((id) => {
    const participant = byId.get(id)!;
    const identifier = `[${encodeCharacterField028(id)}]`;
    const label = encodeCharacterField028(participant.label);
    const title = participant.label === id ? identifier : `${identifier} ${label}`;
    if (title.length > 21) fail('character.width.unsupported', 'Participant head exceeds supported width.', `nodes.${id}.label`);
    return title;
  });
  const captions = new Map(messageOrder.map((id) => {
    const message = byMessageId.get(id)!;
    const identifier = encodeCharacterField028(message.id);
    const label = encodeCharacterField028(message.label);
    const caption = message.label === message.id ? identifier : `${identifier}: ${label}`;
    return [id, message.kind === 'sync' ? `sync ${caption}` : caption] as const;
  }));
  const gaps = Array.from({ length: Math.max(0, order.length - 1) }, () => 25);
  const gapOwner: string[] = [];
  for (const id of messageOrder) {
    const message = byMessageId.get(id)!;
    const from = order.indexOf(message.source);
    const to = order.indexOf(message.target);
    const adjacent = Math.abs(to - from) === 1;
    const neighbor = from + Math.sign(to - from);
    const sourceGap = Math.min(from, neighbor);
    const required = captions.get(id)!.length +
      (adjacent ? message.kind === 'sync' ? 7 : 6 : 4);
    if (required > gaps[sourceGap]!) {
      gaps[sourceGap] = required;
      gapOwner[sourceGap] = id;
    }
  }
  const centers = order.map((_, index) =>
    10 + gaps.slice(0, index).reduce((sum, gap) => sum + gap, 0));
  if (centers.at(-1)! + 10 > columns) {
    let lastExpanded = gaps.length - 1;
    while (lastExpanded >= 0 && gaps[lastExpanded] === 25) lastExpanded--;
    const owner = gapOwner[lastExpanded];
    fail('character.width.unsupported', 'Sequence participants exceed width.', owner ? `edges.${owner}.label` : 'columns');
  }
  const unicode = charset === 'MonoTrue-v1';
  const v = unicode ? glyph['stroke.single.v'].character : '|';
  const h = unicode ? glyph['stroke.single.h'].character : '-';
  const right = unicode ? glyph['endpoint.arrow_open.w'].character : '>';
  const left = unicode ? glyph['endpoint.arrow_open.e'].character : '<';
  const lines = [`CHAR-PREVIEW/1 uml-sequence ${charset}`, 'PICTURE'];
  const diagnostics: CharacterDiagnostic028[] = [];
  const blank = () => {
    const row = Array(centers.at(-1)! + 2).fill(' ');
    centers.forEach((center) => { row[center] = v; });
    return row as string[];
  };
  const caption = (value: string, path: string, from: number, to: number) => {
    const start = to > from ? from + 2 : from - value.length - 2;
    if (start <= Math.min(from, to) || start + value.length >= Math.max(from, to) ||
        start + value.length >= columns) {
      fail('character.width.unsupported', 'Sequence caption exceeds its message span.', path);
    }
    const row = blank();
    value.split('').forEach((letter, index) => { row[start + index] = letter; });
    return row;
  };
  const heads = blank();
  for (const [index] of order.entries()) {
    const title = titles[index]!;
    const start = centers[index]! - Math.floor(title.length / 2);
    title.split('').forEach((letter, offset) => { heads[start + offset] = letter; });
  }
  lines.push(heads.join('').trimEnd(), blank().join('').trimEnd());
  for (const id of messageOrder) {
    const message = byMessageId.get(id)!;
    const from = centers[order.indexOf(message.source)]!;
    const to = centers[order.indexOf(message.target)]!;
    const label = captions.get(id)!;
    const fromIndex = order.indexOf(message.source);
    const toIndex = order.indexOf(message.target);
    const direction = Math.sign(to - from);
    const heading = caption(label, `edges.${id}.label`, from,
      centers[fromIndex + direction]!);
    lines.push(heading.join('').trimEnd());
    const row = blank();
    for (let x = Math.min(from, to) + 1; x < Math.max(from, to); x++) {
      row[x] = message.kind === 'return'
        ? (unicode ? glyph['stroke.dashed.h'].character :
          (x - Math.min(from, to)) % 2 === 0 ? ' ' : '-') : h;
    }
    for (let index = Math.min(fromIndex, toIndex) + 1; index < Math.max(fromIndex, toIndex); index++) {
      row[centers[index]!] = v;
    }
    if (Math.abs(toIndex - fromIndex) > 1) {
      diagnostics.push({ code: 'character.glyph.approximation', severity: 'warning',
        message: `Message ${id} passes behind an intermediate lifeline with a one-cell shaft gap.`, path: `edges.${id}` });
    }
    if (unicode) {
      // Keep both lifeline columns vertical; the open head occupies the
      // adjacent shaft cell and points into the target junction.
      row[from] = glyph[to > from ? 'stroke.single.tee_e' : 'stroke.single.tee_w'].character;
      row[to] = glyph[to > from ? 'stroke.single.tee_w' : 'stroke.single.tee_e'].character;
      row[to - direction] = getEndpointGlyph029(message.kind === 'sync' ? 'triangle_filled' : 'arrow_open', direction, 0);
    } else {
      row[from] = '+';
      row[to] = message.kind === 'sync' ? '+' : direction > 0 ? right : left;
      if (message.kind === 'sync') row[to - direction] = direction > 0 ? '>' : '<';
    }
    if (message.kind === 'sync' && !unicode) {
      row[to - direction * 3] = '#';
      row[to - direction * 2] = '#';
      row[to - direction] = direction > 0 ? '>' : '<';
      diagnostics.push({ code: 'character.glyph.approximation', severity: 'warning',
        message: `Filled synchronous head for ${id} uses a one-row compound cell pattern.`, path: `edges.${id}.targetEnd` });
    }
    lines.push(row.join('').trimEnd(), blank().join('').trimEnd());
  }
  lines.push('GRAPH', ...characterFieldLines028('I', graph.id, columns));
  if (graph.name !== undefined) lines.push(...characterFieldLines028('L', graph.name, columns));
  lines.push('PARTICIPANTS');
  for (const id of order) {
    field(lines, 'P', id, columns);
    field(lines, 'LABEL', byId.get(id)!.label, columns);
  }
  lines.push('MESSAGES');
  for (const id of messageOrder) {
    const message = byMessageId.get(id)!;
    lines.push('[routed]');
    for (const [key, value] of Object.entries(message)) field(lines, key.toUpperCase(), value, columns);
  }
  return finalizeCharacterPreview028(lines, columns, charset, diagnostics);
}
