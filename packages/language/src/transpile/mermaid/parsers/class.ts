import type { BodyLine, LineIndex } from '../preprocess.js';
import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

export type ClassRelationOp =
  | '<|--|>'
  | '<|..|>'
  | '*--*'
  | 'o--o'
  | '<-->'
  | '<..>'
  | '<|--'
  | '--|>'
  | '<|..'
  | '..|>'
  | '*--'
  | '--*'
  | 'o--'
  | '--o'
  | '-->'
  | '<--'
  | '..>'
  | '<..'
  | '()--'
  | '--()'
  | '--'
  | '..';

export interface ClassMemberLine {
  rawText: string;
  range: TranspileSourceRange;
}

export interface ClassDeclStmt {
  kind: 'classDecl';
  rawId: string;
  rawAlias?: string;
  genericParam?: string;
  className?: string;
  stereotypes: string[];
  members: ClassMemberLine[];
  range: TranspileSourceRange;
}

export interface ClassNamespaceStmt {
  kind: 'namespace';
  rawId: string;
  body: ClassStmt[];
  range: TranspileSourceRange;
}

export interface ClassStereotypeStmt {
  kind: 'stereotype';
  stereotype: string;
  rawClassId: string;
  range: TranspileSourceRange;
}

export interface ClassInlineMemberStmt {
  kind: 'inlineMember';
  rawClassId: string;
  rawText: string;
  range: TranspileSourceRange;
}

export interface ClassRelationStmt {
  kind: 'relation';
  leftId: string;
  leftGeneric?: string;
  leftMultiplicity?: string;
  operator: ClassRelationOp;
  rightId: string;
  rightGeneric?: string;
  rightMultiplicity?: string;
  rawLabel?: string;
  range: TranspileSourceRange;
}

export interface ClassDirectionStmt {
  kind: 'direction';
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  range: TranspileSourceRange;
}

export interface ClassNoteStmt {
  kind: 'note';
  forClass?: string;
  rawText: string;
  range: TranspileSourceRange;
}

