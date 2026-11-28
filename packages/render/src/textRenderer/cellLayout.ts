import { computeElkLayout } from '../layout/engine.js';
import type { Settings } from './format.js';
import type { TextScene } from './types.js';

/** Try a single horizontal picture for compact comments. If a caption or
 * orthogonal section would overwrite another mark, use vertical bands. */
export async function compactLayout(scene: TextScene, cfg: Settings): Promise<TextScene> {
  if (cfg.profile !== 'comment' || cfg.density !== 'compact' || scene.bands.length < 2 ||
      scene.bands.some(b => b.frames.length) || scene.repeated.length || !scene.edges.length) return scene;
  const nodes = scene.bands.map(b => ({ id: b.id, width: Math.max(...b.rows.map(r => r.length)), height: b.rows.length }));
  // A horizontal layer needs at least the widest node and its label corridor.
  const gap = Math.max(3, ...scene.edges.map(e => e.label.length + e.marker.length + 3));
  if (gap + Math.max(...nodes.map(n => n.width)) > cfg.width) return scene;
  const layout = await computeElkLayout({ id: 'text', nodes, edges: scene.edges,
    defaults: { algorithm: 'layered', direction: 'RIGHT', edgeRouting: 'ORTHOGONAL',
      spacing: { nodeNode: 2, nodeEdge: 1, edgeEdge: 1, layerSpacing: gap },
      elkOptions: { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' } } });
  const x0 = Math.min(...layout.nodes.map(n => n.absolutePosition.x)), y0 = Math.min(...layout.nodes.map(n => n.absolutePosition.y));
  const width = Math.max(...layout.nodes.map(n => Math.round(n.absolutePosition.x - x0) + n.width));
  const height = Math.max(...layout.nodes.map(n => Math.round(n.absolutePosition.y - y0) + n.height));
  if (width > cfg.width || height > cfg.height || height > scene.bands.reduce((n, b) => n + b.rows.length, 0)) return scene;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(''));
  const put = (x: number, y: number, ch: string) => {
    if (x < 0 || y < 0 || x >= width || y >= height || grid[y][x]) return false;
    grid[y][x] = ch; return true;
  };
  for (const n of layout.nodes) {
    const band = scene.bands.find(b => b.id === n.id)!;
    band.rows.forEach((line, row) => [...line].forEach((ch, col) =>
      put(Math.round(n.absolutePosition.x - x0) + col, Math.round(n.absolutePosition.y - y0) + row, ch)));
  }
  for (const route of layout.edges) {
    const edge = scene.edges.find(e => e.id === route.id)!;
    if (route.sections.length !== 1) return scene;
    const s = route.sections[0];
    const points = [s.startPoint, ...s.bendPoints, s.endPoint].map(p => ({ x: Math.floor(p.x - x0), y: Math.floor(p.y - y0) }));
    let caption = edge.label;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      if (dx && dy) return scene;
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (caption && dx && dist >= caption.length + 2) {
        const left = Math.min(a.x, b.x) + 1;
        if (![...caption].every((c, j) => put(left + j, a.y - 1, c))) return scene;
        caption = '';
      }
      for (let j = 0; j < dist; j++) {
        const last = i === points.length - 1 && j === dist - 1;
        const ch = last ? (edge.marker || (dx > 0 ? cfg.glyph.right : dx < 0 ? cfg.glyph.left : cfg.glyph.down)) :
          i > 1 && j === 0 ? '+' : dx ? cfg.glyph.h : cfg.glyph.v;
        if (ch.length !== 1 || !put(a.x + j * dx, a.y + j * dy, ch)) return scene;
      }
    }
    if (caption) return scene;
  }
  const rows = grid.map(row => row.map(c => c || ' ').join('').trimEnd());
  return { ...scene, edges: [], bands: [{ id: scene.bands[0].id, frames: [], rows, notes: scene.bands.flatMap(b => b.notes) }] };
}
