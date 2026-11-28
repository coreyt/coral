import { normalizeMermaidText } from '../lexer.js';
import type {
  FlowchartAst,
  FlowchartClassicShape,
  FlowchartEdgeStmt,
  FlowchartLinkStyleStmt,
  FlowchartNodeRef,
  FlowchartStmt,
} from '../parsers/flowchart.js';
import type {
  CoralEdgeIr,
  CoralLayoutDirection,
  CoralNodeIr,
  CoralSourceIr,
  EdgeStyleMode,
  FlowchartTargetNotation,
  TranspileDiagnostic,
  TranspileSourceRange,
} from '../types.js';
import { allocateSanitizedId, createNullMap } from './ids.js';
import { normalizeCssColor } from './colors.js';
import {
  formatCoralNodeStyle,
  mergeParsedStyles,
  parseCssStyleString,
  splitCssDeclarations,
  type ParsedCssNodeStyle,
} from './styles.js';

const MAX_EXPANDED_FLOWCHART_EDGES = 25_000;

interface NodeRecord {
  rawId: string;
  localCoralId: string;
  qualifiedCoralId: string;
  groupPath: string[]; // raw subgraph keys
  shape: FlowchartClassicShape;
  expandedShape?: string;
  label?: string;
  hasExplicitLabel: boolean;
  explicitEmptyLabel: boolean;
  classes: string[];
  range: TranspileSourceRange;
  reparented: boolean;
}

interface SubgraphRecord {
  key: string; // unique internal key
  rawId: string;
  localCoralId: string;
  qualifiedCoralId: string;
  parentPath: string[];
  label?: string;
  range: TranspileSourceRange;
}

interface ExpandedEdgeRecord {
  edgeId?: string;
  sourceRawId: string;
  targetRawId: string;
  lineStyle: FlowchartEdgeStmt['lineStyle'];
  firstEnd: FlowchartEdgeStmt['firstEnd'];
  secondEnd: FlowchartEdgeStmt['secondEnd'];
  shaftLength: number;
  label?: string;
  range: TranspileSourceRange;
}

function mapDirection(dir: 'TD' | 'TB' | 'BT' | 'LR' | 'RL'): CoralLayoutDirection {
  switch (dir) {
    case 'TD':
    case 'TB': return 'DOWN';
    case 'BT': return 'UP';
    case 'LR': return 'RIGHT';
    case 'RL': return 'LEFT';
  }
}

function commonPrefix(a: readonly string[], b: readonly string[]): string[] {
  const len = Math.min(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) out.push(a[i]!);
    else break;
  }
  return out;
}

