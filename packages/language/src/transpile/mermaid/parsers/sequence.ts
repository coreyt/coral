import type { BodyLine, LineIndex } from '../preprocess.js';
import { splitStatementsOnSemicolon } from '../lexer.js';
import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

export type SequenceArrowKind =
  | '<<-->>'
  | '<<->>'
  | '--|>'
  | '-|>'
  | '--|)'
  | '-|)'
  | '-->>'
  | '->>'
  | '--)'
  | '-)'
  | '--x'
  | '-x'
  | '-->'
  | '->';

export interface SequenceParticipantDecl {
  kind: 'participant';
  actorKind: 'participant' | 'actor';
  rawId: string;
  rawAlias?: string;
  v11Type?: string;
  isCreate: boolean;
  range: TranspileSourceRange;
}

export interface SequenceDestroyDecl {
  kind: 'destroy';
  rawId: string;
  range: TranspileSourceRange;
}

export interface SequenceBoxDecl {
  kind: 'box';
  color?: string;
  rawLabel?: string;
  participants: SequenceParticipantDecl[];
  range: TranspileSourceRange;
}

export interface SequenceMessageStmt {
  kind: 'message';
  rawSender: string;
  rawReceiver: string;
  arrow: SequenceArrowKind;
  activationModifier?: '+' | '-';
  rawText: string;
  hasWrapPrefix?: boolean;
  range: TranspileSourceRange;
}

export interface SequenceNoteStmt {
  kind: 'note';
  placement: 'left' | 'right' | 'over';
  rawTargets: string[];
  rawText: string;
  hasWrapPrefix?: boolean;
  range: TranspileSourceRange;
}

export interface SequenceActivateStmt {
  kind: 'activate' | 'deactivate';
  rawTarget: string;
  range: TranspileSourceRange;
}

export interface SequenceBlockBranch {
  rawGuard?: string;
  branchKeyword: 'alt' | 'else' | 'opt' | 'loop' | 'par' | 'and' | 'critical' | 'option' | 'break' | 'rect';
  items: SequenceStmt[];
  range: TranspileSourceRange;
}

export interface SequenceBlockStmt {
  kind: 'block';
  blockKind: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'rect';
  rectColor?: string;
  branches: SequenceBlockBranch[];
  range: TranspileSourceRange;
}

export interface SequenceDirectiveStmt {
  kind: 'autonumber' | 'metadata';
  directive: string;
  range: TranspileSourceRange;
}

export type SequenceStmt =
  | SequenceParticipantDecl
  | SequenceDestroyDecl
  | SequenceBoxDecl
  | SequenceMessageStmt
  | SequenceNoteStmt
  | SequenceActivateStmt
  | SequenceBlockStmt
  | SequenceDirectiveStmt;

export interface SequenceAst {
  items: SequenceStmt[];
}

const SEQUENCE_ARROWS: readonly SequenceArrowKind[] = [
  '<<-->>',
  '<<->>',
  '--|>',
  '-|>',
  '--|)',
  '-|)',
  '-->>',
  '->>',
  '--)',
  '-)',
  '--x',
  '-x',
  '-->',
  '->',
];

function stripWrapPrefix(raw: string): { text: string; stripped: boolean } {
  const trimmed = raw.trim();
  if (/^wrap:/i.test(trimmed)) return { text: trimmed.slice(5).trim(), stripped: true };
  if (/^nowrap:/i.test(trimmed)) return { text: trimmed.slice(7).trim(), stripped: true };
  return { text: trimmed, stripped: false };
}

