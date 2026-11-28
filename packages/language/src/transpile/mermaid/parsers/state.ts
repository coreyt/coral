import type { BodyLine, LineIndex } from '../preprocess.js';
import { splitStatementsOnSemicolon, splitTrailingToken } from '../lexer.js';
import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

export interface StateAliasStmt {
  kind: 'stateAlias';
  rawId: string;
  rawLabel: string;
  className?: string;
  range: TranspileSourceRange;
}

export interface StatePseudostateStmt {
  kind: 'pseudostate';
  rawId: string;
  pseudoKind: 'choice' | 'fork' | 'join';
  range: TranspileSourceRange;
}

export interface StateCompositeStmt {
  kind: 'composite';
  rawId: string;
  rawLabel?: string;
  className?: string;
  body: StateStmt[];
  range: TranspileSourceRange;
}

export interface StateDescriptionStmt {
  kind: 'description';
  rawId: string;
  rawText: string;
  range: TranspileSourceRange;
}

export interface StateTransitionStmt {
  kind: 'transition';
  rawSource: string;
  sourceClass?: string;
  rawTarget: string;
  targetClass?: string;
  rawLabel?: string;
  range: TranspileSourceRange;
}

export interface StateNoteStmt {
  kind: 'note';
  side: 'left' | 'right';
  rawTarget: string;
  rawText: string;
  range: TranspileSourceRange;
}

export interface StateConcurrencyStmt {
  kind: 'concurrency';
  range: TranspileSourceRange;
}

export interface StateDirectionStmt {
  kind: 'direction';
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  range: TranspileSourceRange;
}

