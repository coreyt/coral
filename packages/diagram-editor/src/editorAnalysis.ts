import { unescapeString } from '@coral-viz/language';
import { parseInstalledDocument028 } from '@coral-viz/render';
import type { EditorDecoration } from '@coral-viz/viz';
import type { GraphEdge, GraphNode } from './parsers';

export type EntityOccurrence = EditorDecoration;

function decodeToken(token: string): string {
  if (!token.startsWith('"')) return token;
  return unescapeString(token.slice(1, -1));
}

function lines(source: string): Array<{ text: string; start: number; contentStart: number }> {
  const result: Array<{ text: string; start: number; contentStart: number }> = [];
  let start = 0;
  for (const raw of source.split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const indent = text.search(/\S|$/);
    result.push({ text, start, contentStart: start + indent });
    start += raw.length + 1;
  }
  return result;
}

function add(
  output: EntityOccurrence[],
  lineStart: number,
  indices: [number, number] | undefined,
  entityId: string,
) {
  if (indices) output.push({ start: lineStart + indices[0], end: lineStart + indices[1], entityId });
}

function span(start: number, text: string): [number, number] {
  return [start, start + text.length];
}

function coral028Occurrences(source: string, nodes: GraphNode[]): EntityOccurrence[] {
  const parsed = parseInstalledDocument028(source);
  if (!parsed.graph) return [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const output: EntityOccurrence[] = [];
  for (const item of parsed.syntax.statements) {
    if (item.kind === 'node') {
      const id = item.qualifiedId ?? item.id.value;
      if (nodeIds.has(id)) output.push({ start: item.id.range.start.offset,
        end: item.id.range.end.offset, entityId: id });
    } else if (item.kind === 'edge') {
      if (item.resolvedSource && nodeIds.has(item.resolvedSource)) output.push({
        start: item.source.range.start.offset, end: item.source.range.end.offset,
        entityId: item.resolvedSource,
      });
      if (item.resolvedTarget && nodeIds.has(item.resolvedTarget)) output.push({
        start: item.target.range.start.offset, end: item.target.range.end.offset,
        entityId: item.resolvedTarget,
      });
    }
  }
  return output.sort((a, b) => a.start - b.start || a.end - b.end);
}

function coralOccurrences(source: string, nodes: GraphNode[], edges: GraphEdge[]): EntityOccurrence[] {
  const output: EntityOccurrence[] = [];
  const nodesByStart = new Map(nodes.flatMap((node) => node.sourceInfo?.range
    ? [[node.sourceInfo.range.start, node] as const] : []));
  const edgesByStart = new Map(edges.flatMap((edge) => edge.sourceInfo?.range
    ? [[edge.sourceInfo.range.start, edge] as const] : []));
  const token = '"(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_]*';
  const declaration = new RegExp(`^(\\s*(?:${token})\\s+)("(?:[^"\\\\]|\\\\.)*")(?:\\s+as\\s+(${token}))?`);
  const end = '\\((?:[^"()\\\\]|\\\\.|"(?:[^"\\\\]|\\\\.)*")*\\)';
  const edgePattern = new RegExp(`^(\\s*)(${token})(\\s*(?:${end}\\s*)?->\\s*)(${token})`);

  for (const line of lines(source)) {
    const parsedEdge = edgesByStart.get(line.contentStart);
    if (parsedEdge) {
      const match = edgePattern.exec(line.text);
      if (!match) continue;
      if (decodeToken(match[2]) === parsedEdge.source) add(output, line.start, span(match[1].length, match[2]), parsedEdge.source);
      if (decodeToken(match[4]) === parsedEdge.target) add(output, line.start, span(match[1].length + match[2].length + match[3].length, match[4]), parsedEdge.target);
      continue;
    }

    const parsedNode = nodesByStart.get(line.contentStart);
    if (!parsedNode) continue;
    const match = declaration.exec(line.text);
    if (!match || decodeToken(match[2]) !== parsedNode.label) continue;
    add(output, line.start, span(match[1].length, match[2]), parsedNode.id);
    if (match[3] && decodeToken(match[3]) === parsedNode.id) {
      add(output, line.start, span(match[0].lastIndexOf(match[3]), match[3]), parsedNode.id);
    }
  }
  return output.sort((a, b) => a.start - b.start || a.end - b.end);
}

function mermaidOccurrences(source: string, nodes: GraphNode[], edges: GraphEdge[]): EntityOccurrence[] {
  const ids = new Set(nodes.map((node) => node.id));
  const parsedEdges = new Set(edges.map((edge) => `${edge.source}\u0000${edge.target}`));
  const output: EntityOccurrence[] = [];
  const edgePattern = /^(\s*)(\w+)((?:\[[^\]]+\]|\{[^}]+\}|\([^)]+\))?\s*(?:---->|-->|---|-\.->|\.-\.->)\s*(?:\|[^|]+\|)?\s*)(\w+)(?:\[[^\]]+\]|\{[^}]+\}|\([^)]+\))?\s*$/;
  const nodePattern = /^(\s*)(\w+)(?:\[\([^)]*\)\]|\[[^\]]+\]|\{[^}]+\}|\([^)]+\))\s*$/;

  for (const line of lines(source)) {
    const edgeMatch = edgePattern.exec(line.text);
    if (edgeMatch && parsedEdges.has(`${edgeMatch[2]}\u0000${edgeMatch[4]}`)) {
      add(output, line.start, span(edgeMatch[1].length, edgeMatch[2]), edgeMatch[2]);
      add(output, line.start, span(edgeMatch[1].length + edgeMatch[2].length + edgeMatch[3].length, edgeMatch[4]), edgeMatch[4]);
      continue;
    }
    const nodeMatch = nodePattern.exec(line.text);
    if (nodeMatch && ids.has(nodeMatch[2])) add(output, line.start, span(nodeMatch[1].length, nodeMatch[2]), nodeMatch[2]);
  }
  return output.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function analyzeEditorSource(
  source: string,
  format: 'coral' | 'mermaid' | 'dot' | 'plantuml',
  nodes: GraphNode[],
  edges: GraphEdge[],
): EntityOccurrence[] {
  if (format === 'dot' || format === 'plantuml') return [];
  return format === 'coral'
    ? /^[ \t]*@diagram\b/m.test(source)
      ? coral028Occurrences(source, nodes)
      : coralOccurrences(source, nodes, edges)
    : mermaidOccurrences(source, nodes, edges);
}
