/** Test-only reader for the retained GraphIR 3 printer/corpus format.
 * Saved 0.2.8 source continues through the production source-owned reader. */
import { parse as parseGraph } from '@coral-viz/language/parser';
import type { GraphNode as CanonicalGraphNode } from '@coral-viz/language';
import { editorDiagnostic, KNOWN_NODE_TYPES, parseCoralDSL,
  type GraphEdge, type GraphNode, type ParseResult } from '../../src/parsers';
import { validateOutput, type ValidationResult } from '../../src/llm/validate';
import type { OutputFormat } from '../../src/llm/types';

export function parseGraphFixture(text: string): ParseResult {
  if (/^[ \t]*@diagram\b/m.test(text)) return parseCoralDSL(text);
  const result = parseGraph(text, { includeSourceInfo: true });
  const diagnostics = result.diagnostics.map(editorDiagnostic);
  const flatten = (node: CanonicalGraphNode, parent?: string): GraphNode[] => {
    const { children, sourceInfo, ...rest } = node;
    const current = { ...rest, label: node.label ?? node.id, ...(parent ? { parent } : {}) } as GraphNode;
    if (sourceInfo) Object.defineProperty(current, 'sourceInfo', { value: sourceInfo, enumerable: false });
    if (!KNOWN_NODE_TYPES.has(node.type)) diagnostics.push({ severity: 'error',
      code: 'coral.editor.node-type.unknown', message: `Unknown node type: ${node.type}` });
    return [...(KNOWN_NODE_TYPES.has(node.type) ? [current] : []),
      ...(children ?? []).flatMap((child) => flatten(child, node.id))];
  };
  const graph = result.graph;
  const nodes = (graph?.nodes ?? []).flatMap((node) => flatten(node));
  const edges = (graph?.edges ?? []).map((edge) => {
    const { sourceInfo, ...rest } = edge;
    const current = { ...rest, lineStyle: edge.style?.lineStyle } as GraphEdge;
    if (sourceInfo) Object.defineProperty(current, 'sourceInfo', { value: sourceInfo, enumerable: false });
    return current;
  });
  return { nodes, edges, diagnostics,
    errors: diagnostics.filter((item) => item.severity === undefined || item.severity === 'error'),
    ...(graph ? { envelope: { version: graph.version, id: graph.id,
      ...(graph.name !== undefined ? { name: graph.name } : {}),
      ...(graph.metadata !== undefined ? { metadata: graph.metadata } : {}),
      ...(graph.layoutOptions !== undefined ? { layoutOptions: graph.layoutOptions } : {}),
      ...(graph.constraints !== undefined ? { constraints: graph.constraints } : {}),
      ...(graph.profile !== undefined ? { profile: graph.profile } : {}),
      ...(graph.interaction !== undefined ? { interaction: graph.interaction } : {}),
    } } : {}),
  };
}

/** Legacy graph fixtures need the same node/reference checks without claiming
 * that their printer format is accepted saved source. */
export function validateFixtureOutput(text: string, format: OutputFormat): ValidationResult {
  if (format === 'mermaid' || /^[ \t]*@diagram\b/m.test(text)) return validateOutput(text, format);
  const parsed = parseGraphFixture(text);
  const nodeIds = parsed.nodes.map(({ id }) => id);
  const ids = new Set(nodeIds);
  const references = parsed.edges.flatMap((edge) => [
    ...(!ids.has(edge.source) ? [{ message: `Edge "${edge.id}" references missing source node "${edge.source}"` }] : []),
    ...(!ids.has(edge.target) ? [{ message: `Edge "${edge.id}" references missing target node "${edge.target}"` }] : []),
  ]);
  const errors = [...parsed.errors, ...references,
    ...(nodeIds.length ? [] : [{ message: 'No nodes found in generated DSL' }])];
  return { valid: errors.length === 0, errors, diagnostics: [...(parsed.diagnostics ?? []), ...references],
    nodeCount: nodeIds.length, nodeIds };
}
