import type { CandidateEdgeSyntax, CandidateNodeSyntax } from '@coral-viz/language';
import type { SuccessorSourceGraph028, SuccessorSourceNode028 }
  from './successorSourceProjection028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';

export interface SourceSemanticCapabilityNotice028 {
  severity: 'warning';
  code: 'render.capability.chen-ownership' | 'render.capability.chen-cardinality' |
    'render.capability.bpmn-scope';
  message: string;
  subject: { kind: 'node' | 'edge'; id: string };
  range?: CandidateNodeSyntax['id']['range'];
}

/** Preserve supported artwork and authored ends without advertising meaning
 * that the installed catalog and successor model do not yet establish. */
export function sourceSemanticCapabilityNotices028(
  graph: SuccessorSourceGraph028,
  nodeStatements: readonly CandidateNodeSyntax[] = [],
  edgeStatements: readonly CandidateEdgeSyntax[] = [],
): SourceSemanticCapabilityNotice028[] {
  if (graph.profile.id !== 'erd' && graph.profile.id !== 'bpmn') return [];
  const interpretations = resolveSuccessorGraphNodes028(graph);
  const nodeSyntax = new Map(nodeStatements.map((node) => [node.qualifiedId ?? node.id.value, node]));
  const nodes = (items: readonly SuccessorSourceNode028[]): SuccessorSourceNode028[] =>
    items.flatMap((node) => [node, ...nodes(node.children ?? [])]);
  const notices: SourceSemanticCapabilityNotice028[] = [];
  const add = (code: SourceSemanticCapabilityNotice028['code'], message: string,
    kind: 'node' | 'edge', id: string, range?: SourceSemanticCapabilityNotice028['range']) =>
    notices.push({ severity: 'warning', code, message, subject: { kind, id },
      ...(range ? { range } : {}) });
  for (const node of nodes(graph.nodes)) {
    const selected = interpretations.get(node.id)?.effectiveSymbolId;
    const syntax = nodeSyntax.get(node.id);
    if (graph.profile.id === 'bpmn' &&
      (selected === 'bpmn-pool' || selected === 'bpmn-lane' ||
        node.type === 'pool' || node.type === 'lane')) {
      add('render.capability.bpmn-scope',
        `Node ${node.id} can display pool or lane artwork, but process/participant scope is not verified. Ordinary group containment is retained; it does not establish BPMN scope.`,
        'node', node.id, (node.type === 'pool' || node.type === 'lane'
          ? syntax?.nodeKind : syntax?.symbol ?? syntax?.nodeKind)?.range);
    }
    if (graph.profile.id === 'erd' && (selected === 'erd-attribute' || node.type === 'attribute')) {
      add('render.capability.chen-ownership',
        `Attribute ${node.id} and its authored connections are retained, but Chen attribute ownership is not verified or inferred from endpoint order.`,
        'node', node.id, (node.type === 'attribute'
          ? syntax?.nodeKind : syntax?.symbol ?? syntax?.nodeKind)?.range);
    }
    if (graph.profile.id === 'erd' &&
      (selected === 'erd-cardinality' || node.properties?.chenCardinality !== undefined)) {
      add('render.capability.chen-cardinality',
        `Node ${node.id} retains its cardinality artwork or property, but no verified Chen cardinality/participation mapping attaches it to a relationship end.`,
        'node', node.id, selected === 'erd-cardinality' ?
          (syntax?.symbol ?? syntax?.nodeKind)?.range : undefined);
    }
  }
  if (graph.profile.id === 'erd') {
    const cardinality = new Set(['zero-or-one', 'one', 'zero-or-many', 'one-or-many', 'crow-foot']);
    for (const [index, edge] of graph.edges.entries()) {
      if (!cardinality.has(edge.firstEnd?.marker?.kind ?? '') &&
        !cardinality.has(edge.secondEnd?.marker?.kind ?? '') &&
        edge.properties?.chenCardinality === undefined) continue;
      const syntax = edgeStatements.length === graph.edges.length ? edgeStatements[index] : undefined;
      const triggeringEnd = cardinality.has(edge.firstEnd?.marker?.kind ?? '')
        ? syntax?.firstEnd : syntax?.secondEnd;
      add('render.capability.chen-cardinality',
        `Edge ${edge.id} retains its authored endpoint marks and properties, but Chen-specific cardinality and participation are not verified.`,
        'edge', edge.id, cardinality.has(edge.firstEnd?.marker?.kind ?? '') ||
          cardinality.has(edge.secondEnd?.marker?.kind ?? '')
          ? (triggeringEnd ?? syntax?.operator)?.range : undefined);
    }
  }
  return notices.sort((left, right) =>
    (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER));
}
