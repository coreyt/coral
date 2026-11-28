import type { GraphIR } from '@graph-ir/core';
import type { CandidateSequenceItemSyntax } from '@coral-viz/language';
import type { InstalledDocument028 } from '../installedDocument028.js';
import { getEndpointGlyph029 } from '../characterEndpoint029.js';
import { box, key, wrap, type Settings } from './format.js';
import { TextRenderError, unfit, type Band, type Frame, type TextScene } from './types.js';

interface Event { id: string; frames: Frame[]; note?: string }
function sequenceEvents(graph: GraphIR, cfg: Settings, doc?: InstalledDocument028): Event[] {
  const interaction = graph.interaction!;
  if (!doc) {
    const events: Event[] = interaction.messageOrder.map(id => ({ id, frames: (interaction.fragments ?? []).flatMap(f =>
      f.operands.filter(o => o.messageIds.includes(id)).map(o => ({ id: o.id, title: cfg.encode(f.kind + ' [' + (o.guard?.text ?? '') + ']') }))) }));
    for (const note of interaction.notes ?? []) {
      const anchor = events.findIndex(e => note.messageIds?.includes(e.id));
      events.splice(anchor < 0 ? events.length : anchor + 1, 0, { id: note.id, frames: [], note: cfg.encode(note.text) });
    }
    return events;
  }
  // The saved-source tree also covers nested operands, activations and notes,
  // which are absent from the parser's compatibility interaction projection.
  const events: Event[] = [], visited = new Set<CandidateSequenceItemSyntax>();
  const edgeIds = new Map(doc.syntax.statements.filter(s => s.kind === 'edge').map((s, i) => [s, graph.edges[i]?.id]));
  function visit(item: CandidateSequenceItemSyntax, frames: Frame[]) {
    if (visited.has(item)) return;
    visited.add(item);
    if (item.kind === 'edge') {
      const id = edgeIds.get(item);
      if (!id) throw new TextRenderError('text.sequence.invalid', 'Unresolved sequence message.');
      events.push({ id, frames });
    } else if (item.kind === 'note') {
      events.push({ id: 'note-' + item.noteKeyword.range.start.offset, frames,
        note: cfg.encode('Note (' + item.targets.map(t => t.value).join(', ') + '): ' + item.text.value) });
    } else if (item.kind === 'fragment') {
      item.operands.forEach((operand, i) => {
        const frame = { id: `operand-${item.blockOpen.range.start.offset}-${i}`,
          title: cfg.encode((i ? 'else' : item.fragmentKind.value) + (operand.guard ? ` [${operand.guard.value}]` : '')) };
        operand.items.forEach(child => visit(child, [...frames, frame]));
      });
    } else {
      const frame = { id: 'scope-' + item.blockOpen.range.start.offset,
        title: cfg.encode(item.kind === 'activation' ? 'activate ' + item.participant.value : item.label?.value ?? 'region') };
      item.items.forEach(child => visit(child, [...frames, frame]));
    }
  }
  for (const s of doc.syntax.statements) if (s.kind === 'fragment' || s.kind === 'edge' || s.kind === 'note' ||
    s.kind === 'activation' || s.kind === 'region') visit(s, []);
  return events;
}

