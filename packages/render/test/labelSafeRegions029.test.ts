import { describe, expect, it } from 'vitest';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';
import { layoutNodeLabel } from '../src/text/sizing.js';
import { resolveFont } from '../src/text/fonts.js';
import { textInkVertical028 } from '../src/text/metrics.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

const source = '@diagram flowchart\na terminal as "Start"\nd io as "Send response"\ne document as "Receipt"\n';
describe('painted shape label areas', () => {
  it.each(['lowfi', 'hifi'] as const)('fits labels in the usable %s shape bodies', async style => {
    const { scene } = await completeSpatialSource029(source, style, 'DOWN');
    for (const id of ['a', 'd', 'e']) {
      const node = scene.nodes.find(node => node.node.id === id)!;
      const labels = scene.parts.filter(part => part.owner.id === id && part.role === 'node-label');
      expect(labels).toHaveLength(1);
      const bounds = labels[0].bounds;
      const ink = { ...bounds, x: bounds.x - scene.viewport.shiftX, y: bounds.y - scene.viewport.shiftY };
      expect(ink.x).toBeGreaterThan(node.x + 5);
      expect(ink.x + ink.width).toBeLessThan(node.x + node.width - 5);
      if (id === 'e') {
        expect(ink.y + ink.height).toBeLessThan(node.y + node.height * 0.62);
        expect(ink.y + ink.height / 2).toBeLessThan(node.y + node.height * 0.4);
      } else {
        expect(ink.y + ink.height / 2).toBeCloseTo(node.y + node.height / 2, 5);
        if (id === 'd') {
          expect(ink.x).toBeGreaterThan(node.x + node.width / 6);
          expect(ink.x + ink.width).toBeLessThan(node.x + node.width * 5 / 6);
        }
      }
    }
  });
  it.each(['lowfi', 'hifi'] as const)('keeps the BPMN Store label below the %s cylinder cap and architecture database label outside the canonical 72x56 glyph (DRQ-10 Option 2)', async style => {
    const bpmn = await completeSpatialSource029('@diagram bpmn\nstore dataStore [symbol: "bpmn-data-store"] as "Store"\n', style, 'DOWN');
    const bpmnNode = bpmn.scene.nodes[0];
    const bpmnBounds = bpmn.scene.parts.find(part => part.owner.id === 'store' && part.role === 'node-label')!.bounds;
    const bpmnInk = { ...bpmnBounds, x: bpmnBounds.x - bpmn.scene.viewport.shiftX, y: bpmnBounds.y - bpmn.scene.viewport.shiftY };
    expect(bpmnInk.y).toBeGreaterThan(bpmnNode.y + bpmnNode.height * 0.375 + 3);
    expect(bpmnInk.y + bpmnInk.height).toBeLessThan(bpmnNode.y + bpmnNode.height * 0.8125 - 3);

    const archRight = await completeSpatialSource029('@diagram architecture\nstore database as "Store"\n', style, 'RIGHT');
    const archRNode = archRight.scene.nodes[0];
    const archRBounds = archRight.scene.parts.find(part => part.owner.id === 'store' && part.role === 'node-label')!.bounds;
    const archRInk = { ...archRBounds, x: archRBounds.x - archRight.scene.viewport.shiftX, y: archRBounds.y - archRight.scene.viewport.shiftY };
    expect(archRInk.y).toBeGreaterThanOrEqual(archRNode.y + 56 + 4);
    expect(archRInk.y + archRInk.height).toBeLessThanOrEqual(archRNode.y + archRNode.height);

    const archDown = await completeSpatialSource029('@diagram architecture\nstore database as "Store"\n', style, 'DOWN');
    const archDNode = archDown.scene.nodes[0];
    const archDBounds = archDown.scene.parts.find(part => part.owner.id === 'store' && part.role === 'node-label')!.bounds;
    const archDInk = { ...archDBounds, x: archDBounds.x - archDown.scene.viewport.shiftX, y: archDBounds.y - archDown.scene.viewport.shiftY };
    expect(archDInk.x).toBeGreaterThanOrEqual(archDNode.x + 56);
    expect(archDInk.x + archDInk.width).toBeLessThanOrEqual(archDNode.x + archDNode.width);
  });
  it('centers actual Start glyph ink and preserves authored dimensions', () => {
    const font = resolveFont({ family: 'Coral Lowfi Caveat', size: 26, weight: 500, lineHeight: 1.4 });
    const layout = layoutNodeLabel({ text: 'Start', shapeId: 'stadium', sizingMode: 'adaptive',
      dimensions: { width: 180, height: 60 }, fontFamily: font.cssFamily, fontSize: font.size,
      fontWeight: font.weight, lineHeight: font.lineHeight });
    const ink = textInkVertical028('Start', font);
    expect(layout.baselines[0] + (ink.descent - ink.ascent) * font.size / 2).toBeCloseTo(30, 8);
    const graph = { version: '3.0.0' as const, id: 'authored', metadata: { notation: 'flowchart' }, nodes: [
      { id: 'a', type: 'terminal', label: 'Start', dimensions: { width: 180, height: 60 } },
    ], edges: [] };
    const scene = prepareSpatialScene028(graph, { style: 'lowfi' });
    expect(scene.nodes[0]).toMatchObject({ width: 180, height: 60 });
    expect(graph.nodes[0].dimensions).toEqual({ width: 180, height: 60 });
  });
});
