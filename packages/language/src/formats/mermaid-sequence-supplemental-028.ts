import type { GraphIR } from '../types.js';
import { validateSequenceInteraction } from '../sequence.js';

const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function only(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' &&
    'value' in descriptors[key] && (descriptors[key].value === undefined || keys.includes(key)));
}

function quoted(value: string): string | undefined {
  if ([...value].some((char) => {
    const point = char.codePointAt(0)!;
    return point < 0x20 && char !== '\n' || point >= 0x7f && point <= 0x9f ||
      point === 0x2028 || point === 0x2029 ||
      point >= 0xd800 && point <= 0xdfff;
  })) return undefined;
  return `"${value.replace(/[\\"\n]/g, (char) => char === '\n' ? '\\n' : `\\${char}`)}"`;
}

/** Write pre-message participant notes and flat Mermaid alt/loop/opt fragments
 * using approved 0.2.8 source. Every imported field is checked
 * before source is returned; callers reparse and verify exact GraphIR 4. */
export function writeSupplementalMermaidSequence028(graph: GraphIR): string | undefined {
  const interaction = graph.interaction;
  if (!only(graph, ['version', 'id', 'nodes', 'edges', 'metadata', 'profile', 'interaction']) ||
      graph.version !== '3.0.0' || !only(graph.metadata, ['notation']) ||
      graph.metadata.notation !== 'uml-sequence' ||
      !only(graph.profile, ['id', 'kind', 'version']) ||
      graph.profile.id !== 'uml' || graph.profile.kind !== 'sequence' || graph.profile.version !== '1.0.0' ||
      !interaction || !only(interaction,
        ['participants', 'participantOrder', 'messages', 'messageOrder', 'fragments', 'notes', 'activations']) ||
      interaction.activations?.length ||
      !(interaction.fragments?.length || interaction.notes?.length) ||
      validateSequenceInteraction(graph).length) return undefined;

  if (interaction.participants.length !== graph.nodes.length ||
      interaction.messages.length !== graph.edges.length ||
      interaction.participantOrder.length !== graph.nodes.length ||
      interaction.messageOrder.length !== graph.edges.length) return undefined;

  const lines = ['@diagram uml-sequence'];
  for (const [index, node] of graph.nodes.entries()) {
    const participant = interaction.participants[index];
    if (!only(node, ['id', 'type', 'label']) || !BARE.test(node.id) ||
        !['participant', 'actor'].includes(node.type) || typeof node.label !== 'string' ||
        !participant || !only(participant, ['id', 'nodeId']) ||
        participant.id !== node.id || participant.nodeId !== node.id ||
        interaction.participantOrder[index] !== node.id) return undefined;
    const label = node.label === node.id ? '' : quoted(node.label);
    if (label === undefined) return undefined;
    lines.push(`${node.id} ${node.type}${label ? ` as ${label}` : ''}`);
  }

  lines.push('');
  for (const [index, note] of (interaction.notes ?? []).entries()) {
    if (!only(note, ['id', 'text', 'participantIds', 'messageIds']) ||
        note.id !== `note-${index + 1}` || typeof note.text !== 'string' || !note.text ||
        !note.participantIds?.length || note.messageIds !== undefined ||
        new Set(note.participantIds).size !== note.participantIds.length ||
        note.participantIds.some((id) => !interaction.participantOrder.includes(id))) return undefined;
    const body = quoted(note.text);
    if (!body) return undefined;
    lines.push(`note ${body} on ${note.participantIds.join(', ')}`);
  }

  const membership = new Map<string, { fragment: number; operand: number }>();
  const plans: Array<{ first: number; last: number; kind: 'alt' | 'loop' | 'opt';
    guards: Array<string | undefined> }> = [];
  for (const [fragmentIndex, fragment] of (interaction.fragments ?? []).entries()) {
    if (!only(fragment, ['id', 'kind', 'operands']) || fragment.id !== `fragment-${fragmentIndex + 1}` ||
        !(fragment.kind === 'alt' ? fragment.operands.length >= 2 :
          (fragment.kind === 'loop' || fragment.kind === 'opt') && fragment.operands.length === 1)) return undefined;
    const guards: Array<string | undefined> = [];
    let memberCount = 0;
    for (const [operandIndex, operand] of fragment.operands.entries()) {
      if (!only(operand, ['id', 'guard', 'messageIds']) ||
          operand.id !== `fragment-${fragmentIndex + 1}-operand-${operandIndex + 1}` ||
          !operand.messageIds.length) return undefined;
      if (!operand.guard && fragment.kind !== 'loop') return undefined;
      if (operand.guard && (!only(operand.guard, ['id', 'text']) ||
          operand.guard.id !== `fragment-${fragmentIndex + 1}-guard-${operandIndex + 1}` ||
          typeof operand.guard.text !== 'string' || !operand.guard.text)) return undefined;
      const guard = operand.guard ? quoted(operand.guard.text) : undefined;
      if (operand.guard && !guard) return undefined;
      guards.push(guard);
      for (const id of operand.messageIds) {
        if (membership.has(id)) return undefined;
        membership.set(id, { fragment: fragmentIndex, operand: operandIndex });
        memberCount++;
      }
    }
    const positions = interaction.messageOrder.flatMap((id, index) =>
      membership.get(id)?.fragment === fragmentIndex ? [index] : []);
    if (positions.length !== memberCount || !positions.length) return undefined;
    const first = positions[0]!;
    const last = positions[positions.length - 1]!;
    if (positions.length !== last - first + 1 || first <= (plans[plans.length - 1]?.last ?? -1)) return undefined;
    let previousOperand = -1;
    for (let index = first; index <= last; index++) {
      const owner = membership.get(interaction.messageOrder[index]!);
      if (!owner || owner.fragment !== fragmentIndex || owner.operand < previousOperand ||
          owner.operand > previousOperand + 1) return undefined;
      previousOperand = owner.operand;
    }
    if (previousOperand !== guards.length - 1) return undefined;
    plans.push({ first, last, kind: fragment.kind, guards });
  }
  const starts = new Map(plans.map((plan, index) => [plan.first, index]));
  const ends = new Map(plans.map((plan, index) => [plan.last, index]));

  let activeFragment: number | undefined;
  let currentOperand = -1;
  for (const [index, edge] of graph.edges.entries()) {
    const message = interaction.messages[index];
    if (!only(edge, ['id', 'source', 'target', 'type', 'label']) ||
        !BARE.test(edge.id) || !BARE.test(edge.source) || !BARE.test(edge.target) ||
        !message || !only(message,
          ['id', 'edgeId', 'sourceParticipantId', 'targetParticipantId', 'kind']) ||
        interaction.messageOrder[index] !== edge.id || message.id !== edge.id || message.edgeId !== edge.id ||
        message.sourceParticipantId !== edge.source || message.targetParticipantId !== edge.target) return undefined;
    const operator = edge.type === 'sync' && message.kind === 'synchronous' ? '-#>' :
      edge.type === 'async' && message.kind === 'asynchronous' ? '->' :
      edge.type === 'return' && message.kind === 'return' ? '-.->' : undefined;
    if (!operator || edge.label !== undefined && typeof edge.label !== 'string') return undefined;
    const label = edge.label === undefined ? '' : quoted(edge.label);
    if (label === undefined) return undefined;
    const owner = membership.get(edge.id);
    const opening = starts.get(index);
    if (opening !== undefined) {
      const plan = plans[opening]!;
      lines.push(`${plan.kind}${plan.guards[0] ? ` ${plan.guards[0]}` : ''} {`);
      activeFragment = opening;
      currentOperand = -1;
    }
    if ((owner && owner.fragment !== activeFragment) || (!owner && activeFragment !== undefined))
      return undefined;
    if (owner && owner.operand !== currentOperand) {
      if (currentOperand >= 0) lines.push(`} else ${plans[owner.fragment]!.guards[owner.operand]!} {`);
      currentOperand = owner.operand;
    }
    const statement = `${edge.id} = ${edge.source} ${operator} ${edge.target}${label ? ` as ${label}` : ''}`;
    lines.push(owner === undefined ? statement : `  ${statement}`);
    if (ends.has(index)) { lines.push('}'); activeFragment = undefined; currentOperand = -1; }
  }
  return lines.join('\n');
}
