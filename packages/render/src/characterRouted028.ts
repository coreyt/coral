/** Bounded ordinary-graph cell layout adapted from the character experiment. */
import type { GraphIR, GraphNode } from '@graph-ir/core';
import { computeElkLayout } from './layout/engine.js';
import { CHARACTER_GLYPH_ROLES_028 as glyph } from './characterGlyphRoles028.js';
import { getEndpointGlyph029, wallTeeGlyph029 } from './characterEndpoint029.js';
import {
  CharacterRenderError, characterFieldLines028, encodeCharacterField028,
  type CharacterCharset028, type CharacterColumns028, type CharacterDiagnostic028,
} from './characters028.js';

interface CellPoint { x: number; y: number }
interface CellRect { x: number; y: number; width: number; height: number }
interface Glyphs { tl: string; tr: string; bl: string; br: string; h: string; v: string; right: string }
const ascii: Glyphs = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', right: '>' };
const unicode: Glyphs = {
  tl: glyph['stroke.single.nw'].character, tr: glyph['stroke.single.ne'].character,
  bl: glyph['stroke.single.sw'].character, br: glyph['stroke.single.se'].character,
  h: glyph['stroke.single.h'].character, v: glyph['stroke.single.v'].character,
  right: glyph['endpoint.arrow_open.w'].character,
};
const CONTROLLED_DRAWING = new Set<string>(Object.values(glyph).map(role => role.character));
const MAX_PICTURE_ROWS = 120;
const MAX_PICTURE_CELLS = 19200;
const MAX_LAYOUT_ROWS = 480;
const MAX_LAYOUT_CELLS = 48000;
const MAX_TEXT_ROWS = 1024;
const MAX_TEXT_CELLS = 65536;
const BPMN_GATEWAY_HEIGHT = 11;
type RoutedResult = Omit<import('./characterPreview028.js').CharacterPreviewResult028, 'graph'>;

function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}

/** Enforce the complete copyable artifact budget after all picture and ledger rows. */
export function finalizeCharacterPreview028(
  lines: string[], columns: CharacterColumns028, charset: CharacterCharset028,
  diagnostics: CharacterDiagnostic028[],
): RoutedResult {
  if (lines.length > MAX_TEXT_ROWS || lines.reduce((cells, line) => cells + line.length, 0) > MAX_TEXT_CELLS) {
    fail('character.size.unsupported', 'Complete preview exceeds the row or cell budget.');
  }
  if (lines.some((line) => line.length > columns)) {
    fail('character.width.unsupported', 'Complete preview row exceeds the requested width.');
  }
  const text = `${lines.join('\n')}\n`;
  if (charset === 'ASCII' && !/^[\x20-\x7e\n]*$/.test(text)) {
    fail('character.charset.invalid', 'ASCII preview contains an invalid byte.');
  }
  if ([...text].some((char) => {
    const point = char.codePointAt(0)!;
    const privateUse = point >= 0xe000 && point <= 0xf8ff ||
      point >= 0xf0000 && point <= 0xffffd || point >= 0x100000 && point <= 0x10fffd;
    return privateUse && (charset !== 'MonoTrue-v1' || !CONTROLLED_DRAWING.has(char));
  })) fail('character.charset.invalid', 'Preview contains an unvalidated private-use character.');
  return { text, charset, width: Math.max(...lines.map((line) => line.length)),
    height: lines.length, diagnostics };
}

function roleCue(node: GraphNode, notation: string): string {
  if (notation === 'block') return 'block';
  if (notation === 'flowchart') {
    if (node.type === 'terminal' && (node.variant === 'start' || node.variant === 'end')) return node.variant;
    if (node.type === 'process' || node.type === 'decision') return node.type;
  }
  if (notation === 'bpmn') {
    if (node.symbol === 'bpmn-start-event') return 'start';
    if (node.symbol === 'bpmn-task') return 'task';
    if (node.symbol === 'bpmn-gateway-exclusive') return 'X gateway';
    if (node.symbol === 'bpmn-end-event') return 'end';
  }
  if (notation === 'uml-state') {
    if (node.type === 'initial') return 'initial';
    if (node.type === 'state') return 'state';
    if (node.type === 'final') return 'final';
  }
  fail('character.role.unsupported', 'No cell cue for node role.', `nodes.${node.id}`);
}

function gatewaySide(width: number, row: number): number {
  const half = Math.floor(BPMN_GATEWAY_HEIGHT / 2);
  return Math.round((width - 1) * (half - row) / (half * 2));
}

function gatewayContourRow(width: number, portX: number): number {
  let best = 0;
  let distance = Infinity;
  for (let row = 0; row <= Math.floor(BPMN_GATEWAY_HEIGHT / 2); row++) {
    const left = gatewaySide(width, row);
    const gap = Math.min(Math.abs(portX - left), Math.abs(portX - (width - 1 - left)));
    if (gap < distance) { best = row; distance = gap; }
  }
  return best;
}

