/** Unique-box UML class cell picture with explicit relation-end marks. */
import { computeElkLayout } from './layout/engine.js';
import { CHARACTER_GLYPH_ROLES_028 as glyph } from './characterGlyphRoles028.js';
import { getEndpointGlyph029, wallTeeGlyph029 } from './characterEndpoint029.js';
import { CharacterRenderError, type CharacterCharset028,
  type CharacterColumns028, type CharacterDiagnostic028 } from './characters028.js';

export interface ClassPictureNode028 { id: string; sections: string[][] }
export interface ClassPictureEdge028 {
  id: string; source: string; target: string; type: string;
  sourceMarker: string; targetMarker: string;
}
interface Point { x: number; y: number }
interface Box { x: number; y: number; width: number; height: number; node: ClassPictureNode028 }
interface Marker { cells: Map<string, string>; reserved: Set<string>; depth: number }
const MAX_ROWS = 120;
const MAX_CELLS = 19200;
const MAX_WORK_ROWS = 480;
const MAX_WORK_CELLS = 48000;

function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}
const key = (point: Point) => `${point.x},${point.y}`;
const move = (point: Point, direction: Point, distance: number): Point => ({
  x: point.x + direction.x * distance, y: point.y + direction.y * distance,
});
const direction = (from: Point, to: Point): Point => ({
  x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y),
});
const length = (from: Point, to: Point) => Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

function boxSize(node: ClassPictureNode028): { width: number; height: number } {
  return { width: Math.max(...node.sections.flat().map((row) => row.length), 1) + 4,
    height: node.sections.reduce((count, section) => count + Math.max(1, section.length), 0) +
      node.sections.length + 1 };
}

function markerPattern(kind: string, intoBox: Point): string[] {
  if (kind === 'diamond/filled') return ['  #  ', ' ### ', '#####', ' ### ', '  #  '];
  if (kind === 'arrow/open') return [intoBox.x > 0 ? '>' : intoBox.x < 0 ? '<' : intoBox.y > 0 ? 'v' : '^'];
  if (kind !== 'triangle/open') fail('character.class.marker.unsupported', 'Unknown class marker.');
  if (intoBox.x > 0) return ['|>'];
  if (intoBox.x < 0) return ['<|'];
  if (intoBox.y < 0) return ['  ^  ', ' / \\ ', '-----'];
  return ['-----', ' \\ / ', '  v  '];
}

function markerAt(kind: string, border: Point, outside: Point, unicode: boolean): Marker {
  const intoBox = { x: -outside.x, y: -outside.y };
  if (unicode) {
    const family = kind === 'diamond/filled' ? 'diamond_filled'
      : kind === 'triangle/open' ? 'triangle_open' : kind === 'arrow/open' ? 'arrow_open' : undefined;
    if (!family) fail('character.class.marker.unsupported', 'Unknown class marker.');
    const position = key(move(border, outside, 1));
    return { cells: new Map([[position, getEndpointGlyph029(family, intoBox.x, intoBox.y)]]),
      reserved: new Set([position]), depth: 1 };
  }
  const pattern = markerPattern(kind, intoBox);
  const width = Math.max(...pattern.map((row) => row.length));
  const height = pattern.length;
  const apex = move(border, outside, 1);
  const left = intoBox.x > 0 ? apex.x - width + 1 : intoBox.x < 0 ? apex.x : apex.x - Math.floor(width / 2);
  const top = intoBox.y > 0 ? apex.y - height + 1 : intoBox.y < 0 ? apex.y : apex.y - Math.floor(height / 2);
  const cells = new Map<string, string>();
  const reserved = new Set<string>();
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const point = { x: left + column, y: top + row };
      reserved.add(key(point));
      const char = pattern[row]![column] ?? ' ';
      if (char !== ' ') cells.set(key(point), char);
    }
  }
  return { cells, reserved, depth: outside.x ? width : height };
}