export interface ClassStyleStmt {
  kind: 'style';
  targetId: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface ClassDefStmt {
  kind: 'classDef';
  name: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface ClassAssignStmt {
  kind: 'cssClass';
  targetIds: string[];
  className: string;
  range: TranspileSourceRange;
}

export interface ClassLinkStmt {
  kind: 'link';
  directive: string;
  range: TranspileSourceRange;
}

export type ClassStmt =
  | ClassDeclStmt
  | ClassNamespaceStmt
  | ClassStereotypeStmt
  | ClassInlineMemberStmt
  | ClassRelationStmt
  | ClassDirectionStmt
  | ClassNoteStmt
  | ClassStyleStmt
  | ClassDefStmt
  | ClassAssignStmt
  | ClassLinkStmt;

export interface ClassAst {
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  body: ClassStmt[];
}

const CLASS_REL_OPS: readonly ClassRelationOp[] = [
  '<|--|>',
  '<|..|>',
  '*--*',
  'o--o',
  '<-->',
  '<..>',
  '<|--',
  '--|>',
  '<|..',
  '..|>',
  '*--',
  '--*',
  'o--',
  '--o',
  '-->',
  '<--',
  '..>',
  '<..',
  '()--',
  '--()',
  '--',
  '..',
];

function stripGeneric(raw: string): { id: string; generic?: string } {
  const tilde = raw.indexOf('~');
  if (tilde > 0 && raw.endsWith('~') && raw.length > tilde + 1) {
    return { id: raw.slice(0, tilde), generic: raw.slice(tilde + 1, -1) };
  }
  return { id: raw };
}

function unquoteBacktick(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) return t.slice(1, -1);
  return t;
}

function parseClassHeader(rest: string): {
  rawId: string;
  rawAlias?: string;
  genericParam?: string;
  className?: string;
  opensBlock: boolean;
} | null {
  let working = rest.trim();
  let opensBlock = false;
  if (working.endsWith('{')) {
    opensBlock = true;
    working = working.slice(0, -1).trim();
  }
  // Optional :::styleClass
  let className: string | undefined;
  const cssIdx = working.indexOf(':::');
  if (cssIdx > 0) {
    className = working.slice(cssIdx + 3).trim();
    working = working.slice(0, cssIdx).trim();
  }
  // Optional ["Alias"]
  let rawAlias: string | undefined;
  const bracketIdx = working.indexOf('[');
  if (bracketIdx > 0 && working.endsWith(']')) {
    const inside = working.slice(bracketIdx + 1, -1).trim();
    rawAlias = inside.startsWith('"') && inside.endsWith('"') && inside.length >= 2
      ? inside.slice(1, -1) : inside;
    working = working.slice(0, bracketIdx).trim();
  }
  const clean = unquoteBacktick(working);
  if (!clean) return null;
  const { id, generic } = stripGeneric(clean);
  return {
    rawId: id,
    ...(rawAlias !== undefined ? { rawAlias } : {}),
    ...(generic !== undefined ? { genericParam: generic } : {}),
    ...(className ? { className } : {}),
    opensBlock,
  };
}

function tryParseRelation(trimmed: string, range: TranspileSourceRange): ClassRelationStmt | null {
  // Split off optional `: label` outside quotes
  let mainPart = trimmed;
  let rawLabel: string | undefined;
  let inQuote = false;
  let inBacktick = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inQuote = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === ':') {
      mainPart = trimmed.slice(0, i).trim();
      rawLabel = trimmed.slice(i + 1).trim();
      break;
    }
  }

  // Find operator outside quotes/backticks
  inQuote = false;
  inBacktick = false;
  let opPos = -1;
  let foundOp: ClassRelationOp | null = null;
  for (let i = 1; i < mainPart.length; i++) {
    const ch = mainPart[i]!;
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inQuote = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === '<' || ch === '-' || ch === '.' || ch === '*' || ch === 'o' || ch === '(') {
      for (const op of CLASS_REL_OPS) {
        if (mainPart.startsWith(op, i)) {
          // M7: Allow spaceless `Order*--LineItem`; only guard `o` with preceding whitespace
          if (op.startsWith('o') && i > 0 && !/\s/.test(mainPart[i - 1]!)) {
            continue;
          }
          // Avoid matching `--` or `..` if right after an alphanumeric without space when part of `...`
          opPos = i;
          foundOp = op;
          break;
        }
      }
      if (foundOp) break;
    }
  }

  if (!foundOp || opPos < 0) return null;

  const leftRaw = mainPart.slice(0, opPos).trim();
  const rightRaw = mainPart.slice(opPos + foundOp.length).trim();
  if (!leftRaw || !rightRaw) return null;

  // C3: Linear scan for left multiplicity `<id> "mult"`
  let leftIdRaw = leftRaw;
  let leftMultiplicity: string | undefined;
  if (leftRaw.endsWith('"') && leftRaw.length >= 2) {
    const openQuote = leftRaw.lastIndexOf('"', leftRaw.length - 2);
    if (openQuote > 0 && (leftRaw[openQuote - 1] === ' ' || leftRaw[openQuote - 1] === '\t')) {
      const before = leftRaw.slice(0, openQuote).trim();
      if (before) {
        leftIdRaw = before;
        leftMultiplicity = leftRaw.slice(openQuote + 1, -1);
      }
    }
  }

  // C3: Linear scan for right multiplicity `"mult" <id>`
  let rightIdRaw = rightRaw;
  let rightMultiplicity: string | undefined;
  if (rightRaw.startsWith('"') && rightRaw.length >= 2) {
    const closeQuote = rightRaw.indexOf('"', 1);
    if (closeQuote > 0 && closeQuote + 1 < rightRaw.length && (rightRaw[closeQuote + 1] === ' ' || rightRaw[closeQuote + 1] === '\t')) {
      const after = rightRaw.slice(closeQuote + 1).trim();
      if (after) {
        rightMultiplicity = rightRaw.slice(1, closeQuote);
        rightIdRaw = after;
      }
    }
  }

  const left = stripGeneric(unquoteBacktick(leftIdRaw));
  const right = stripGeneric(unquoteBacktick(rightIdRaw));
  if (!left.id || !right.id) return null;

  return {
    kind: 'relation',
    leftId: left.id,
    ...(left.generic ? { leftGeneric: left.generic } : {}),
    ...(leftMultiplicity !== undefined ? { leftMultiplicity } : {}),
    operator: foundOp,
    rightId: right.id,
    ...(right.generic ? { rightGeneric: right.generic } : {}),
    ...(rightMultiplicity !== undefined ? { rightMultiplicity } : {}),
    ...(rawLabel !== undefined && rawLabel !== '' ? { rawLabel } : {}),
    range,
  };
}

