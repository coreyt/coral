import type { GraphEdge, GraphNode } from '../parsers';
import { lintAgainstNotation } from './notationLint';

export type SemanticAssessmentCode =
  | 'graph.edge.missing-source'
  | 'graph.edge.missing-target'
  | 'graph.node.missing-parent'
  | 'graph.topology.disconnected'
  | 'notation.node.unsupported-type'
  | 'notation.node.unsupported-symbol'
  | 'notation.edge.atypical';

export interface SemanticAssessmentFinding {
  readonly code: SemanticAssessmentCode;
  readonly category: 'integrity' | 'capability' | 'advice';
  readonly severity: 'error' | 'review';
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly components?: readonly (readonly string[])[];
  readonly message: string;
}

const CATEGORY_ORDER: Readonly<Record<SemanticAssessmentFinding['category'], number>> = {
  integrity: 0,
  capability: 1,
  advice: 2,
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTextArrays(a: readonly string[], b: readonly string[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const comparison = compareText(a[index], b[index]);
    if (comparison !== 0) return comparison;
  }
  return a.length - b.length;
}

function compareComponents(
  a: readonly (readonly string[])[],
  b: readonly (readonly string[])[],
): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const comparison = compareTextArrays(a[index], b[index]);
    if (comparison !== 0) return comparison;
  }
  return a.length - b.length;
}

function compareFindings(a: SemanticAssessmentFinding, b: SemanticAssessmentFinding): number {
  return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    || compareText(a.code, b.code)
    || compareTextArrays(a.edgeIds, b.edgeIds)
    || compareTextArrays(a.nodeIds, b.nodeIds)
    || compareComponents(a.components ?? [], b.components ?? []);
}

function assertUniqueIds(items: readonly { id: string }[], kind: 'node' | 'edge'): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate ${kind} id "${item.id}"`);
    seen.add(item.id);
  }
}

function connectedComponents(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string[][] {
  const nodeIds = nodes.map((node) => node.id).sort(compareText);
  const known = new Set(nodeIds);
  const adjacent = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  const connect = (left: string, right: string) => {
    if (!known.has(left) || !known.has(right)) return;
    adjacent.get(left)!.add(right);
    adjacent.get(right)!.add(left);
  };

  for (const edge of edges) connect(edge.source, edge.target);
  for (const node of nodes) {
    if (node.parent) connect(node.id, node.parent);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of nodeIds) {
    if (visited.has(start)) continue;
    const pending = [start];
    const component: string[] = [];
    visited.add(start);
    while (pending.length > 0) {
      const current = pending.pop()!;
      component.push(current);
      for (const next of [...(adjacent.get(current) ?? [])].sort(compareText).reverse()) {
        if (visited.has(next)) continue;
        visited.add(next);
        pending.push(next);
      }
    }
    components.push(component.sort(compareText));
  }
  return components.sort(compareTextArrays);
}

/**
 * Produce internal, non-product semantic assessment evidence from an already
 * parsed graph. This helper is intentionally not wired into generation or UI.
 */
export function assessDiagramSemantics(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  notationId = '',
): readonly SemanticAssessmentFinding[] {
  assertUniqueIds(nodes, 'node');
  assertUniqueIds(edges, 'edge');
  const findings: SemanticAssessmentFinding[] = [];
  const knownNodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of edges) {
    if (!knownNodeIds.has(edge.source)) {
      findings.push({
        code: 'graph.edge.missing-source',
        category: 'integrity',
        severity: 'error',
        nodeIds: [edge.source],
        edgeIds: [edge.id],
        message: `Edge "${edge.id}" references missing source node "${edge.source}".`,
      });
    }
    if (!knownNodeIds.has(edge.target)) {
      findings.push({
        code: 'graph.edge.missing-target',
        category: 'integrity',
        severity: 'error',
        nodeIds: [edge.target],
        edgeIds: [edge.id],
        message: `Edge "${edge.id}" references missing target node "${edge.target}".`,
      });
    }
  }

  for (const node of nodes) {
    if (node.parent && !knownNodeIds.has(node.parent)) {
      findings.push({
        code: 'graph.node.missing-parent',
        category: 'integrity',
        severity: 'error',
        nodeIds: [node.id, node.parent].sort(compareText),
        edgeIds: [],
        message: `Node "${node.id}" references missing parent node "${node.parent}".`,
      });
    }
  }

  if (notationId) {
    for (const result of lintAgainstNotation([...nodes], [...edges], notationId)) {
      const nodeIds = result.nodeId
        ? [result.nodeId]
        : result.sourceId && result.targetId
          ? [result.sourceId, result.targetId].sort(compareText)
          : [];
      findings.push({
        code: result.code,
        category: result.category,
        severity: result.severity === 'error' ? 'error' : 'review',
        nodeIds,
        edgeIds: result.edgeId ? [result.edgeId] : [],
        message: result.message,
      });
    }
  }

  const components = connectedComponents(nodes, edges);
  if (components.length > 1) {
    findings.push({
      code: 'graph.topology.disconnected',
      category: 'advice',
      severity: 'review',
      nodeIds: components.flat().sort(compareText),
      edgeIds: [],
      components,
      message: `The graph has ${components.length} disconnected components; author intent is required before treating this as a defect.`,
    });
  }

  return findings.sort(compareFindings);
}