function drawBox(grid: string[][], box: Box, unicode: boolean): void {
  const h = unicode ? glyph['stroke.single.h'].character : '-';
  const v = unicode ? glyph['stroke.single.v'].character : '|';
  const tl = unicode ? glyph['stroke.single.nw'].character : '+';
  const tr = unicode ? glyph['stroke.single.ne'].character : '+';
  const bl = unicode ? glyph['stroke.single.sw'].character : '+';
  const br = unicode ? glyph['stroke.single.se'].character : '+';
  const teeLeft = unicode ? glyph['stroke.single.tee_e'].character : '+';
  const teeRight = unicode ? glyph['stroke.single.tee_w'].character : '+';
  const { x, y, width, height } = box;
  const line = (row: number, left: string, right: string) => {
    grid[row]![x] = left;
    for (let column = x + 1; column < x + width - 1; column++) grid[row]![column] = h;
    grid[row]![x + width - 1] = right;
  };
  line(y, tl, tr);
  let row = y + 1;
  for (const [sectionIndex, section] of box.node.sections.entries()) {
    if (sectionIndex > 0) line(row++, teeLeft, teeRight);
    for (const text of section.length ? section : ['']) {
      grid[row]![x] = v;
      grid[row]![x + width - 1] = v;
      for (let column = 0; column < text.length; column++) grid[row]![x + 2 + column] = text[column]!;
      row++;
    }
  }
  if (row !== y + height - 1) fail('character.class.box.invalid', 'Class compartment geometry disagrees.');
  line(row, bl, br);
}

/** Collapse redundant straight vertical corridors after routes and boxes are complete. */
function compactVerticalRuns(grid: string[][]): string[][] {
  const sameVerticals = (first: string[], second: string[]): boolean => first.every((cell, x) => {
    const other = second[x];
    const vertical = cell === '|' || cell === '│';
    return (vertical || cell === ' ') && (other === '|' || other === '│' || other === ' ') &&
      vertical === (other === '|' || other === '│');
  });
  return grid.filter((row, index) => index === 0 || index === grid.length - 1 ||
    !sameVerticals(grid[index - 1]!, row) || !sameVerticals(row, grid[index + 1]!));
}

function bendGlyph(before: Point, at: Point, after: Point, unicode: boolean): string {
  if (!unicode) return '+';
  const d1 = direction(before, at);
  const d2 = direction(at, after);
  const sides = new Set([
    d1.x > 0 ? 'west' : d1.x < 0 ? 'east' : d1.y > 0 ? 'north' : 'south',
    d2.x > 0 ? 'east' : d2.x < 0 ? 'west' : d2.y > 0 ? 'south' : 'north',
  ]);
  if (sides.has('south') && sides.has('east')) return glyph['stroke.single.nw'].character;
  if (sides.has('south') && sides.has('west')) return glyph['stroke.single.ne'].character;
  if (sides.has('north') && sides.has('east')) return glyph['stroke.single.sw'].character;
  if (sides.has('north') && sides.has('west')) return glyph['stroke.single.se'].character;
  return d1.x ? glyph['stroke.single.h'].character : glyph['stroke.single.v'].character;
}

function routeCells(points: Point[], unicode: boolean, edgeId: string): Map<string, string> {
  const cells = new Map<string, string>();
  const h = unicode ? glyph['stroke.single.h'].character : '-';
  const v = unicode ? glyph['stroke.single.v'].character : '|';
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const step = direction(start, end);
    const count = length(start, end);
    if (!count || step.x && step.y) {
      fail('character.class.route.invalid', `Class route ${edgeId} is not orthogonal at (${start.x},${start.y}) → (${end.x},${end.y}); path=${JSON.stringify(points)}.`, `edges.${edgeId}`);
    }
    for (let distance = 0; distance <= count; distance++) {
      cells.set(key(move(start, step, distance)), step.x ? h : v);
    }
  }
  for (let index = 1; index < points.length - 1; index++) {
    cells.set(key(points[index]!), bendGlyph(points[index - 1]!, points[index]!, points[index + 1]!, unicode));
  }
  return cells;
}

function snapBorder(box: Box, point: Point, step: Point): Point {
  if (step.x > 0) return { x: box.x + box.width - 1, y: Math.max(box.y + 1, Math.min(box.y + box.height - 2, point.y)) };
  if (step.x < 0) return { x: box.x, y: Math.max(box.y + 1, Math.min(box.y + box.height - 2, point.y)) };
  if (step.y > 0) return { x: Math.max(box.x + 1, Math.min(box.x + box.width - 2, point.x)), y: box.y + box.height - 1 };
  return { x: Math.max(box.x + 1, Math.min(box.x + box.width - 2, point.x)), y: box.y };
}

