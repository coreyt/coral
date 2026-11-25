import { describe, expect, it } from 'vitest';
import {
  ANEMONE_MODEL_0214,
  normalizeRenderStyle0214,
  parrotfish,
  prepareSpatialScene028,
  projectInstalledSourceToSuccessor028,
  renderSvg,
  resolveParrotfishModel,
  successorSourceDisplayWithSemanticPorts028,
  type ParrotfishModel,
} from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

const ARCH_SAMPLE = `@diagram architecture
shopper actor as "Shopper"
stripe service as "Stripe"
platform group as "E-Commerce System" {
  web service as "Web Storefront"
  api service as "Order Service"
  db database as "Orders DB"
  events queue as "Order Events"
}
e1 = shopper -> platform.web [calls] as "Browses"
e2 = platform.web -> platform.api [calls] as "Submits"
e3 = platform.api -> platform.db [reads] as "Persists"
e4 = platform.api -> platform.events [async] as "Publishes"
e5 = platform.api -> stripe [calls] as "Charges"
`;

async function layoutSample(source: string, style: 'lowfi' | 'hifi' = 'hifi') {
  const projected = projectInstalledSourceToSuccessor028(source);
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
  const laid = await layoutGraphForSvg(display, {
    direction: 'RIGHT',
    svgOptions: { style },
    semanticInterpretations,
  });
  return { laid, display, successorSource: projected.graph! };
}

describe('0.2.14 Anemone peer output style & Parrotfish modeled renderer', () => {
  it('normalizes lowfi, hifi, anemone, and ane shorthand while reserving thx', () => {
    expect(normalizeRenderStyle0214('lowfi')).toBe('lowfi');
    expect(normalizeRenderStyle0214('hifi')).toBe('hifi');
    expect(normalizeRenderStyle0214('anemone')).toBe('anemone');
    expect(normalizeRenderStyle0214('ane')).toBe('anemone');
    expect(() => normalizeRenderStyle0214('thx')).toThrow(/thx is reserved/);
  });

  it('keeps default lowfi and hifi outputs monochrome black-and-white', async () => {
    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE, 'hifi');
    const hifiSvg = renderSvg(laid, {
      style: 'hifi',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    expect(hifiSvg).toContain('fill="#ffffff"');
    expect(hifiSvg).toContain('stroke="#22272b"');
    // Default monochrome hifi must NOT emit Anemone tinted surfaces
    expect(hifiSvg).not.toContain('#f0fdfa');
    expect(hifiSvg).not.toContain('#fff1f2');
    expect(hifiSvg).not.toContain('#fffbeb');
  });

  it('renders anemone and its ane shorthand identically as a peer to hifi/lowfi', async () => {
    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE, 'hifi');
    const common = {
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    };
    const aneFull = renderSvg(laid, { ...common, renderStyle: 'anemone' });
    const aneShort = renderSvg(laid, { ...common, renderStyle: 'ane' });
    expect(aneShort).toBe(aneFull);
    // Anemone distinguishes roles semantically (actor coral stroke, service teal, db amber, queue violet, container dashed tint)
    expect(aneFull).toContain('#be123c');
    expect(aneFull).toContain('#f0fdfa');
    expect(aneFull).toContain('#fffbeb');
    expect(aneFull).toContain('#f5f3ff');
    expect(aneFull).toContain('#f4f7fb');
  });

  it.each(['hifi', 'anemone'] as const)('paints containers behind connectors in %s on shared scenes and SVG', async (renderStyle) => {
    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE);
    const common = { renderStyle, edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource };
    const scene = prepareSpatialScene028(laid, common);
    const svg = renderSvg(laid, common);
    const containerIds = new Set(scene.resolved.nodes.filter((node) => node.container).map((node) => node.id));
    const firstEdge = scene.parts.findIndex((part) => part.owner.kind === 'edge');
    const lastContainer = scene.parts.findLastIndex((part) => part.owner.kind === 'node' && containerIds.has(part.owner.id));
    expect(lastContainer).toBeGreaterThanOrEqual(0);
    expect(firstEdge).toBeGreaterThan(lastContainer);
    const serializedIds = [...svg.matchAll(/data-coral-part-id="([^"]+)"/g)].map((match) => match[1]);
    expect(serializedIds).toEqual(scene.parts.map((part) => part.id));
    expect(svg.indexOf('data-coral-node="platform"')).toBeLessThan(svg.indexOf('data-coral-edge="e1"'));
  });

  it('parrotfish preserves exact layout, flow, and routing geometry while transforming only presentation', async () => {
    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE, 'hifi');
    const baseScene = prepareSpatialScene028(laid, {
      style: 'hifi',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    const customModel: ParrotfishModel = {
      name: 'reef-custom',
      extends: 'ane',
      light: { background: '#fafaf9', containerFill: '#eef2f6' },
      nodes: {
        'platform.api': { fill: '#e0f2fe', stroke: '#0284c7', accentColor: '#0369a1', accentPosition: 'top' },
      },
      edges: {
        e5: { stroke: '#dc2626', strokeWidth: 2.5, dash: '4 3' },
      },
      symbols: {
        'platform.api': {
          name: 'Custom API badge',
          viewBox: '0 0 24 24',
          paths: [{ d: 'M4 12 L12 4 L20 12 L12 20 Z', filled: true }],
        },
      },
    };
    const result = parrotfish(baseScene, customModel, { theme: 'light' });
    expect(result.modelName).toBe('reef-custom');
    expect(result.theme).toBe('light');

    // Geometry invariants: viewport, bounds, node frames, port contacts, and edge routes MUST stay identical
    expect(result.scene.viewport).toEqual(baseScene.viewport);
    expect(result.scene.bounds).toEqual(baseScene.bounds);
    expect(result.scene.portContacts).toEqual(baseScene.portContacts);
    expect(result.scene.nodes.map((n) => ({ id: n.node.id, x: n.x, y: n.y, w: n.width, h: n.height }))).toEqual(
      baseScene.nodes.map((n) => ({ id: n.node.id, x: n.x, y: n.y, w: n.width, h: n.height })),
    );
    const routePathMap = (s: typeof baseScene) => s.parts
      .filter((p) => p.geometry.kind === 'route')
      .map((p) => [p.id, p.geometry.kind === 'route' ? p.geometry.d : '']);
    expect(routePathMap(result.scene)).toEqual(routePathMap(baseScene));

    // Presentation overrides took effect in SVG
    expect(result.svg).toContain('fill="#fafaf9"');
    expect(result.svg).toContain('fill="#e0f2fe"');
    expect(result.svg).toContain('stroke="#0284c7"');
    expect(result.svg).toContain('stroke="#dc2626"');
    expect(result.svg).toContain('stroke-dasharray="4 3"');
    expect(result.svg).toContain('M4 12 L12 4 L20 12 L12 20 Z');
  });

  it('supports dark theme in anemone and resolves preset aliases cleanly', async () => {
    expect(resolveParrotfishModel('ane')).toBe(ANEMONE_MODEL_0214);
    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE, 'hifi');
    const darkResult = parrotfish(laid, 'ane', {
      theme: 'dark',
      svgOptions: { edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource },
    });
    expect(darkResult.theme).toBe('dark');
    expect(darkResult.svg).toContain('fill="#0f172a"');
    expect(darkResult.svg).toContain('#2dd4bf');
  });
});
