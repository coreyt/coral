/** Strict bounded UML state-chain Graph IR 3 character composer. */
import type { GraphIR } from '@graph-ir/core';
import { CharacterRenderError, characterFieldLines028, encodeCharacterField028,
  type CharacterCharset028, type CharacterColumns028, type CharacterDiagnostic028 } from './characters028.js';
import { finalizeCharacterPreview028, renderRoutedCharacters028 } from './characterRouted028.js';
import { CHARACTER_GLYPH_ROLES_028 as glyph } from './characterGlyphRoles028.js';

type Rec = Record<string, unknown>;
interface StateNode { id: string; type: 'initial' | 'state' | 'final'; label: string }
interface StateEdge { id: string; source: string; target: string; label?: string }
function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}
function rec(value: unknown, path: string): Rec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('character.field.invalid', 'Expected record.', path);
  return value as Rec;
}
function only(value: Rec, fields: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!fields.includes(key)) {
    fail('character.field.unsupported', `Unsupported field ${key}.`, `${path}.${key}`);
  }
}
function word(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.length > 2048) {
    fail('character.field.invalid', 'Expected bounded nonempty string.', path);
  }
  encodeCharacterField028(value);
  return value;
}
function marker(value: unknown, path: string, kind: string, fill: string): void {
  const end = rec(value, path);
  only(end, ['marker'], path);
  const mark = rec(end.marker, `${path}.marker`);
  only(mark, ['kind', 'fill'], `${path}.marker`);
  if (mark.kind !== kind || mark.fill !== fill) {
    fail('character.edge.marker', 'State transition requires a forward open arrow.', path);
  }
}
function stateGraph(graph: GraphIR): { nodes: StateNode[]; edges: StateEdge[]; chain: boolean } {
  const root = rec(graph, 'graph');
  only(root, ['version', 'id', 'name', 'nodes', 'edges', 'metadata'], 'graph');
  if (graph.version !== '3.0.0') fail('character.graph.version', 'Graph IR 3 required.', 'version');
  word(graph.id, 'id');
  if (graph.name !== undefined) word(graph.name, 'name');
  const metadata = rec(graph.metadata, 'metadata');
  only(metadata, ['notation'], 'metadata');
  if (metadata.notation !== 'uml-state') fail('character.notation.unsupported', 'UML state required.', 'metadata.notation');
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 3 || graph.nodes.length > 10) {
    fail('character.state.size', 'Expected one initial, one to eight states, and one final.', 'nodes');
  }
  if (!Array.isArray(graph.edges) || graph.edges.length < 2 || graph.edges.length > 20) {
    fail('character.state.size', 'Expected 2–20 transitions.', 'edges');
  }
  const nodes: StateNode[] = graph.nodes.map((raw, index) => {
    const path = `nodes.${index}`;
    const node = rec(raw, path);
    only(node, ['id', 'type', 'label'], path);
    const id = word(node.id, `${path}.id`);
    if (!['initial', 'state', 'final'].includes(String(node.type))) {
      fail('character.role.unsupported', 'Only initial, simple state and final are supported.', `${path}.type`);
    }
    const label = word(node.label, `${path}.label`);
    return { id, type: node.type as StateNode['type'], label };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) fail('character.id.duplicate', 'Duplicate node ID.', 'nodes');
  const initial = nodes.filter((node) => node.type === 'initial');
  const final = nodes.filter((node) => node.type === 'final');
  if (initial.length !== 1 || final.length !== 1 ||
      nodes.filter((node) => node.type === 'state').length !== nodes.length - 2) {
    fail('character.state.graph', 'One initial, one final and one to eight simple states are required.', 'nodes');
  }
  const edges: StateEdge[] = graph.edges.map((raw, index) => {
    const path = `edges.${index}`;
    const edge = rec(raw, path);
    only(edge, ['id', 'source', 'target', 'type', 'label', 'sourceEnd', 'targetEnd'], path);
    const id = word(edge.id, `${path}.id`);
    const source = word(edge.source, `${path}.source`);
    const target = word(edge.target, `${path}.target`);
    if (!ids.has(source) || !ids.has(target) || source === target) {
      fail('character.state.chain', 'Transition endpoints must be distinct known nodes.', path);
    }
    if (edge.type !== 'transition') fail('character.edge.unsupported', 'Only transition edges are admitted.', `${path}.type`);
    marker(edge.sourceEnd, `${path}.sourceEnd`, 'none', 'unspecified');
    marker(edge.targetEnd, `${path}.targetEnd`, 'arrow', 'open');
    const label = edge.label === undefined ? undefined : word(edge.label, `${path}.label`);
    return { id, source, target, ...(label ? { label } : {}) };
  });
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) {
    fail('character.id.duplicate', 'Duplicate transition ID.', 'edges');
  }
  const outgoing = new Map<string, StateEdge[]>();
  const incoming = new Map<string, StateEdge[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }
  if (incoming.has(initial[0]!.id) || (outgoing.get(initial[0]!.id)?.length ?? 0) !== 1 ||
      outgoing.has(final[0]!.id) || !incoming.has(final[0]!.id)) {
    fail('character.state.graph', 'Initial and final transition directions are invalid.', 'edges');
  }
  const reach = (start: string, links: Map<string, StateEdge[]>, next: (edge: StateEdge) => string): Set<string> => {
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const edge of links.get(queue.shift()!) ?? []) {
        const id = next(edge);
        if (!visited.has(id)) { visited.add(id); queue.push(id); }
      }
    }
    return visited;
  };
  const forward = reach(initial[0]!.id, outgoing, (edge) => edge.target);
  const backward = reach(final[0]!.id, incoming, (edge) => edge.source);
  if (nodes.some((node) => !forward.has(node.id) || !backward.has(node.id))) {
    fail('character.state.graph', 'Every state must lie on an initial-to-final path.', 'edges');
  }
  // The compact historical chain has no separate caption lanes. Use the
  // ID-bearing routed picture whenever authored aliases need those lanes.
  const chain = nodes.every(node => node.label === node.id) &&
    edges.length === nodes.length - 1 && nodes.every((node) =>
    node.type === 'initial' ? (outgoing.get(node.id)?.length ?? 0) === 1 :
      node.type === 'final' ? (incoming.get(node.id)?.length ?? 0) === 1 :
        (incoming.get(node.id)?.length ?? 0) === 1 && (outgoing.get(node.id)?.length ?? 0) === 1);
  if (!chain) return { nodes, edges, chain: false };
  const orderedNodes = [initial[0]!];
  const orderedEdges: StateEdge[] = [];
  while (orderedNodes.at(-1)!.id !== final[0]!.id) {
    const edge = outgoing.get(orderedNodes.at(-1)!.id)?.[0];
    const next = edge && nodes.find((node) => node.id === edge.target);
    if (!edge || !next || orderedNodes.includes(next)) fail('character.state.graph', 'Broken state chain.', 'edges');
    orderedEdges.push(edge);
    orderedNodes.push(next);
  }
  return { nodes: orderedNodes, edges: orderedEdges, chain: true };
}

