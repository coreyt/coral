import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028, successorSourceDisplayWithSemanticPorts028 } from '../src/index.js';
import { resolveSpatialLayout } from '../src/layout/index.js';
import type { GraphIR } from '@graph-ir/core';
import { layoutGraphForSvg } from '../src/svg/layout.js';

const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/block-cycle.coral', import.meta.url), 'utf8');
describe('CR-101 generated block feedback', () => {
  for (const style of ['lowfi', 'hifi'] as const) for (const direction of ['RIGHT', 'LEFT'] as const) {
    it('uses one clear exterior baseline while retaining authored E/W contacts in '+style+'/'+direction, async () => {
      const projected = projectInstalledSourceToSuccessor028(source);
      const before = JSON.stringify(projected.graph);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations, svgOptions: { style } });
      const section = laid.edgeRoutes.get('edge-3')![0];
      const sink = laid.nodes.find(({ id }) => id === 'sink')!;
      const producer = laid.nodes.find(({ id }) => id === 'producer')!;
      expect(section.startPoint.x).toBeCloseTo(sink.position!.x + sink.dimensions!.width);
      expect(section.endPoint.x).toBeCloseTo(producer.position!.x);
      if (direction === 'RIGHT') {
        expect(section.bendPoints).toHaveLength(4);
        expect(section.bendPoints[1].y).toBe(section.bendPoints[2].y);
        expect(section.bendPoints[0].x).toBeGreaterThan(section.startPoint.x);
        expect(section.bendPoints.at(-1)!.x).toBeLessThan(section.endPoint.x);
      } else {
        // Under 0.2.11 BRANDES_KOEPF, LEFT aligns sink and producer directly (0 bends) or via a clean 2-bend return.
        expect(section.bendPoints.length).toBeLessThanOrEqual(2);
        if (section.bendPoints.length > 0) {
          expect(section.bendPoints[0].x).toBeGreaterThan(section.startPoint.x);
          expect(section.bendPoints.at(-1)!.x).toBeLessThan(section.endPoint.x);
        }
      }
      expect(JSON.stringify(projected.graph)).toBe(before);
    });
  }
});


describe('CR-101 conservative staircase fallback', () => {
  it.each(['clear', 'blocked', 'parallel', 'pinned', 'authored'] as const)(
    'preserves engine contacts and honors %s restrictions', async (mode) => {
      const frames = [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
        ...(mode === 'blocked' ? [
          { id: 'upper', x: 200, y: 85, width: 20, height: 10 },
          { id: 'lower', x: 400, y: 93, width: 20, height: 10 },
        ] : []),
      ];
      const bendPoints = [{ x: 520, y: 30 }, { x: 520, y: 90 },
        { x: 350, y: 90 }, { x: 350, y: 100 }, { x: 150, y: 100 },
        { x: 150, y: 95 }, { x: -20, y: 95 }, { x: -20, y: 30 }];
      const input: GraphIR = { version: '3.0.0', id: 'block-control',
        metadata: { notation: 'block' },
        nodes: frames.map(({ id, x, y, width, height }) => ({ id, type: 'block',
          dimensions: { width, height },
          ...(mode === 'pinned' ? { position: { x, y }, pinned: true } : {}),
          ports: [{ id: 'in', side: 'WEST', position: 0.5 },
            { id: 'out', side: 'EAST', position: 0.5 }] })),
        edges: [{ id: 'forward', source: 'a', target: 'b' },
          { id: 'return', source: 'b', target: 'a', sourcePort: 'out', targetPort: 'in',
            ...(mode === 'authored' ? { routeIntent: { waypoints: [
              { id: 'via', placement: { kind: 'absolute', position: { x: 520, y: 160 } } },
              { id: 'returnLane', placement: { kind: 'absolute', position: { x: -20, y: 160 } } },
              { id: 'arrival', placement: { kind: 'absolute', position: { x: -20, y: 30 } } },
            ] } } : {}) },
          ...(mode === 'parallel' ? [{ id: 'other', source: 'b', target: 'a' }] : [])] };
      const before = structuredClone(input);
      const result = await resolveSpatialLayout({ graph: input, revision: mode,
        operation: 'load', defaults: { algorithm: 'layered', direction: 'RIGHT' },
        candidateLayout: { nodes: frames.map(({ id, x, y, width, height }) => ({ id,
          position: { x, y }, absolutePosition: { x, y }, width, height })),
          edges: [{ id: 'return', sections: [{ startPoint: { x: 500, y: 30 },
            endPoint: { x: 0, y: 30 }, bendPoints }] }],
          width: 550, height: 180, effectiveOptions: {}, diagnostics: [] } });
      const route = result.edges.find(({ id }) => id === 'return')!;
      expect(input).toEqual(before);
      expect(route.sections[0].startPoint).toEqual({ x: 500, y: 30 });
      expect(route.sections.at(-1)!.endPoint).toEqual({ x: 0, y: 30 });
      if (mode === 'clear') {
        expect(route.sections[0].bendPoints).toHaveLength(4);
        expect(route.sections[0].bendPoints[1].y).toBe(100);
      }
      else if (mode === 'authored') expect(route.waypointIds).toEqual(['via', 'returnLane', 'arrival']);
      else expect(route.sections[0].bendPoints).toEqual(bendPoints);
    });
});