export interface StateClassDefStmt {
  kind: 'classDef';
  name: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface StateClassAssignStmt {
  kind: 'class';
  targetIds: string[];
  className: string;
  range: TranspileSourceRange;
}

export interface StateStyleStmt {
  kind: 'style';
  targetId: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface StateDeclStmt {
  kind: 'stateDecl';
  rawId: string;
  className?: string;
  range: TranspileSourceRange;
}

export type StateStmt =
  | StateAliasStmt
  | StatePseudostateStmt
  | StateCompositeStmt
  | StateDescriptionStmt
  | StateTransitionStmt
  | StateNoteStmt
  | StateConcurrencyStmt
  | StateDirectionStmt
  | StateClassDefStmt
  | StateClassAssignStmt
  | StateStyleStmt
  | StateDeclStmt;

export interface StateAst {
  body: StateStmt[];
}

function splitClassSuffix(raw: string): { id: string; className?: string } {
  const idx = raw.indexOf(':::');
  if (idx > 0) {
    return { id: raw.slice(0, idx).trim(), className: raw.slice(idx + 3).trim() };
  }
  return { id: raw.trim() };
}

export function parseStateDiagram(
  bodyLines: readonly BodyLine[],
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
  maxNestingDepth: number,
): StateAst {
  const rootBody: StateStmt[] = [];
  const stack: Array<{ body: StateStmt[]; composite?: StateCompositeStmt }> = [{ body: rootBody }];
  let multilineNote: {
    side: 'left' | 'right';
    rawTarget: string;
    lines: string[];
    range: TranspileSourceRange;
    targetBody: StateStmt[];
  } | null = null;

  for (const line of bodyLines) {
    const rawTrimmed = line.text.trim();
    if (multilineNote) {
      if (/^end\s+note$/i.test(rawTrimmed)) {
        multilineNote.targetBody.push({
          kind: 'note',
          side: multilineNote.side,
          rawTarget: multilineNote.rawTarget,
          rawText: multilineNote.lines.join('\n'),
          range: multilineNote.range,
        });
        multilineNote = null;
      } else {
        multilineNote.lines.push(rawTrimmed);
      }
      continue;
    }

    const pieces = splitStatementsOnSemicolon(line.text, { respectBrackets: false });
    for (const piece of pieces) {
      const trimmed = piece.text.trim();
      if (!trimmed) continue;
      const lead = piece.text.length - piece.text.trimStart().length;
      const startOff = line.startOffset + piece.offsetInLine + lead;
      const stmtRange = lineIndex.range(startOff, startOff + trimmed.length);
      const currentBody = stack[stack.length - 1]!.body;

      // 1. Closing brace `}`
      if (trimmed === '}') {
        if (stack.length > 1) {
          stack.pop();
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.state.statement.unparsed',
            message: 'Unexpected "}" without an open composite state.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 2. Concurrent region separator `--`
      if (trimmed === '--') {
        currentBody.push({ kind: 'concurrency', range: stmtRange });
        continue;
      }

      // 3. `direction LR|RL|TB|BT|TD`
      const dirMatch = /^direction\s+(TD|TB|BT|LR|RL)$/i.exec(trimmed);
      if (dirMatch) {
        currentBody.push({
          kind: 'direction',
          direction: dirMatch[1]!.toUpperCase() as 'TD' | 'TB' | 'BT' | 'LR' | 'RL',
          range: stmtRange,
        });
        continue;
      }

      // 4. `note left|right of S : text` or multiline `note left|right of S`
      const noteInline = /^note\s+(left|right)\s+of\s+([^:]+):(.*)$/i.exec(trimmed);
      if (noteInline) {
        currentBody.push({
          kind: 'note',
          side: noteInline[1]!.toLowerCase() as 'left' | 'right',
          rawTarget: noteInline[2]!.trim(),
          rawText: noteInline[3]!.trim(),
          range: stmtRange,
        });
        continue;
      }
      const noteMulti = /^note\s+(left|right)\s+of\s+([^\s:]+)$/i.exec(trimmed);
      if (noteMulti) {
        multilineNote = {
          side: noteMulti[1]!.toLowerCase() as 'left' | 'right',
          rawTarget: noteMulti[2]!.trim(),
          lines: [],
          range: stmtRange,
          targetBody: currentBody,
        };
        continue;
      }

      // 5. `classDef`, `class`, `style`
      if (/^classDef\s+/i.test(trimmed)) {
        const rest = trimmed.slice('classDef'.length).trim();
        const sp = rest.search(/\s/);
        if (sp > 0) {
          currentBody.push({
            kind: 'classDef',
            name: rest.slice(0, sp).trim(),
            rawStyle: rest.slice(sp + 1).trim(),
            range: stmtRange,
          });
          continue;
        }
      }
      if (/^class\s+/i.test(trimmed)) {
        const rest = trimmed.slice('class'.length).trim();
        const split = splitTrailingToken(rest);
        if (split) {
          currentBody.push({
            kind: 'class',
            targetIds: split.head.split(',').map((s) => s.trim()).filter(Boolean),
            className: split.tail,
            range: stmtRange,
          });
          continue;
        }
      }
      if (/^style\s+/i.test(trimmed)) {
        const rest = trimmed.slice('style'.length).trim();
        const sp = rest.search(/\s/);
        if (sp > 0) {
          currentBody.push({
            kind: 'style',
            targetId: rest.slice(0, sp).trim(),
            rawStyle: rest.slice(sp + 1).trim(),
            range: stmtRange,
          });
          continue;
        }
      }

      // 6. `state ...`
      if (/^state\s+/i.test(trimmed)) {
        const rest = trimmed.slice('state'.length).trim();
        // `state id <<choice|fork|join>>` or `[[choice|fork|join]]`
        const pseudoMatch = /^(\S+)\s+(?:<<|\[\[)(choice|fork|join)(?:>>|\]\])$/i.exec(rest);
        if (pseudoMatch) {
          currentBody.push({
            kind: 'pseudostate',
            rawId: pseudoMatch[1]!,
            pseudoKind: pseudoMatch[2]!.toLowerCase() as 'choice' | 'fork' | 'join',
            range: stmtRange,
          });
          continue;
        }
        // M6: Composite opener (including single-line empty `state Active {}` and `state Active:::warn {`)
        const emptyComposite = rest.endsWith('{}');
        const openComposite = !emptyComposite && rest.endsWith('{');
        if (emptyComposite || openComposite) {
          if (openComposite && stack.length >= maxNestingDepth) {
            diagnostics.push({
              severity: 'error',
              code: 'mermaid.input.nesting-exceeded',
              message: `Composite state nesting exceeds maximum depth of ${maxNestingDepth}.`,
              range: stmtRange,
            });
            return { body: rootBody };
          }
          const inner = (emptyComposite ? rest.slice(0, -2) : rest.slice(0, -1)).trim();
          const aliasComp = /^"([^"]*)"\s+as\s+(\S+)$/i.exec(inner);
          let comp: StateCompositeStmt;
          if (aliasComp) {
            const split = splitClassSuffix(aliasComp[2]!);
            comp = {
              kind: 'composite',
              rawId: split.id,
              rawLabel: aliasComp[1]!,
              ...(split.className ? { className: split.className } : {}),
              body: [],
              range: stmtRange,
            };
          } else {
            const split = splitClassSuffix(inner);
            comp = {
              kind: 'composite',
              rawId: split.id,
              rawLabel: split.id,
              ...(split.className ? { className: split.className } : {}),
              body: [],
              range: stmtRange,
            };
          }
          currentBody.push(comp);
          if (openComposite) {
            stack.push({ body: comp.body, composite: comp });
          }
          continue;
        }
        // Alias: `state "Label" as id`
        const aliasMatch = /^"([^"]*)"\s+as\s+(\S+)$/i.exec(rest);
        if (aliasMatch) {
          const split = splitClassSuffix(aliasMatch[2]!);
          currentBody.push({
            kind: 'stateAlias',
            rawId: split.id,
            rawLabel: aliasMatch[1]!,
            ...(split.className ? { className: split.className } : {}),
            range: stmtRange,
          });
          continue;
        }
        // Plain `state Idle`
        if (!/\s/.test(rest)) {
          const split = splitClassSuffix(rest);
          currentBody.push({
            kind: 'stateDecl',
            rawId: split.id,
            ...(split.className ? { className: split.className } : {}),
            range: stmtRange,
          });
          continue;
        }
      }

      // 7. Transition `src --> dst [: label]` or `src -> dst [: label]`
      // M6: Only treat as transition when leftPart has no whitespace and no single `:` (outside `:::`),
      // so `Idle : Maps input -> output` parses as a state description.
      const arrowIdx = trimmed.indexOf('-->');
      const shortArrowIdx = arrowIdx < 0 ? trimmed.indexOf('->') : -1;
      const transIdx = arrowIdx >= 0 ? arrowIdx : shortArrowIdx;
      const arrowLen = arrowIdx >= 0 ? 3 : 2;
      if (transIdx > 0) {
        const leftPart = trimmed.slice(0, transIdx).trim();
        const leftWithoutClass = splitClassSuffix(leftPart).id;
        const leftIsSingleState = Boolean(leftWithoutClass) && !/\s/.test(leftPart) && !leftWithoutClass.includes(':');
        if (leftIsSingleState) {
          const afterArrow = trimmed.slice(transIdx + arrowLen).trim();
          // Find `: label` (skip `:::className`)
          let labelIdx = -1;
          for (let i = 0; i < afterArrow.length; i++) {
            if (afterArrow[i] === ':') {
              if (afterArrow.startsWith(':::', i)) {
                i += 2;
                continue;
              }
              labelIdx = i;
              break;
            }
          }
          const rightPart = (labelIdx >= 0 ? afterArrow.slice(0, labelIdx) : afterArrow).trim();
          const rawLabel = labelIdx >= 0 ? afterArrow.slice(labelIdx + 1).trim() : undefined;
          if (leftPart && rightPart) {
            const src = splitClassSuffix(leftPart);
            const dst = splitClassSuffix(rightPart);
            currentBody.push({
              kind: 'transition',
              rawSource: src.id,
              ...(src.className ? { sourceClass: src.className } : {}),
              rawTarget: dst.id,
              ...(dst.className ? { targetClass: dst.className } : {}),
              ...(rawLabel !== undefined && rawLabel !== '' ? { rawLabel } : {}),
              range: stmtRange,
            });
            continue;
          }
        }
      }

      // 8. State description `s1 : description` (avoid matching `:::className`)
      let descColon = -1;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === ':') {
          if (trimmed.startsWith(':::', i)) { i += 2; continue; }
          descColon = i;
          break;
        }
      }
      if (descColon > 0) {
        const rawId = trimmed.slice(0, descColon).trim();
        const rawText = trimmed.slice(descColon + 1).trim();
        if (rawId && !/\s/.test(rawId)) {
          currentBody.push({ kind: 'description', rawId, rawText, range: stmtRange });
          continue;
        }
      }

      // 9. Bare single-token state declaration `Idle` or `Idle:::warn`
      if (!/\s/.test(trimmed)) {
        const split = splitClassSuffix(trimmed);
        currentBody.push({
          kind: 'stateDecl',
          rawId: split.id,
          ...(split.className ? { className: split.className } : {}),
          range: stmtRange,
        });
        continue;
      }

      diagnostics.push({
        severity: 'error',
        code: 'mermaid.state.statement.unparsed',
        message: `Could not parse state diagram statement: "${trimmed.slice(0, 60)}".`,
        range: stmtRange,
        source: trimmed.slice(0, 120),
      });
    }
  }

  if (multilineNote) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.state.block.unclosed',
      message: 'Unclosed multiline note missing "end note".',
      range: multilineNote.range,
    });
  }

  while (stack.length > 1) {
    const unclosed = stack.pop()!;
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.state.block.unclosed',
      message: `Composite state "${unclosed.composite?.rawId ?? 'unknown'}" is missing a closing "}".`,
      ...(unclosed.composite ? { range: unclosed.composite.range } : {}),
    });
  }

  return { body: rootBody };
}