export function parseClassDiagram(
  bodyLines: readonly BodyLine[],
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
  maxNestingDepth: number,
): ClassAst {
  const rootBody: ClassStmt[] = [];
  let direction: ClassAst['direction'];

  type Frame =
    | { kind: 'root'; body: ClassStmt[] }
    | { kind: 'namespace'; ns: ClassNamespaceStmt }
    | { kind: 'class'; cls: ClassDeclStmt };

  const stack: Frame[] = [{ kind: 'root', body: rootBody }];

  const currentBody = (): ClassStmt[] => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      if (f.kind === 'root') return f.body;
      if (f.kind === 'namespace') return f.ns.body;
    }
    return rootBody;
  };

  for (const line of bodyLines) {
    const trimmed = line.text.trim();
    if (!trimmed) continue;
    const lead = line.text.length - line.text.trimStart().length;
    const stmtRange = lineIndex.range(line.startOffset + lead, line.startOffset + lead + trimmed.length);
    const top = stack[stack.length - 1]!;

    // Closing brace
    if (trimmed === '}') {
      if (stack.length > 1) {
        stack.pop();
      } else {
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.class.statement.unparsed',
          message: 'Unexpected "}" without an open class or namespace block.',
          range: stmtRange,
          source: trimmed,
        });
      }
      continue;
    }

    // Inside a class body `{ ... }`
    if (top.kind === 'class') {
      const stereoMatch = /^<<([^>]+)>>$/.exec(trimmed);
      if (stereoMatch) {
        top.cls.stereotypes.push(stereoMatch[1]!.trim());
      } else {
        top.cls.members.push({ rawText: trimmed, range: stmtRange });
      }
      continue;
    }

    // 1. `direction TB|BT|LR|RL`
    const dirMatch = /^direction\s+(TD|TB|BT|LR|RL)$/i.exec(trimmed);
    if (dirMatch) {
      direction = dirMatch[1]!.toUpperCase() as ClassAst['direction'];
      currentBody().push({ kind: 'direction', direction: direction!, range: stmtRange });
      continue;
    }

    // 2. C3: Linear check for `namespace Ns {`
    if (/^namespace[ \t]+/i.test(trimmed) && trimmed.endsWith('{')) {
      const nsNameRaw = trimmed.slice('namespace'.length, -1).trim();
      if (nsNameRaw && !nsNameRaw.includes('{')) {
        if (stack.length >= maxNestingDepth) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.input.nesting-exceeded',
            message: `Class namespace nesting exceeds maximum depth of ${maxNestingDepth}.`,
            range: stmtRange,
          });
          return { ...(direction ? { direction } : {}), body: rootBody };
        }
        const ns: ClassNamespaceStmt = {
          kind: 'namespace',
          rawId: unquoteBacktick(nsNameRaw),
          body: [],
          range: stmtRange,
        };
        currentBody().push(ns);
        stack.push({ kind: 'namespace', ns });
        continue;
      }
    }

    // 3. `class ...`
    if (/^class\s+/i.test(trimmed)) {
      const parsed = parseClassHeader(trimmed.slice('class'.length));
      if (parsed) {
        const cls: ClassDeclStmt = {
          kind: 'classDecl',
          rawId: parsed.rawId,
          ...(parsed.rawAlias !== undefined ? { rawAlias: parsed.rawAlias } : {}),
          ...(parsed.genericParam !== undefined ? { genericParam: parsed.genericParam } : {}),
          ...(parsed.className ? { className: parsed.className } : {}),
          stereotypes: [],
          members: [],
          range: stmtRange,
        };
        currentBody().push(cls);
        if (parsed.opensBlock) {
          if (stack.length >= maxNestingDepth) {
            diagnostics.push({
              severity: 'error',
              code: 'mermaid.input.nesting-exceeded',
              message: `Class block nesting exceeds maximum depth of ${maxNestingDepth}.`,
              range: stmtRange,
            });
            return { ...(direction ? { direction } : {}), body: rootBody };
          }
          stack.push({ kind: 'class', cls });
        }
        continue;
      }
    }

    // 4. Standalone `<<stereotype>> ClassId`
    const standaloneStereo = /^<<([^>]+)>>\s+(.+)$/.exec(trimmed);
    if (standaloneStereo) {
      currentBody().push({
        kind: 'stereotype',
        stereotype: standaloneStereo[1]!.trim(),
        rawClassId: unquoteBacktick(standaloneStereo[2]!.trim()),
        range: stmtRange,
      });
      continue;
    }

    // 5. `note for Foo "..."` or `note "..."`
    const noteForMatch = /^note\s+for\s+(\S+)\s+"([^"]*)"$/i.exec(trimmed);
    if (noteForMatch) {
      currentBody().push({
        kind: 'note',
        forClass: unquoteBacktick(noteForMatch[1]!),
        rawText: noteForMatch[2]!,
        range: stmtRange,
      });
      continue;
    }
    const notePlainMatch = /^note\s+"([^"]*)"$/i.exec(trimmed);
    if (notePlainMatch) {
      currentBody().push({ kind: 'note', rawText: notePlainMatch[1]!, range: stmtRange });
      continue;
    }

    // 6. `style`, `classDef`, `cssClass`
    if (/^classDef\s+/i.test(trimmed)) {
      const rest = trimmed.slice('classDef'.length).trim();
      const sp = rest.search(/\s/);
      if (sp > 0) {
        currentBody().push({
          kind: 'classDef',
          name: rest.slice(0, sp).trim(),
          rawStyle: rest.slice(sp + 1).trim(),
          range: stmtRange,
        });
        continue;
      }
    }
    if (/^cssClass\s+/i.test(trimmed)) {
      const rest = trimmed.slice('cssClass'.length).trim();
      const match = /^"([^"]+)"\s+(\S+)$/.exec(rest);
      if (match) {
        currentBody().push({
          kind: 'cssClass',
          targetIds: match[1]!.split(',').map((s) => s.trim()).filter(Boolean),
          className: match[2]!,
          range: stmtRange,
        });
        continue;
      }
    }
    if (/^style\s+/i.test(trimmed)) {
      const rest = trimmed.slice('style'.length).trim();
      const sp = rest.search(/\s/);
      if (sp > 0) {
        currentBody().push({
          kind: 'style',
          targetId: rest.slice(0, sp).trim(),
          rawStyle: rest.slice(sp + 1).trim(),
          range: stmtRange,
        });
        continue;
      }
    }

    // 7. `link` / `callback` / `click`
    if (/^(link|callback|click)\s+/i.test(trimmed)) {
      currentBody().push({ kind: 'link', directive: trimmed, range: stmtRange });
      continue;
    }

    // 8. Relationship
    const rel = tryParseRelation(trimmed, stmtRange);
    if (rel) {
      currentBody().push(rel);
      continue;
    }

    // 9. Inline member `ClassId : +String owner`
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const clsId = unquoteBacktick(trimmed.slice(0, colonIdx).trim());
      const memberText = trimmed.slice(colonIdx + 1).trim();
      if (clsId && memberText && !/\s/.test(clsId)) {
        currentBody().push({
          kind: 'inlineMember',
          rawClassId: stripGeneric(clsId).id,
          rawText: memberText,
          range: stmtRange,
        });
        continue;
      }
    }

    diagnostics.push({
      severity: 'error',
      code: 'mermaid.class.statement.unparsed',
      message: `Could not parse class diagram statement: "${trimmed.slice(0, 60)}".`,
      range: stmtRange,
      source: trimmed.slice(0, 120),
    });
  }

  while (stack.length > 1) {
    const unclosed = stack.pop()!;
    const range = unclosed.kind === 'namespace' ? unclosed.ns.range
      : unclosed.kind === 'class' ? unclosed.cls.range : undefined;
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.class.block.unclosed',
      message: `Unclosed ${unclosed.kind} block missing "}".`,
      ...(range ? { range } : {}),
    });
  }

  return { ...(direction ? { direction } : {}), body: rootBody };
}
