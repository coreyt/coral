/**
 * Finite Mermaid `sequenceDiagram` adapter (R-060 AC-3/AC-4, Slice 70).
 *
 * Emits exactly the GraphIR that parsing the equivalent canonical Coral
 * produces. Every statement is either consumed by a supported mapping or
 * refused with a stable code; nothing is ignored or approximated.
 */

import type {
  GraphEdge,
  GraphNode,
  InteractionActivation,
  InteractionFragment,
  InteractionNote,
  ParseResult,
} from '../types.js';
import { finishParse, parseDiagnostic, type ParseDiagnostic } from '../diagnostics.js';
import {
  UML_SEQUENCE_NOTATION,
  UML_SEQUENCE_PROFILE,
  deriveSequenceCore,
  finalizeSequenceInteraction,
  guardId,
  operandId,
  validateSequenceInteraction,
  type SequenceMessageToken,
} from '../sequence.js';

const ARROWS: Record<string, SequenceMessageToken | undefined> = {
  '->>': 'sync',
  '-->>': 'return',
  '-)': 'async',
};
// Longest first, so `-->>` is never read as `-->` plus `>`.
const ARROW = '<<-->>|<<->>|--\\|>|-\\|>|--\\|\\)|-\\|\\)|-->>|->>|--\\)|-\\)|--x|-x|-->|->|<<[-<>|)x/\\\\]*|-[-<>|)x/\\\\]*';
const MESSAGE = new RegExp(`^(\\w+)\\s*(${ARROW})\\s*([+-]?)\\s*(\\w+)\\s*:(.*)$`);

/** XML 1.0 Char: tab, newline, carriage return, and the non-surrogate, non-FFFE/FFFF scalars. */
function isXmlCharacter(code: number): boolean {
  return code === 0x9 || code === 0xA || code === 0xD
    || code >= 0x20 && code <= 0xD7FF
    || code >= 0xE000 && code <= 0xFFFD
    || code >= 0x10000 && code <= 0x10FFFF;
}

type Block =
  | { kind: 'fragment'; fragment: InteractionFragment; line: number }
  | { kind: 'unsupported'; line: number }
  | { kind: 'nested'; line: number };

