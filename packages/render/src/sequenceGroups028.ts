import type { SequenceBox, SequenceScene, SequenceSceneGroup, SequenceText } from './sequence.js';
import type { SuccessorSourceInteraction028 } from './successorSourceProjection028.js';
import { measureText } from './text/metrics.js';

/** Translate every shared scene part together; source identities never move between lanes. */
export function translateSequenceScene028(scene: SequenceScene, dx: number, dy: number): SequenceScene {
  const box = <T extends SequenceBox>(value: T): T => ({ ...value, x: value.x + dx, y: value.y + dy });
  const text = (value: SequenceText): SequenceText => ({ ...value, x: value.x + dx, y: value.y + dy });
  return { ...scene, width: scene.width + dx, height: scene.height + dy,
    participants: scene.participants.map((participant) => ({ ...participant, header: box(participant.header),
      label: text(participant.label), lifeline: { x: participant.lifeline.x + dx,
        y1: participant.lifeline.y1 + dy, y2: participant.lifeline.y2 + dy } })),
    messages: scene.messages.map((message) => ({ ...message,
      points: message.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      ...(message.label ? { label: text(message.label) } : {}),
      ...(message.labelBounds ? { labelBounds: box(message.labelBounds) } : {}) })),
    activations: scene.activations.map(box),
    notes: scene.notes.map((note) => ({ ...box(note), text: text(note.text) })),
    fragments: scene.fragments.map((frame) => ({ ...box(frame), tab: { ...box(frame.tab), text: text(frame.tab.text) },
      operands: frame.operands.map((operand) => ({ ...operand,
        ...(operand.separatorY !== undefined ? { separatorY: operand.separatorY + dy } : {}),
        ...(operand.guard ? { guard: text(operand.guard) } : {}) })) })),
    ...(scene.regions ? { regions: scene.regions.map((region) => ({ ...box(region),
      ...(region.label ? { label: text(region.label) } : {}) })) } : {}),
    ...(scene.groups ? { groups: scene.groups.map((group) => ({ ...box(group),
      ...(group.label ? { label: text(group.label) } : {}),
      ...(group.identifier ? { identifier: text(group.identifier) } : {}),
      members: group.members.map((member) => ({ ...member, x: member.x + dx })),
      spans: group.spans.map((span) => ({ x1: span.x1 + dx, x2: span.x2 + dx, y: span.y + dy })) })) } : {}),
  };
}

/** Groups annotate exact member runs above headers. A bounding enclosure would
 * falsely group intervening nonmembers; lane and timeline order stay untouched. */
export function placeSequenceGroups028(scene: SequenceScene,
  groups: NonNullable<SuccessorSourceInteraction028['groups']>, padding = 24): SequenceScene {
  const fail = (): never => { throw new Error('coral.sequence.layout.invalid: invalid participant group'); };
  const participants = new Map(scene.participants.map((participant) => [participant.id, participant]));
  const indices = new Map(scene.participants.map((participant, index) => [participant.id, index]));
  const ids = new Set<string>(), members = new Set<string>();
  for (const group of groups) {
    if (!group || typeof group.id !== 'string' || !group.id.length || ids.has(group.id) ||
      !Array.isArray(group.participantIds) || group.label !== undefined && typeof group.label !== 'string') fail();
    ids.add(group.id);
    for (const id of group.participantIds) {
      if (!participants.has(id) || members.has(id)) fail();
      members.add(id);
    }
  }
  if (!groups.length) return scene;
  const first = (group: typeof groups[number]) => Math.min(Infinity, ...group.participantIds.map((id) => indices.get(id)!));
  const ordered = [...groups].sort((a, b) => {
    const left = first(a), right = first(b);
    return left === right ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : left < right ? -1 : 1;
  });
  let y = padding;
  const placed: SequenceSceneGroup[] = ordered.map((group) => {
    const sorted = [...group.participantIds].sort((a, b) => indices.get(a)! - indices.get(b)!);
    const runs: string[][] = [];
    for (const id of sorted) {
      const previous = runs.at(-1)?.at(-1);
      if (previous !== undefined && indices.get(previous)! + 1 === indices.get(id)!) runs.at(-1)!.push(id);
      else runs.push([id]);
    }
    const x = sorted.length ? Math.min(...sorted.map((id) => participants.get(id)!.header.x)) : padding;
    const heading = measureText({ text: group.label || group.id, fontSize: scene.font.size,
      fontFamily: scene.font.cssFamily, fontWeight: scene.font.weight,
      lineHeight: scene.font.lineHeight / scene.font.size });
    const height = Math.max(scene.font.lineHeight, heading.height) + 20;
    const spans = runs.map((run) => ({ x1: participants.get(run[0])!.header.x,
      x2: participants.get(run.at(-1)!)!.header.x + participants.get(run.at(-1)!)!.header.width,
      y: y + height - 8 }));
    const width = Math.max(32, heading.width + 16, ...spans.map((span) => span.x2 - x));
    const headingText: SequenceText = { lines: heading.lines, x: x + 8,
      y: y + scene.font.lineHeight, anchor: 'start' };
    const result: SequenceSceneGroup = { id: group.id, x, y, width, height,
      participantIds: [...group.participantIds],
      ...(group.label !== undefined ? { label: { ...headingText, lines: group.label === '' ? [''] : heading.lines } } : {}),
      ...(!group.label ? { identifier: headingText } : {}),
      members: group.participantIds.map((id) => ({ id, x: participants.get(id)!.lifeline.x })), spans,
      accessibleName: `Participant group ${group.id}${group.label !== undefined ? `: ${group.label}` : ''}; members: ${group.participantIds.join(', ') || 'none'}` };
    y += height + 8;
    return result;
  });
  const top = Math.min(padding, ...scene.participants.map(({ header }) => header.y));
  const shifted = translateSequenceScene028(scene, 0, Math.max(0, y + 8 - top));
  return { ...shifted, groups: placed,
    width: Math.max(shifted.width, ...placed.map((group) => group.x + group.width + padding)),
    description: `${scene.description}, ${groups.length} participant groups` };
}
