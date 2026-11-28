import { normalizeMermaidText } from '../lexer.js';
import type { StateAst, StateStmt } from '../parsers/state.js';
import type {
  CoralLayoutDirection,
  CoralNodeIr,
  CoralSourceIr,
  StateTargetEdition,
  TranspileDiagnostic,
  TranspileSourceRange,
} from '../types.js';
import { allocateSanitizedId, allocateUniqueId, createNullMap } from './ids.js';
import {
  formatCoralNodeStyle,
  mergeParsedStyles,
  parseCssStyleString,
  type ParsedCssNodeStyle,
} from './styles.js';

function mapDirection(dir: 'TD' | 'TB' | 'BT' | 'LR' | 'RL'): CoralLayoutDirection {
  switch (dir) {
    case 'TD':
    case 'TB': return 'DOWN';
    case 'BT': return 'UP';
    case 'LR': return 'RIGHT';
    case 'RL': return 'LEFT';
  }
}

export function lowerStateDiagram(
  ast: StateAst,
  options: { stateTargetEdition: StateTargetEdition; comments: string[] },
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  if (options.stateTargetEdition === '0.2.8') {
    return lowerState028(ast, options.comments, diagnostics);
  }
  return lowerState0217(ast, options.comments, diagnostics);
}

// ============================================================================
// Edition 0.2.17: Full Visual & Hierarchical UML State
// ============================================================================

interface StateNode0217 {
  rawId: string;
  localCoralId: string;
  qualifiedCoralId: string;
  kind: 'initial' | 'state' | 'final' | 'choice' | 'fork' | 'join' | 'composite' | 'note';
  label?: string;
  explicitLabel: boolean;
  descriptions: string[];
  classes: string[];
  childrenOrder: StateNode0217[];
  childrenByRaw: Map<string, StateNode0217>;
  takenLocalIds: Set<string>;
  range: TranspileSourceRange;
}

interface StateEdge0217 {
  sourceScopePath: string[];
  sourceRawId: string;
  targetScopePath: string[];
  targetRawId: string;
  operator: '->' | '-.-';
  relation?: 'annotation';
  label?: string;
  /** Pre-resolved qualified IDs for synthetic initial/final/note endpoints. */
  sourceQualified?: string;
  targetQualified?: string;
}

