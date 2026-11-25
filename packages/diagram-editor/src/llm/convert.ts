/**
 * Conversion Utilities
 *
 * Loss-reporting conversion from canonical GraphIR to Mermaid text.
 */

import { parseMermaid } from '@coral-viz/language';
import type { GraphIR } from '../printer';

/** Convert GraphIR to the editor's Mermaid subset and name every lost field. */
export function convertToMermaidDslWithDiagnostics(graph: GraphIR): {
  text: string;
  diagnostics: string[];
} {
  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ');
  const shape = (type: string, label: string) => {
    const value = escape(label);
    if (type === 'database') return `[(${value})]`;
    if (type === 'module') return `{${value}}`;
    return `[${value}]`;
  };
  const lines = ['flowchart TD'];
  const diagnostics: string[] = [];
  const nodes: GraphIR['nodes'] = [];
  const collect = (items: GraphIR['nodes']) => {
    for (const node of items) {
      nodes.push(node);
      if (node.children?.length) {
        diagnostics.push(`Node "${node.id}" hierarchy is flattened in Mermaid.`);
        collect(node.children);
      }
    }
  };
  collect(graph.nodes);

  const usedIds = new Set<string>();
  const ids = new Map<string, string>();
  for (const [index, node] of nodes.entries()) {
    let candidate = node.id.replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z_]/.test(candidate)) candidate = `n_${candidate}`;
    if (!candidate) candidate = `node_${index + 1}`;
    const base = candidate;
    let suffix = 2;
    while (usedIds.has(candidate)) candidate = `${base}_${suffix++}`;
    usedIds.add(candidate);
    ids.set(node.id, candidate);
    if (candidate !== node.id) {
      diagnostics.push(`Node "${node.id}" identifier is remapped to "${candidate}" for Mermaid.`);
    }
  }

  diagnostics.push(`Graph id "${graph.id}" is not represented in Mermaid text.`);
  if (graph.name !== undefined) diagnostics.push('Graph name is not represented in Mermaid text.');
  if (graph.metadata !== undefined) diagnostics.push('Graph metadata is not represented in Mermaid text.');
  if (graph.layoutOptions !== undefined) diagnostics.push('Graph layout options are reduced to flowchart TD.');
  for (const constraint of graph.constraints ?? []) {
    diagnostics.push(`Constraint "${constraint.id}" is not represented in Mermaid text.`);
  }

  for (const node of nodes) {
    const id = ids.get(node.id)!;
    lines.push(`    ${id}${shape(node.type, node.label ?? node.id)}`);
    if (!['service', 'database', 'module'].includes(node.type)) {
      diagnostics.push(`Node "${node.id}" type "${node.type}" is degraded to a Mermaid rectangle.`);
    }
    if (node.position) diagnostics.push(`Node "${node.id}" position is not represented in Mermaid text.`);
    if (node.pinned) diagnostics.push(`Node "${node.id}" pinning is not represented in Mermaid text.`);
    if (node.labelPlacement) diagnostics.push(`Node "${node.id}" label placement is not represented in Mermaid text.`);
    if (node.description !== undefined) diagnostics.push(`Node "${node.id}" description is not represented in Mermaid text.`);
    if (node.symbol !== undefined) diagnostics.push(`Node "${node.id}" symbol is not represented in Mermaid text.`);
    if (node.variant !== undefined) diagnostics.push(`Node "${node.id}" symbol variant is not represented in Mermaid text.`);
    if (node.parent !== undefined && !node.children?.length) diagnostics.push(`Node "${node.id}" parent reference is flattened in Mermaid.`);
    if (node.ports?.length) diagnostics.push(`Node "${node.id}" ports are not represented in Mermaid text.`);
    if (node.dimensions !== undefined) diagnostics.push(`Node "${node.id}" dimensions are not represented in Mermaid text.`);
    if (node.layoutOptions !== undefined) diagnostics.push(`Node "${node.id}" layout options are not represented in Mermaid text.`);
    if (node.sourceInfo !== undefined) diagnostics.push(`Node "${node.id}" source information is not represented in Mermaid text.`);
    if (node.properties && Object.keys(node.properties).length > 0) {
      diagnostics.push(`Node "${node.id}" properties are not represented in Mermaid text.`);
    }
  }
  for (const edge of graph.edges) {
    const lineStyle = edge.style?.lineStyle ?? edge.lineStyle;
    const arrow = lineStyle === 'dashed' || lineStyle === 'dotted' ? '-.->' : '-->';
    const label = edge.label ? `|${escape(edge.label)}|` : '';
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) {
      diagnostics.push(`Edge "${edge.id}" is omitted because an endpoint is missing.`);
      continue;
    }
    lines.push(`    ${source} ${arrow}${label} ${target}`);
    diagnostics.push(`Edge id "${edge.id}" is not represented in Mermaid text.`);
    if (edge.sourcePort !== undefined) diagnostics.push(`Edge "${edge.id}" source port is not represented in Mermaid text.`);
    if (edge.targetPort !== undefined) diagnostics.push(`Edge "${edge.id}" target port is not represented in Mermaid text.`);
    if (edge.type) diagnostics.push(`Edge "${edge.id}" relation type is not represented in Mermaid text.`);
    if (edge.description !== undefined) diagnostics.push(`Edge "${edge.id}" description is not represented in Mermaid text.`);
    if (edge.labelPlacement !== undefined) diagnostics.push(`Edge "${edge.id}" label placement is not represented in Mermaid text.`);
    if (edge.routeIntent?.waypoints.length) diagnostics.push(`Edge "${edge.id}" route intent is not represented in Mermaid text.`);
    if (edge.routingPoints?.length) diagnostics.push(`Edge "${edge.id}" waypoints are not represented in Mermaid text.`);
    if (edge.sourceInfo !== undefined) diagnostics.push(`Edge "${edge.id}" source information is not represented in Mermaid text.`);
    if (edge.properties && Object.keys(edge.properties).length > 0) {
      diagnostics.push(`Edge "${edge.id}" properties are not represented in Mermaid text.`);
    }
    if (lineStyle === 'dotted') diagnostics.push(`Edge "${edge.id}" dotted style is degraded to dashed in Mermaid.`);
    if (edge.sourceEnd?.marker !== undefined) diagnostics.push(`Edge "${edge.id}" source marker is not represented in Mermaid text.`);
    if (edge.targetEnd?.marker !== undefined && edge.targetEnd.marker.kind !== 'arrow') {
      diagnostics.push(`Edge "${edge.id}" target arrow is degraded to an arrow in Mermaid.`);
    }
    if (edge.style?.routing !== undefined) diagnostics.push(`Edge "${edge.id}" routing style is not represented in Mermaid text.`);
  }
  const text = lines.join('\n');
  const validation = parseMermaid(text);
  const unparsed = validation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error' || diagnostic.code.endsWith('.unparsed'),
  );
  if (!validation.graph || unparsed.length > 0) {
    throw new Error(`Generated Mermaid failed validation: ${unparsed.map((item) => item.message).join('; ')}`);
  }
  return { text, diagnostics };
}
