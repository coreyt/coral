/** Source-owned character target with exact successor admission. */
import { validateGraphIRSuccessorWithCatalog, type GraphIR } from '@graph-ir/core';
import { projectInstalledSourceToSuccessor028, type SuccessorSourceGraph028 } from './successorSourceProjection028.js';
import { resolveSuccessorGraphNodes028, successorCoreValidationInput029 } from './successorInterpretation028.js';
import { assessInstalledSuccessorSourceIntegrity028 } from './successorSourceIntegrity028.js';
import { checkInstalledSuccessorSourceConformance028 } from './successorSourceConformance028.js';
import { parseInstalledDocument028 } from './installedDocument028.js';
import {
  CharacterRenderError, encodeCharacterField028, monoTrueReady028,
  renderCharacterGraph028, type CharacterColumns028, type CharacterDiagnostic028,
  type CharacterOptions028, type CharacterCharset028,
} from './characters028.js';
import { renderRoutedCharacters028 } from './characterRouted028.js';
import { renderUmlClassCharacters028, renderUmlSequenceCharacters028 } from './characterUml028.js';
import { renderUmlStateCharacters028, stateCharacterUsesChain028 } from './characterState028.js';

export type CharacterPreviewOptions028 = CharacterOptions028;
export interface CharacterPreviewResult028 {
  text: string;
  charset: CharacterCharset028;
  width: number;
  height: number;
  diagnostics: CharacterDiagnostic028[];
  /** Exact parsed Graph IR 3 display projection, copied before private adaptation. */
  graph: GraphIR;
}

const ROUTE_ROLES = [
  'stroke.single.nw', 'stroke.single.h', 'stroke.single.ne',
  'stroke.single.v', 'stroke.single.sw', 'stroke.single.se',
  'endpoint.arrow_open.e', 'endpoint.arrow_open.n',
  'endpoint.arrow_open.s', 'endpoint.arrow_open.w',
  'stroke.single.tee_e', 'stroke.single.tee_w', 'stroke.single.tee_n', 'stroke.single.tee_s',
] as const;
const BPMN_ROLES: Record<string, { type: string; symbol: string }> = {
  startEvent: { type: 'actor', symbol: 'bpmn-start-event' },
  task: { type: 'service', symbol: 'bpmn-task' },
  exclusiveGateway: { type: 'decision', symbol: 'bpmn-gateway-exclusive' },
  endEvent: { type: 'terminal', symbol: 'bpmn-end-event' },
};
type InputRecord = Record<string, unknown>;

function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}

function record(value: unknown, path: string): InputRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('character.field.invalid', 'Expected a record.', path);
  }
  return value as InputRecord;
}

function allowedKeys(value: InputRecord, names: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!names.includes(key)) fail('character.field.unsupported', `Unsupported field ${key}.`, `${path}.${key}`);
  }
}

function boundedString(value: unknown, path: string, budget: { units: number }, optional = false): string {
  if (typeof value !== 'string' || (!optional && value.length === 0)) {
    fail('character.field.invalid', 'Expected a nonempty string.', path);
  }
  if (value.length > 2048) fail('character.size.unsupported', 'Field exceeds 2,048 UTF-16 units.', path);
  // The shared encoder rejects unpaired surrogate code units.
  encodeCharacterField028(value);
  budget.units += value.length;
  if (budget.units > 8192) fail('character.size.unsupported', 'Text exceeds 8,192 UTF-16 units.', path);
  return value;
}

