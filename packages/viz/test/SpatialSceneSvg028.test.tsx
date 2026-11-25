import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { prepareSpatialScene028, renderSvg } from '@coral-viz/render';
import { SpatialSceneSvg028 } from '../src/components/SpatialSceneSvg028.js';

const drawing = {
  id: 'shared', metadata: { notation: 'flowchart' },
  nodes: [
    { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', label: 'Start',
      position: { x: 20, y: 20 }, dimensions: { width: 130, height: 64 } },
    { id: 'check', type: 'decision', symbol: 'flowchart-decision', label: 'Ready?',
      position: { x: 240, y: 20 }, dimensions: { width: 150, height: 100 } },
  ],
  edges: [{ id: 'next', source: 'start', target: 'check', label: 'yes',
    targetEnd: { marker: { kind: 'arrow' as const, fill: 'open' as const } } }],
};

describe('React spatial scene projection', () => {
  it('paints the same owned parts, order, text and route geometry as SVG export', () => {
    for (const style of ['lowfi', 'hifi'] as const) {
      const scene = prepareSpatialScene028(drawing, { style });
      const react = renderToStaticMarkup(<SpatialSceneSvg028 scene={scene} namespace="react-a" />);
      const exported = renderSvg(drawing, { style });
      const ids = (markup: string) => [...markup.matchAll(/data-coral-part-id="([^"]+)"/g)]
        .map((match) => match[1]);
      expect(ids(react)).toEqual(ids(exported));
      for (const part of scene.parts) {
        if (part.geometry.kind === 'route') {
          expect(react).toContain(`d="${part.geometry.d}"`);
          expect(exported).toContain(`d="${part.geometry.d}"`);
        }
        if (part.geometry.kind === 'text') {
          expect(react).toContain(part.geometry.text);
          expect(exported).toContain(part.geometry.text);
        }
      }
      expect(react).toContain('data-coral-marker-contact=');
    }
  });

  it.each(['lowfi', 'hifi'] as const)('projects exact centered multiline labels with a shared background in %s', (style) => {
    const graph = { ...drawing, nodes: drawing.nodes.map((node, index) => ({ ...node,
      position: { x: index * 700, y: 100 } })), edges: [{ ...drawing.edges[0],
      label: 'Review\nrequest', labelPlacement: { side: 'center' as const, at: .25 } }] };
    const scene = prepareSpatialScene028(graph, { style });
    const react = renderToStaticMarkup(<SpatialSceneSvg028 scene={scene} namespace="placed" />);
    const exported = renderSvg(graph, { style });
    for (const markup of [react, exported]) {
      expect(markup).toContain('data-coral-label-background="next:label"');
      expect(markup).toMatch(/<tspan[^>]*>Review<\/tspan>/);
      expect(markup).toMatch(/<tspan[^>]*>request<\/tspan>/);
    }
    const label = scene.parts.find((part) => part.id === 'next:label')!;
    if (label.geometry.kind !== 'text') throw new Error('missing text');
    for (const markup of [react, exported]) expect(markup).toContain(`x="${label.geometry.x}" y="${label.geometry.y}"`);
  });

  it('namespaces marker definitions independently for two scene instances', () => {
    const scene = prepareSpatialScene028(drawing, { style: 'hifi' });
    const first = renderToStaticMarkup(<SpatialSceneSvg028 scene={scene} namespace="first" />);
    const second = renderToStaticMarkup(<SpatialSceneSvg028 scene={scene} namespace="second" />);
    expect(first).toContain('id="first-coral-marker-');
    expect(first).toContain('marker-end="url(#first-coral-marker-');
    expect(second).toContain('id="second-coral-marker-');
    expect(second).toContain('marker-end="url(#second-coral-marker-');
    expect(first).not.toContain('id="second-coral-marker-');
  });

  it('gives a standalone scene an accessible title and optional description', () => {
    const scene = prepareSpatialScene028(drawing, { style: 'hifi' });
    const markup = renderToStaticMarkup(<SpatialSceneSvg028 scene={scene}
      namespace="accessible" title="Approval flow" description="Two steps and one connector" />);
    expect(markup).toContain('aria-labelledby="accessible-title"');
    expect(markup).toContain('<title id="accessible-title">Approval flow</title>');
    expect(markup).toContain('aria-describedby="accessible-description"');
    expect(markup).toContain('<desc id="accessible-description">Two steps and one connector</desc>');
  });
});