function parseParticipantRest(
  rest: string,
  actorKind: 'participant' | 'actor',
  isCreate: boolean,
  range: TranspileSourceRange,
): SequenceParticipantDecl | null {
  let working = rest.trim();
  if (!working) return null;

  // Check v11 typed participant: `A@{ "type": "database" }`
  let v11Type: string | undefined;
  const atBrace = working.indexOf('@{');
  if (atBrace >= 0) {
    const closeBrace = working.indexOf('}', atBrace + 2);
    if (closeBrace > atBrace) {
      const inner = working.slice(atBrace + 2, closeBrace);
      const typeMatch = /["']?type["']?\s*:\s*["']?([^"',}\s]+)["']?/i.exec(inner);
      if (typeMatch) v11Type = typeMatch[1]!;
      working = (working.slice(0, atBrace) + working.slice(closeBrace + 1)).trim();
    }
  }

  // Linear scan for ` as ` separator (replaces backtracking /\s+as\s+/i — C3)
  let asIdx = -1;
  let asEnd = -1;
  for (let i = 0; i < working.length - 3; i++) {
    const ch = working[i];
    if (ch !== ' ' && ch !== '\t') continue;
    let j = i;
    while (j < working.length && (working[j] === ' ' || working[j] === '\t')) j++;
    const c0 = working[j];
    const c1 = working[j + 1];
    if ((c0 === 'a' || c0 === 'A') && (c1 === 's' || c1 === 'S')) {
      let k = j + 2;
      if (k < working.length && (working[k] === ' ' || working[k] === '\t')) {
        while (k < working.length && (working[k] === ' ' || working[k] === '\t')) k++;
        asIdx = i;
        asEnd = k;
        break;
      }
    }
    i = j - 1;
  }
  if (asIdx > 0 && asEnd > 0) {
    const rawId = working.slice(0, asIdx).trim();
    const rawAlias = working.slice(asEnd).trim();
    return {
      kind: 'participant',
      actorKind,
      rawId,
      rawAlias,
      ...(v11Type ? { v11Type } : {}),
      isCreate,
      range,
    };
  }

  return {
    kind: 'participant',
    actorKind,
    rawId: working,
    ...(v11Type ? { v11Type } : {}),
    isCreate,
    range,
  };
}

function parseBoxHeader(rest: string): { color?: string; rawLabel?: string } {
  const trimmed = rest.trim();
  if (!trimmed) return {};
  // Check if first token is a color (`transparent`, `#...`, `rgb(...)`, `rgba(...)`, `hsl(...)`, or CSS color followed by label)
  if (/^rgba?\([^)]*\)/i.test(trimmed)) {
    const close = trimmed.indexOf(')');
    const color = trimmed.slice(0, close + 1).trim();
    const label = trimmed.slice(close + 1).trim();
    return { color, ...(label ? { rawLabel: label } : {}) };
  }
  if (/^hsla?\([^)]*\)/i.test(trimmed)) {
    const close = trimmed.indexOf(')');
    const color = trimmed.slice(0, close + 1).trim();
    const label = trimmed.slice(close + 1).trim();
    return { color, ...(label ? { rawLabel: label } : {}) };
  }
  const sp = trimmed.search(/\s/);
  const first = sp > 0 ? trimmed.slice(0, sp) : trimmed;
  const restLabel = sp > 0 ? trimmed.slice(sp + 1).trim() : '';
  const firstLower = first.toLowerCase();
  if (firstLower === 'transparent' || first.startsWith('#')) {
    return { color: first, ...(restLabel ? { rawLabel: restLabel } : {}) };
  }
  // Common named box colors when followed by a label
  const boxColors: Readonly<Record<string, true>> = {
    aqua: true, beige: true, blue: true, brown: true, coral: true, cyan: true, gold: true,
    gray: true, green: true, grey: true, indigo: true, ivory: true, lavender: true,
    lightblue: true, lightgray: true, lightgreen: true, lightgrey: true, lightyellow: true,
    lime: true, magenta: true, navy: true, orange: true, pink: true, purple: true, red: true,
    silver: true, skyblue: true, slate: true, teal: true, violet: true, white: true, yellow: true,
  };
  if (restLabel && Object.prototype.hasOwnProperty.call(boxColors, firstLower)) {
    return { color: first, rawLabel: restLabel };
  }
  return { rawLabel: trimmed };
}

function tryParseMessage(trimmed: string, range: TranspileSourceRange): SequenceMessageStmt | null {
  // Find earliest arrow occurrence outside quotes
  let bestPos = -1;
  let bestArrow: SequenceArrowKind | null = null;
  let colonLimit = trimmed.indexOf(':');
  if (colonLimit < 0) colonLimit = trimmed.length;

  for (let i = 1; i < colonLimit; i++) {
    const ch = trimmed[i];
    if (ch !== '-' && ch !== '<') continue;
    for (const arrow of SEQUENCE_ARROWS) {
      if (i + arrow.length <= colonLimit && trimmed.startsWith(arrow, i)) {
        bestPos = i;
        bestArrow = arrow;
        break;
      }
    }
    if (bestArrow) break;
  }

  if (!bestArrow || bestPos < 0) return null;

  const rawSender = trimmed.slice(0, bestPos).trim();
  if (!rawSender) return null;

  let afterArrow = bestPos + bestArrow.length;
  let activationModifier: '+' | '-' | undefined;
  if (trimmed[afterArrow] === '+' || trimmed[afterArrow] === '-') {
    activationModifier = trimmed[afterArrow] as '+' | '-';
    afterArrow++;
  }

  const colonIdx = trimmed.indexOf(':', afterArrow);
  const rawReceiver = (colonIdx >= 0 ? trimmed.slice(afterArrow, colonIdx) : trimmed.slice(afterArrow)).trim();
  if (!rawReceiver) return null;

  const rawMsgPart = colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : '';
  const { text, stripped } = stripWrapPrefix(rawMsgPart);

  return {
    kind: 'message',
    rawSender,
    rawReceiver,
    arrow: bestArrow,
    ...(activationModifier ? { activationModifier } : {}),
    rawText: text,
    ...(stripped ? { hasWrapPrefix: true } : {}),
    range,
  };
}

