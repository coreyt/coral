import { checkPortDirection } from '@coral-viz/viz';
import type { GraphEdge, GraphNode, EditorParseError } from './parsers';
import { effectiveNodePorts, type NotationType } from './hooks/diagramUtils';

type SourceInfo = { range?: { startPosition?: { line: number; column: number }; start?: number } };

function located(item: GraphNode | GraphEdge): Pick<EditorParseError, 'line' | 'column'> {
  const start = (item as { sourceInfo?: SourceInfo }).sourceInfo?.range?.startPosition;
  return start ? { line: start.line, column: start.column } : { line: 0 };
}

/**
 * Editor-boundary port safety (R-063 AC-7). Every explicit edge port must
 * exist on the node's effective ports, the same membership rule GraphIR
 * validation applies on reopen, and suit the endpoint's direction. An
 * unrecognized authored direction blocks only when an edge references it.
 */
export function portSafetyDiagnostics(
  nodes: GraphNode[],
  edges: GraphEdge[],
  notation: NotationType,
): EditorParseError[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const diagnostics: EditorParseError[] = [];
  const referenced = new Set<string>();
  const unrecognized = (node: GraphNode, port: { id: string; rawDirection?: unknown }, severity: 'error' | 'warning') => ({
    ...located(node), severity, code: 'coral.editor.port-direction.unrecognized',
    message: `Port "${port.id}" on node "${node.id}" has unrecognized direction "${String(port.rawDirection)}"; use in, out, or inout.`,
  } satisfies EditorParseError);

  for (const edge of edges) {
    for (const endpoint of ['source', 'target'] as const) {
      const portId = endpoint === 'source' ? edge.sourcePort : edge.targetPort;
      const node = byId.get(endpoint === 'source' ? edge.source : edge.target);
      if (!portId || !node) continue;
      const ports = effectiveNodePorts(node, notation) ?? [];
      const port = ports.find((candidate) => candidate.id === portId);
      if (!port) {
        const symbolPort = node.ports !== undefined
          && effectiveNodePorts({ ...node, ports: undefined }, notation)?.some((candidate) => candidate.id === portId);
        diagnostics.push({
          ...located(edge), severity: 'error', code: 'coral.editor.port-reference.invalid',
          message: `Edge "${edge.id}" references missing ${endpoint} port "${portId}" on node "${node.id}".`,
          ...(symbolPort ? { hint: `An explicit ports list replaces the symbol ports; add "${portId}" to it.` } : {}),
        });
        continue;
      }
      if (!port.directionValid) {
        const key = `${node.id}\u0000${port.id}`;
        if (!referenced.has(key)) diagnostics.push(unrecognized(node, port, 'error'));
        referenced.add(key);
        continue;
      }
      const check = endpoint === 'source'
        ? checkPortDirection(port.direction, 'in')
        : checkPortDirection('out', port.direction);
      if (!check.valid) {
        diagnostics.push({
          ...located(edge), severity: 'error', code: 'coral.editor.port-direction.invalid',
          message: `Edge "${edge.id}" uses ${endpoint} port "${portId}" on node "${node.id}": ${check.message}.`,
        });
      }
    }
  }
  for (const node of nodes) {
    for (const port of node.ports !== undefined ? effectiveNodePorts(node, notation) ?? [] : []) {
      if (!port.directionValid && !referenced.has(`${node.id}\u0000${port.id}`)) {
        diagnostics.push(unrecognized(node, port, 'warning'));
      }
    }
  }
  return diagnostics;
}

/**
 * A notation switch redraws symbols, so an edge port the new notation does
 * not define (such as a flowchart decision's inferred `yes`) is dropped
 * rather than left to block publication; inference re-runs on publication.
 */
export function dropUnresolvedEdgePorts(
  nodes: GraphNode[],
  edges: GraphEdge[],
  notation: NotationType,
): { edges: GraphEdge[]; dropped: number } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const resolves = (nodeId: string, portId: string | undefined) => portId === undefined
    || (effectiveNodePorts(byId.get(nodeId) ?? { id: nodeId, type: 'service' } as GraphNode, notation) ?? [])
      .some((port) => port.id === portId);
  let dropped = 0;
  const next = edges.map((edge) => {
    const keepSource = resolves(edge.source, edge.sourcePort);
    const keepTarget = resolves(edge.target, edge.targetPort);
    if (keepSource && keepTarget) return edge;
    dropped += Number(!keepSource) + Number(!keepTarget);
    const { sourcePort, targetPort, ...rest } = edge;
    return { ...rest, ...(keepSource && sourcePort ? { sourcePort } : {}), ...(keepTarget && targetPort ? { targetPort } : {}) };
  });
  return { edges: next, dropped };
}