function drawBox(grid: string[][], x: number, y: number, label: string, glyphs: Glyphs,
  role: string, direction: 'RIGHT' | 'DOWN', boxWidth?: number): void {
  const width = boxWidth ?? label.length + 4;
  if (role === 'state-initial' || role === 'state-final') {
    const initial = role === 'state-initial';
    const center = x + Math.floor(width / 2);
    const fill = glyphs === ascii ? '#' : glyph['mark.circle.filled'].character;
    if (initial) {
      for (let column = center - 1; column <= center + 1; column++) {
        grid[y + 1]![column] = fill;
        grid[y + 3]![column] = fill;
      }
      for (let column = center - 2; column <= center + 2; column++) grid[y + 2]![column] = fill;
    }
    const labelY = initial ? y : y + 7;
    for (let i = 0; i < label.length; i++) {
      grid[labelY]![x + Math.floor((width - label.length) / 2) + i] = label[i]!;
    }
    if (initial && direction === 'RIGHT') {
      for (let column = center + 3; column < x + width; column++) grid[y + 2]![column] = glyphs.h;
    }
    if (initial && direction === 'DOWN') {
      grid[y + 4]![center] = glyphs.v;
    }
    return;
  }
  if (role === 'bpmn-start' || role === 'bpmn-end') {
    const start = role === 'bpmn-start';
    const mid = x + Math.floor(width / 2);
    const top = y + (start ? 1 : 0);
    const stroke = start ? glyphs.h : '#';
    grid[top]![mid - 2] = '/';
    grid[top]![mid - 1] = stroke;
    grid[top]![mid] = stroke;
    grid[top]![mid + 1] = stroke;
    grid[top]![mid + 2] = '\\';
    grid[top + 1]![mid - 2] = start ? '(' : '#';
    grid[top + 1]![mid + 2] = start ? ')' : '#';
    grid[top + 2]![mid - 2] = '\\';
    grid[top + 2]![mid - 1] = stroke;
    grid[top + 2]![mid] = stroke;
    grid[top + 2]![mid + 1] = stroke;
    grid[top + 2]![mid + 2] = '/';
    for (let i = 0; i < label.length; i++) grid[y + (start ? 0 : 3)]![x + i + 2] = label[i]!;
    if (direction === 'RIGHT' && start) {
      for (let column = mid + 3; column < x + width; column++) grid[y + 2]![column] = glyphs.h;
    }
    return;
  }
  if (role === 'decision' || role === 'X gateway' || role === 'bpmn-X gateway') {
    if (role === 'bpmn-X gateway') {
      const center = x + Math.floor(width / 2);
      grid[y]![center - 1] = '/';
      grid[y]![center] = '\\';
      for (let level = 1; level < Math.floor(BPMN_GATEWAY_HEIGHT / 2); level++) {
        const left = x + gatewaySide(width, level);
        const right = x + width - 1 - (left - x);
        grid[y + level]![left] = '/';
        grid[y + level]![right] = '\\';
        grid[y + BPMN_GATEWAY_HEIGHT - 1 - level]![left] = '\\';
        grid[y + BPMN_GATEWAY_HEIGHT - 1 - level]![right] = '/';
      }
      const middle = y + Math.floor(BPMN_GATEWAY_HEIGHT / 2);
      grid[middle]![x] = '<';
      grid[middle]![x + width - 1] = '>';
      grid[y + BPMN_GATEWAY_HEIGHT - 1]![center - 1] = '\\';
      grid[y + BPMN_GATEWAY_HEIGHT - 1]![center] = '/';
      for (let i = 0; i < label.length; i++) grid[middle]![x + i + 2] = label[i]!;
      return;
    }
    grid[y]![x + 1] = '/';
    grid[y]![x + width - 2] = '\\';
    grid[y + 1]![x] = '/';
    grid[y + 1]![x + width - 1] = '\\';
    grid[y + 2]![x] = '<';
    grid[y + 2]![x + width - 1] = '>';
    grid[y + 3]![x] = '\\';
    grid[y + 3]![x + width - 1] = '/';
    grid[y + 4]![x + 1] = '\\';
    grid[y + 4]![x + width - 2] = '/';
    for (let i = 2; i < width - 2; i++) {
      grid[y]![x + i] = glyphs.h;
      grid[y + 4]![x + i] = glyphs.h;
    }
    for (let i = 0; i < label.length; i++) grid[y + 2]![x + i + 2] = label[i]!;
    return;
  }
  const terminal = role === 'start' || role === 'end' || role === 'bpmn-task' || role === 'state-state';
  for (let i = 1; i < width - 1; i++) {
    grid[y]![x + i] = glyphs.h;
    grid[y + 2]![x + i] = glyphs.h;
  }
  grid[y]![x] = terminal ? '/' : glyphs.tl;
  grid[y]![x + width - 1] = terminal ? '\\' : glyphs.tr;
  grid[y + 1]![x] = terminal ? '(' : glyphs.v;
  grid[y + 1]![x + width - 1] = terminal ? ')' : glyphs.v;
  grid[y + 2]![x] = terminal ? '\\' : glyphs.bl;
  grid[y + 2]![x + width - 1] = terminal ? '/' : glyphs.br;
  for (let i = 0; i < label.length; i++) {
    grid[y + 1]![x + (role === 'state-state' ? Math.floor((width - label.length) / 2) : 2) + i] = label[i]!;
  }
}

