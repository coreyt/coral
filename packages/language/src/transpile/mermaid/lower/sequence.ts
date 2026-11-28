import { normalizeMermaidText } from '../lexer.js';
import type {
  SequenceArrowKind,
  SequenceAst,
  SequenceBlockStmt,
  SequenceBoxDecl,
  SequenceParticipantDecl,
  SequenceStmt,
} from '../parsers/sequence.js';
import type {
  CoralSequenceGroupIr,
  CoralSequenceItemIr,
  CoralSequenceParticipantIr,
  CoralSourceIr,
  TranspileDiagnostic,
  TranspileMode,
  TranspileSourceRange,
} from '../types.js';
import { allocateSanitizedId, createNullMap } from './ids.js';

interface ParticipantRecord {
  rawId: string;
  coralId: string;
  kind: 'participant' | 'actor';
  label?: string;
  range: TranspileSourceRange;
}

interface RawActivationSpan {
  participantId: string;
  startIndex: number;
  endIndex: number;
  openOrder: number;
  range: TranspileSourceRange;
}

function mapSequenceArrow(
  arrow: SequenceArrowKind,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): string {
  switch (arrow) {
    case '->>': return '-#>';
    case '-->>': return '-.->';
    case '-)': return '->';
    case '--)' :
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.sequence.arrow.normalized',
        message: 'Dashed async arrow "--)" normalized to Coral dashed open arrow "-.->".',
        range,
      });
      return '-.->';
    case '->':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.degraded',
        message: 'Arrowless sequence line "->" degraded to Coral async arrow "->".',
        range,
      });
      return '->';
    case '-->':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.degraded',
        message: 'Dashed arrowless sequence line "-->" degraded to Coral return arrow "-.->".',
        range,
      });
      return '-.->';
    case '-x':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.cross.degraded',
        message: 'Cross sequence arrow "-x" degraded to Coral async arrow "->".',
        range,
      });
      return '->';
    case '--x':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.cross.degraded',
        message: 'Dashed cross sequence arrow "--x" degraded to Coral return arrow "-.->".',
        range,
      });
      return '-.->';
    case '<<->>':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.bidirectional.degraded',
        message: 'Bidirectional sequence arrow "<<->>" degraded to Coral sync arrow "-#>".',
        range,
      });
      return '-#>';
    case '<<-->>':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.bidirectional.degraded',
        message: 'Bidirectional dashed sequence arrow "<<-->>" degraded to Coral return arrow "-.->".',
        range,
      });
      return '-.->';
    case '-|>':
    case '-|)':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.degraded',
        message: `Mermaid v11 sequence arrow "${arrow}" degraded to Coral sync arrow "-#>".`,
        range,
      });
      return '-#>';
    case '--|>':
    case '--|)':
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.arrow.degraded',
        message: `Mermaid v11 dashed sequence arrow "${arrow}" degraded to Coral return arrow "-.->".`,
        range,
      });
      return '-.->';
  }
}