function isPrefixOf(prefix: readonly string[], full: readonly string[]): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function mapShapeForTarget(
  shape: FlowchartClassicShape,
  expandedShape: string | undefined,
  target: FlowchartTargetNotation,
  inDeg: number,
  outDeg: number,
  isUniqueStartStadium: boolean,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): { kind: string; symbol?: string; variant?: string } {
  // Normalize expanded v11.3+ shapes into canonical categories
  const exp = expandedShape?.toLowerCase();

  if (target === 'flowchart') {
    if (shape === 'bare' || shape === 'rect' || exp === 'rect' || exp === 'proc' || exp === 'process') {
      return { kind: 'process' };
    }
    if (shape === 'rounded' || exp === 'rounded' || exp === 'event') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.shape.degraded',
        message: 'Rounded rectangle shape degraded to ISO flowchart "process". Use flowchartTarget: "block" to preserve rounded rectangles.',
        range,
      });
      return { kind: 'process' };
    }
    if (shape === 'stadium' || exp === 'stadium' || exp === 'terminal' || exp === 'pill') {
      if (isUniqueStartStadium) return { kind: 'terminal', variant: 'start' };
      if (inDeg >= 1 && outDeg === 0) return { kind: 'terminal', variant: 'end' };
      return { kind: 'terminal' };
    }
    if (shape === 'diamond' || exp === 'diam' || exp === 'diamond' || exp === 'decision' || exp === 'question') {
      return { kind: 'decision' };
    }
    if (shape === 'lean-r' || shape === 'lean-l' || exp === 'lean-r' || exp === 'lean-l' || exp === 'in-out' || exp === 'out-in') {
      if (shape === 'lean-l' || exp === 'lean-l') {
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.flowchart.shape.normalized',
          message: 'Left-leaning parallelogram normalized to ISO flowchart "io".',
          range,
        });
      }
      return { kind: 'io' };
    }
    if (shape === 'subproc' || exp === 'subproc' || exp === 'subprocess' || exp === 'framed-rectangle') {
      return { kind: 'process', symbol: 'flowchart-predefined' };
    }
    if (shape === 'circle' || exp === 'circ' || exp === 'circle' || exp === 'sm-circ') {
      return { kind: 'process', symbol: 'flowchart-connector' };
    }
    if (shape === 'dbl-circle' || exp === 'dbl-circ' || exp === 'f-circ' || exp === 'framed-circle') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.shape.degraded',
        message: 'Double-circle shape degraded to ISO flowchart connector.',
        range,
      });
      return { kind: 'process', symbol: 'flowchart-connector' };
    }
    if (exp === 'doc' || exp === 'document' || exp === 'docs' || exp === 'documents' || exp === 'lin-doc' || exp === 'tag-doc') {
      if (exp === 'docs' || exp === 'documents') {
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.flowchart.shape.normalized',
          message: `Expanded shape "${exp}" normalized to ISO flowchart "document".`,
          range,
        });
      }
      return { kind: 'document' };
    }
    if (exp === 'comment' || exp === 'brace' || exp === 'brace-r' || exp === 'braces' || exp === 'notch-pent') {
      return { kind: 'process', symbol: 'flowchart-annotation' };
    }
    if (shape === 'cylinder' || exp === 'cyl' || exp === 'cylinder' || exp === 'db' || exp === 'database' || exp === 'h-cyl' || exp === 'lin-cyl') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.shape.degraded',
        message: 'Cylinder/database shape has no ISO flowchart symbol and degraded to "process". Switch flowchartTarget to "block" or "architecture" to preserve it.',
        range,
      });
      return { kind: 'process' };
    }
    diagnostics.push({
      severity: 'warning',
      code: 'mermaid.flowchart.shape.degraded',
      message: `Flowchart shape "${exp ?? shape}" has no ISO flowchart equivalent and degraded to "process".`,
      range,
    });
    return { kind: 'process' };
  }

  if (target === 'block') {
    if (shape === 'bare' || shape === 'rect' || exp === 'rect' || exp === 'proc' || exp === 'process') return { kind: 'box' };
    if (shape === 'rounded' || exp === 'rounded' || exp === 'event') return { kind: 'rounded' };
    if (shape === 'stadium' || exp === 'stadium' || exp === 'terminal' || exp === 'pill') return { kind: 'pill' };
    if (shape === 'diamond' || exp === 'diam' || exp === 'diamond' || exp === 'decision' || exp === 'question') return { kind: 'diamond' };
    if (shape === 'cylinder' || exp === 'cyl' || exp === 'cylinder' || exp === 'db' || exp === 'database' || exp === 'h-cyl' || exp === 'lin-cyl') return { kind: 'cylinder' };
    if (shape === 'circle' || exp === 'circ' || exp === 'circle' || exp === 'sm-circ') return { kind: 'circle' };
    if (shape === 'dbl-circle' || exp === 'dbl-circ' || exp === 'f-circ' || exp === 'framed-circle') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.shape.degraded',
        message: 'Double-circle shape degraded to block "circle".',
        range,
      });
      return { kind: 'circle' };
    }
    if (exp === 'doc' || exp === 'document' || exp === 'docs' || exp === 'documents' || exp === 'comment' || exp === 'brace' || exp === 'brace-r' || exp === 'braces') {
      return { kind: 'note' };
    }
    if (exp === 'tri' || exp === 'triangle') return { kind: 'triangle' };
    if (exp === 'oval') return { kind: 'oval' };
    diagnostics.push({
      severity: 'warning',
      code: 'mermaid.flowchart.shape.degraded',
      message: `Shape "${exp ?? shape}" degraded to block "box".`,
      range,
    });
    return { kind: 'box' };
  }

  // target === 'architecture'
  if (shape === 'bare' || shape === 'rect' || exp === 'rect' || exp === 'proc' || exp === 'process') return { kind: 'service' };
  if (shape === 'rounded' || exp === 'rounded' || exp === 'event') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: 'Rounded shape normalized to architecture "service".',
      range,
    });
    return { kind: 'service' };
  }
  if (shape === 'stadium' || exp === 'stadium' || exp === 'terminal' || exp === 'pill') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: 'Stadium/terminal shape normalized to architecture "actor".',
      range,
    });
    return { kind: 'actor' };
  }
  if (shape === 'diamond' || exp === 'diam' || exp === 'diamond' || exp === 'decision' || exp === 'question') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: 'Diamond shape normalized to architecture "gateway".',
      range,
    });
    return { kind: 'gateway' };
  }
  if (shape === 'lean-r' || shape === 'lean-l' || exp === 'lean-r' || exp === 'lean-l') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: 'Parallelogram shape normalized to architecture "queue".',
      range,
    });
    return { kind: 'queue' };
  }
  if (shape === 'subproc' || exp === 'subproc' || exp === 'subprocess' || exp === 'framed-rectangle') return { kind: 'component' };
  if (shape === 'cylinder' || exp === 'cyl' || exp === 'cylinder' || exp === 'db' || exp === 'database' || exp === 'h-cyl' || exp === 'lin-cyl') return { kind: 'database' };
  if (shape === 'hexagon' || exp === 'hex' || exp === 'hexagon' || exp === 'prepare' || exp === 'bolt') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: `Shape "${exp ?? shape}" normalized to architecture "function".`,
      range,
    });
    return { kind: 'function' };
  }
  if (exp === 'cloud') return { kind: 'externalSystem' };
  if (exp === 'disk' || exp === 'doc' || exp === 'document' || exp === 'docs' || exp === 'documents') {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.flowchart.shape.normalized',
      message: `Shape "${exp}" normalized to architecture "storage".`,
      range,
    });
    return { kind: 'storage' };
  }
  if (exp === 'comment' || exp === 'brace' || exp === 'brace-r' || exp === 'braces') {
    return { kind: 'service', symbol: 'arch-annotation' };
  }
  diagnostics.push({
    severity: 'warning',
    code: 'mermaid.flowchart.shape.degraded',
    message: `Shape "${exp ?? shape}" degraded to architecture "service".`,
    range,
  });
  return { kind: 'service' };
}