function placeCue(cells: Map<string, string>, points: Point[], text: string,
  available: (point: Point) => boolean): Set<string> | undefined {
  const segments = points.slice(1).map((end, index) => ({ start: points[index]!, end }));
  segments.sort((a, b) => length(b.start, b.end) - length(a.start, a.end));
  for (const { start, end } of segments) {
    const middle = { x: Math.round((start.x + end.x) / 2), y: Math.round((start.y + end.y) / 2) };
    for (const side of [1, -1]) {
      const x = start.y === end.y ? middle.x - Math.floor(text.length / 2)
        : side > 0 ? middle.x + 2 : middle.x - text.length - 1;
      const y = start.y === end.y ? middle.y + side * 2 : middle.y - Math.floor(text.length / 2);
      const area = new Set<string>();
      let fits = true;
      for (let dy = -1; dy <= 1 && fits; dy++) {
        for (let index = -1; index <= text.length; index++) {
          const point = { x: x + index, y: y + dy };
          if (!available(point) || cells.has(key(point))) { fits = false; break; }
          area.add(key(point));
        }
      }
      if (!fits) continue;
      for (let index = 0; index < text.length; index++) cells.set(key({ x: x + index, y }), text[index]!);
      return area;
    }
  }
  return undefined;
}

export async function renderClassPicture028(nodes: ClassPictureNode028[], edges: ClassPictureEdge028[],
  columns: CharacterColumns028, charset: CharacterCharset028,
): Promise<{ picture: string; diagnostics: CharacterDiagnostic028[] }> {
  const unicode = charset === 'MonoTrue-v1';
  const contentCells = nodes.reduce((total, node) => total +
    node.sections.reduce((subtotal, section) => subtotal +
      section.reduce((count, row) => count + row.length, 0), 0), 0);
  if (contentCells > 2000) {
    fail('character.limit.exceeded', 'Class picture content exceeds 2,000 encoded cells.');
  }
  nodes = nodes.map((node) => {
    const sections = node.sections.map((section) => [...section]);
    const outgoing = edges.filter((edge) => edge.source === node.id).length;
    const incoming = edges.filter((edge) => edge.target === node.id).length;
    const busiestSide = Math.max(outgoing, incoming);
    const currentHeight = boxSize({ ...node, sections }).height;
    const padding = !unicode && busiestSide >= 3 ? Math.max(0, busiestSide * 4 + 3 - currentHeight) : 0;
    if (padding) sections.at(-1)!.push(...Array<string>(padding).fill(''));
    return { ...node, sections };
  });
  const sizes = new Map(nodes.map((node) => [node.id, boxSize(node)]));
  for (const node of nodes) {
    if (sizes.get(node.id)!.width > columns) {
      fail('character.width.unsupported', 'Class signature exceeds selected width.', `nodes.${node.id}`);
    }
  }
  const layoutFor = (direction: 'RIGHT' | 'DOWN') => computeElkLayout({
    id: 'class-preview',
    nodes: nodes.map((node) => ({ id: node.id, ...sizes.get(node.id)! })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    defaults: { algorithm: 'layered', direction, edgeRouting: 'ORTHOGONAL',
      spacing: { nodeNode: 3, nodeEdge: 2, edgeEdge: 2, layerSpacing: nodes.length <= 2 ? 24 : 8 },
      elkOptions: { 'elk.layered.nodePlacement.strategy': 'SIMPLE' } },
  });
  let layout = await layoutFor('RIGHT');
  const project = (source: typeof layout) => {
    const routePoints = source.edges.flatMap((edge) => edge.sections.flatMap((section) =>
      [section.startPoint, ...section.bendPoints, section.endPoint]));
    const originX = Math.floor(Math.min(...source.nodes.map((node) => node.absolutePosition.x),
      ...routePoints.map((point) => point.x)));
    const originY = Math.floor(Math.min(...source.nodes.map((node) => node.absolutePosition.y),
      ...routePoints.map((point) => point.y)));
    const boxes = new Map(source.nodes.map((node) => {
      const spec = nodes.find((item) => item.id === node.id)!;
      return [node.id, { x: Math.round(node.absolutePosition.x) - originX,
        y: Math.round(node.absolutePosition.y) - originY,
        width: node.width, height: node.height, node: spec }] as const;
    }));
    const routes = new Map(source.edges.map((edge) => [edge.id, edge.sections.map((section) =>
      [section.startPoint, ...section.bendPoints, section.endPoint].map((point) => ({
        x: Math.round(point.x) - originX, y: Math.round(point.y) - originY,
      })))]));
    const width = Math.max(...[...boxes.values()].map((box) => box.x + box.width),
      ...[...routes.values()].flat(2).map((point) => point.x + 1));
    const height = Math.max(...[...boxes.values()].map((box) => box.y + box.height),
      ...[...routes.values()].flat(2).map((point) => point.y + 1));
    return { boxes, routes, width, height };
  };
  let projected = project(layout);
  if (projected.width > columns) {
    layout = await layoutFor('DOWN');
    projected = project(layout);
  }
  if (edges.some((edge) => !unicode && (edge.sourceMarker === 'diamond/filled' || edge.targetMarker === 'diamond/filled') ||
      edge.type === 'inheritance' && edge.sourceMarker === 'none/unspecified' &&
      edge.targetMarker === 'none/unspecified')) {
    for (const [id, box] of projected.boxes) projected.boxes.set(id, { ...box, y: box.y + 3 });
    for (const sections of projected.routes.values()) {
      for (const points of sections) for (const point of points) point.y += 3;
    }
    projected.height += 6;
  }
  const { boxes, routes, width, height } = projected;
  if (width > columns || height > MAX_WORK_ROWS || width * height > MAX_WORK_CELLS) {
    fail('character.limit.exceeded', 'Class cell layout exceeds the working-grid budget.');
  }
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(' '));
  const nodeMask = new Set<string>();
  for (const box of boxes.values()) {
    for (let y = box.y; y < box.y + box.height; y++) {
      for (let x = box.x; x < box.x + box.width; x++) nodeMask.add(key({ x, y }));
    }
    drawBox(grid, box, unicode);
  }
  const reserved = new Set<string>();
  const diagnostics: CharacterDiagnostic028[] = [];
  const inGrid = (point: Point) => point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
  for (const edge of edges) {
    const sections = routes.get(edge.id) ?? [];
    if (sections.length !== 1 || sections[0]!.length < 2) {
      fail('character.class.route.unsupported', 'Class relation needs one connected route section.', `edges.${edge.id}`);
    }
    const points = [...sections[0]!];
    const sourceBox = boxes.get(edge.source)!;
    const targetBox = boxes.get(edge.target)!;
    const centerDelta = {
      x: targetBox.x + targetBox.width / 2 - sourceBox.x - sourceBox.width / 2,
      y: targetBox.y + targetBox.height / 2 - sourceBox.y - sourceBox.height / 2,
    };
    const cardinal = (step: Point): Point => {
      if (!step.x || !step.y) return step;
      return Math.abs(centerDelta.x) >= Math.abs(centerDelta.y)
        ? { x: Math.sign(centerDelta.x), y: 0 }
        : { x: 0, y: Math.sign(centerDelta.y) };
    };
    const outward = cardinal(direction(points[0]!, points[1]!));
    const inward = cardinal(direction(points.at(-2)!, points.at(-1)!));
    points[0] = snapBorder(sourceBox, points[0]!, outward);
    points[points.length - 1] = snapBorder(targetBox, points.at(-1)!, { x: -inward.x, y: -inward.y });
    if (points[0]!.x !== points[1]!.x && points[0]!.y !== points[1]!.y) {
      points.splice(1, 0, outward.x
        ? { x: Math.round((points[0]!.x + points[1]!.x) / 2), y: points[0]!.y }
        : { x: points[0]!.x, y: Math.round((points[0]!.y + points[1]!.y) / 2) });
    }
    const prior = points.at(-2)!;
    const endPoint = points.at(-1)!;
    if (prior.x !== endPoint.x && prior.y !== endPoint.y) {
      const clearance = unicode ? edge.targetMarker === 'none/unspecified' ? 1 : 2
        : edge.targetMarker === 'diamond/filled' ? 7
        : edge.targetMarker === 'triangle/open' ? 4
          : edge.targetMarker === 'arrow/open' ? 2 : 1;
      const approach = move(endPoint, { x: -inward.x, y: -inward.y }, clearance);
      const outerBend = inward.x ? { x: approach.x, y: prior.y }
        : { x: prior.x, y: approach.y };
      points.splice(points.length - 1, 0, outerBend, approach);
    }
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1]!;
      const end = points[index]!;
      if (start.x === end.x || start.y === end.y) continue;
      const candidates = [{ x: end.x, y: start.y }, { x: start.x, y: end.y }];
      const clear = (from: Point, to: Point): boolean => {
        const step = direction(from, to);
        for (let offset = 1; offset < length(from, to); offset++) {
          const position = key(move(from, step, offset));
          if (nodeMask.has(position) || reserved.has(position)) return false;
        }
        return true;
      };
      const bend = candidates.find((candidate) => !nodeMask.has(key(candidate)) &&
        !reserved.has(key(candidate)) && clear(start, candidate) && clear(candidate, end));
      if (!bend) fail('character.class.route.collision', 'Class relation has no clear orthogonal bend.', `edges.${edge.id}`);
      points.splice(index, 0, bend);
      index++;
    }
    for (let index = 1; index < points.length - 1;) {
      const before = points[index - 1]!;
      const at = points[index]!;
      const after = points[index + 1]!;
      if (before.x === at.x && at.x === after.x ||
          before.y === at.y && at.y === after.y) {
        points.splice(index, 1);
      } else index++;
    }
    const cells = routeCells(points, unicode, edge.id);
    const ownReserved = new Set<string>();
    for (const [end, kind] of [['source', edge.sourceMarker], ['target', edge.targetMarker]] as const) {
      const border = end === 'source' ? points[0]! : points.at(-1)!;
      if (kind === 'none/unspecified') {
        const side = end === 'source' ? outward : { x: -inward.x, y: -inward.y };
        const join = unicode ? wallTeeGlyph029(side.x, side.y) : '+';
        cells.set(key(border), join);
        continue;
      }
      const outside = end === 'source' ? outward : { x: -inward.x, y: -inward.y };
      const marker = markerAt(kind, border, outside, unicode);
      const segmentLength = end === 'source' ? length(points[0]!, points[1]!)
        : length(points.at(-2)!, points.at(-1)!);
      if (segmentLength < marker.depth + 1) {
        fail('character.class.marker.clearance', 'Relation marker lacks a straight terminal segment.', `edges.${edge.id}.${end}End`);
      }
      if (unicode) cells.set(key(border), wallTeeGlyph029(outside.x, outside.y));
      else cells.delete(key(border));
      for (const position of marker.reserved) {
        cells.delete(position);
        ownReserved.add(position);
      }
      for (const [position, char] of marker.cells) cells.set(position, char);
      if (!unicode) diagnostics.push({ code: 'character.glyph.approximation', severity: 'warning',
        message: `${edge.id}: ${kind} at ${end} uses a compound cell marker.`, path: `edges.${edge.id}.${end}End` });
    }
    if (edge.type === 'inheritance' && edge.sourceMarker === 'none/unspecified' &&
        edge.targetMarker === 'none/unspecified') {
      const cue = placeCue(cells, points, '<<inherits>>', (point) => inGrid(point) &&
        !nodeMask.has(key(point)) && !reserved.has(key(point)) && grid[point.y]![point.x] === ' ');
      if (!cue) fail('character.class.cue.unplaced', 'Inheritance cue cannot be shown beside its route.', `edges.${edge.id}`);
      for (const position of cue) ownReserved.add(position);
    }
    for (const position of ownReserved) {
      const [x, y] = position.split(',').map(Number);
      if (!inGrid({ x: x!, y: y! }) || nodeMask.has(position) || reserved.has(position) ||
          grid[y!]![x!] !== ' ') {
        fail('character.class.route.collision', 'Relation footprint overlaps another element.', `edges.${edge.id}`);
      }
    }
    for (const [position, char] of cells) {
      const [x, y] = position.split(',').map(Number);
      const endpoint = position === key(points[0]!) || position === key(points.at(-1)!);
      if (!inGrid({ x: x!, y: y! }) || nodeMask.has(position) && !endpoint || reserved.has(position) ||
          grid[y!]![x!] !== ' ' && !endpoint) {
        fail('character.class.route.collision', `Relation ${edge.id} overlaps another element at (${x},${y}); node=${nodeMask.has(position)}, reserved=${reserved.has(position)}, previous=${grid[y!]?.[x!] ?? 'outside'}, source=${JSON.stringify(sourceBox)}, target=${JSON.stringify(targetBox)}, path=${JSON.stringify(points)}.`, `edges.${edge.id}`);
      }
      if (endpoint && !nodeMask.has(position)) fail('character.class.route.invalid', 'Relation endpoint misses class outline.', `edges.${edge.id}`);
      if (!char) fail('character.class.route.invalid', 'Empty relation cell.', `edges.${edge.id}`);
    }
    for (const position of ownReserved) reserved.add(position);
    for (const [position, char] of cells) {
      const [x, y] = position.split(',').map(Number);
      grid[y!]![x!] = char;
    }
  }
  const compacted = compactVerticalRuns(grid);
  let firstUsedRow = 0;
  while (firstUsedRow < compacted.length && compacted[firstUsedRow]!.every((cell) => cell === ' ')) firstUsedRow++;
  let lastUsedRow = compacted.length - 1;
  while (lastUsedRow >= firstUsedRow && compacted[lastUsedRow]!.every((cell) => cell === ' ')) lastUsedRow--;
  const pictureRows = compacted.slice(firstUsedRow, lastUsedRow + 1);
  if (pictureRows.length > MAX_ROWS || width * pictureRows.length > MAX_CELLS) {
    fail('character.limit.exceeded', `Class picture ${width}×${pictureRows.length} exceeds the final cell budget.`);
  }
  return { picture: pictureRows.map((row) => row.join('').trimEnd()).join('\n'), diagnostics };
}