export function lowerSequence(
  ast: SequenceAst,
  options: { mode: TranspileMode; maxNestingDepth: number; comments: string[] },
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const usedIdentities = new Set<string>();
  const participantsByRaw = new Map<string, ParticipantRecord>();
  const participantsOrder: ParticipantRecord[] = [];
  const boxes: SequenceBoxDecl[] = [];

  const registerParticipant = (
    rawId: string,
    kind: 'participant' | 'actor',
    rawAlias: string | undefined,
    range: TranspileSourceRange,
    explicit: boolean,
  ): ParticipantRecord => {
    const existing = participantsByRaw.get(rawId);
    const label = rawAlias !== undefined ? normalizeMermaidText(rawAlias, diagnostics, range) : undefined;
    if (existing) {
      if (explicit && kind === 'actor') existing.kind = 'actor';
      if (label !== undefined) existing.label = label;
      return existing;
    }
    const { coralId, renamed } = allocateSanitizedId(rawId, usedIdentities, diagnostics, range);
    idMap[coralId] = rawId;
    const fallbackLabel = renamed ? normalizeMermaidText(rawId, diagnostics, range, { unquote: false }) : undefined;
    const rec: ParticipantRecord = {
      rawId,
      coralId,
      kind,
      ...(label !== undefined ? { label } : fallbackLabel !== undefined ? { label: fallbackLabel } : {}),
      range,
    };
    participantsByRaw.set(rawId, rec);
    participantsOrder.push(rec);
    return rec;
  };

  // Pass 1: Collect explicit & implicit participants in appearance order FIRST
  const collectParticipants = (stmts: readonly SequenceStmt[]) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'participant':
          if (stmt.v11Type) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.sequence.participant-type.degraded',
              message: `Mermaid v11 participant type "${stmt.v11Type}" on "${stmt.rawId}" degraded to standard participant.`,
              range: stmt.range,
            });
          }
          registerParticipant(stmt.rawId, stmt.actorKind, stmt.rawAlias, stmt.range, true);
          break;
        case 'box':
          boxes.push(stmt);
          for (const p of stmt.participants) {
            if (p.v11Type) {
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.sequence.participant-type.degraded',
                message: `Mermaid v11 participant type "${p.v11Type}" on "${p.rawId}" degraded to standard participant.`,
                range: p.range,
              });
            }
            registerParticipant(p.rawId, p.actorKind, p.rawAlias, p.range, true);
          }
          break;
        case 'message':
          registerParticipant(stmt.rawSender, 'participant', undefined, stmt.range, false);
          registerParticipant(stmt.rawReceiver, 'participant', undefined, stmt.range, false);
          break;
        case 'note':
          for (const t of stmt.rawTargets) {
            registerParticipant(t, 'participant', undefined, stmt.range, false);
          }
          break;
        case 'activate':
        case 'deactivate':
          registerParticipant(stmt.rawTarget, 'participant', undefined, stmt.range, false);
          break;
        case 'destroy':
          registerParticipant(stmt.rawId, 'participant', undefined, stmt.range, false);
          break;
        case 'block':
          for (const br of stmt.branches) collectParticipants(br.items);
          break;
        case 'autonumber':
        case 'metadata':
          break;
      }
    }
  };

  collectParticipants(ast.items);

  // Helper to allocate collision-free synthetic IDs (`box_N`, `msg_N`)
  let boxSeq = 0;
  let msgSeq = 0;
  const nextBoxId = (): string => {
    let candidate = `box_${++boxSeq}`;
    while (usedIdentities.has(candidate)) candidate = `box_${++boxSeq}`;
    usedIdentities.add(candidate);
    return candidate;
  };
  const nextMsgId = (): string => {
    let candidate = `msg_${++msgSeq}`;
    while (usedIdentities.has(candidate)) candidate = `msg_${++msgSeq}`;
    usedIdentities.add(candidate);
    return candidate;
  };

  // Build participant groups from `box`
  const groups: CoralSequenceGroupIr[] = [];
  const groupedParticipantIds = new Set<string>();
  for (const box of boxes) {
    if (box.color && box.color.toLowerCase() !== 'transparent') {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.sequence.box-color.dropped',
        message: `Sequence box background color "${box.color}" has no Coral saved-source equivalent and was omitted.`,
        range: box.range,
      });
    }
    const members: string[] = [];
    for (const p of box.participants) {
      const rec = participantsByRaw.get(p.rawId);
      if (rec && !members.includes(rec.coralId) && !groupedParticipantIds.has(rec.coralId)) {
        members.push(rec.coralId);
        groupedParticipantIds.add(rec.coralId);
      }
    }
    if (members.length > 0) {
      const label = box.rawLabel !== undefined
        ? normalizeMermaidText(box.rawLabel, diagnostics, box.range)
        : undefined;
      groups.push({
        id: nextBoxId(),
        members,
        ...(label ? { label } : {}),
      });
    }
  }

  // Track participant usage after a given statement index at root level for `destroy` validation
  const stmtReferencesParticipant = (stmt: SequenceStmt, rawId: string): boolean => {
    switch (stmt.kind) {
      case 'message': return stmt.rawSender === rawId || stmt.rawReceiver === rawId;
      case 'note': return stmt.rawTargets.includes(rawId);
      case 'activate':
      case 'deactivate': return stmt.rawTarget === rawId;
      case 'block': return stmt.branches.some((b) => b.items.some((i) => stmtReferencesParticipant(i, rawId)));
      default: return false;
    }
  };

  const createdParticipants = new Set<string>();
  const destroyedParticipants = new Set<string>();
  const usedBeforeIndex = new Set<string>();
  let globalOpenOrder = 0;

  const lowerContainer = (stmts: readonly SequenceStmt[], isRoot: boolean): CoralSequenceItemIr[] => {
    const concreteItems: CoralSequenceItemIr[] = [];
    const itemParticipants: Array<Set<string>> = [];
    const destroyTargetsAtIndex = new Map<number, string>();
    const openStacks = new Map<string, Array<{ startIndex: number; openOrder: number; range: TranspileSourceRange; preAnchored: boolean }>>();
    let containerOpenCount = 0;
    const closedSpans: RawActivationSpan[] = [];
    let pendingCreate: SequenceParticipantDecl | null = null;
    let pendingDestroy: { rawId: string; range: TranspileSourceRange; stmtIdx: number } | null = null;

    for (let idx = 0; idx < stmts.length; idx++) {
      const stmt = stmts[idx]!;
      switch (stmt.kind) {
        case 'box':
          // Participants already registered in Pass 1; box group already emitted
          break;
        case 'participant':
          if (stmt.isCreate) {
            if (!isRoot) {
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.sequence.create.root-only.dropped',
                message: `Participant creation for "${stmt.rawId}" inside a fragment is not supported by Coral and [create] was omitted.`,
                range: stmt.range,
              });
            } else {
              pendingCreate = stmt;
            }
          }
          break;
        case 'destroy':
          if (!isRoot) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.sequence.destroy.unsupported.dropped',
              message: `Destruction of "${stmt.rawId}" inside a fragment is not supported by Coral and [destroy] was omitted.`,
              range: stmt.range,
            });
          } else {
            pendingDestroy = { rawId: stmt.rawId, range: stmt.range, stmtIdx: idx };
          }
          break;
        case 'autonumber':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.sequence.autonumber.dropped',
            message: 'Mermaid "autonumber" has no Coral saved-source equivalent and was omitted.',
            range: stmt.range,
          });
          break;
        case 'metadata':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.sequence.metadata.dropped',
            message: `Mermaid sequence metadata directive "${stmt.directive.split(/\s+/)[0]}" has no Coral equivalent and was omitted.`,
            range: stmt.range,
          });
          break;
        case 'message': {
          if (stmt.hasWrapPrefix) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.sequence.text-wrap.dropped',
              message: 'Mermaid wrap:/nowrap: prefix has no Coral equivalent and was stripped.',
              range: stmt.range,
            });
          }
          const senderRec = participantsByRaw.get(stmt.rawSender)!;
          const receiverRec = participantsByRaw.get(stmt.rawReceiver)!;
          let operator = mapSequenceArrow(stmt.arrow, diagnostics, stmt.range);
          const label = stmt.rawText ? normalizeMermaidText(stmt.rawText, diagnostics, stmt.range) : undefined;
          let relation: 'create' | 'destroy' | undefined;

          // Pending create check
          if (pendingCreate) {
            if (pendingCreate.rawId === stmt.rawReceiver && !createdParticipants.has(receiverRec.coralId)
              && !usedBeforeIndex.has(receiverRec.coralId)) {
              relation = 'create';
              createdParticipants.add(receiverRec.coralId);
              if (operator !== '-.->') {
                operator = '-.->';
                diagnostics.push({
                  severity: 'info',
                  code: 'mermaid.sequence.create-arrow.normalized',
                  message: `Creation message arrow to "${stmt.rawReceiver}" normalized to dashed open arrow "-.->" required by Coral [create].`,
                  range: stmt.range,
                });
              }
            } else {
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.sequence.create.root-only.dropped',
                message: `Could not attach [create] for "${pendingCreate.rawId}" to the following message.`,
                range: pendingCreate.range,
              });
            }
            pendingCreate = null;
          }

          // Pending destroy check
          if (pendingDestroy) {
            const targetDestroyId = pendingDestroy.rawId;
            const targetDestroyRec = participantsByRaw.get(targetDestroyId);
            const usedLater = stmts.slice(idx + 1).some((later) => stmtReferencesParticipant(later, targetDestroyId));
            if (
              relation === undefined &&
              targetDestroyRec &&
              targetDestroyId === stmt.rawReceiver &&
              !destroyedParticipants.has(targetDestroyRec.coralId) &&
              !usedLater
            ) {
              relation = 'destroy';
              destroyedParticipants.add(targetDestroyRec.coralId);
            } else {
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.sequence.destroy.unsupported.dropped',
                message: `Could not safely attach [destroy] for "${targetDestroyId}" (must be root-level, targeting the destroyed participant with no subsequent uses).`,
                range: pendingDestroy.range,
              });
            }
            pendingDestroy = null;
          }

          const msgIdx = concreteItems.length;
          const msgItem: CoralSequenceItemIr = {
            kind: 'message',
            id: nextMsgId(),
            source: senderRec.coralId,
            target: receiverRec.coralId,
            operator,
            ...(relation ? { relation } : {}),
            ...(label ? { label } : {}),
          };
          concreteItems.push(msgItem);
          itemParticipants.push(new Set([senderRec.coralId, receiverRec.coralId]));
          if (relation === 'destroy') {
            destroyTargetsAtIndex.set(msgIdx, receiverRec.coralId);
          }
          usedBeforeIndex.add(senderRec.coralId);
          usedBeforeIndex.add(receiverRec.coralId);

          // Arrow `+` / `-` activation modifiers
          if (stmt.activationModifier === '+') {
            if (containerOpenCount >= options.maxNestingDepth) {
              diagnostics.push({
                severity: 'error',
                code: 'mermaid.input.nesting-exceeded',
                message: `Sequence activation nesting exceeds maximum depth of ${options.maxNestingDepth}.`,
                range: stmt.range,
              });
              return concreteItems;
            }
            const stk = openStacks.get(receiverRec.coralId) ?? [];
            stk.push({ startIndex: msgIdx, openOrder: ++globalOpenOrder, range: stmt.range, preAnchored: false });
            openStacks.set(receiverRec.coralId, stk);
            containerOpenCount++;
          } else if (stmt.activationModifier === '-') {
            const stk = openStacks.get(senderRec.coralId);
            if (stk && stk.length > 0) {
              const opened = stk.pop()!;
              containerOpenCount = Math.max(0, containerOpenCount - 1);
              closedSpans.push({
                participantId: senderRec.coralId,
                startIndex: opened.startIndex,
                endIndex: msgIdx,
                openOrder: opened.openOrder,
                range: opened.range,
              });
            } else {
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.sequence.activation.non-nested.dropped',
                message: `Deactivation "-" on "${stmt.rawSender}" has no matching open activation in the same container and was omitted.`,
                range: stmt.range,
              });
            }
          }
          break;
        }
        case 'note': {
          if (stmt.hasWrapPrefix) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.sequence.text-wrap.dropped',
              message: 'Mermaid wrap:/nowrap: prefix has no Coral equivalent and was stripped.',
              range: stmt.range,
            });
          }
          if (stmt.placement === 'left' || stmt.placement === 'right') {
            diagnostics.push({
              severity: 'info',
              code: 'mermaid.sequence.note-side.degraded',
              message: `Note "${stmt.placement} of" placement normalized to Coral "note ... on ...".`,
              range: stmt.range,
            });
          }
          const targets = stmt.rawTargets
            .map((t) => participantsByRaw.get(t)?.coralId)
            .filter((x): x is string => Boolean(x));
          if (targets.length > 0) {
            const text = normalizeMermaidText(stmt.rawText, diagnostics, stmt.range);
            concreteItems.push({ kind: 'note', text, targets });
            itemParticipants.push(new Set(targets));
            for (const t of targets) usedBeforeIndex.add(t);
          }
          break;
        }
        case 'activate': {
          const rec = participantsByRaw.get(stmt.rawTarget)!;
          // M5: Record participant use so a subsequent [create] is not emitted after prior activation
          usedBeforeIndex.add(rec.coralId);
          if (containerOpenCount >= options.maxNestingDepth) {
            diagnostics.push({
              severity: 'error',
              code: 'mermaid.input.nesting-exceeded',
              message: `Sequence activation nesting exceeds maximum depth of ${options.maxNestingDepth}.`,
              range: stmt.range,
            });
            return concreteItems;
          }
          // Anchor to immediately preceding sibling message iff it targeted rec; else next sibling item!
          const prevItem = concreteItems[concreteItems.length - 1];
          const anchorPrev = prevItem?.kind === 'message' && prevItem.target === rec.coralId;
          const startIndex = anchorPrev ? concreteItems.length - 1 : concreteItems.length;
          const stk = openStacks.get(rec.coralId) ?? [];
          stk.push({ startIndex, openOrder: ++globalOpenOrder, range: stmt.range, preAnchored: !anchorPrev });
          openStacks.set(rec.coralId, stk);
          containerOpenCount++;
          break;
        }
        case 'deactivate': {
          const rec = participantsByRaw.get(stmt.rawTarget)!;
          const stk = openStacks.get(rec.coralId);
          if (stk && stk.length > 0) {
            const opened = stk.pop()!;
            containerOpenCount = Math.max(0, containerOpenCount - 1);
            const endIndex = concreteItems.length - 1;
            if (endIndex >= opened.startIndex) {
              closedSpans.push({
                participantId: rec.coralId,
                startIndex: opened.startIndex,
                endIndex,
                openOrder: opened.openOrder,
                range: opened.range,
              });
            } else {
              diagnostics.push({
                severity: 'info',
                code: 'mermaid.sequence.activation.empty.dropped',
                message: `Empty activation on "${stmt.rawTarget}" was omitted.`,
                range: opened.range,
              });
            }
          } else {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.sequence.activation.non-nested.dropped',
              message: `Deactivation of "${stmt.rawTarget}" crosses container boundaries or lacks a matching activation and was omitted.`,
              range: stmt.range,
            });
          }
          break;
        }
        case 'block': {
          const loweredBlock = lowerBlock(stmt);
          if (loweredBlock) {
            concreteItems.push(loweredBlock);
            const involved = collectItemParticipants(loweredBlock);
            itemParticipants.push(involved);
            for (const p of involved) usedBeforeIndex.add(p);
          }
          break;
        }
      }
    }

    // Flush dangling pending create/destroy
    if (pendingCreate) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.create.root-only.dropped',
        message: `Creation declaration for "${pendingCreate.rawId}" had no following message.`,
        range: pendingCreate.range,
      });
    }
    if (pendingDestroy) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.destroy.unsupported.dropped',
        message: `Destroy declaration for "${pendingDestroy.rawId}" had no following message.`,
        range: pendingDestroy.range,
      });
    }

    // Handle any unclosed activations in this container
    for (const [participantId, stk] of openStacks.entries()) {
      while (stk.length > 0) {
        const opened = stk.pop()!;
        containerOpenCount = Math.max(0, containerOpenCount - 1);
        // Find last item in this container involving participantId
        let lastIdx = -1;
        for (let i = concreteItems.length - 1; i >= opened.startIndex; i--) {
          if (itemParticipants[i]?.has(participantId)) {
            lastIdx = i;
            break;
          }
        }
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.activation.unclosed',
          message: `Activation on "${participantId}" was not closed before the end of its container.`,
          range: opened.range,
        });
        if (options.mode !== 'strict' && lastIdx >= opened.startIndex) {
          closedSpans.push({
            participantId,
            startIndex: opened.startIndex,
            endIndex: lastIdx,
            openOrder: opened.openOrder,
            range: opened.range,
          });
        }
      }
    }

    return wrapActivations(concreteItems, closedSpans, destroyTargetsAtIndex, options.maxNestingDepth, diagnostics);
  };

  const lowerBlock = (block: SequenceBlockStmt): CoralSequenceItemIr | null => {
    if (block.blockKind === 'rect') {
      if (block.rectColor) {
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.sequence.rect-color.dropped',
          message: `Sequence rect color "${block.rectColor}" has no Coral saved-source equivalent and was omitted.`,
          range: block.range,
        });
      }
      const items = lowerContainer(block.branches[0]?.items ?? [], false);
      if (items.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.fragment.empty-operand.dropped',
          message: 'Empty sequence rect region was omitted.',
          range: block.range,
        });
        return null;
      }
      return { kind: 'region', items };
    }

    if (block.blockKind === 'critical') {
      const mainBranch = block.branches[0]!;
      const mainItems = lowerContainer(mainBranch.items, false);
      for (let i = 1; i < block.branches.length; i++) {
        const optBr = block.branches[i]!;
        const optItems = lowerContainer(optBr.items, false);
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.critical-option.degraded',
          message: 'Mermaid critical "option" sub-clause lowered to nested Coral "opt" fragment.',
          range: optBr.range,
        });
        if (optItems.length > 0) {
          const optGuard = optBr.rawGuard ? normalizeMermaidText(optBr.rawGuard, diagnostics, optBr.range) : 'option';
          mainItems.push({
            kind: 'fragment',
            fragmentKind: 'opt',
            operands: [{ guard: optGuard, items: optItems }],
          });
        }
      }
      if (mainItems.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.fragment.empty-operand.dropped',
          message: 'Empty critical fragment was omitted.',
          range: block.range,
        });
        return null;
      }
      const guard = mainBranch.rawGuard ? normalizeMermaidText(mainBranch.rawGuard, diagnostics, mainBranch.range) : undefined;
      return {
        kind: 'fragment',
        fragmentKind: 'critical',
        operands: [{ ...(guard ? { guard } : {}), items: mainItems }],
      };
    }

    // alt / par / opt / loop / break
    const nonEmptyOperands: Array<{ guard?: string; items: CoralSequenceItemIr[] }> = [];
    for (let i = 0; i < block.branches.length; i++) {
      const br = block.branches[i]!;
      const lowered = lowerContainer(br.items, false);
      if (lowered.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.fragment.empty-operand.dropped',
          message: `Empty "${br.branchKeyword}" operand was omitted to satisfy Coral sequence display rules.`,
          range: br.range,
        });
        continue;
      }
      let guard = br.rawGuard ? normalizeMermaidText(br.rawGuard, diagnostics, br.range) : undefined;
      if (!guard && br.branchKeyword === 'else') {
        guard = 'else';
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.sequence.else-guard.defaulted',
          message: 'Unlabeled "else" branch defaulted to guard "else".',
          range: br.range,
        });
      }
      if (!guard && (block.blockKind === 'alt' || block.blockKind === 'opt' || block.blockKind === 'break')) {
        guard = block.blockKind === 'alt' ? 'alt' : block.blockKind === 'opt' ? 'optional' : 'break';
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.sequence.guard.defaulted',
          message: `Unlabeled "${block.blockKind}" fragment defaulted to guard "${guard}".`,
          range: br.range,
        });
      }
      nonEmptyOperands.push({ ...(guard ? { guard } : {}), items: lowered });
    }

    if (nonEmptyOperands.length === 0) return null;

    if (block.blockKind === 'alt' && nonEmptyOperands.length === 1) {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.sequence.alt-single-branch.normalized',
        message: 'Single-branch "alt" fragment normalized to Coral "opt".',
        range: block.range,
      });
      const singleOp = nonEmptyOperands[0]!;
      return {
        kind: 'fragment',
        fragmentKind: 'opt',
        operands: [{ guard: singleOp.guard ?? 'optional', items: singleOp.items }],
      };
    }
    if (block.blockKind === 'par' && nonEmptyOperands.length === 1) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.par-single-branch.degraded',
        message: 'Single-branch "par" fragment degraded to Coral "region".',
        range: block.range,
      });
      return {
        kind: 'region',
        ...(nonEmptyOperands[0]!.guard ? { label: nonEmptyOperands[0]!.guard } : {}),
        items: nonEmptyOperands[0]!.items,
      };
    }

    return {
      kind: 'fragment',
      fragmentKind: block.blockKind,
      operands: nonEmptyOperands,
    };
  };

  const items = lowerContainer(ast.items, true);

  const participants: CoralSequenceParticipantIr[] = participantsOrder.map((p) => ({
    id: p.coralId,
    kind: p.kind,
    ...(p.label !== undefined && p.label !== p.coralId ? { label: p.label } : {}),
  }));

  return {
    ir: {
      notation: 'uml-sequence',
      edition: '0.2.14',
      ...(options.comments.length > 0 ? { comments: options.comments } : {}),
      sequence: { participants, groups, items },
    },
    idMap,
  };
}