export function lowerFlowchart(
  ast: FlowchartAst,
  options: {
    flowchartTarget: FlowchartTargetNotation;
    edgeStyleMode: EdgeStyleMode;
    comments: string[];
  },
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const nodesByRaw = new Map<string, NodeRecord>();
  const subgraphsByKey = new Map<string, SubgraphRecord>();
  const subgraphsByRawId = new Map<string, SubgraphRecord>();
  const rawEdges: ExpandedEdgeRecord[] = [];
  const classDefs = new Map<string, ParsedCssNodeStyle>();
  const classAssignments = new Map<string, string[]>();
  const inlineStyles = new Map<string, ParsedCssNodeStyle>();
  const linkStyles: FlowchartLinkStyleStmt[] = [];
  const edgeConfigs = new Map<string, { animate: boolean; animationSpeed?: string; range: TranspileSourceRange }>();
  const scopeOrder = new Map<string, Array<{ kind: 'node' | 'subgraph'; key: string }>>();

  let rootDirection: 'TD' | 'TB' | 'BT' | 'LR' | 'RL' | undefined = ast.direction;
  let sgSeq = 0;

  const ensureOrderList = (scopeKey: string) => {
    let list = scopeOrder.get(scopeKey);
    if (!list) {
      list = [];
      scopeOrder.set(scopeKey, list);
    }
    return list;
  };

  const scopeKeyOf = (path: readonly string[]): string => path.join('\0');

  // M4: Pre-collect all subgraph rawIds so forward references (e.g. `A --> backend` before `subgraph backend`) resolve to the group
  const knownSubgraphRawIds = new Set<string>();
  const collectSubgraphIds = (stmts: readonly FlowchartStmt[]) => {
    for (const stmt of stmts) {
      if (stmt.kind === 'subgraph') {
        knownSubgraphRawIds.add(stmt.rawId);
        collectSubgraphIds(stmt.body);
      }
    }
  };
  collectSubgraphIds(ast.body);

  let edgeBudgetExceeded = false;

  const registerNodeRef = (ref: FlowchartNodeRef, currentPath: readonly string[]) => {
    // If ref.rawId names a known subgraph ID (including forward-declared ones) and has no shape, don't create a duplicate node!
    if (ref.shape === 'bare' && !ref.hasExplicitLabel && knownSubgraphRawIds.has(ref.rawId)) {
      return;
    }
    let rec = nodesByRaw.get(ref.rawId);
    const label = ref.hasExplicitLabel && ref.rawLabel !== undefined
      ? normalizeMermaidText(ref.rawLabel, diagnostics, ref.range)
      : undefined;

    if (!rec) {
      rec = {
        rawId: ref.rawId,
        localCoralId: '',
        qualifiedCoralId: '',
        groupPath: [...currentPath],
        shape: ref.shape,
        ...(ref.expandedShape ? { expandedShape: ref.expandedShape } : {}),
        ...(label !== undefined ? { label } : {}),
        hasExplicitLabel: ref.hasExplicitLabel,
        explicitEmptyLabel: ref.hasExplicitLabel && label === '',
        classes: ref.className ? [ref.className] : [],
        range: ref.range,
        reparented: false,
      };
      nodesByRaw.set(ref.rawId, rec);
      ensureOrderList(scopeKeyOf(currentPath)).push({ kind: 'node', key: ref.rawId });
    } else {
      // Upgrade bare shape if a later declaration defines an explicit shape or label
      if (ref.shape !== 'bare' && rec.shape === 'bare') {
        rec.shape = ref.shape;
        if (ref.expandedShape) rec.expandedShape = ref.expandedShape;
      }
      if (ref.hasExplicitLabel && label !== undefined) {
        rec.label = label;
        rec.hasExplicitLabel = true;
        rec.explicitEmptyLabel = label === '';
      }
      if (ref.className && !rec.classes.includes(ref.className)) {
        rec.classes.push(ref.className);
      }
      // Subgraph reparenting check: only when referenced inside a DIFFERENT non-empty subgraph
      if (currentPath.length > 0 && rec.groupPath.length > 0) {
        if (!isPrefixOf(rec.groupPath, currentPath) && !isPrefixOf(currentPath, rec.groupPath)) {
          const lca = commonPrefix(rec.groupPath, currentPath);
          if (!rec.reparented) {
            rec.reparented = true;
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.flowchart.subgraph.reparented',
              message: `Node "${ref.rawId}" appeared in multiple disjoint subgraphs and was hoisted to their lowest common ancestor.`,
              range: ref.range,
            });
          }
          // Move order entry from old scope to LCA
          const oldList = scopeOrder.get(scopeKeyOf(rec.groupPath));
          if (oldList) {
            const idx = oldList.findIndex((e) => e.kind === 'node' && e.key === ref.rawId);
            if (idx >= 0) oldList.splice(idx, 1);
          }
          rec.groupPath = lca;
          const newList = ensureOrderList(scopeKeyOf(lca));
          if (!newList.some((e) => e.kind === 'node' && e.key === ref.rawId)) {
            newList.push({ kind: 'node', key: ref.rawId });
          }
        }
      } else if (currentPath.length > 0 && rec.groupPath.length === 0 && ref.shape !== 'bare') {
        // Declared bare in an earlier root edge, then declared with shape inside a subgraph -> move into subgraph
        const oldList = scopeOrder.get('');
        if (oldList) {
          const idx = oldList.findIndex((e) => e.kind === 'node' && e.key === ref.rawId);
          if (idx >= 0) oldList.splice(idx, 1);
        }
        rec.groupPath = [...currentPath];
        ensureOrderList(scopeKeyOf(currentPath)).push({ kind: 'node', key: ref.rawId });
      }
    }
  };

  const walkStmts = (stmts: readonly FlowchartStmt[], currentPath: readonly string[]) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'direction':
          if (currentPath.length === 0) {
            rootDirection = stmt.direction;
          } else {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.flowchart.subgraph-direction.dropped',
              message: `Subgraph-level "direction ${stmt.direction}" has no Coral equivalent (Coral layout direction is document-level) and was omitted.`,
              range: stmt.range,
            });
          }
          break;
        case 'subgraph': {
          const sgKey = `sg#${++sgSeq}`;
          const label = stmt.rawTitle !== undefined
            ? normalizeMermaidText(stmt.rawTitle, diagnostics, stmt.range)
            : undefined;
          const rec: SubgraphRecord = {
            key: sgKey,
            rawId: stmt.rawId,
            localCoralId: '',
            qualifiedCoralId: '',
            parentPath: [...currentPath],
            ...(label !== undefined ? { label } : {}),
            range: stmt.range,
          };
          subgraphsByKey.set(sgKey, rec);
          if (!subgraphsByRawId.has(stmt.rawId)) {
            subgraphsByRawId.set(stmt.rawId, rec);
          }
          ensureOrderList(scopeKeyOf(currentPath)).push({ kind: 'subgraph', key: sgKey });
          walkStmts(stmt.body, [...currentPath, sgKey]);
          break;
        }
        case 'node':
          for (const n of stmt.nodes) registerNodeRef(n, currentPath);
          break;
        case 'edge': {
          for (const s of stmt.sources) registerNodeRef(s, currentPath);
          for (const t of stmt.targets) registerNodeRef(t, currentPath);
          const pairCount = stmt.sources.length * stmt.targets.length;
          if (rawEdges.length + pairCount > MAX_EXPANDED_FLOWCHART_EDGES) {
            if (!edgeBudgetExceeded) {
              edgeBudgetExceeded = true;
              diagnostics.push({
                severity: 'error',
                code: 'mermaid.input.too-large',
                message: `Expanded flowchart edge count exceeds maximum budget of ${MAX_EXPANDED_FLOWCHART_EDGES} edges.`,
                range: stmt.range,
              });
            }
            return;
          }
          for (const s of stmt.sources) {
            for (const t of stmt.targets) {
              const label = stmt.rawLabel !== undefined
                ? normalizeMermaidText(stmt.rawLabel, diagnostics, stmt.range)
                : undefined;
              rawEdges.push({
                ...(stmt.edgeId ? { edgeId: stmt.edgeId } : {}),
                sourceRawId: s.rawId,
                targetRawId: t.rawId,
                lineStyle: stmt.lineStyle,
                firstEnd: stmt.firstEnd,
                secondEnd: stmt.secondEnd,
                shaftLength: stmt.shaftLength,
                ...(label !== undefined && label !== '' ? { label } : {}),
                range: stmt.range,
              });
            }
          }
          break;
        }
        case 'classDef':
          classDefs.set(stmt.name, parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range));
          break;
        case 'class':
          for (const id of stmt.nodeIds) {
            const list = classAssignments.get(id) ?? [];
            if (!list.includes(stmt.className)) list.push(stmt.className);
            classAssignments.set(id, list);
          }
          break;
        case 'style': {
          const parsed = parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range);
          inlineStyles.set(stmt.nodeId, mergeParsedStyles(inlineStyles.get(stmt.nodeId), parsed));
          break;
        }
        case 'linkStyle':
          linkStyles.push(stmt);
          break;
        case 'edgeConfig':
          edgeConfigs.set(stmt.edgeId, {
            animate: stmt.animate,
            ...(stmt.animationSpeed ? { animationSpeed: stmt.animationSpeed } : {}),
            range: stmt.range,
          });
          break;
        case 'click':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.flowchart.click.dropped',
            message: `Interactive click handler on "${stmt.nodeId}" has no Coral saved-source equivalent and was omitted.`,
            range: stmt.range,
          });
          break;
      }
    }
  };

  walkStmts(ast.body, []);

  // Allocate local Coral IDs per scope cleanly
  const scopeTaken = new Map<string, Set<string>>();
  const getScopeTaken = (scopeKey: string) => {
    let set = scopeTaken.get(scopeKey);
    if (!set) {
      set = new Set<string>();
      scopeTaken.set(scopeKey, set);
    }
    return set;
  };

  const assignScopeIds = (path: readonly string[], qualifiedPrefix: string) => {
    const key = scopeKeyOf(path);
    const items = scopeOrder.get(key) ?? [];
    const taken = getScopeTaken(key);
    for (const entry of items) {
      if (entry.kind === 'node') {
        const rec = nodesByRaw.get(entry.key)!;
        const { coralId, renamed } = allocateSanitizedId(rec.rawId, taken, diagnostics, rec.range);
        rec.localCoralId = coralId;
        rec.qualifiedCoralId = qualifiedPrefix ? `${qualifiedPrefix}.${coralId}` : coralId;
        idMap[rec.qualifiedCoralId] = rec.rawId;
        if (renamed && !rec.hasExplicitLabel) {
          rec.label = normalizeMermaidText(rec.rawId, diagnostics, rec.range, { unquote: false });
        }
      } else {
        const sg = subgraphsByKey.get(entry.key)!;
        const { coralId, renamed } = allocateSanitizedId(sg.rawId, taken, diagnostics, sg.range);
        sg.localCoralId = coralId;
        sg.qualifiedCoralId = qualifiedPrefix ? `${qualifiedPrefix}.${coralId}` : coralId;
        idMap[sg.qualifiedCoralId] = sg.rawId;
        if (renamed && sg.label === undefined) {
          sg.label = normalizeMermaidText(sg.rawId, diagnostics, sg.range, { unquote: false });
        }
        assignScopeIds([...path, sg.key], sg.qualifiedCoralId);
      }
    }
  };

  assignScopeIds([], '');

  const resolveEndpoint = (rawId: string): string | undefined => {
    const node = nodesByRaw.get(rawId);
    if (node) return node.qualifiedCoralId;
    const sg = subgraphsByRawId.get(rawId);
    if (sg) return sg.qualifiedCoralId;
    return undefined;
  };

  // Compute in/out degree for flowchart terminal start/end variants
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const e of rawEdges) {
    if (e.lineStyle === 'invisible') continue;
    outDegree.set(e.sourceRawId, (outDegree.get(e.sourceRawId) ?? 0) + 1);
    inDegree.set(e.targetRawId, (inDegree.get(e.targetRawId) ?? 0) + 1);
  }
  const zeroInStadiums: string[] = [];
  for (const rec of nodesByRaw.values()) {
    const exp = rec.expandedShape?.toLowerCase();
    const isStadium = rec.shape === 'stadium' || exp === 'stadium' || exp === 'terminal' || exp === 'pill';
    if (isStadium && (inDegree.get(rec.rawId) ?? 0) === 0 && (outDegree.get(rec.rawId) ?? 0) >= 1) {
      zeroInStadiums.push(rec.rawId);
    }
  }
  const uniqueStartRawId = zeroInStadiums.length === 1 ? zeroInStadiums[0] : undefined;

  // Build hierarchical CoralNodeIr tree
  const buildNodes = (path: readonly string[]): CoralNodeIr[] => {
    const items = scopeOrder.get(scopeKeyOf(path)) ?? [];
    const out: CoralNodeIr[] = [];
    for (const entry of items) {
      if (entry.kind === 'node') {
        const rec = nodesByRaw.get(entry.key)!;
        const mapped = mapShapeForTarget(
          rec.shape,
          rec.expandedShape,
          options.flowchartTarget,
          inDegree.get(rec.rawId) ?? 0,
          outDegree.get(rec.rawId) ?? 0,
          rec.rawId === uniqueStartRawId,
          diagnostics,
          rec.range,
        );
        // Merge classDef -> class/::: -> inline style
        let mergedStyle: ParsedCssNodeStyle | undefined;
        const allClasses = [...rec.classes, ...(classAssignments.get(rec.rawId) ?? [])];
        for (const cls of allClasses) {
          const def = classDefs.get(cls);
          if (def) mergedStyle = mergeParsedStyles(mergedStyle, def);
        }
        const inline = inlineStyles.get(rec.rawId);
        if (inline) mergedStyle = mergeParsedStyles(mergedStyle, inline);
        const styleStr = formatCoralNodeStyle(mergedStyle);

        const label = rec.label !== undefined && (rec.label !== rec.localCoralId || rec.explicitEmptyLabel)
          ? rec.label
          : undefined;
        out.push({
          id: rec.localCoralId,
          kind: mapped.kind,
          ...(label !== undefined ? { label } : {}),
          ...(rec.explicitEmptyLabel ? { explicitEmptyLabel: true } : {}),
          ...(mapped.symbol ? { symbol: mapped.symbol } : {}),
          ...(mapped.variant ? { variant: mapped.variant } : {}),
          ...(styleStr ? { style: styleStr } : {}),
        });
      } else {
        const sg = subgraphsByKey.get(entry.key)!;
        let mergedStyle: ParsedCssNodeStyle | undefined;
        for (const cls of classAssignments.get(sg.rawId) ?? []) {
          const def = classDefs.get(cls);
          if (def) mergedStyle = mergeParsedStyles(mergedStyle, def);
        }
        const inline = inlineStyles.get(sg.rawId);
        if (inline) mergedStyle = mergeParsedStyles(mergedStyle, inline);
        const styleStr = formatCoralNodeStyle(mergedStyle);

        const label = sg.label !== undefined && sg.label !== sg.localCoralId ? sg.label : undefined;
        out.push({
          id: sg.localCoralId,
          kind: 'group',
          ...(label !== undefined ? { label } : {}),
          ...(styleStr ? { style: styleStr } : {}),
          children: buildNodes([...path, sg.key]),
        });
      }
    }
    return out;
  };

  const nodes = buildNodes([]);

  // C1: Merge repeated `linkStyle default` declarations into one default style before per-index overrides
  type LinkStyleEntry = { color?: string; thick?: boolean; range: TranspileSourceRange };
  let defaultLinkStyle: LinkStyleEntry | undefined;
  const edgeStyleByIndex = new Map<number, LinkStyleEntry>();
  for (const ls of linkStyles) {
    const parsed = parseLinkStyle(ls.rawStyle, diagnostics, ls.range);
    if (ls.targets === 'default') {
      defaultLinkStyle = {
        ...(defaultLinkStyle?.color ? { color: defaultLinkStyle.color } : {}),
        ...(defaultLinkStyle?.thick !== undefined ? { thick: defaultLinkStyle.thick } : {}),
        ...(parsed.color ? { color: parsed.color } : {}),
        ...(parsed.thick !== undefined ? { thick: parsed.thick } : {}),
        range: ls.range,
      };
    } else {
      for (const idx of ls.targets) {
        if (idx < 0 || idx >= rawEdges.length) continue;
        const prev = edgeStyleByIndex.get(idx);
        edgeStyleByIndex.set(idx, {
          ...(prev?.color ? { color: prev.color } : {}),
          ...(prev?.thick !== undefined ? { thick: prev.thick } : {}),
          ...(parsed.color ? { color: parsed.color } : {}),
          ...(parsed.thick !== undefined ? { thick: parsed.thick } : {}),
          range: ls.range,
        });
      }
    }
  }

  // Emit edges at root scope with dot-qualified endpoints
  const edges: CoralEdgeIr[] = [];
  const usedEdgeIds = new Set<string>(Object.keys(idMap));

  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i]!;
    if (e.lineStyle === 'invisible') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.edge.invisible.dropped',
        message: `Invisible layout link between "${e.sourceRawId}" and "${e.targetRawId}" was omitted.`,
        range: e.range,
      });
      continue;
    }

    let source = resolveEndpoint(e.sourceRawId);
    let target = resolveEndpoint(e.targetRawId);
    if (!source || !target) continue;

    let firstEnd = e.firstEnd;
    let secondEnd = e.secondEnd;
    if (firstEnd === 'cross' || secondEnd === 'cross') {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.flowchart.marker.cross.degraded',
        message: 'Cross edge marker ("--x" / "x--x") has no Coral marker equivalent and degraded to an unmarked end.',
        range: e.range,
      });
      if (firstEnd === 'cross') firstEnd = 'none';
      if (secondEnd === 'cross') secondEnd = 'none';
    }

    let shaft = e.shaftLength;
    if (shaft > 6) {
      shaft = 6;
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.flowchart.edge-length.clamped',
        message: 'Mermaid edge shaft length exceeded Coral maximum (6) and was clamped to 6.',
        range: e.range,
      });
    }

    const isDashed = e.lineStyle === 'dashed';
    const isThick = e.lineStyle === 'thick';
    const styleTerms: string[] = [];

    // M4: Determine Coral operator & optional firstEnd, preserving arrowheads on reverse & mixed-end arrows
    let operator = '->';
    let coralFirstEnd: string | undefined;
    let operatorIsDashed = false;

    if (firstEnd === 'arrow' && secondEnd === 'arrow') {
      const dashes = '-'.repeat(Math.max(1, Math.min(6, shaft)));
      operator = `<${dashes}>`;
      if (isDashed) styleTerms.push('dashed');
    } else if (firstEnd === 'arrow' && secondEnd === 'none') {
      const dashes = '-'.repeat(Math.max(1, Math.min(6, shaft)));
      operator = `<${dashes}`;
      if (isDashed) styleTerms.push('dashed');
    } else if (firstEnd === 'arrow' && secondEnd === 'circle') {
      // Flip endpoints so circle is firstEnd and open arrow is operator secondEnd (satisfies Coral direction invariant)
      const tmp = source;
      source = target;
      target = tmp;
      if (isDashed) {
        operator = '-.->';
        operatorIsDashed = true;
      } else {
        operator = `${'-'.repeat(Math.max(1, Math.min(6, shaft)))}>`;
      }
      coralFirstEnd = 'circle';
    } else if (firstEnd === 'circle' && secondEnd === 'arrow') {
      if (isDashed) {
        operator = '-.->';
        operatorIsDashed = true;
      } else {
        operator = `${'-'.repeat(Math.max(1, Math.min(6, shaft)))}>`;
      }
      coralFirstEnd = 'circle';
    } else if (firstEnd === 'circle' && secondEnd === 'circle') {
      operator = isDashed ? '-.-o' : '-o';
      operatorIsDashed = isDashed;
      coralFirstEnd = 'circle';
    } else if (secondEnd === 'circle') {
      operator = isDashed ? '-.-o' : '-o';
      operatorIsDashed = isDashed;
    } else if (firstEnd === 'circle') {
      operator = isDashed ? '-.-' : '--';
      operatorIsDashed = isDashed;
      coralFirstEnd = 'circle';
    } else if (secondEnd === 'arrow') {
      if (isDashed) {
        operator = '-.->';
        operatorIsDashed = true;
      } else {
        operator = `${'-'.repeat(Math.max(1, Math.min(6, shaft)))}>`;
      }
    } else {
      // Open link
      if (isDashed) {
        operator = '-.-';
        operatorIsDashed = true;
      } else {
        operator = '-'.repeat(Math.max(2, Math.min(6, shaft)));
      }
    }

    // Thick edge weight
    const perEdgeStyle = edgeStyleByIndex.get(i);
    const linkStyle: LinkStyleEntry | undefined = defaultLinkStyle || perEdgeStyle
      ? {
        ...(defaultLinkStyle?.color ? { color: defaultLinkStyle.color } : {}),
        ...(defaultLinkStyle?.thick !== undefined ? { thick: defaultLinkStyle.thick } : {}),
        ...(perEdgeStyle?.color ? { color: perEdgeStyle.color } : {}),
        ...(perEdgeStyle?.thick !== undefined ? { thick: perEdgeStyle.thick } : {}),
        range: (perEdgeStyle ?? defaultLinkStyle)!.range,
      }
      : undefined;
    const wantsThick = isThick || linkStyle?.thick === true;
    if (wantsThick) {
      if (options.edgeStyleMode === 'portable') {
        styleTerms.push('thick');
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.flowchart.edge-weight.degraded',
          message: 'Thick edge weight degraded to regular weight in visual-safe mode (use edgeStyleMode: "portable" to preserve [style: "thick"]).',
          range: e.range,
        });
      }
    }

    // Edge color from linkStyle
    if (linkStyle?.color) {
      if (options.edgeStyleMode === 'portable') {
        styleTerms.push(linkStyle.color);
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.flowchart.edge-color.degraded',
          message: `Edge stroke color "${linkStyle.color}" degraded in visual-safe mode (use edgeStyleMode: "portable" to preserve it).`,
          range: linkStyle.range,
        });
      }
    }

    // Edge animation from e1@{ animate: true }
    const cfg = e.edgeId ? edgeConfigs.get(e.edgeId) : undefined;
    if (cfg?.animate) {
      if (options.edgeStyleMode === 'portable') {
        styleTerms.push('animated:forward');
        if (cfg.animationSpeed) {
          diagnostics.push({
            severity: 'info',
            code: 'mermaid.flowchart.edge-animation-speed.degraded',
            message: `Edge animation speed "${cfg.animationSpeed}" normalized to Coral "animated:forward".`,
            range: cfg.range,
          });
        }
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.flowchart.edge-animation.degraded',
          message: `Edge animation on "${e.edgeId}" degraded in visual-safe mode (use edgeStyleMode: "portable" to preserve [style: "animated:forward"]).`,
          range: cfg.range,
        });
      }
    }

    // Guard: NEVER emit dashed in style when operator itself is dashed
    const filteredTerms = operatorIsDashed
      ? styleTerms.filter((t) => t !== 'dashed')
      : styleTerms;

    let edgeCoralId: string | undefined;
    if (e.edgeId) {
      const alloc = allocateSanitizedId(e.edgeId, usedEdgeIds, diagnostics, e.range);
      edgeCoralId = alloc.coralId;
    }

    edges.push({
      ...(edgeCoralId ? { id: edgeCoralId } : {}),
      source,
      target,
      operator,
      ...(coralFirstEnd ? { firstEnd: coralFirstEnd } : {}),
      ...(filteredTerms.length > 0 ? { style: filteredTerms.join('; ') } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
    });
  }

  let direction: CoralLayoutDirection | undefined;
  if (rootDirection) {
    direction = mapDirection(rootDirection);
  } else if (options.flowchartTarget === 'block') {
    // blockNotation defaults to RIGHT while Mermaid defaults to TD/DOWN
    direction = 'DOWN';
  }

  return {
    ir: {
      notation: options.flowchartTarget,
      edition: '0.2.14',
      ...(direction ? { direction } : {}),
      ...(options.comments.length > 0 ? { comments: options.comments } : {}),
      nodes,
      edges,
    },
    idMap,
  };
}

function parseLinkStyle(
  raw: string,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): { color?: string; thick?: boolean } {
  let color: string | undefined;
  let thick: boolean | undefined;
  for (const part of splitCssDeclarations(raw)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const prop = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (prop === 'stroke') {
      const hex = normalizeCssColor(val);
      if (hex) color = hex;
      else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.style.color.unsupported',
          message: `Unsupported linkStyle stroke color "${val}" was omitted.`,
          range,
        });
      }
    } else if (prop === 'stroke-width') {
      const m = /^(\d+(?:\.\d+)?)\s*(?:px)?$/i.exec(val);
      if (m && Number(m[1]) >= 3) thick = true;
    }
  }
  return { ...(color ? { color } : {}), ...(thick !== undefined ? { thick } : {}) };
}