/** Keep a short caption next to its own route, never over a node or another edge. */
export function placeEdgeLabel(grid: string[][], points: CellPoint[], label: string,
  nodeRects: CellRect[], notation: string, occupiedLabels?: Set<string>): boolean {
  if (!label || label.length > 24 || points.length < 2) return false;
  const free = (x: number, y: number, text: string) => y >= 0 && y < grid.length && x >= 0 &&
    x + text.length <= grid[y]!.length &&
    !nodeRects.some((rect) => y >= rect.y && y < rect.y + rect.height &&
      x < rect.x + rect.width && x + text.length > rect.x) &&
    Array.from({ length: text.length }, (_, i) => grid[y]![x + i] === ' ').every(Boolean) &&
    (!occupiedLabels || (notation === 'uml-state' ? [y - 1, y, y + 1] : [y])
      .every((row) => Array.from({ length: text.length + 2 }, (_, i) => `${row}:${x + i - 1}`)
        .every((cell) => !occupiedLabels.has(cell))));
  const tryPlace = (x: number, y: number, text = label): boolean => {
    if (!free(x, y, text)) return false;
    for (let i = 0; i < text.length; i++) grid[y]![x + i] = text[i]!;
    if (occupiedLabels) for (let i = 0; i < text.length; i++) occupiedLabels.add(`${y}:${x + i}`);
    return true;
  };
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (length < 3) continue;
    const first = Math.max(2, Math.min(length - 1, 3));
    for (let distance = first; distance < length; distance++) {
      if (a.x === b.x) {
        const y = b.y - Math.sign(b.y - a.y) * distance;
        if (notation === 'uml-state') {
          if (tryPlace(b.x - label.length - 1, y) || tryPlace(b.x + 1, y)) return true;
          continue;
        }
        if (notation === 'block' || notation === 'bpmn') {
          const left = `${label}:`;
          const right = `:${label}`;
          if (tryPlace(b.x - left.length, y, left) || tryPlace(b.x + 1, y, right)) return true;
          continue;
        }
        if (tryPlace(b.x + 2, y) || tryPlace(b.x - label.length - 2, y)) return true;
      } else {
        const x = b.x - Math.sign(b.x - a.x) * distance;
        const centeredX = x - Math.floor(label.length / 2);
        const offsets = notation === 'block' || notation === 'bpmn' || notation === 'uml-state'
          ? [-1, 1, -2, 2, -3, 3] : [-1, 1];
        if (offsets.some((offset) => tryPlace(centeredX, b.y + offset))) return true;
      }
    }
  }
  return false;
}

/** Collapse only identical straight-run rows; no bend, caption, marker or box row moves alone. */
function compactStraightRuns(grid: string[][], glyphs: Glyphs, keepTwo = true): string[][] {
  const signature = (row: string[]): string | undefined => {
    const occupied = row.flatMap((char, x) => char === ' ' ? [] : [x]);
    if (occupied.length === 0) return 'blank';
    return occupied.every((x) => row[x] === glyphs.v) ? occupied.join(',') : undefined;
  };
  const compact: string[][] = [];
  for (let start = 0; start < grid.length;) {
    const key = signature(grid[start]!);
    if (key === undefined) {
      compact.push(grid[start]!);
      start++;
      continue;
    }
    let end = start + 1;
    while (end < grid.length && signature(grid[end]!) === key) end++;
    compact.push(grid[start]!);
    if (keepTwo && key !== 'blank' && end > start + 1) compact.push(grid[end - 1]!);
    start = end;
  }
  return compact;
}

/** Remove a redundant state-transition shaft row while keeping a row below captions. */
export function compactStateVerticalRuns(grid: string[][], glyphs: Glyphs,
  captionRows: ReadonlySet<string[]> = new Set()): string[][] {
  const diagramEnds = Object.entries(glyph).filter(([role]) => role.startsWith('endpoint.')).map(([, row]) => row.character);
  const wallTees = ['├', '┤', '┬', '┴'];
  const connector = new Set([...diagramEnds, ...wallTees, glyphs.v, glyphs.h, glyphs.tl, glyphs.tr, glyphs.bl,
    glyphs.br, '+', '-', '|', '/', '\\', '(', ')', '^', 'v', '↑', '↓', '.', "'"]);
  const arrows = ['^', 'v', '<', '>', '↑', '↓', '←', '→', ...diagramEnds, ...wallTees];
  const downward = new Set([glyphs.v, glyphs.tl, glyphs.tr, '+', '|', '(', ')', ...arrows]);
  const upward = new Set([glyphs.v, glyphs.bl, glyphs.br, '+', '|', '(', ')', ...arrows]);
  const compact = [...grid];
  for (let index = 1; index < compact.length - 1;) {
    const row = compact[index]!;
    const occupied = row.flatMap((cell, x) => cell === ' ' ? [] : [x]);
    const before = compact[index - 1]!;
    const after = compact[index + 1]!;
    const beforeCaption = captionRows.has(before) || before.some((cell) => /[A-Za-z0-9]/.test(cell));
    const afterCaption = captionRows.has(after) || after.some((cell) => /[A-Za-z0-9]/.test(cell));
    const safe = occupied.length > 0 && occupied.every((x) => row[x] === glyphs.v) &&
      !(occupied.length > 1 && beforeCaption) &&
      !(beforeCaption && afterCaption) &&
      !row.some((cell, x) => cell === ' ' && downward.has(before[x]!) && upward.has(after[x]!)) &&
      occupied.every((x) => connector.has(before[x]!) && connector.has(after[x]!));
    if (safe) {
      compact.splice(index, 1);
      if (index > 1) index--;
    } else index++;
  }
  return compact;
}