function collectItemParticipants(item: CoralSequenceItemIr): Set<string> {
  const out = new Set<string>();
  const visit = (it: CoralSequenceItemIr) => {
    switch (it.kind) {
      case 'message':
        out.add(it.source);
        out.add(it.target);
        break;
      case 'note':
        for (const t of it.targets) out.add(t);
        break;
      case 'activation':
        out.add(it.participant);
        for (const c of it.items) visit(c);
        break;
      case 'region':
        for (const c of it.items) visit(c);
        break;
      case 'fragment':
        for (const op of it.operands) for (const c of op.items) visit(c);
        break;
    }
  };
  visit(item);
  return out;
}

function wrapActivations(
  concreteItems: readonly CoralSequenceItemIr[],
  spans: readonly RawActivationSpan[],
  destroyTargetsAtIndex: ReadonlyMap<number, string>,
  maxNestingDepth: number,
  diagnostics: TranspileDiagnostic[],
): CoralSequenceItemIr[] {
  if (spans.length === 0) return [...concreteItems];

  // Filter out activations wrapping a [destroy] on the same participant
  const candidates: RawActivationSpan[] = [];
  for (const span of spans) {
    let wrapsDestroy = false;
    for (let i = span.startIndex; i <= span.endIndex; i++) {
      if (destroyTargetsAtIndex.get(i) === span.participantId) {
        wrapsDestroy = true;
        break;
      }
    }
    if (wrapsDestroy) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.activation.non-nested.dropped',
        message: `Activation on "${span.participantId}" wraps its [destroy] message and was omitted.`,
        range: span.range,
      });
    } else {
      candidates.push(span);
    }
  }

  // Sort by openOrder ascending so earlier-opened activations take priority when rejecting interleaved spans
  const byOpenOrder = [...candidates].sort((a, b) => a.openOrder - b.openOrder);
  const accepted: RawActivationSpan[] = [];
  for (const cand of byOpenOrder) {
    const conflicts = accepted.some((acc) => {
      // Disjoint
      if (acc.endIndex < cand.startIndex || cand.endIndex < acc.startIndex) return false;
      // Earlier-opened activation contains later-opened activation (LIFO nesting)
      if (acc.startIndex <= cand.startIndex && cand.endIndex <= acc.endIndex) return false;
      // Otherwise crossing or non-LIFO (later-opened extending past earlier-opened)
      return true;
    });
    if (conflicts) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.sequence.activation.non-nested.dropped',
        message: `Interleaved non-nested activation on "${cand.participantId}" cannot be represented as a Coral block and was omitted.`,
        range: cand.range,
      });
    } else {
      accepted.push(cand);
    }
  }

  if (accepted.length === 0) return [...concreteItems];

  // Build hierarchical tree of accepted spans: outer wraps inner; equal spans -> earlier openOrder wraps later
  const sorted = [...accepted].sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    if (a.endIndex !== b.endIndex) return b.endIndex - a.endIndex;
    return a.openOrder - b.openOrder;
  });

  const buildRange = (from: number, to: number, available: RawActivationSpan[], depth: number): CoralSequenceItemIr[] => {
    if (depth > maxNestingDepth) {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.input.nesting-exceeded',
        message: `Sequence activation nesting exceeds maximum depth of ${maxNestingDepth}.`,
      });
      return concreteItems.slice(from, to + 1);
    }
    const out: CoralSequenceItemIr[] = [];
    let i = from;
    while (i <= to) {
      const span = available.find((s) => s.startIndex === i && s.endIndex <= to);
      if (span) {
        const inner = available.filter((s) => s !== span && s.startIndex >= span.startIndex && s.endIndex <= span.endIndex);
        const wrappedItems = buildRange(span.startIndex, span.endIndex, inner, depth + 1);
        out.push({
          kind: 'activation',
          participant: span.participantId,
          items: wrappedItems,
        });
        i = span.endIndex + 1;
      } else {
        out.push(concreteItems[i]!);
        i++;
      }
    }
    return out;
  };

  return buildRange(0, concreteItems.length - 1, sorted, 0);
}