export function sequenceScene(graph: GraphIR, cfg: Settings, doc?: InstalledDocument028): TextScene {
  const interaction = graph.interaction;
  if (!interaction) throw new TextRenderError('text.sequence.invalid', 'Missing sequence interaction.');
  const events = sequenceEvents(graph, cfg, doc);
  const depth = Math.max(0, ...events.map(e => e.frames.length));
  const available = cfg.width - 4 * depth, participants = interaction.participantOrder;
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const names = participants.map(id => {
    const node = nodes.get(interaction.participants.find(p => p.id === id)?.nodeId ?? id);
    return cfg.encode(node?.label ?? id);
  });
  const count = participants.length;
  if (!count) throw new TextRenderError('text.sequence.invalid', 'Missing sequence participants.');
  const cell = Math.floor(available / count);
  const legends: string[] = [];
  const headers = names.map((name, i) => {
    const full = names.indexOf(name) === names.lastIndexOf(name) ? name : `[${cfg.encode(participants[i])}] ${name}`;
    if (full.length + 3 <= cell) return full;
    const ref = key(i);
    if (cfg.legend === 'none' || cell < ref.length + 1) unfit(participants[i], count * (ref.length + 1) + depth * 4, 'participant headers cannot fit');
    legends.push(...wrap(`[${ref}] ${full}`, cfg.width, participants[i]));
    return ref;
  });
  const lane = (i: number) => Math.floor(cell / 2) + i * cell;
  const headerRows = ['', '', ''];
  headers.forEach((label, i) => {
    const shaped = cell >= label.length + 3 ? [cfg.glyph.tl + cfg.glyph.h.repeat(label.length) + cfg.glyph.tr,
      cfg.glyph.v + label + cfg.glyph.v, cfg.glyph.bl + cfg.glyph.h.repeat(label.length) + cfg.glyph.br] : ['', label, cfg.glyph.v];
    shaped.forEach((s, r) => { headerRows[r] = headerRows[r].padEnd(lane(i) - Math.floor(s.length / 2)) + s; });
  });
  const repeated = headerRows.map(r => ' '.repeat(depth * 2) + r.trimEnd());
  const bands: Band[] = [];
  const edges = new Map(graph.edges.map(e => [e.id, e]));
  const messages = new Map(interaction.messages.flatMap(m => [[m.id, m], [m.edgeId, m]] as const));
  let ordinal = 0;
  for (const event of events) {
    const rows: string[] = [], notes: string[] = [];
    const pad = ' '.repeat((depth - event.frames.length) * 2);
    if (event.note !== undefined) rows.push(...box(wrap(event.note, available - 4, event.id), cfg));
    else {
      const msg = messages.get(event.id), edge = edges.get(msg?.edgeId ?? event.id);
      if (!msg || !edge) throw new TextRenderError('text.sequence.invalid', 'Missing message or edge.', event.id);
      const a = participants.indexOf(msg.sourceParticipantId), b = participants.indexOf(msg.targetParticipantId);
      if (a < 0 || b < 0) throw new TextRenderError('text.sequence.invalid', 'Unknown participant.', event.id);
      const start = lane(a), end = lane(b), lo = Math.min(start, end), hi = Math.max(start, end);
      const line = Array<string>(available).fill(' ');
      participants.forEach((_, i) => { line[lane(i)] = cfg.glyph.v; });
      const label = cfg.encode(edge.label ?? edge.id);
      let labels = wrap(label, available, edge.id);
      if (labels.length > (cfg.density === 'compact' ? 3 : 5)) {
        if (cfg.legend === 'none') unfit(edge.id, label.length, 'message label requires a legend');
        const ref = `[${++ordinal}]`;
        notes.push(...wrap(ref + ' ' + label, cfg.width, edge.id)); labels = [ref];
      }
      for (const text of labels) {
        const row = [...line], left = Math.min(lo + 1, available - text.length);
        row.splice(left, text.length, ...text); rows.push(row.join('').trimEnd());
      }
      for (let x = lo + 1; x < hi; x++) line[x] = msg.kind === 'return' ? '.' : cfg.glyph.h;
      if (a === b) {
        const self = start + 3 < available ? '|' + cfg.glyph.h + '+' : '+' + cfg.glyph.h + '|';
        line.splice(Math.min(start, available - 3), 3, ...self);
        rows.push(line.join('').trimEnd());
      }
      line[end] = msg.kind === 'synchronous' ? (a <= b ? '>' : '<') : a <= b ? cfg.glyph.right : cfg.glyph.left;
      if (cfg.charset === 'monotrue-v1') line[end] = getEndpointGlyph029(msg.kind === 'synchronous' ? 'triangle_filled' : 'arrow_open', a <= b ? 1 : -1, 0);
      else if (msg.kind === 'synchronous' && hi > lo + 1) line[end + (a < b ? -1 : 1)] = line[end];
      rows.push(line.join('').trimEnd());
    }
    bands.push({ id: event.id, frames: event.frames, rows: rows.map(r => pad + r), notes });
  }
  // Participant keys apply to every page. Put their definitions in the
  // document once as independent, breakable legend rows.
  legends.forEach((row, i) => bands.push({ id: `participant-legend-${i}`, rows: [row], frames: [], notes: [] }));
  return { title: cfg.encode(graph.name ?? 'Sequence'), repeated, bands, edges: [] };
}