function validateBpmnGraph(graph: GraphIR): void {
  const root = record(graph, 'graph');
  allowedKeys(root, ['version', 'id', 'name', 'nodes', 'edges', 'metadata'], 'graph');
  if (root.version !== '3.0.0') fail('character.graph.version', 'GraphIR 3 is required.', 'version');
  const budget = { units: 0 };
  boundedString(root.id, 'id', budget);
  if (root.name !== undefined) boundedString(root.name, 'name', budget, true);
  const metadata = record(root.metadata, 'metadata');
  allowedKeys(metadata, ['notation'], 'metadata');
  if (metadata.notation !== 'bpmn') fail('character.notation.unsupported', 'BPMN notation is required.', 'metadata.notation');
  if (!Array.isArray(root.nodes) || !Array.isArray(root.edges)) {
    fail('character.graph.invalid', 'Nodes and edges must be arrays.');
  }
  if (root.nodes.length < 1 || root.nodes.length > 40 || root.edges.length > 80) {
    fail('character.size.unsupported', 'The preview accepts 1–40 nodes and at most 80 edges.');
  }
  const ids = new Set<string>();
  for (const [index, value] of root.nodes.entries()) {
    const path = `nodes.${index}`;
    const node = record(value, path);
    allowedKeys(node, ['id', 'type', 'label', 'symbol', 'variant'], path);
    const id = boundedString(node.id, `${path}.id`, budget);
    if (ids.has(id)) fail('character.id.duplicate', 'Duplicate node ID.', `${path}.id`);
    ids.add(id);
    const role = typeof node.type === 'string' ? BPMN_ROLES[node.type] : undefined;
    if (!role || node.symbol !== undefined && node.symbol !== role.symbol || node.variant !== undefined) {
      fail('character.role.unsupported', 'BPMN node role, symbol or variant is not admitted.', path);
    }
    if (node.label !== undefined) boundedString(node.label, `${path}.label`, budget, true);
  }
  const edgeIds = new Set<string>();
  const nodeTypes = new Map(root.nodes.map((node: GraphIR['nodes'][number]) => [node.id, node.type]));
  const startOutgoings = new Map<string, number>();
  for (const [index, value] of root.edges.entries()) {
    const path = `edges.${index}`;
    const edge = record(value, path);
    allowedKeys(edge, ['id', 'source', 'target', 'label', 'type', 'sourceEnd', 'targetEnd'], path);
    const id = boundedString(edge.id, `${path}.id`, budget);
    if (edgeIds.has(id)) fail('character.id.duplicate', 'Duplicate edge ID.', `${path}.id`);
    edgeIds.add(id);
    const source = boundedString(edge.source, `${path}.source`, budget);
    const target = boundedString(edge.target, `${path}.target`, budget);
    if (!ids.has(source) || !ids.has(target)) fail('character.edge.endpoint', 'Edge endpoint is missing.', path);
    if (nodeTypes.get(source) === 'endEvent' || nodeTypes.get(target) === 'startEvent') {
      fail('character.bpmn.sequence-endpoint', 'Start events cannot receive and end events cannot send Sequence Flows.', path);
    }
    if (nodeTypes.get(source) === 'startEvent') {
      const count = (startOutgoings.get(source) ?? 0) + 1;
      startOutgoings.set(source, count);
      if (count > 1) {
        fail('character.bpmn.start-fanout', 'Multiple start-event flows cannot be attached to the event contour.', `nodes.${source}`);
      }
    }
    if (edge.type !== undefined && edge.type !== 'sequence') {
      fail('character.edge.unsupported', 'Only BPMN sequence edges are admitted.', `${path}.type`);
    }
    if (edge.label !== undefined) boundedString(edge.label, `${path}.label`, budget, true);
    const sourceEnd = record(edge.sourceEnd, `${path}.sourceEnd`);
    const targetEnd = record(edge.targetEnd, `${path}.targetEnd`);
    allowedKeys(sourceEnd, ['marker'], `${path}.sourceEnd`);
    allowedKeys(targetEnd, ['marker'], `${path}.targetEnd`);
    const sourceMarker = record(sourceEnd.marker, `${path}.sourceEnd.marker`);
    const targetMarker = record(targetEnd.marker, `${path}.targetEnd.marker`);
    allowedKeys(sourceMarker, ['kind', 'fill'], `${path}.sourceEnd.marker`);
    allowedKeys(targetMarker, ['kind', 'fill'], `${path}.targetEnd.marker`);
    if (sourceMarker.kind !== 'none' || sourceMarker.fill !== 'unspecified' ||
        targetMarker.kind !== 'arrow' || targetMarker.fill !== 'open') {
      fail('character.edge.direction', 'Only forward, open-arrow edges are admitted.', path);
    }
  }
}

