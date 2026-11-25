import { describe, expect, it } from 'vitest';
import { classifierPresentation, renderSvg, resolveEdgeAppearance, resolveRenderScene } from '../src/index.js';
import type { GraphIR } from '@graph-ir/core';

const graph: GraphIR = {
  version: '3.0.0', id: 'uml', profile: { id: 'uml', kind: 'class', version: '1.0.0' },
  metadata: { notation: 'uml-class' },
  nodes: [{
    id: 'Order', type: 'class', label: 'Order', position: { x: 0, y: 0 }, dimensions: { width: 220, height: 140 },
    classifier: { kind: 'class', name: 'Order', modifiers: ['abstract'], compartments: [
      { id: 'name', kind: 'name' },
      { id: 'attributes', kind: 'attributes', items: [{ id: 'a1', kind: 'attribute', visibility: 'private', name: 'id', type: 'UUID' }] },
      { id: 'operations', kind: 'operations', items: [{ id: 'o1', kind: 'operation', visibility: 'public', name: 'save', parameters: [], returnType: 'Void' }] },
    ] },
  }], edges: [],
};

describe('UML class shared rendering', () => {
  it('projects one classifier presentation into scene and SVG', () => {
    expect(classifierPresentation(graph.nodes[0].classifier)?.compartments.map((part) => part.rows))
      .toEqual([['- id: UUID'], ['+ save(): Void']]);
    expect(resolveRenderScene(graph).nodes[0].classifier?.abstract).toBe(true);
    const svg = renderSvg(graph);
    expect(svg).toContain('data-coral-classifier-name');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('- id: UUID');
    expect(svg).toContain('+ save(): Void');
  });

  it('sizes unbounded classifiers from their longest row and row count', () => {
    const expanded = structuredClone(graph);
    const attributes = expanded.nodes[0].classifier!.compartments.find((part) => part.kind === 'attributes');
    if (attributes?.kind === 'attributes') {
      attributes.items.push(...Array.from({ length: 8 }, (_, index) => ({
        id: `long-${index}`, kind: 'attribute' as const,
        name: `exceptionallyLongAttributeName${index}`, type: 'ExtremelyLongDomainType',
      })));
    }
    delete expanded.nodes[0].dimensions;
    const scene = resolveRenderScene(expanded).nodes[0];
    expect(scene.width).toBeGreaterThan(180);
    expect(scene.height).toBeGreaterThan(120);
    expanded.nodes[0].dimensions = { width: 90, height: 70 };
    expect(resolveRenderScene(expanded).nodes[0]).toMatchObject({ width: 90, height: 70 });
  });

  it('applies relation defaults below authored style and end markers', () => {
    const appearance = resolveEdgeAppearance({
      id: 'e', source: 'a', target: 'b', type: 'inheritance', style: { lineStyle: 'dotted' },
      targetEnd: { marker: { kind: 'none', fill: 'unspecified' }, navigability: 'navigable' },
    }, [], 'uml-class', '#000');
    expect(appearance.style.lineStyle).toBe('dotted');
    expect(appearance.target.marker?.kind).toBe('none');
    expect(appearance.target.navigability).toBe('navigable');
    const aggregation = resolveEdgeAppearance({
      id: 'a', source: 'whole', target: 'part', type: 'aggregation',
    }, [], 'uml-class', '#000');
    const composition = resolveEdgeAppearance({
      id: 'c', source: 'whole', target: 'part', type: 'composition',
    }, [], 'uml-class', '#000');
    expect(aggregation.source.marker).toEqual({ kind: 'diamond', fill: 'open' });
    expect(composition.source.marker).toEqual({ kind: 'diamond', fill: 'filled' });
  });
});