/** Share exact fast-path admission with the public target's glyph preflight. */
export function stateCharacterUsesChain028(graph: GraphIR): boolean {
  return stateGraph(graph).chain;
}

export function renderUmlStateCharacters028(graph: GraphIR, columns: CharacterColumns028,
  charset: CharacterCharset028): ReturnType<typeof finalizeCharacterPreview028> |
    Promise<ReturnType<typeof finalizeCharacterPreview028>> {
  const { nodes, edges, chain } = stateGraph(graph);
  if (!chain) return renderRoutedCharacters028(graph, columns, charset);
  const unicode = charset === 'MonoTrue-v1';
  const h = unicode ? glyph['stroke.single.h'].character : '-';
  const v = unicode ? glyph['stroke.single.v'].character : '|';
  const right = unicode ? glyph['endpoint.arrow_open.w'].character : '>';
  const corner = unicode ? [glyph['stroke.single.nw'].character, glyph['stroke.single.ne'].character,
    glyph['stroke.single.sw'].character, glyph['stroke.single.se'].character] : ['+', '+', '+', '+'];
  const rows = Array<string>(7).fill('');
  for (const [index, node] of nodes.entries()) {
    const label = encodeCharacterField028(node.label);
    let pieces: string[];
    if (node.type === 'state') {
      const middle = `[${label}]`;
      const blank = ' '.repeat(middle.length + 2);
      pieces = [blank, blank, corner[0] + h.repeat(middle.length) + corner[1],
        v + middle + v, corner[2] + h.repeat(middle.length) + corner[3], blank, blank];
    } else {
      const fill = unicode ? glyph['mark.circle.filled'].character : '#';
      if (node.type === 'initial') {
        pieces = ['       ', '       ', `  ${fill.repeat(3)}  `, ` ${fill.repeat(5)}${h}`,
          `  ${fill.repeat(3)}  `, '       ', '       '];
      } else {
        pieces = ['   .---.   ', '  /     \\  ', ' /       \\ ',
          `(   ${fill.repeat(3)}   )`,
          ' \\       / ', '  \\     /  ', "   '---'   "];
      }
    }
    for (let row = 0; row < 7; row++) rows[row] += pieces[row]!;
    const edge = edges[index];
    if (unicode && node.type === 'state' && index > 0) {
      const start = rows[3]!.length - pieces[3]!.length;
      rows[3] = rows[3]!.slice(0, start) + glyph['stroke.single.tee_w'].character + rows[3]!.slice(start + 1);
    }
    if (edge) {
      if (unicode && node.type === 'state') rows[3] = rows[3]!.slice(0, -1) + glyph['stroke.single.tee_e'].character;
      const text = edge.label ? encodeCharacterField028(edge.label) : '';
      const gap = Math.max(5, text.length + 2);
      rows[0] += text.padStart(Math.floor((gap + text.length) / 2)).padEnd(gap);
      for (const row of [1, 2, 4, 5, 6]) rows[row] += ' '.repeat(gap);
      rows[3] += h.repeat(gap - 1) + right;
    }
  }
  const pictureRows = rows.map((row) => row.trimEnd());
  if (pictureRows.some((row) => row.length > columns)) {
    fail('character.width.unsupported', 'State chain exceeds requested width.', 'columns');
  }
  const diagnostics: CharacterDiagnostic028[] = [];
  const lines = [`CHAR-PREVIEW/1 uml-state ${charset}`, 'Flat state chain; directed transitions.',
    'PICTURE', ...pictureRows, 'GRAPH', ...characterFieldLines028('I', graph.id, columns), 'NODES'];
  if (graph.name !== undefined) lines.push(...characterFieldLines028('L', graph.name, columns));
  for (const node of nodes) {
    lines.push(`NODE ${node.type}`);
    lines.push(...characterFieldLines028('I', node.id, columns));
    lines.push(...characterFieldLines028('L', node.label, columns));
  }
  lines.push('EDGES');
  for (const edge of edges) {
    lines.push('EDGE transition');
    lines.push(...characterFieldLines028('I', edge.id, columns));
    lines.push(...characterFieldLines028('F', edge.source, columns));
    lines.push(...characterFieldLines028('T', edge.target, columns));
    if (edge.label !== undefined) lines.push(...characterFieldLines028('L', edge.label, columns));
  }
  return finalizeCharacterPreview028(lines, columns, charset, diagnostics);
}