/** Validate the exact accepted semantic subset, then make only display-copy additions. */
export function adaptCharacterGraph028(graph: GraphIR, columns: CharacterColumns028): GraphIR {
  if (![40, 80, 120].includes(columns)) {
    fail('character.width.unsupported', 'Width must be 40, 80 or 120 columns.', 'columns');
  }
  const notation = graph?.metadata?.notation;
  if (notation === 'block' || notation === 'flowchart') {
    if (graph.nodes.length === 0) fail('character.graph.empty', 'Character preview needs at least one node.', 'nodes');
    // This is the released strict semantic preflight and round-trip verifier.
    renderCharacterGraph028(graph, { columns, target: 'copy-export' });
  } else if (notation === 'bpmn') {
    validateBpmnGraph(graph);
  } else {
    fail('character.notation.unsupported', 'No routed character profile for this notation.', 'metadata.notation');
  }
  const adapted = structuredClone(graph);
  const relation = notation === 'bpmn' ? 'sequence' : 'flow';
  adapted.edges = adapted.edges.map((edge) => ({ ...edge, type: edge.type ?? relation }));
  if (notation === 'bpmn') {
    adapted.nodes = adapted.nodes.map((node) => {
      const role = BPMN_ROLES[node.type]!;
      return { ...node, type: role.type, symbol: role.symbol };
    });
  }
  return adapted;
}

function sourcePath(range: { start: { line: number; column: number } } | undefined): string {
  return range ? `source.line.${range.start.line}.column.${range.start.column}` : 'source';
}

/** Family-only refusals still identify a concrete source token. Shared
 * placement/port/proximity admission runs first and supplies its exact token. */
function sourceConstructPath028(item: ReturnType<typeof parseInstalledDocument028>['syntax']['statements'][number]): string {
  if (item.kind === 'node') return sourcePath((item.symbol ?? item.variant ??
    item.conformanceException ?? item.blockOpen ?? item.blockClose ?? item.parentGroup ??
    (item.bracketClose && !item.label ? item.bracketClose : item.nodeKind)).range);
  if (item.kind === 'edge') return sourcePath((item.operator.raw !== '->' ? item.operator
    : item.firstEnd ?? item.secondEnd ?? item.style ?? item.edgeType ?? item.bracketClose ?? item.operator).range);
  const token = Object.values(item).find(value => value !== null &&
    typeof value === 'object' && 'range' in value);
  return sourcePath(token?.range);
}

function validateStateSource028(statements: ReturnType<typeof parseInstalledDocument028>['syntax']['statements']): void {
  for (const item of statements) {
    const path = sourceConstructPath028(item);
    if (item.kind === 'node') {
      if (!['initial', 'state', 'final'].includes(item.nodeKind.value) || item.symbol || item.variant ||
          item.description || item.style || item.technology || item.provider ||
          item.conformanceException || item.blockOpen || item.blockClose || item.parentGroup ||
          item.bracketClose && !item.label) {
        fail('character.state.source-construct', 'Only flat initial, simple state and final declarations are admitted.', path);
      }
    } else if (item.kind === 'edge') {
      if (item.operator.raw !== '->' || item.sourcePort || item.targetPort || item.firstEnd || item.secondEnd ||
          item.description || item.technology || item.firstLabel || item.secondLabel ||
          item.style || item.styleIntent && Object.keys(item.styleIntent).length > 0 ||
          item.scope?.length || item.edgeType && item.edgeType.value !== 'transition' ||
          item.bracketClose && !item.label && !item.edgeType ||
          !item.operatorConnector || item.operatorConnector.dashCount !== 1 ||
          item.operatorConnector.stroke !== 'solid' ||
          item.operatorConnector.firstEnd.kind !== 'none' ||
          item.operatorConnector.secondEnd.kind !== 'arrow') {
        fail('character.state.source-construct', 'Only flat literal forward transitions are admitted.', path);
      }
    } else {
      fail('character.state.source-construct', 'Unsupported state source statement.', path);
    }
  }
}

function validateBpmnSource028(statements: ReturnType<typeof parseInstalledDocument028>['syntax']['statements']): void {
  for (const item of statements) {
    const path = sourceConstructPath028(item);
    if (item.kind === 'node') {
      if (!Object.hasOwn(BPMN_ROLES, item.nodeKind.value) || item.symbol || item.variant ||
          item.conformanceException || item.blockOpen || item.blockClose || item.parentGroup ||
          item.bracketClose && !item.label) {
        fail('character.bpmn.source-construct', 'Only flat BPMN start, task, exclusive gateway and end declarations are admitted.', path);
      }
    } else if (item.kind === 'edge') {
      if (item.operator.raw !== '->' || item.sourcePort || item.targetPort || item.firstEnd || item.secondEnd ||
          item.style || item.styleIntent && Object.keys(item.styleIntent).length > 0 ||
          item.scope?.length || item.edgeType && item.edgeType.value !== 'sequence' ||
          item.bracketClose && !item.label && !item.edgeType ||
          !item.operatorConnector || item.operatorConnector.dashCount !== 1 ||
          item.operatorConnector.stroke !== 'solid' ||
          item.operatorConnector.firstEnd.kind !== 'none' ||
          item.operatorConnector.secondEnd.kind !== 'arrow') {
        fail('character.bpmn.source-construct', 'Only flat literal forward Sequence Flows are admitted.', path);
      }
    } else {
      fail('character.bpmn.source-construct', 'Unsupported BPMN source statement.', path);
    }
  }
}