function lowerState0217(
  ast: StateAst,
  comments: string[],
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const rootChildren: StateNode0217[] = [];
  const rootByRaw = new Map<string, StateNode0217>();
  const rootTaken = new Set<string>();
  const allByRawFirstSeen = new Map<string, StateNode0217>();
  const classDefs = new Map<string, ParsedCssNodeStyle>();
  const classAssignments = new Map<string, string[]>();
  const inlineStyles = new Map<string, ParsedCssNodeStyle>();
  const edges: StateEdge0217[] = [];
  let rootDirection: CoralLayoutDirection | undefined;
  let noteSeq = 0;

  interface ScopeCtx {
    parent?: ScopeCtx;
    path: string[];
    qualifiedPrefix: string;
    children: StateNode0217[];
    byRaw: Map<string, StateNode0217>;
    taken: Set<string>;
    regionInitial?: StateNode0217;
    regionFinal?: StateNode0217;
  }

  const findInAncestors = (scope: ScopeCtx, rawId: string): StateNode0217 | undefined => {
    let cur: ScopeCtx | undefined = scope;
    while (cur) {
      const found = cur.byRaw.get(rawId);
      if (found) return found;
      cur = cur.parent;
    }
    return undefined;
  };

  const ensureStateInScope = (
    scope: ScopeCtx,
    rawId: string,
    range: TranspileSourceRange,
    kind: StateNode0217['kind'] = 'state',
    checkAncestors = true,
  ): StateNode0217 => {
    const inScope = scope.byRaw.get(rawId);
    if (inScope) {
      if (kind !== 'state' && inScope.kind === 'state') inScope.kind = kind;
      return inScope;
    }
    // M6: Check ancestor/root scopes before creating a new local state inside a composite,
    // so e.g. `Run --> Idle : cancel` inside `state Active { ... }` targets root `Idle`.
    if (checkAncestors) {
      const ancestorMatch = findInAncestors(scope, rawId);
      if (ancestorMatch) {
        if (kind !== 'state' && ancestorMatch.kind === 'state') ancestorMatch.kind = kind;
        return ancestorMatch;
      }
    }
    // If at root and already declared in a composite, return that node rather than duplicating
    if (scope.path.length === 0) {
      const existing = allByRawFirstSeen.get(rawId);
      if (existing) {
        if (kind !== 'state' && existing.kind === 'state') existing.kind = kind;
        return existing;
      }
    }
    const { coralId, renamed } = allocateSanitizedId(rawId, scope.taken, diagnostics, range);
    const qualifiedCoralId = scope.qualifiedPrefix ? `${scope.qualifiedPrefix}.${coralId}` : coralId;
    idMap[qualifiedCoralId] = rawId;
    const fallbackLabel = renamed ? normalizeMermaidText(rawId, diagnostics, range, { unquote: false }) : undefined;
    const node: StateNode0217 = {
      rawId,
      localCoralId: coralId,
      qualifiedCoralId,
      kind,
      ...(fallbackLabel !== undefined ? { label: fallbackLabel } : {}),
      explicitLabel: false,
      descriptions: [],
      classes: [],
      childrenOrder: [],
      childrenByRaw: new Map(),
      takenLocalIds: new Set(),
      range,
    };
    scope.byRaw.set(rawId, node);
    scope.children.push(node);
    if (!allByRawFirstSeen.has(rawId)) allByRawFirstSeen.set(rawId, node);
    return node;
  };

  const ensureStartNode = (scope: ScopeCtx, range: TranspileSourceRange): StateNode0217 => {
    if (scope.regionInitial) return scope.regionInitial;
    const localId = allocateUniqueId('start', scope.taken);
    const qualifiedCoralId = scope.qualifiedPrefix ? `${scope.qualifiedPrefix}.${localId}` : localId;
    const node: StateNode0217 = {
      rawId: '[*]_start',
      localCoralId: localId,
      qualifiedCoralId,
      kind: 'initial',
      explicitLabel: false,
      descriptions: [],
      classes: [],
      childrenOrder: [],
      childrenByRaw: new Map(),
      takenLocalIds: new Set(),
      range,
    };
    scope.children.push(node);
    scope.regionInitial = node;
    return node;
  };

  const ensureFinalNode = (scope: ScopeCtx, range: TranspileSourceRange): StateNode0217 => {
    if (scope.regionFinal) return scope.regionFinal;
    const localId = allocateUniqueId('finish', scope.taken);
    const qualifiedCoralId = scope.qualifiedPrefix ? `${scope.qualifiedPrefix}.${localId}` : localId;
    const node: StateNode0217 = {
      rawId: '[*]_final',
      localCoralId: localId,
      qualifiedCoralId,
      kind: 'final',
      explicitLabel: false,
      descriptions: [],
      classes: [],
      childrenOrder: [],
      childrenByRaw: new Map(),
      takenLocalIds: new Set(),
      range,
    };
    scope.children.push(node);
    scope.regionFinal = node;
    return node;
  };

  const walk = (stmts: readonly StateStmt[], scope: ScopeCtx) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'direction':
          if (scope.path.length === 0) {
            rootDirection = mapDirection(stmt.direction);
          } else {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.state.direction.dropped',
              message: `Composite-level "direction ${stmt.direction}" has no Coral equivalent (Coral layout direction is document-level) and was omitted.`,
              range: stmt.range,
            });
          }
          break;
        case 'concurrency':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.concurrency.dropped',
            message: 'Concurrent region separator "--" has no orthogonal-region equivalent in Coral uml-state 0.2.17; inner states remain inside the composite.',
            range: stmt.range,
          });
          // Reset regionInitial/regionFinal so a second concurrent region's [*] gets its own initial/final pseudostate
          scope.regionInitial = undefined;
          scope.regionFinal = undefined;
          break;
        case 'stateDecl': {
          const node = ensureStateInScope(scope, stmt.rawId, stmt.range, 'state');
          if (stmt.className && !node.classes.includes(stmt.className)) node.classes.push(stmt.className);
          break;
        }
        case 'stateAlias': {
          const node = ensureStateInScope(scope, stmt.rawId, stmt.range, 'state');
          node.label = normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range);
          node.explicitLabel = true;
          if (stmt.className && !node.classes.includes(stmt.className)) node.classes.push(stmt.className);
          break;
        }
        case 'pseudostate': {
          ensureStateInScope(scope, stmt.rawId, stmt.range, stmt.pseudoKind);
          break;
        }
        case 'composite': {
          const comp = ensureStateInScope(scope, stmt.rawId, stmt.range, 'composite', false);
          comp.kind = 'composite';
          comp.label = stmt.rawLabel !== undefined
            ? normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range)
            : normalizeMermaidText(stmt.rawId, diagnostics, stmt.range, { unquote: false });
          comp.explicitLabel = true;
          if (stmt.className && !comp.classes.includes(stmt.className)) comp.classes.push(stmt.className);
          const childScope: ScopeCtx = {
            parent: scope,
            path: [...scope.path, comp.localCoralId],
            qualifiedPrefix: comp.qualifiedCoralId,
            children: comp.childrenOrder,
            byRaw: comp.childrenByRaw,
            taken: comp.takenLocalIds,
          };
          walk(stmt.body, childScope);
          break;
        }
        case 'description': {
          const node = ensureStateInScope(scope, stmt.rawId, stmt.range, 'state');
          const text = normalizeMermaidText(stmt.rawText, diagnostics, stmt.range);
          if (text) node.descriptions.push(text);
          break;
        }
        case 'transition': {
          const srcNode = stmt.rawSource === '[*]'
            ? ensureStartNode(scope, stmt.range)
            : ensureStateInScope(scope, stmt.rawSource, stmt.range, 'state');
          const dstNode = stmt.rawTarget === '[*]'
            ? ensureFinalNode(scope, stmt.range)
            : ensureStateInScope(scope, stmt.rawTarget, stmt.range, 'state');
          if (stmt.sourceClass && !srcNode.classes.includes(stmt.sourceClass)) srcNode.classes.push(stmt.sourceClass);
          if (stmt.targetClass && !dstNode.classes.includes(stmt.targetClass)) dstNode.classes.push(stmt.targetClass);
          const label = stmt.rawLabel !== undefined
            ? normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range)
            : undefined;
          edges.push({
            sourceScopePath: scope.path,
            sourceRawId: stmt.rawSource,
            targetScopePath: scope.path,
            targetRawId: stmt.rawTarget,
            sourceQualified: srcNode.qualifiedCoralId,
            targetQualified: dstNode.qualifiedCoralId,
            operator: '->',
            ...(label !== undefined && label !== '' ? { label } : {}),
          });
          break;
        }
        case 'note': {
          const targetNode = ensureStateInScope(scope, stmt.rawTarget, stmt.range, 'state');
          const noteId = allocateUniqueId(`note_${++noteSeq}`, rootTaken);
          const text = normalizeMermaidText(stmt.rawText, diagnostics, stmt.range);
          const noteNode: StateNode0217 = {
            rawId: noteId,
            localCoralId: noteId,
            qualifiedCoralId: noteId,
            kind: 'note',
            label: text,
            explicitLabel: true,
            descriptions: [],
            classes: [],
            childrenOrder: [],
            childrenByRaw: new Map(),
            takenLocalIds: new Set(),
            range: stmt.range,
          };
          rootChildren.push(noteNode);
          edges.push({
            sourceScopePath: [],
            sourceRawId: noteId,
            targetScopePath: scope.path,
            targetRawId: stmt.rawTarget,
            sourceQualified: noteId,
            targetQualified: targetNode.qualifiedCoralId,
            operator: '-.-',
            relation: 'annotation',
          });
          break;
        }
        case 'classDef':
          classDefs.set(stmt.name, parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range));
          break;
        case 'class':
          for (const id of stmt.targetIds) {
            const list = classAssignments.get(id) ?? [];
            if (!list.includes(stmt.className)) list.push(stmt.className);
            classAssignments.set(id, list);
          }
          break;
        case 'style': {
          const parsed = parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range);
          inlineStyles.set(stmt.targetId, mergeParsedStyles(inlineStyles.get(stmt.targetId), parsed));
          break;
        }
      }
    }
  };

  const rootScope: ScopeCtx = {
    path: [],
    qualifiedPrefix: '',
    children: rootChildren,
    byRaw: rootByRaw,
    taken: rootTaken,
  };
  walk(ast.body, rootScope);

  const toCoralNode = (node: StateNode0217): CoralNodeIr => {
    let mergedStyle: ParsedCssNodeStyle | undefined;
    const allClasses = [...node.classes, ...(classAssignments.get(node.rawId) ?? [])];
    for (const cls of allClasses) {
      const def = classDefs.get(cls);
      if (def) mergedStyle = mergeParsedStyles(mergedStyle, def);
    }
    const inline = inlineStyles.get(node.rawId);
    if (inline) mergedStyle = mergeParsedStyles(mergedStyle, inline);
    const styleStr = formatCoralNodeStyle(mergedStyle);
    const description = node.descriptions.length > 0 ? node.descriptions.join('\n') : undefined;

    // For composite and note, always emit `as "<label>"` when label is set; for others emit when explicit or differs from ID
    const shouldEmitLabel = node.label !== undefined && (
      node.kind === 'composite' || node.kind === 'note' || node.label !== node.localCoralId
    );

    return {
      id: node.localCoralId,
      kind: node.kind,
      ...(shouldEmitLabel ? { label: node.label } : {}),
      ...(description ? { description } : {}),
      ...(styleStr ? { style: styleStr } : {}),
      ...(node.kind === 'composite' ? { children: node.childrenOrder.map(toCoralNode) } : {}),
    };
  };

  return {
    ir: {
      notation: 'uml-state',
      edition: '0.2.17',
      ...(rootDirection ? { direction: rootDirection } : {}),
      ...(comments.length > 0 ? { comments } : {}),
      nodes: rootChildren.map(toCoralNode),
      edges: edges.map((e) => ({
        source: e.sourceQualified!,
        target: e.targetQualified!,
        operator: e.operator,
        ...(e.relation ? { relation: e.relation } : {}),
        ...(e.label !== undefined ? { label: e.label } : {}),
      })),
    },
    idMap,
  };
}

