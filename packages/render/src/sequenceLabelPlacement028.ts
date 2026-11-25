import { translateSequenceScene028 } from './sequenceGroups028.js';
import type { GraphEdge } from '@graph-ir/core';
import { authoredEdgeLabelBox028, measureEdgeLabel028 } from './edgeLabelPlacement028.js';
import { RenderCapabilityError } from './scene.js';
import type { SequenceBox, SequenceFont, SequenceGraph, SequenceScene, SequenceText } from './sequence.js';

const overlaps = (a: SequenceBox, b: SequenceBox) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (a: SequenceBox, b: SequenceBox) => a.x >= b.x && a.y >= b.y &&
  a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/** Placement executes only after the complete recursive timeline is measured.
 * A common box owns ink masking, collision checks, viewport and selection. */
export function placeSequenceLabels028(scene: SequenceScene, graph: SequenceGraph, padding = 24): SequenceScene {
  const fail = (edgeId: string, message: string): never => { throw new RenderCapabilityError([{
    code: 'render.capability.scene-layout', subject: { kind: 'edge', id: edgeId },
    message: `render.capability.scene-layout: Edge ${edgeId} label ${message}`,
  }]); };
  const edgeByMessage = new Map((graph.interaction?.messages ?? []).map((message) =>
    [message.id, graph.edges.find((edge) => edge.id === message.edgeId)]));
  const textBox = (text: SequenceText, font: SequenceFont): SequenceBox => {
    const measured = measureEdgeLabel028({ text: text.lines.join('\n'), fontSize: font.size, fontFamily: font.cssFamily,
      fontWeight: font.weight, lineHeight: font.lineHeight / font.size });
    return { x: text.x - (text.anchor === 'middle' ? measured.width / 2 : 0), y: text.y - measured.baselineOffset,
      width: measured.width, height: measured.height };
  };
  const fixed: SequenceBox[] = [...scene.participants.map((participant) => participant.header),
    ...scene.activations, ...scene.notes, ...(scene.groups ?? [])];
  const border = (frame: SequenceBox) => { fixed.push(
    { x: frame.x - 2, y: frame.y - 2, width: frame.width + 4, height: 4 },
    { x: frame.x - 2, y: frame.y + frame.height - 2, width: frame.width + 4, height: 4 },
    { x: frame.x - 2, y: frame.y, width: 4, height: frame.height },
    { x: frame.x + frame.width - 2, y: frame.y, width: 4, height: frame.height }); };
  for (const frame of scene.fragments) {
    border(frame); fixed.push(frame.tab);
    for (const operand of frame.operands) {
      if (operand.guard) fixed.push(textBox(operand.guard, scene.font));
      if (operand.separatorY !== undefined) fixed.push({ x: frame.x, y: operand.separatorY - 2, width: frame.width, height: 4 });
    }
  }
  for (const region of scene.regions ?? []) {
    border(region);
    if (region.label) fixed.push({ x: region.x, y: region.y, width: region.width, height: region.headingHeight });
  }
  for (const participant of scene.participants) fixed.push({ x: participant.lifeline.x - 1,
    y: participant.lifeline.y1, width: 2, height: participant.lifeline.y2 - participant.lifeline.y1 });
  for (const message of scene.messages) {
    const tip = message.points.at(-1)!;
    const from = message.points.at(-2)!;
    const back = tip.x - (Math.sign(tip.x - from.x) || 1) * 9;
    fixed.push({ x: Math.min(tip.x, back) - 2, y: tip.y - 7, width: Math.abs(tip.x - back) + 4, height: 14 });
    if (message.kind === 'destroy') fixed.push({ x: tip.x - 10, y: tip.y - 10, width: 20, height: 20 });
  }
  const frames = new Map(scene.fragments.map((frame) => [frame.id, frame]));
  const regions = new Map((scene.regions ?? []).map((region) => [region.id, region]));
  const scopes = new Map<string, SequenceBox[]>();
  const operandBox = (id: string, index: number): SequenceBox => {
    const frame = frames.get(id)!;
    const top = frame.operands[index].separatorY ?? frame.tab.y + frame.tab.height;
    const bottom = frame.operands[index + 1]?.separatorY ?? frame.y + frame.height;
    return { x: frame.x + 3, y: top + 3, width: frame.width - 6, height: bottom - top - 6 };
  };
  const timeline = graph.sourceTimeline028 ?? graph.recursiveFragments028;
  if (timeline) {
    const fragmentById = new Map((timeline.fragments ?? []).map((frame) => [frame.id, frame]));
    const regionById = new Map((graph.sourceTimeline028?.regions ?? []).map((region) => [region.id, region]));
    type Item = { kind: string; id: string };
    const walk = (items: readonly Item[], parents: SequenceBox[], depth = 0): void => {
      if (depth > 128) fail('', 'containment exceeds safe traversal limits');
      for (const item of items) {
        if (item.kind === 'message') scopes.set(item.id, parents);
        else if (item.kind === 'fragment') fragmentById.get(item.id)!.operands.forEach((operand, index) =>
          walk(operand.items, [...parents, operandBox(item.id, index)], depth + 1));
        else if (item.kind === 'region') {
          const region = regions.get(item.id)!;
          walk(regionById.get(item.id)!.items, [...parents, { x: region.x + 3, y: region.y + region.headingHeight + 3,
            width: region.width - 6, height: region.height - region.headingHeight - 6 }], depth + 1);
        }
      }
    };
    walk(timeline.items, []);
  } else for (const fragment of graph.interaction?.fragments ?? []) fragment.operands.forEach((operand, index) => {
    for (const id of operand.messageIds) scopes.set(id, [operandBox(fragment.id, index)]);
  });
  const bounds = new Map<string, SequenceBox>();
  const baselines = new Map<string, number>();
  for (const message of scene.messages) {
    const placement = edgeByMessage.get(message.id)?.labelPlacement;
    if (!message.label) continue;
    if (!placement) { bounds.set(message.id, textBox(message.label, scene.messageFont)); continue; }
    const measured = measureEdgeLabel028({ text: message.label.lines.join('\n'), fontSize: scene.messageFont.size,
      fontFamily: scene.messageFont.cssFamily, fontWeight: scene.messageFont.weight,
      lineHeight: scene.messageFont.lineHeight / scene.messageFont.size });
    bounds.set(message.id, authoredEdgeLabelBox028(message.points, placement, measured.width, measured.height));
    baselines.set(message.id, measured.baselineOffset);
  }
  const segmentHits = (a: { x: number; y: number }, b: { x: number; y: number }, box: SequenceBox) => {
    // Sequence shafts are orthogonal; exact rectangle intersection suffices.
    return overlaps({ x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1,
      width: Math.abs(a.x - b.x) + 2, height: Math.abs(a.y - b.y) + 2 }, box);
  };
  const messages = scene.messages.map((message) => {
    const edge: GraphEdge | undefined = edgeByMessage.get(message.id);
    const box = bounds.get(message.id);
    if (!edge?.labelPlacement || !box || !message.label) return message;
    if (scopes.get(message.id)?.some((scope) => !inside(box, scope))) fail(edge.id, 'is outside its operand/region containment');
    if (fixed.some((obstacle) => overlaps(box, obstacle)) ||
      [...bounds].some(([id, other]) => id !== message.id && overlaps(box, other)) ||
      scene.messages.some((other) => other.id !== message.id && other.points.slice(1).some((point, index) =>
        segmentHits(other.points[index], point, box)))) fail(edge.id, 'placement overlaps a header, terminal marker, lifeline, activation, note, frame, or another message');
    return { ...message, labelBounds: box, label: { ...message.label,
      x: box.x + box.width / 2, y: box.y + baselines.get(message.id)!, anchor: 'middle' as const } };
  });
  const placed = messages.flatMap((message) => message.labelBounds ? [message.labelBounds] : []);
  const dx = -Math.min(0, ...placed.map((box) => box.x - padding));
  const dy = -Math.min(0, ...placed.map((box) => box.y - padding));
  const shifted = translateSequenceScene028({ ...scene, messages }, dx, dy);
  return { ...shifted,
    width: Math.max(scene.width, ...placed.map((box) => box.x + box.width + padding)) + dx,
    height: Math.max(scene.height, ...placed.map((box) => box.y + box.height + padding)) + dy };
}