/** Flowchart nodes that select a defined user symbol; each draws as a labelled
 * process box, and a connector may name its ports (design D60-7). */
function characterUserSymbolNodes029(document: ReturnType<typeof parseInstalledDocument028>): ReadonlySet<string> {
  if (document.header.header?.diagramType !== 'flowchart' || !document.definitions?.length) return new Set();
  const defined = new Set(document.definitions.map((definition) => definition.symbolId));
  return new Set(document.syntax.statements.flatMap((item) => item.kind === 'node' && item.symbol &&
    defined.has(item.symbol.value) ? [item.id.value] : []));
}

/** Reject authored intent absent from the reviewed character geometry, even
 * when the optional legacy staging graph has silently omitted that intent. */
function admitCharacterIntent028(document: ReturnType<typeof parseInstalledDocument028>,
  userNodes: ReadonlySet<string> = new Set()): void {
  const notation = document.header.header!.diagramType;
  for (const item of document.syntax.statements) {
    let token;
    if (item.kind === 'node') token = item.position?.marker ?? item.pinned ?? item.labelPlacement?.side;
    else if (item.kind === 'port') token = item.portKeyword;
    else if (item.kind === 'edge') {
      token = (userNodes.has(item.source.value) ? undefined : item.sourcePort) ??
        (userNodes.has(item.target.value) ? undefined : item.targetPort) ?? item.labelPlacement?.side;
      // Preserve the reviewed default spellings for class relationships and
      // dashed sequence returns. Other shaft lengths request spatial meaning
      // that these character compositors do not execute.
      const baseline = notation === 'uml-class' ? 2
        : notation === 'uml-sequence' && item.operatorConnector?.stroke === 'dashed' ? 3 : 1;
      if (!token && item.operatorConnector?.dashCount !== undefined &&
          item.operatorConnector.dashCount !== baseline &&
          !(notation === 'uml-class' && item.operatorConnector.dashCount === 1)) token = item.operator;
      if (!token && notation !== 'uml-class' && notation !== 'uml-sequence' &&
          (item.firstEnd || item.secondEnd)) token = item.firstEnd ?? item.secondEnd;
    } else if (item.kind === 'route') token = item.routeKeyword;
    else if (item.kind === 'layout' || item.kind === 'constraint' || item.kind === 'arrangement') token = item.keyword;
    if (token) fail('character.source.capability',
      'The character target cannot preserve this authored placement, port, proximity or direction choice.', sourcePath(token.range));
  }
}

function admitCharacterSource028(source: string,
  document: ReturnType<typeof parseInstalledDocument028>): SuccessorSourceGraph028 {
  const projected = projectInstalledSourceToSuccessor028(document);
  if (!projected.graph) {
    const issue = projected.diagnostics[0];
    fail('character.source.projection-unavailable', issue?.message ?? 'Exact source projection is unavailable.', sourcePath(issue?.range));
  }
  const graph = projected.graph;
  // This is unconditional: the shared U2 helper may take an ordinary legacy
  // report shortcut and therefore cannot establish exact validation itself.
  const core = successorCoreValidationInput029(graph);
  const exact = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
  if (!exact.valid || !exact.verification.complete) fail('character.source.integrity',
    exact.errors[0]?.message ?? exact.verification.obligations[0]?.message ?? 'Exact successor validation failed.', 'source');
  const interpretations = resolveSuccessorGraphNodes028(graph);
  const integrity = assessInstalledSuccessorSourceIntegrity028(document, graph, interpretations)[0];
  if (integrity) fail('character.source.integrity', integrity.message, sourcePath(integrity.range));
  const checked = checkInstalledSuccessorSourceConformance028(source);
  const diagnostic = checked.diagnostics[0];
  if (diagnostic) fail('character.source.integrity', diagnostic.message, sourcePath(diagnostic.range));
  if (!checked.report) fail('character.source.integrity', 'Source conformance could not be evaluated.', 'source');
  const error = checked.report.findings.find(finding => finding.severity === 'error');
  if (error) fail('character.source.conformance', error.message, sourcePath(error.range));
  // The returned graph keeps the historical parser-display contract. Paired
  // successor endpoints are the independent proof of message direction.
  if (graph.interaction && document.graph?.interaction) {
    for (const message of graph.interaction.messages) {
      const staged = document.graph.interaction.messages.find(item => item.id === message.id);
      if (!staged || staged.sourceParticipantId !== message.senderParticipantId ||
          staged.targetParticipantId !== message.receiverParticipantId) {
        fail('character.source.capability', 'The display projection cannot preserve message direction.', 'source');
      }
    }
  }
  return graph;
}