// ============================================================================
// Edition 0.2.8: Legacy Flat Character-Compatible UML State (SPEC-12 / SPEC-13)
// ============================================================================

interface FlatStateRecord {
  rawId: string;
  coralId: string;
  kind: 'initial' | 'state' | 'final';
  label?: string;
  hasExplicitAlias: boolean;
  descriptions: string[];
  range: TranspileSourceRange;
}

function lowerState028(
  ast: StateAst,
  comments: string[],
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const taken = new Set<string>();
  const statesByRaw = new Map<string, FlatStateRecord>();
  const order: FlatStateRecord[] = [];
  const transitions: Array<{ src: FlatStateRecord; dst: FlatStateRecord; label?: string }> = [];

  let startRec: FlatStateRecord | undefined;
  let finalRec: FlatStateRecord | undefined;

  const ensureStart = (range: TranspileSourceRange): FlatStateRecord => {
    if (startRec) return startRec;
    const coralId = allocateUniqueId('start', taken);
    startRec = { rawId: '[*]_start', coralId, kind: 'initial', hasExplicitAlias: false, descriptions: [], range };
    order.push(startRec);
    return startRec;
  };

  const ensureFinal = (range: TranspileSourceRange): FlatStateRecord => {
    if (finalRec) return finalRec;
    const coralId = allocateUniqueId('finish', taken);
    finalRec = { rawId: '[*]_final', coralId, kind: 'final', hasExplicitAlias: false, descriptions: [], range };
    order.push(finalRec);
    return finalRec;
  };

  const ensureState = (rawId: string, range: TranspileSourceRange): FlatStateRecord => {
    let rec = statesByRaw.get(rawId);
    if (!rec) {
      const { coralId, renamed } = allocateSanitizedId(rawId, taken, diagnostics, range);
      idMap[coralId] = rawId;
      const fallbackLabel = renamed ? normalizeMermaidText(rawId, diagnostics, range, { unquote: false }) : undefined;
      rec = {
        rawId,
        coralId,
        kind: 'state',
        ...(fallbackLabel !== undefined ? { label: fallbackLabel } : {}),
        hasExplicitAlias: false,
        descriptions: [],
        range,
      };
      statesByRaw.set(rawId, rec);
      order.push(rec);
    }
    return rec;
  };

  const walk = (stmts: readonly StateStmt[]) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'direction':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.direction.dropped',
            message: `State "direction ${stmt.direction}" is not supported in Coral 0.2.8 uml-state and was omitted.`,
            range: stmt.range,
          });
          break;
        case 'concurrency':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.concurrency.dropped',
            message: 'Concurrent region separator "--" is not supported in Coral 0.2.8 uml-state and was omitted.',
            range: stmt.range,
          });
          break;
        case 'composite':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.composite.flattened',
            message: `Composite state "${stmt.rawId}" was flattened into top-level states for Coral 0.2.8 uml-state.`,
            range: stmt.range,
          });
          if (stmt.className) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.state.style.dropped',
              message: `State style class ":::${stmt.className}" is not supported in Coral 0.2.8 uml-state and was omitted.`,
              range: stmt.range,
            });
          }
          ensureState(stmt.rawId, stmt.range);
          walk(stmt.body);
          break;
        case 'pseudostate':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.pseudostate.degraded',
            message: `Pseudostate "<<${stmt.pseudoKind}>>" on "${stmt.rawId}" degraded to plain "state" in Coral 0.2.8 uml-state.`,
            range: stmt.range,
          });
          ensureState(stmt.rawId, stmt.range);
          break;
        case 'note':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.note.dropped',
            message: 'State note is not supported in Coral 0.2.8 uml-state and was omitted.',
            range: stmt.range,
          });
          break;
        case 'classDef':
        case 'class':
        case 'style':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.state.style.dropped',
            message: 'State styling is not supported in Coral 0.2.8 uml-state and was omitted.',
            range: stmt.range,
          });
          break;
        case 'stateDecl':
          if (stmt.className) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.state.style.dropped',
              message: `State style class ":::${stmt.className}" is not supported in Coral 0.2.8 uml-state and was omitted.`,
              range: stmt.range,
            });
          }
          ensureState(stmt.rawId, stmt.range);
          break;
        case 'stateAlias': {
          const rec = ensureState(stmt.rawId, stmt.range);
          rec.label = normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range);
          rec.hasExplicitAlias = true;
          if (stmt.className) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.state.style.dropped',
              message: `State style class ":::${stmt.className}" is not supported in Coral 0.2.8 uml-state and was omitted.`,
              range: stmt.range,
            });
          }
          break;
        }
        case 'description': {
          const rec = ensureState(stmt.rawId, stmt.range);
          const text = normalizeMermaidText(stmt.rawText, diagnostics, stmt.range);
          if (text) rec.descriptions.push(text);
          break;
        }
        case 'transition': {
          if (stmt.sourceClass || stmt.targetClass) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.state.style.dropped',
              message: 'State style class ":::" is not supported in Coral 0.2.8 uml-state and was omitted.',
              range: stmt.range,
            });
          }
          const src = stmt.rawSource === '[*]' ? ensureStart(stmt.range) : ensureState(stmt.rawSource, stmt.range);
          const dst = stmt.rawTarget === '[*]' ? ensureFinal(stmt.range) : ensureState(stmt.rawTarget, stmt.range);
          const label = stmt.rawLabel !== undefined
            ? normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range) : undefined;
          transitions.push({ src, dst, ...(label ? { label } : {}) });
          break;
        }
      }
    }
  };

  walk(ast.body);

  // Resolve descriptions on Edition 0.2.8 (no [description: ...] allowed!)
  for (const rec of order) {
    if (rec.descriptions.length > 0) {
      const joined = rec.descriptions.join('\n');
      if (!rec.hasExplicitAlias) {
        rec.label = joined;
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.state.description.as-label',
          message: `State "${rec.rawId}" description was emitted as its display label in Coral 0.2.8.`,
          range: rec.range,
        });
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.state.description.degraded',
          message: `State "${rec.rawId}" description was omitted because Coral 0.2.8 has no [description] field and an alias is already set.`,
          range: rec.range,
        });
      }
    }
  }

  return {
    ir: {
      notation: 'uml-state',
      edition: '0.2.8',
      ...(comments.length > 0 ? { comments } : {}),
      nodes: order.map((rec) => ({
        id: rec.coralId,
        kind: rec.kind,
        ...(rec.label !== undefined && rec.label !== rec.coralId ? { label: rec.label } : {}),
      })),
      edges: transitions.map((t) => ({
        source: t.src.coralId,
        target: t.dst.coralId,
        operator: '->',
        ...(t.label !== undefined ? { label: t.label } : {}),
      })),
    },
    idMap,
  };
}