/** Draw a complete route atomically; a collision leaves the grid unchanged. */
function route(grid: string[][], originalPoints: CellPoint[], glyphs: Glyphs,
  target?: CellRect, filledHead = false, source?: CellRect): boolean {
  const points = [...originalPoints];
  if (points.length < 2) return false;
  if (target) {
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    const dx = Math.sign(end.x - before.x);
    const dy = Math.sign(end.y - before.y);
    points[points.length - 1] = {
      x: dx > 0 ? target.x : dx < 0 ? target.x + target.width - 1 : end.x,
      y: dy > 0 ? target.y : dy < 0 ? target.y + target.height - 1 : end.y,
    };
  }
  const cells: Array<{ x: number; y: number; glyph: string }> = [];
  const start = points[0]!;
  const next = points[1]!;
  if (start.x === next.x && start.y === next.y || start.x !== next.x && start.y !== next.y) return false;
  const sourceDx = Math.sign(next.x - start.x);
  const sourceDy = Math.sign(next.y - start.y);
  if (source && glyphs !== ascii && grid[start.y]?.[start.x] === ' ') {
    const wall = { x: start.x - sourceDx, y: start.y - sourceDy };
    const onFace = sourceDx > 0 ? wall.x === source.x + source.width - 1 && wall.y > source.y && wall.y < source.y + source.height - 1
      : sourceDx < 0 ? wall.x === source.x && wall.y > source.y && wall.y < source.y + source.height - 1
        : sourceDy > 0 ? wall.y === source.y + source.height - 1 && wall.x > source.x && wall.x < source.x + source.width - 1
          : wall.y === source.y && wall.x > source.x && wall.x < source.x + source.width - 1;
    if (onFace && grid[wall.y]?.[wall.x] === (sourceDx ? glyphs.v : glyphs.h)) points[0] = wall;
  }
  const first = points[0]!;
  const sourceWall = glyphs !== ascii && [glyphs.h, glyphs.v].includes(grid[first.y]?.[first.x] ?? '');
  if (sourceWall) {
    cells.push({ ...first, glyph: wallTeeGlyph029(Math.sign(next.x - first.x), Math.sign(next.y - first.y)) });
  } else if (grid[first.y]?.[first.x] === ' ') {
    cells.push({ x: first.x, y: first.y, glyph: first.x !== next.x ? glyphs.h : glyphs.v });
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x === b.x && a.y === b.y || a.x !== b.x && a.y !== b.y) return false;
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (let step = 1; step < Math.abs(b.x - a.x) + Math.abs(b.y - a.y); step++) {
      cells.push({ x: a.x + dx * step, y: a.y + dy * step, glyph: dx ? glyphs.h : glyphs.v });
    }
    if (i < points.length - 1) {
      const after = points[i + 1]!;
      const nextDx = Math.sign(after.x - b.x);
      const nextDy = Math.sign(after.y - b.y);
      if (nextDx !== 0 && nextDy !== 0 || nextDx === 0 && nextDy === 0) return false;
      const sides = new Set([
        dx > 0 ? 'west' : dx < 0 ? 'east' : dy > 0 ? 'north' : 'south',
        nextDx > 0 ? 'east' : nextDx < 0 ? 'west' : nextDy > 0 ? 'south' : 'north',
      ]);
      const bend = sides.has('south') && sides.has('east') ? glyphs.tl
        : sides.has('south') && sides.has('west') ? glyphs.tr
          : sides.has('north') && sides.has('east') ? glyphs.bl
            : sides.has('north') && sides.has('west') ? glyphs.br
              : sides.has('east') && sides.has('west') ? glyphs.h
                : sides.has('north') && sides.has('south') ? glyphs.v : undefined;
      if (!bend) return false;
      cells.push({ x: b.x, y: b.y, glyph: bend });
    }
  }
  const end = points.at(-1)!;
  const before = points.at(-2)!;
  const dx = Math.sign(end.x - before.x);
  const dy = Math.sign(end.y - before.y);
  if (dx === 0 && dy === 0) return false;
  const arrow = glyphs !== ascii ? getEndpointGlyph029(filledHead ? 'triangle_filled' : 'arrow_open', dx, dy)
    : filledHead ? (dx > 0 ? '>' : dx < 0 ? '<' : dy > 0 ? 'V' : '^')
      : dx > 0 ? '>' : dx < 0 ? '<' : dy > 0 ? 'v' : '^';
  // Diagram markers sit outside an axis-aligned wall, whose tee reaches their tip.
  // Existing curved/compound contour recipes keep their authored boundary cells.
  const targetWall = target && glyphs !== ascii && [glyphs.h, glyphs.v].includes(grid[end.y]?.[end.x] ?? '');
  if (targetWall && Math.abs(end.x - before.x) + Math.abs(end.y - before.y) < 2) return false;
  const arrowX = target && !targetWall ? end.x : end.x - dx;
  const arrowY = target && !targetWall ? end.y : end.y - dy;
  if (targetWall) cells.push({ ...end, glyph: wallTeeGlyph029(-dx, -dy) });
  const prior = cells.find((cell) => cell.x === arrowX && cell.y === arrowY);
  if (prior) prior.glyph = arrow;
  else cells.push({ x: arrowX, y: arrowY, glyph: arrow });
  if (filledHead && glyphs === ascii) {
    const tailX = arrowX - dx;
    const tailY = arrowY - dy;
    const tail = cells.find((cell) => cell.x === tailX && cell.y === tailY);
    if (tail && dx) tail.glyph = '=';
  }
  const outline = new Set([glyphs.tl, glyphs.tr, glyphs.bl, glyphs.br, glyphs.h, glyphs.v, '#',
    '/', '\\', '(', ')', '<', '>']);
  if (cells.some(({ x, y }) => y < 0 || y >= grid.length || x < 0 || x >= grid[y]!.length ||
      grid[y]![x] !== ' ' &&
      !((target && (!targetWall && x === arrowX && y === arrowY || targetWall && x === end.x && y === end.y) ||
        sourceWall && x === first.x && y === first.y) && outline.has(grid[y]![x]!)))) {
    return false;
  }
  for (const { x, y, glyph } of cells) grid[y]![x] = glyph;
  return true;
}