const fallbackPoint029 = (point: { x: number; y: number }) =>
  `(${Number(point.x.toFixed(4))}, ${Number(point.y.toFixed(4))})`;

/** Draw each user symbol as a labelled process box. Connectors that name its
 * ports lose only the port: the cell router attaches them to the box outline.
 * The notice names each such port end and lists every escape segment from an
 * interior anchor to its boundary point, which cell geometry cannot draw. */
function userSymbolCharacterFallback029(graph: GraphIR, successor: SuccessorSourceGraph028,
  userNodes: ReadonlySet<string>): { graph: GraphIR; notices: CharacterDiagnostic028[] } {
  const interpretations = resolveSuccessorGraphNodes028(successor);
  const notices: CharacterDiagnostic028[] = [];
  for (const node of graph.nodes) {
    if (!userNodes.has(node.id)) continue;
    const user = interpretations.get(node.id)?.userSymbol029;
    if (!user) continue;
    const ends: string[] = [];
    const escapes: string[] = [];
    for (const edge of graph.edges) for (const [end, nodeId, portId] of [
      ['source', edge.source, edge.sourcePort], ['target', edge.target, edge.targetPort]] as const) {
      if (nodeId !== node.id || portId === undefined) continue;
      ends.push(`${edge.id}:${end} ${portId}`);
      const port = interpretations.get(node.id)!.semanticPorts.find((item) => item.id === portId);
      const anchor = port && typeof port.anchor === 'object' ? user.anchors.get(port.anchor.id) : undefined;
      if (anchor?.interior) escapes.push(`${edge.id}:${end} from ${fallbackPoint029(anchor.interior)} to ${fallbackPoint029(anchor.attachment)}`);
    }
    notices.push({ code: 'character.symbol.local-fallback', severity: 'info', path: `nodes.${node.id}`,
      message: `Node ${node.id} uses user symbol ${user.definition.symbolId}; drawn as a labelled box.` +
        (ends.length ? ` Port ends drawn to the box: ${ends.join(', ')}.` : '') +
        (escapes.length ? ` Escape segments not drawn: ${escapes.join(', ')}.` : '') });
  }
  return { notices, graph: { ...graph,
    nodes: graph.nodes.map((node) => userNodes.has(node.id)
      ? { id: node.id, type: 'process', ...(node.label !== undefined ? { label: node.label } : {}) } : node),
    edges: graph.edges.map((edge) => {
      const { sourcePort, targetPort, ...rest } = edge;
      return { ...rest,
        ...(sourcePort !== undefined && !userNodes.has(edge.source) ? { sourcePort } : {}),
        ...(targetPort !== undefined && !userNodes.has(edge.target) ? { targetPort } : {}) };
    }) } };
}

