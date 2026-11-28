import type { GraphIR, GraphNode, GraphEdge } from '@graph-ir/core';
import { box, wrap, type Settings } from './format.js';
import { TextRenderError, unfit, type Band, type Frame, type TextScene, type TextDiagnostic } from './types.js';

export interface NodeContent {
  title: string;
  compartments?: string[][];
  secondary?: string[];
  decision?: boolean;
  cue?: string;
  demotableRows?: ReadonlySet<string>;
}
export type NodeAdapter = (node: GraphNode, label: string, cfg: Settings) => NodeContent;
export type EdgeAdapter = (edge: GraphEdge, cfg: Settings) => string;

export function makeScene(graph: GraphIR, cfg: Settings, diagnostics: TextDiagnostic[],
  nodeContent: NodeAdapter, edgeMarker: EdgeAdapter): TextScene {
  const entries: { node: GraphNode; parents: GraphNode[] }[] = [];
  const labels = new Map<string, number>();
  function collect(nodes: GraphNode[], parents: GraphNode[]) {
    const horizontal = graph.layoutOptions?.direction === 'RIGHT';
    const first = horizontal ? 'x' : 'y', second = horizontal ? 'y' : 'x';
    // Only reorder the slots occupied by positioned siblings. Unpositioned
    // declarations retain their model order, including within nested groups.
    const positioned = nodes.filter(n => n.position).sort((a, b) =>
      a.position![first] - b.position![first] || a.position![second] - b.position![second]);
    let slot = 0;
    for (const original of nodes) {
      const node = original.position ? positioned[slot++] : original;
      entries.push({ node, parents });
      const label = node.label ?? node.id;
      labels.set(label, (labels.get(label) ?? 0) + 1);
      if (node.children) collect(node.children, [...parents, node]);
    }
  }
  collect(graph.nodes, []);
  const name = (node: GraphNode) => {
    const label = node.label ?? node.id;
    return (labels.get(label)! > 1 ? `[${node.id}] ` : '') + label;
  };
  const ids = new Set(entries.map(e => e.node.id));
  if (ids.size !== entries.length) throw new TextRenderError('text.node.duplicate', 'Duplicate node identity.');
  const edgeIds = new Set<string>();
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || edgeIds.has(e.id))
      throw new TextRenderError('text.edge.invalid', 'Missing endpoint or duplicate edge identity.', e.id);
    edgeIds.add(e.id);
  }
  const bands: Band[] = [], frames = new Map<string, Frame>();
  let ordinal = 0;
  const lineLimit = cfg.density === 'compact' ? 3 : 5;
  function footnote(value: string, path: string, notes: string[]) {
    if (cfg.legend === 'none') unfit(path, value.length + 4, 'full label requires a legend');
    const ref = `[${++ordinal}]`;
    notes.push(...wrap(ref + ' ' + value, cfg.width, path));
    return ref;
  }
  const labelById = new Map<string, string>();
  const endpoints = new Set(graph.edges.flatMap(e => [e.source, e.target]));
  for (const { node, parents } of entries) {
    if (node.position || node.dimensions || node.pinned || node.labelPlacement) diagnostics.push({
      code: 'text.geometry.ignored', severity: 'info', path: node.id, message: 'Only relative authored position is used in text.',
    });
    if (node.symbol?.startsWith('local.') && !diagnostics.some(d => d.code === 'text.artwork.ignored')) diagnostics.push({
      code: 'text.artwork.ignored', severity: 'info', path: node.id, message: 'Custom symbols use labelled boxes.',
    });
    if ((node.properties?.coralStyle0214 || node.properties?.style) && !diagnostics.some(d => d.code === 'text.style.ignored' && d.path === node.id)) diagnostics.push({
      code: 'text.style.ignored', severity: 'info', path: node.id, message: 'Visual style omitted from text.',
    });
    const content = nodeContent(node, name(node), cfg), notes: string[] = [];
    let title = (content.cue ? content.cue + ' ' : '') + cfg.encode(content.title);
    const ancestry = parents.map(p => frames.get(p.id)!);
    const inner = cfg.width - ancestry.length * 4 - 4;
    if (inner < 3) unfit(node.id, cfg.columns - inner + 3, 'nested box cannot fit');
    // Keep a corridor for bent edges and frame walls when wrapping the box.
    const limit = Math.min(inner, Math.max(8, inner - 8));
    let lines = wrap(title, limit, node.id);
    if (lines.length > lineLimit) {
      title = footnote(title, node.id, notes);
      lines = [title];
    }
    labelById.set(node.id, title);
    const rows: (string | null)[] = [...lines];
    for (const section of content.compartments ?? []) {
      rows.push(null);
      const demoted: string[] = [];
      for (const field of section) {
        const encoded = cfg.encode(field), measured = wrap(encoded, limit, node.id);
        if (content.demotableRows?.has(field) && (rows.length + measured.length + 4 > cfg.height || measured.length > lineLimit))
          demoted.push(encoded);
        else rows.push(...measured);
      }
      if (demoted.length) rows.push(footnote(demoted.join(', '), node.id, notes));
    }
    for (const field of content.secondary ?? []) {
      const encoded = cfg.encode(field), extra = wrap(encoded, limit, node.id);
      rows.push(...(rows.length + extra.length > lineLimit ? [footnote(encoded, node.id, notes)] : extra));
    }
    let picture = box(rows, cfg);
    if (content.decision && cfg.density === 'standard' && rows.length === 1) {
      const cap = cfg.glyph.h.repeat(title.length);
      picture = ['  ' + cap, ' /' + ' '.repeat(title.length) + '\\', '< ' + title + ' >',
        ' \\' + ' '.repeat(title.length) + '/', '  ' + cap];

    }
    if (node.children?.length) {
      frames.set(node.id, { id: node.id, title });
      if (!notes.length && !endpoints.has(node.id) && rows.length === lines.length) continue;
    }
    bands.push({ id: node.id, frames: ancestry, rows: picture, notes });
  }
  const order = new Map(bands.map((b, i) => [b.id, i]));
  const edges = graph.edges.map(e => {
    const reverse = e.sourceEnd?.marker?.kind === 'arrow' && e.targetEnd?.marker?.kind === 'none';
    const source = reverse ? e.target : e.source, target = reverse ? e.source : e.target;
    const fields = [e.type, e.label, e.description, e.properties?.technology, e.sourceEnd?.role, e.targetEnd?.role].filter(Boolean);
    let label = cfg.encode(fields.join(' '));
    const band = bands[order.get(source)!];
    const space = cfg.width - band.frames.length * 4 - 10;
    if (label.length > space) label = footnote(label, e.id, band.notes);
    if (cfg.legend === 'always') band.notes.push(...wrap(`${cfg.encode(e.id)}: ${labelById.get(source)} -> ${labelById.get(target)}`, cfg.width, e.id));
    return { id: e.id, source, target, label, marker: edgeMarker(e, cfg) };
  }).sort((a, b) => order.get(a.source)! - order.get(b.source)!);
  return { title: cfg.encode(graph.name ?? graph.metadata?.notation ?? graph.id), bands, edges, repeated: [] };
}