export function parseSequence(
  bodyLines: readonly BodyLine[],
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
  maxNestingDepth: number,
): SequenceAst {
  const rootItems: SequenceStmt[] = [];
  type Frame =
    | { kind: 'root'; items: SequenceStmt[] }
    | { kind: 'box'; box: SequenceBoxDecl }
    | { kind: 'block'; block: SequenceBlockStmt };

  const stack: Frame[] = [{ kind: 'root', items: rootItems }];
  let openActivationDepth = 0;

  const currentItems = (): SequenceStmt[] => {
    const top = stack[stack.length - 1]!;
    if (top.kind === 'root') return top.items;
    if (top.kind === 'block') return top.block.branches[top.block.branches.length - 1]!.items;
    // Inside box: non-participant statements fallback to parent list
    return rootItems;
  };

  for (const line of bodyLines) {
    const pieces = splitStatementsOnSemicolon(line.text, { respectBrackets: false });
    for (const piece of pieces) {
      const trimmed = piece.text.trim();
      if (!trimmed) continue;
      const lead = piece.text.length - piece.text.trimStart().length;
      const startOff = line.startOffset + piece.offsetInLine + lead;
      const stmtRange = lineIndex.range(startOff, startOff + trimmed.length);
      const top = stack[stack.length - 1]!;

      // 1. `end`
      if (trimmed === 'end') {
        if (stack.length > 1) {
          stack.pop();
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.sequence.statement.unparsed',
            message: 'Unexpected "end" without an open sequence block.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 2. `else [guard]`, `and [guard]`, `option [guard]`
      const branchMatch = /^(else|and|option)(?:\s+(.*))?$/i.exec(trimmed);
      if (branchMatch) {
        const kw = branchMatch[1]!.toLowerCase() as 'else' | 'and' | 'option';
        const guard = branchMatch[2]?.trim();
        if (top.kind === 'block') {
          const valid =
            (kw === 'else' && top.block.blockKind === 'alt') ||
            (kw === 'and' && top.block.blockKind === 'par') ||
            (kw === 'option' && top.block.blockKind === 'critical');
          if (valid) {
            top.block.branches.push({
              branchKeyword: kw,
              ...(guard ? { rawGuard: guard } : {}),
              items: [],
              range: stmtRange,
            });
            continue;
          }
        }
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.sequence.statement.unparsed',
          message: `Unexpected "${kw}" outside a matching sequence fragment.`,
          range: stmtRange,
          source: trimmed,
        });
        continue;
      }

      // 3. `box ...`
      if (/^box(?:\s|$)/i.test(trimmed)) {
        if (stack.length >= maxNestingDepth) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.input.nesting-exceeded',
            message: `Sequence block nesting exceeds maximum depth of ${maxNestingDepth}.`,
            range: stmtRange,
          });
          return { items: rootItems };
        }
        const parsed = parseBoxHeader(trimmed.slice(3));
        const box: SequenceBoxDecl = {
          kind: 'box',
          ...(parsed.color ? { color: parsed.color } : {}),
          ...(parsed.rawLabel ? { rawLabel: parsed.rawLabel } : {}),
          participants: [],
          range: stmtRange,
        };
        currentItems().push(box);
        stack.push({ kind: 'box', box });
        continue;
      }

      // 4. `create participant|actor ...`
      const createMatch = /^create\s+(participant|actor)\s+(.+)$/i.exec(trimmed);
      if (createMatch) {
        const decl = parseParticipantRest(
          createMatch[2]!,
          createMatch[1]!.toLowerCase() as 'participant' | 'actor',
          true,
          stmtRange,
        );
        if (decl) currentItems().push(decl);
        continue;
      }

      // 5. `participant|actor ...`
      const partMatch = /^(participant|actor)\s+(.+)$/i.exec(trimmed);
      if (partMatch) {
        const decl = parseParticipantRest(
          partMatch[2]!,
          partMatch[1]!.toLowerCase() as 'participant' | 'actor',
          false,
          stmtRange,
        );
        if (decl) {
          if (top.kind === 'box') top.box.participants.push(decl);
          else currentItems().push(decl);
        }
        continue;
      }

      // 6. `destroy P`
      const destroyMatch = /^destroy\s+(.+)$/i.exec(trimmed);
      if (destroyMatch) {
        currentItems().push({ kind: 'destroy', rawId: destroyMatch[1]!.trim(), range: stmtRange });
        continue;
      }

      // 7. `activate P` / `deactivate P`
      const actMatch = /^(activate|deactivate)\s+(.+)$/i.exec(trimmed);
      if (actMatch) {
        const actKind = actMatch[1]!.toLowerCase() as 'activate' | 'deactivate';
        if (actKind === 'activate') {
          openActivationDepth++;
          if (openActivationDepth > maxNestingDepth) {
            diagnostics.push({
              severity: 'error',
              code: 'mermaid.input.nesting-exceeded',
              message: `Sequence activation nesting exceeds maximum depth of ${maxNestingDepth}.`,
              range: stmtRange,
            });
            return { items: rootItems };
          }
        } else if (openActivationDepth > 0) {
          openActivationDepth--;
        }
        currentItems().push({
          kind: actKind,
          rawTarget: actMatch[2]!.trim(),
          range: stmtRange,
        });
        continue;
      }

      // 8. `Note left of|right of|over ...: text`
      const noteMatch = /^note\s+(left\s+of|right\s+of|over)\s+([^:]+):(.*)$/i.exec(trimmed);
      if (noteMatch) {
        const placeRaw = noteMatch[1]!.toLowerCase().replace(/\s+/g, ' ');
        const placement: 'left' | 'right' | 'over' =
          placeRaw === 'left of' ? 'left' : placeRaw === 'right of' ? 'right' : 'over';
        const rawTargets = noteMatch[2]!.split(',').map((t) => t.trim()).filter(Boolean);
        const { text, stripped } = stripWrapPrefix(noteMatch[3]!);
        currentItems().push({
          kind: 'note',
          placement,
          rawTargets,
          rawText: text,
          ...(stripped ? { hasWrapPrefix: true } : {}),
          range: stmtRange,
        });
        continue;
      }

      // 9. Block openers: alt, opt, loop, par, critical, break, rect
      const blockMatch = /^(alt|opt|loop|par|critical|break|rect)(?:\s+(.*))?$/i.exec(trimmed);
      if (blockMatch) {
        if (stack.length >= maxNestingDepth) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.input.nesting-exceeded',
            message: `Sequence block nesting exceeds maximum depth of ${maxNestingDepth}.`,
            range: stmtRange,
          });
          return { items: rootItems };
        }
        const bk = blockMatch[1]!.toLowerCase() as SequenceBlockStmt['blockKind'];
        const arg = blockMatch[2]?.trim();
        const block: SequenceBlockStmt = {
          kind: 'block',
          blockKind: bk,
          ...(bk === 'rect' && arg ? { rectColor: arg } : {}),
          branches: [{
            branchKeyword: bk,
            ...(bk !== 'rect' && arg ? { rawGuard: arg } : {}),
            items: [],
            range: stmtRange,
          }],
          range: stmtRange,
        };
        currentItems().push(block);
        stack.push({ kind: 'block', block });
        continue;
      }

      // 10. `autonumber`
      if (/^autonumber(?:\s|$)/i.test(trimmed)) {
        currentItems().push({ kind: 'autonumber', directive: trimmed, range: stmtRange });
        continue;
      }

      // 11. `link`, `links`, `properties`, `details`
      if (/^(links?|properties|details)\s+/i.test(trimmed)) {
        currentItems().push({ kind: 'metadata', directive: trimmed, range: stmtRange });
        continue;
      }

      // 12. Message statement
      const msg = tryParseMessage(trimmed, stmtRange);
      if (msg) {
        if (msg.activationModifier === '+') {
          openActivationDepth++;
          if (openActivationDepth > maxNestingDepth) {
            diagnostics.push({
              severity: 'error',
              code: 'mermaid.input.nesting-exceeded',
              message: `Sequence activation nesting exceeds maximum depth of ${maxNestingDepth}.`,
              range: stmtRange,
            });
            return { items: rootItems };
          }
        } else if (msg.activationModifier === '-' && openActivationDepth > 0) {
          openActivationDepth--;
        }
        currentItems().push(msg);
        continue;
      }

      diagnostics.push({
        severity: 'error',
        code: 'mermaid.sequence.statement.unparsed',
        message: `Could not parse sequence statement: "${trimmed.slice(0, 60)}".`,
        range: stmtRange,
        source: trimmed.slice(0, 120),
      });
    }
  }

  while (stack.length > 1) {
    const unclosed = stack.pop()!;
    const range = unclosed.kind === 'box' ? unclosed.box.range
      : unclosed.kind === 'block' ? unclosed.block.range : undefined;
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.sequence.block.unclosed',
      message: `Unclosed sequence ${unclosed.kind === 'box' ? 'box' : unclosed.kind === 'block' ? unclosed.block.blockKind : 'block'} missing "end".`,
      ...(range ? { range } : {}),
    });
  }

  return { items: rootItems };
}