/** Layout only carries the visual projection. The source graph is kept by the caller. */
export async function renderRoutedCharacters028(
  graph: GraphIR, columns: CharacterColumns028, charset: CharacterCharset028,
): Promise<RoutedResult> {
  const notation = graph.metadata?.notation;
  if (notation !== 'block' && notation !== 'flowchart' && notation !== 'bpmn' && notation !== 'uml-state') {
    fail('character.notation.unsupported', 'No routed cell profile for this notation.', 'metadata.notation');
  }
  const glyphs = charset === 'MonoTrue-v1' ? unicode : ascii;
  let encodedCells = 0;
  const nodeWidths = new Map<string, number>();
  const labels = new Map(graph.nodes.map((node) => {
    const id = encodeCharacterField028(node.id);
    const label = encodeCharacterField028(node.label ?? node.id);
    const cue = notation === 'bpmn' ? roleCue(node, notation) : '';
    const text = notation === 'uml-state' && node.label === node.id ? `[${id}]`
      : `${cue === 'X gateway' ? 'X ' : ''}[${id}] ${label}`;
    const nodeWidth = notation === 'uml-state' ? `[${id}] ${label}`.length + 4 : text.length + 4;
    // The initial circle's center must coincide with its floor-quantized ELK
    // port even when the node's origin falls on a half cell. Default state
    // widths are already odd; aliases can otherwise leave a diagonal gap.
    nodeWidths.set(node.id, nodeWidth + Number(notation === 'uml-state' &&
      node.type === 'initial' && nodeWidth % 2 === 0));
    encodedCells += text.length;
    if (text.length > 80 || nodeWidths.get(node.id)! > columns) {
      fail('character.width.unsupported', 'Node box exceeds the chosen cell width.', `nodes.${node.id}`);
    }
    return [node.id, text] as const;
  }));
  for (const edge of graph.edges) {
    const labelLength = encodeCharacterField028(edge.label ?? '').length;
    if ((notation === 'block' || notation === 'bpmn' || notation === 'uml-state') && labelLength > 24) {
      fail('character.label.unsupported', 'Edge caption exceeds 24 encoded cells.', `edges.${edge.id}.label`);
    }
    if (labelLength > 80) fail('character.size.unsupported', 'Edge label exceeds 80 encoded cells.', `edges.${edge.id}.label`);
    encodedCells += labelLength;
  }
  if (encodedCells > 2000) fail('character.size.unsupported', 'Encoded display text exceeds 2,000 cells.');
  const layoutNodes = [...graph.nodes].sort((a, b) =>
    Number(roleCue(b, notation) === 'start') - Number(roleCue(a, notation) === 'start'));
  const hasStart = layoutNodes.some((node) => roleCue(node, notation) === 'start');
  const captionWidth = Math.max(0, ...graph.edges.map((edge) =>
    encodeCharacterField028(edge.label ?? '').length));
  const denseBpmn = notation === 'bpmn' && graph.edges.length >= graph.nodes.length;
  const layoutFor = (direction: 'RIGHT' | 'DOWN') => computeElkLayout({
    id: graph.id,
    nodes: layoutNodes.map((node) => ({ id: node.id, width: nodeWidths.get(node.id)!,
      height: notation === 'bpmn' && roleCue(node, notation) === 'X gateway' ? BPMN_GATEWAY_HEIGHT
        : ['decision', 'X gateway'].includes(roleCue(node, notation)) ? 5
        : notation === 'bpmn' && ['start', 'end'].includes(roleCue(node, notation)) ? 4
          : notation === 'uml-state' && roleCue(node, notation) === 'final' ? 9
            : notation === 'uml-state' && roleCue(node, notation) === 'initial' ? 5 : 3 })),
    edges: graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    defaults: { algorithm: 'layered', direction, edgeRouting: 'ORTHOGONAL',
      spacing: { nodeNode: notation === 'bpmn' ? (denseBpmn ? 16 : 8)
        : notation === 'uml-state' ? 10 : notation === 'block' ? 10 : 3,
        nodeEdge: 1, edgeEdge: 1,
        layerSpacing: notation === 'bpmn' ? Math.max(denseBpmn ? 16 : 10, captionWidth + 6)
          : notation === 'uml-state' ? Math.max(5, captionWidth + 1)
          : notation === 'block' ? Math.max(12, captionWidth + 4) : 4 },
      elkOptions: {
        'elk.layered.nodePlacement.strategy': 'SIMPLE',
        ...(hasStart || notation === 'block' || notation === 'bpmn' || notation === 'uml-state'
          ? { 'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST' } : {}),
      } },
  });
  const diagnostics: CharacterDiagnostic028[] = [];
  let layout;
  let layoutDirection: 'RIGHT' | 'DOWN' = notation === 'uml-state' ? 'DOWN' : 'RIGHT';
  try {
    layout = await layoutFor(layoutDirection);
    if (notation !== 'uml-state' && Math.ceil(layout.width) + 2 > columns) {
      layout = await layoutFor('DOWN');
      layoutDirection = 'DOWN';
      diagnostics.push({ code: 'character.layout.reflow', severity: 'warning',
        message: 'Diagram reflowed downward to fit the requested columns.' });
    }
  } catch (error) {
    fail('character.layout.failed', error instanceof Error ? error.message : 'Cell layout failed.');
  }
  diagnostics.push(...layout.diagnostics.map((item) => ({ ...item })));
  const routePoints = layout.edges.flatMap((edge) => edge.sections.flatMap((section) =>
    [section.startPoint, ...section.bendPoints, section.endPoint]));
  const x0 = Math.min(...layout.nodes.map((node) => node.absolutePosition.x), ...routePoints.map((point) => point.x));
  const y0 = Math.min(...layout.nodes.map((node) => node.absolutePosition.y), ...routePoints.map((point) => point.y));
  const rawWidth = Math.max(...layout.nodes.map((node) => Math.ceil(node.absolutePosition.x + node.width)),
    ...routePoints.map((point) => Math.floor(point.x) + 1)) - Math.floor(x0);
  const blockPadX = notation === 'block' || notation === 'bpmn' || notation === 'uml-state'
    ? Math.max(0, Math.min(3, Math.floor((columns - rawWidth) / 2))) : 0;
  const offsetX = -Math.floor(x0) + blockPadX;
  const offsetY = -Math.floor(y0) + (notation === 'block' || notation === 'bpmn' || notation === 'uml-state' ? 3 : 0);
  const width = Math.max(...layout.nodes.map((node) => Math.ceil(node.absolutePosition.x + node.width)),
    ...routePoints.map((point) => Math.floor(point.x) + 1)) + offsetX + blockPadX;
  const height = Math.max(...layout.nodes.map((node) => Math.ceil(node.absolutePosition.y + node.height)),
    ...routePoints.map((point) => Math.floor(point.y) + 1)) + offsetY +
      (notation === 'block' || notation === 'bpmn' || notation === 'uml-state' ? 3 : 0);
  if (width > columns || height > MAX_LAYOUT_ROWS || width * height > MAX_LAYOUT_CELLS) {
    fail('character.limit.exceeded', `Layout needs ${width} columns and ${height} rows; available ${columns} columns and ${MAX_LAYOUT_ROWS} working rows.`);
  }
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(' '));
  const rects = new Map(layout.nodes.map((node) => [node.id, node]));
  const nodeRects = layout.nodes.map((node) => ({
    x: Math.round(node.absolutePosition.x + offsetX),
    y: Math.round(node.absolutePosition.y + offsetY),
    width: node.width, height: node.height,
  }));
  for (const node of graph.nodes) {
    const rect = rects.get(node.id);
    if (!rect) fail('character.layout.failed', `Layout omitted node ${node.id}.`);
    drawBox(grid, Math.round(rect.absolutePosition.x + offsetX),
      Math.round(rect.absolutePosition.y + offsetY), labels.get(node.id)!, glyphs,
      notation === 'bpmn' ? `bpmn-${roleCue(node, notation)}`
        : notation === 'uml-state' ? `state-${roleCue(node, notation)}` : roleCue(node, notation),
      layoutDirection, rect.width);
  }
  const sections = new Map(layout.edges.map((edge) => [edge.id, edge.sections]));
  if (notation === 'uml-state') {
    const final = graph.nodes.find((node) => node.type === 'final')!;
    const rect = rects.get(final.id)!;
    const center = Math.round(rect.absolutePosition.x + offsetX) + Math.floor(rect.width / 2);
    const top = Math.round(rect.absolutePosition.y + offsetY);
    const incoming = graph.edges.filter((edge) => edge.target === final.id);
    const ports = incoming.map((edge) => sections.get(edge.id)?.at(-1)?.endPoint);
    if (ports.some((port) => !port)) fail('character.layout.failed', 'Final transition port is missing.', `nodes.${final.id}`);
    const xs = ports.map((port) => Math.floor(port!.x + offsetX));
    const topRadius = Math.max(3, ...xs.map((x) => Math.abs(x - center) + 1));
    const left = center - topRadius - 2;
    const right = center + topRadius + 2;
    if (left < 0 || right >= width) {
      fail('character.layout.failed', 'Final state contour exceeds the character canvas.', `nodes.${final.id}`);
    }
    const topLeft = center - topRadius;
    const topRight = center + topRadius;
    grid[top]![topLeft] = '.';
    grid[top]![topRight] = '.';
    grid[top + 1]![left + 1] = '/';
    grid[top + 1]![right - 1] = '\\';
    grid[top + 2]![left] = '/';
    grid[top + 2]![right] = '\\';
    grid[top + 3]![left] = '(';
    grid[top + 3]![right] = ')';
    grid[top + 4]![left] = '\\';
    grid[top + 4]![right] = '/';
    grid[top + 5]![left + 1] = '\\';
    grid[top + 5]![right - 1] = '/';
    grid[top + 6]![topLeft] = "'";
    grid[top + 6]![topRight] = "'";
    for (let x = topLeft + 1; x < topRight; x++) {
      grid[top]![x] = glyphs.h;
      grid[top + 6]![x] = glyphs.h;
    }
    const fill = glyphs === ascii ? '#' : glyph['mark.circle.filled'].character;
    for (let x = center - 1; x <= center + 1; x++) grid[top + 3]![x] = fill;
    const finalNodeRect = nodeRects.find((item) => item.y === top && center >= item.x && center < item.x + item.width);
    if (finalNodeRect) {
      finalNodeRect.x = left;
      finalNodeRect.width = right - left + 1;
    }
  }
  if (notation === 'bpmn') {
    for (const edge of graph.edges) {
      if (graph.nodes.find((node) => node.id === edge.source)?.symbol !== 'bpmn-gateway-exclusive') continue;
      const source = rects.get(edge.source);
      const port = sections.get(edge.id)?.[0]?.startPoint;
      if (!source || !port) continue;
      const x = Math.floor(port.x + offsetX);
      const y = Math.round(source.absolutePosition.y + offsetY);
      const left = Math.round(source.absolutePosition.x + offsetX);
      const relativeX = x - Math.round(source.absolutePosition.x + offsetX);
      const contour = gatewayContourRow(source.width, relativeX);
      const sideX = left + (relativeX < source.width / 2
        ? gatewaySide(source.width, contour)
        : source.width - 1 - gatewaySide(source.width, contour));
      const portY = Math.floor(port.y + offsetY);
      const top = portY <= y;
      const bottom = portY >= y + BPMN_GATEWAY_HEIGHT - 1;
      if (!top && !bottom) {
        const relativeY = portY - y;
        const level = Math.min(relativeY, BPMN_GATEWAY_HEIGHT - 1 - relativeY);
        const inset = gatewaySide(source.width, level);
        const contourX = x < left + source.width / 2
          ? left + inset : left + source.width - 1 - inset;
        for (let column = Math.min(x, contourX) + 1; column < Math.max(x, contourX); column++) {
          if (grid[portY]?.[column] === ' ') grid[portY]![column] = glyphs.h;
        }
        continue;
      }
      const boundaryY = top ? y + contour : y + BPMN_GATEWAY_HEIGHT - 1 - contour;
      for (let column = Math.min(x, sideX) + 1; column < Math.max(x, sideX); column++) {
        if (grid[boundaryY]?.[column] === ' ') grid[boundaryY]![column] = glyphs.h;
      }
      if (x !== sideX && grid[boundaryY]?.[x] === ' ') grid[boundaryY]![x] = glyphs.h;
      for (let row = top ? y : boundaryY + 1; row < (top ? boundaryY : y + BPMN_GATEWAY_HEIGHT); row++) {
        if (grid[row]?.[x] === ' ') grid[row]![x] = glyphs.v;
      }
    }
  }
  const statuses = new Map<string, 'routed' | 'legend-only'>();
  const paintEdges = notation === 'block' || notation === 'bpmn' || notation === 'uml-state'
    ? [...graph.edges].reverse() : graph.edges;
  for (const edge of paintEdges) {
    const segments = sections.get(edge.id) ?? [];
    const candidate = grid.map((row) => [...row]);
    const targetRect = rects.get(edge.target);
    const drawn = segments.length > 0 && segments.every((segment, index) => {
      const points = [segment.startPoint, ...segment.bendPoints, segment.endPoint].map((point) => ({
        x: Math.floor(point.x + offsetX), y: Math.floor(point.y + offsetY),
      }));
      const target = index === segments.length - 1 && targetRect ? {
        x: Math.round(targetRect.absolutePosition.x + offsetX),
        y: Math.round(targetRect.absolutePosition.y + offsetY),
        width: targetRect.width, height: targetRect.height,
      } : undefined;
      if (target && notation === 'uml-state' && graph.nodes.find((node) => node.id === edge.target)?.type === 'final') {
        const end = points.at(-1)!;
        const before = points.at(-2)!;
        if (end.x !== before.x || end.y <= before.y) return false;
        target.x = end.x;
        target.width = 1;
        target.height = 1;
      }
      if (target && notation === 'bpmn') {
        const targetNode = graph.nodes.find((node) => node.id === edge.target);
        const end = points.at(-1)!;
        const before = points.at(-2)!;
        if (targetNode?.symbol === 'bpmn-end-event') {
          if (end.y > before.y) target.y -= 1;
          else if (end.x > before.x) target.x += Math.floor(target.width / 2) - 3;
          target.width = 1;
          target.height = 1;
        } else if (targetNode?.symbol === 'bpmn-gateway-exclusive') {
          const contour = gatewayContourRow(target.width, end.x - target.x);
          if (end.y > before.y) target.y += contour - 1;
          else if (end.y < before.y) target.y += BPMN_GATEWAY_HEIGHT - contour;
          else {
            const relativeY = end.y - target.y;
            const level = Math.min(relativeY, BPMN_GATEWAY_HEIGHT - 1 - relativeY);
            const inset = gatewaySide(target.width, level);
            if (end.x > before.x) target.x += inset - 1;
            else if (end.x < before.x) target.x += target.width - inset;
          }
          target.width = 1;
          target.height = 1;
        }
      }
      const sourceRect = index === 0 ? rects.get(edge.source) : undefined;
      const source = sourceRect ? {
        x: Math.round(sourceRect.absolutePosition.x + offsetX),
        y: Math.round(sourceRect.absolutePosition.y + offsetY),
        width: sourceRect.width, height: sourceRect.height,
      } : undefined;
      return route(candidate, points, glyphs, target, notation === 'bpmn', source);
    });
    statuses.set(edge.id, drawn ? 'routed' : 'legend-only');
    if (drawn) candidate.forEach((row, index) => { grid[index] = row; });
    else fail('character.edge.route.unplaced', `${notation} edge ${edge.id} cannot be routed without overlap.`, `edges.${edge.id}`);
  }
  // Spaces inside a caption are authored content, not free cells for a later label.
  const occupiedLabels = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.label || statuses.get(edge.id) !== 'routed') continue;
    const segments = sections.get(edge.id) ?? [];
    const paths = segments.map((segment) =>
      [segment.startPoint, ...segment.bendPoints, segment.endPoint].map((point) => ({
        x: Math.floor(point.x + offsetX), y: Math.floor(point.y + offsetY),
      })));
    const placed = paths.some((path) => placeEdgeLabel(grid,
      path, encodeCharacterField028(edge.label!), nodeRects, notation, occupiedLabels));
    if (!placed) {
      fail('character.label.unplaced', 'Edge caption cannot be placed by its route.', `edges.${edge.id}.label`);
    }
  }
  const straightCompact = compactStraightRuns(grid, glyphs,
    notation !== 'block' && notation !== 'bpmn' && notation !== 'uml-state');
  const captionRows = new Set<string[]>();
  if (notation === 'uml-state') for (const cell of occupiedLabels ?? []) {
    const y = Number(cell.slice(0, cell.indexOf(':')));
    captionRows.add(grid[y]!);
  }
  const compact = notation === 'uml-state'
    ? compactStateVerticalRuns(straightCompact, glyphs, captionRows) : straightCompact;
  const firstOccupied = notation === 'uml-state'
    ? compact.findIndex((row) => row.some((cell) => cell !== ' ')) : 0;
  const pictureRows = firstOccupied > 0 ? compact.slice(firstOccupied) : compact;
  if (pictureRows.length > MAX_PICTURE_ROWS || width * pictureRows.length > MAX_PICTURE_CELLS) {
    fail('character.limit.exceeded', `Picture needs ${width} columns and ${pictureRows.length} rows; available ${columns} columns and ${MAX_PICTURE_ROWS} picture rows.`);
  }
  const picture = pictureRows.map((row) => row.join('').trimEnd()).join('\n').trimEnd();
  const lines = [`CHAR-PREVIEW/1 ${notation} ${charset}`, 'GRAPH',
    ...characterFieldLines028('I', graph.id, columns),
    ...(graph.name === undefined ? [] : characterFieldLines028('L', graph.name, columns)),
    'PICTURE', ...picture.split('\n'), 'NODES'];
  graph.nodes.forEach((node, index) => {
    lines.push(`N ${String(index + 1).padStart(2, '0')}`,
      ...characterFieldLines028('I', node.id, columns),
      `R ${roleCue(node, notation)}`,
      ...(node.label === undefined ? [] : characterFieldLines028('L', node.label, columns)));
  });
  lines.push('EDGES');
  graph.edges.forEach((edge, index) => {
    lines.push(`E ${String(index + 1).padStart(2, '0')} [${statuses.get(edge.id)}]`,
      ...characterFieldLines028('I', edge.id, columns),
      ...characterFieldLines028('F', edge.source, columns),
      ...characterFieldLines028('T', edge.target, columns),
      `K ${edge.type ?? ''}`,
      ...(edge.label === undefined ? [] : characterFieldLines028('L', edge.label, columns)));
  });
  return finalizeCharacterPreview028(lines, columns, charset, diagnostics);
}