export function parseMermaidSequence(
  lines: string[],
  options: { graphId?: string; graphName?: string; headerIndex?: number } = {},
): ParseResult {
  const diagnostics: ParseDiagnostic[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeById = new Map<string, GraphNode>();
  type PendingActivation = Omit<InteractionActivation, 'id'>;
  const activations: PendingActivation[] = [];
  const open = new Map<string, { activation: PendingActivation; line: number }[]>();
  const fragments: InteractionFragment[] = [];
  const notes: Omit<InteractionNote, 'id'>[] = [];
  const blocks: Block[] = [];

  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) { lineOffsets.push(offset); offset += line.length + 1; }
  const report = (line: number, column: number, code: string, message: string, source: string) => {
    diagnostics.push(parseDiagnostic({
      severity: 'error', code, message, source,
      position: { line, column, offset: (lineOffsets[line - 1] ?? 0) + column },
    }));
  };

  const ensure = (id: string): GraphNode => {
    let node = nodeById.get(id);
    if (!node) {
      node = { id, type: 'participant', label: id };
      nodeById.set(id, node);
      nodes.push(node);
    }
    return node;
  };

  for (let index = (options.headerIndex ?? 0) + 1; index < lines.length; index++) {
    const lineNumber = index + 1;
    const raw = lines[index];
    if (raw.trim().startsWith('%%')) continue;
    let column = 0;
    // Mermaid encodes `#name;` entities before lexing, so their `;` never separates.
    for (const part of raw.split(/(?<!#\w+);/)) {
      const statement = part.trim();
      const at = column + (part.length - part.trimStart().length);
      column += part.length + 1;
      if (!statement) continue;
      const fail = (code: string, message: string) => report(lineNumber, at, code, message, statement);
      const text = (value: string): string | undefined => {
        let result = value.trim();
        if (/^(?:no)?wrap:/i.test(result)) {
          fail('mermaid.sequence.text.unsupported', 'Mermaid wrap directives are not preserved');
          return undefined;
        }
        result = result.replace(/<br\s*\/?>/gi, '\n');
        if (/#[A-Za-z]\w*;/.test(result)) {
          fail('mermaid.sequence.text.unsupported', 'Named Mermaid entities are not decoded');
          return undefined;
        }
        let invalid = false;
        const decoded = result.replace(/#(\d+);/g, (_match, digits: string) => {
          const code = Number(digits);
          if (!isXmlCharacter(code)) { invalid = true; return ''; }
          return String.fromCodePoint(code);
        });
        // Text reaches SVG and HTML, so every character must be XML 1.0 legal.
        if (invalid || [...decoded].some((character) => !isXmlCharacter(character.codePointAt(0)!))) {
          fail('mermaid.sequence.text.unsupported', 'Text contains a character that is not legal in XML 1.0');
          return undefined;
        }
        return decoded;
      };
      const top = blocks[blocks.length - 1];

      // Declarations.
      if (/^(participant|actor)\s+[^\s@]*@\{/i.test(statement)) {
        fail('mermaid.sequence.participant.unsupported', 'Typed Mermaid participants are not part of the 0.2.6 subset');
        continue;
      }
      const declaration = statement.match(/^(participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i);
      if (declaration) {
        const id = declaration[2];
        if (nodeById.has(id)) {
          fail('mermaid.sequence.participant.duplicate', `Participant "${id}" is already declared or used`);
          continue;
        }
        const label = declaration[3] === undefined ? id : text(declaration[3]);
        if (label === undefined) continue;
        const node = ensure(id);
        node.type = declaration[1].toLowerCase();
        node.label = label;
        continue;
      }
      if (/^(create|destroy|box|links?|properties|details)\b/i.test(statement)) {
        fail('mermaid.sequence.participant.unsupported', 'Participant groups, lifecycle events, links, and properties are 0.2.7 work');
        if (/^box\b/i.test(statement)) blocks.push({ kind: 'unsupported', line: lineNumber });
        continue;
      }
      if (/^autonumber\b/i.test(statement)) {
        fail('mermaid.sequence.numbering.unsupported', 'Message numbering is not part of the 0.2.6 subset');
        continue;
      }

      // Notes: only participant targets before the first message.
      const note = statement.match(/^note\s+(right\s+of|left\s+of|over)\s+([^:]+):(.*)$/i);
      if (note) {
        if (!/^over$/i.test(note[1]) || edges.length > 0 || blocks.length > 0) {
          fail('mermaid.sequence.note.placement', 'Only notes over participants, before the first message and outside blocks, keep their meaning in 0.2.6');
          continue;
        }
        const targets = note[2].split(',').map((target) => target.trim());
        if (targets.some((target) => !/^\w+$/.test(target))) {
          fail('mermaid.sequence.line.unparsed', 'Unsupported note target');
          continue;
        }
        const value = text(note[3]);
        if (value === undefined) continue;
        if (!value) {
          fail('mermaid.sequence.line.unparsed', 'A note needs text');
          continue;
        }
        targets.forEach(ensure);
        notes.push({ text: value, participantIds: [...new Set(targets)] });
        continue;
      }

      // Blocks.
      const fragmentHead = statement.match(/^(loop|alt|opt)(?:\s+(.*))?$/i);
      if (fragmentHead) {
        if (blocks.length > 0) {
          fail('mermaid.sequence.fragment.nested', 'Nested fragments are 0.2.7 work');
          blocks.push({ kind: 'nested', line: lineNumber });
          continue;
        }
        const guard = fragmentHead[2] === undefined ? '' : text(fragmentHead[2]);
        if (guard === undefined) continue;
        const id = `fragment-${fragments.length + 1}`;
        const fragment: InteractionFragment = {
          id, kind: fragmentHead[1].toLowerCase() as InteractionFragment['kind'],
          operands: [{ id: operandId(id, 0), ...(guard ? { guard: { id: guardId(id, 0), text: guard } } : {}), messageIds: [] }],
        };
        fragments.push(fragment);
        blocks.push({ kind: 'fragment', fragment, line: lineNumber });
        continue;
      }
      if (/^(par|critical|break|rect)\b/i.test(statement)) {
        fail('mermaid.sequence.fragment.unsupported', 'par, critical, break, and rect are 0.2.7 work');
        blocks.push({ kind: 'unsupported', line: lineNumber });
        continue;
      }
      if (/^(and|option)\b/i.test(statement) && top && top.kind !== 'fragment') continue;
      const otherwise = statement.match(/^else(?:\s+(.*))?$/i);
      if (otherwise) {
        if (top?.kind === 'nested' || top?.kind === 'unsupported') continue;
        if (top?.kind !== 'fragment' || top.fragment.kind !== 'alt') {
          fail('mermaid.sequence.fragment.invalid', 'else must continue an alt fragment');
          continue;
        }
        const guard = otherwise[1] === undefined ? '' : text(otherwise[1]);
        if (guard === undefined) continue;
        const operands = top.fragment.operands;
        operands.push({
          id: operandId(top.fragment.id, operands.length),
          ...(guard ? { guard: { id: guardId(top.fragment.id, operands.length), text: guard } } : {}),
          messageIds: [],
        });
        continue;
      }
      if (/^end$/i.test(statement)) {
        const closed = blocks.pop();
        if (!closed) fail('mermaid.sequence.fragment.invalid', 'end has no open block');
        else if (closed.kind === 'fragment' && closed.fragment.operands.every((operand) => operand.messageIds.length === 0)) {
          report(closed.line, Math.max(0, lines[closed.line - 1].search(/\S/)), 'mermaid.sequence.fragment.invalid',
            'A fragment must contain at least one message', lines[closed.line - 1].trim());
        } else if (closed.kind === 'fragment' && closed.fragment.kind === 'alt' && closed.fragment.operands.length < 2) {
          // GraphIR 3 alt fragments have two or more operands; a one-branch alt is not guessed into an opt.
          report(closed.line, Math.max(0, lines[closed.line - 1].search(/\S/)), 'mermaid.sequence.fragment.invalid',
            'An alt fragment needs an else branch; use opt for a single optional branch', lines[closed.line - 1].trim());
        }
        continue;
      }

      // Activations.
      const activation = statement.match(/^(activate|deactivate)\s+(\w+)$/i);
      if (activation) {
        const participant = activation[2];
        const last = edges[edges.length - 1];
        if (!last || last.source !== participant && last.target !== participant) {
          fail('mermaid.sequence.activation.invalid', `${activation[1]} ${participant} must follow a message involving ${participant}`);
          continue;
        }
        if (activation[1].toLowerCase() === 'activate') start(participant, last.id, lineNumber);
        else if (!end(participant, last.id)) fail('mermaid.sequence.activation.invalid', `No open activation of ${participant}`);
        continue;
      }

      // Messages.
      const message = statement.match(MESSAGE);
      if (message) {
        const [, source, arrow, modifier, target, rawText] = message;
        const token = ARROWS[arrow];
        if (!token) {
          fail('mermaid.sequence.message.unsupported', `The Mermaid arrow "${arrow}" is outside the sync/async/return subset`);
          continue;
        }
        const label = text(rawText);
        if (label === undefined) continue;
        ensure(source);
        ensure(target);
        const edge: GraphEdge = {
          id: `msg_${edges.length + 1}`, source, target, type: token, ...(label ? { label } : {}),
        };
        edges.push(edge);
        if (top?.kind === 'fragment') top.fragment.operands[top.fragment.operands.length - 1].messageIds.push(edge.id);
        if (modifier === '+') start(target, edge.id, lineNumber);
        if (modifier === '-' && !end(source, edge.id)) fail('mermaid.sequence.activation.invalid', `No open activation of ${source}`);
        continue;
      }

      fail('mermaid.sequence.line.unparsed', `Unsupported Mermaid sequence statement: ${statement}`);
    }
  }

  function start(participant: string, messageId: string, line: number): void {
    const record: PendingActivation = { participantId: participant, startMessageId: messageId, endMessageId: messageId };
    activations.push(record);
    const stack = open.get(participant) ?? [];
    stack.push({ activation: record, line });
    open.set(participant, stack);
  }
  function end(participant: string, messageId: string): boolean {
    const entry = open.get(participant)?.pop();
    if (!entry) return false;
    entry.activation.endMessageId = messageId;
    return true;
  }

  for (const block of blocks) {
    if (block.kind === 'fragment') {
      report(block.line, Math.max(0, lines[block.line - 1].search(/\S/)), 'mermaid.sequence.fragment.invalid',
        'Unclosed fragment', lines[block.line - 1].trim());
    }
  }
  for (const [participant, stack] of open) {
    for (const entry of stack) {
      report(entry.line, Math.max(0, lines[entry.line - 1].search(/\S/)), 'mermaid.sequence.activation.invalid',
        `Unclosed activation of ${participant}`, lines[entry.line - 1].trim());
    }
  }

  const graph = {
    version: '3.0.0' as const,
    id: options.graphId || 'mermaid-sequence',
    ...(options.graphName !== undefined ? { name: options.graphName } : {}),
    nodes,
    edges,
    metadata: { notation: UML_SEQUENCE_NOTATION },
    profile: UML_SEQUENCE_PROFILE,
    interaction: finalizeSequenceInteraction({ ...deriveSequenceCore(nodes, edges), activations, fragments, notes }),
  };
  if (diagnostics.length === 0) {
    for (const issue of validateSequenceInteraction(graph)) {
      report(1, 0, issue.code, issue.message, issue.entity.id);
    }
  }
  return finishParse(diagnostics, graph);
}