export async function renderInstalledCharacterPreview028(
  source: string, options: CharacterPreviewOptions028,
): Promise<CharacterPreviewResult028> {
  if (![40, 80, 120].includes(options.columns)) {
    fail('character.width.unsupported', 'Width must be 40, 80 or 120 columns.', 'columns');
  }
  const document = parseInstalledDocument028(source);
  const issue = document.header.diagnostics[0] ?? document.syntax.diagnostics[0];
  if (issue || !document.header.header) {
    fail('character.source.invalid', issue?.message ?? 'Coral header is unresolved.', sourcePath(issue?.range));
  }
  const userNodes = characterUserSymbolNodes029(document);
  admitCharacterIntent028(document, userNodes);
  if (document.header.header.diagramType === 'uml-state') validateStateSource028(document.syntax.statements);
  if (document.header.header.diagramType === 'bpmn') validateBpmnSource028(document.syntax.statements);
  let successor: SuccessorSourceGraph028 | undefined;
  if (document.graph || !document.syntax.statements.some(item => item.kind === 'edge' &&
      (item.styleIntent?.strokeColor !== undefined || item.styleIntent?.strokeWeight !== undefined || item.styleIntent?.motion !== undefined))) {
    successor = admitCharacterSource028(source, document);
  }
  // GraphIR 3 cannot carry a symbol catalog, so the reader withholds the
  // display graph of a document with definitions. Its body graph is the same
  // historical display contract; the successor admitted above stays the authority.
  const display = document.graph ?? (document.definitions?.length && successor ? document.syntax.graph : undefined);
  if (!display) {
    const edge = document.syntax.statements.find((item) => item.kind === 'edge' &&
      (item.styleIntent?.strokeColor !== undefined || item.styleIntent?.strokeWeight !== undefined ||
        item.styleIntent?.motion !== undefined));
    const extra = document.syntax.statements.find((item) => item.kind === 'note' || item.kind === 'activation');
    const range = (edge?.kind === 'edge' ? edge.style?.range ?? edge.operator.range : undefined) ??
      (extra?.kind === 'note' ? extra.noteKeyword.range : extra?.kind === 'activation' ? extra.activationKeyword.range : undefined);
    fail('character.source.projection-unavailable', 'Source meaning has no Graph IR 3 display projection.', sourcePath(range));
  }
  const graph = structuredClone(display);
  if (graph.metadata?.notation === 'uml-state') {
    const stateWork = structuredClone(graph);
    if (stateWork.metadata?.custom && Object.keys(stateWork.metadata.custom).length === 1 && 'coralEdition' in stateWork.metadata.custom) {
      delete stateWork.metadata.custom;
    }
    const chain = stateCharacterUsesChain028(stateWork);
    const requiredRoles = [...(chain ? [...ROUTE_ROLES.slice(0, 6), 'endpoint.arrow_open.w', 'stroke.single.tee_e', 'stroke.single.tee_w'] : ROUTE_ROLES),
      'mark.circle.filled'];
    const charset: CharacterCharset028 = options.monoTrue?.face === 'Regular' &&
      monoTrueReady028(options, requiredRoles) ? 'MonoTrue-v1' : 'ASCII';
    return { ...await renderUmlStateCharacters028(stateWork, options.columns, charset), graph };
  }
  if (graph.metadata?.notation === 'uml-class' || graph.metadata?.notation === 'uml-sequence') {
    if (graph.metadata.notation === 'uml-sequence' &&
        (document.syntax.sequenceItems ?? []).some((item) => item.kind !== 'edge')) {
      fail('character.sequence.source-construct', 'Only flat message statements are admitted.', 'source.sequenceItems');
    }
    const requiredRoles = graph.metadata.notation === 'uml-class'
      ? [...ROUTE_ROLES, ...['diamond_filled', 'triangle_open'].flatMap(family =>
        ['e', 'w', 'n', 's'].map(port => `endpoint.${family}.${port}`))]
      : ['stroke.single.v', 'stroke.single.h', 'stroke.dashed.h',
        'stroke.single.tee_e', 'stroke.single.tee_w',
        'endpoint.arrow_open.e', 'endpoint.arrow_open.w',
        'endpoint.triangle_filled.e', 'endpoint.triangle_filled.w'];
    const regular = options.monoTrue?.face === 'Regular';
    const charset: CharacterCharset028 = regular && monoTrueReady028(options, requiredRoles) ? 'MonoTrue-v1' : 'ASCII';
    const rendered = graph.metadata.notation === 'uml-class'
      ? await renderUmlClassCharacters028(graph, options.columns, charset)
      : renderUmlSequenceCharacters028(graph, options.columns, charset);
    return { ...rendered, graph };
  }
  const fallback = userNodes.size && successor ? userSymbolCharacterFallback029(graph, successor, userNodes) : undefined;
  const adapted = adaptCharacterGraph028(fallback?.graph ?? graph, options.columns);
  const charset: CharacterCharset028 = options.monoTrue?.face === 'Regular' && monoTrueReady028(options, graph.metadata?.notation === 'bpmn'
    ? [...ROUTE_ROLES, ...['e', 'w', 'n', 's'].map(port => `endpoint.triangle_filled.${port}`)] : ROUTE_ROLES)
    ? 'MonoTrue-v1' : 'ASCII';
  const rendered = await renderRoutedCharacters028(adapted, options.columns, charset);
  return { ...rendered, diagnostics: [...rendered.diagnostics, ...fallback?.notices ?? []], graph };
}
