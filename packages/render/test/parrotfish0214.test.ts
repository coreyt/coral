import { describe, expect, it } from 'vitest';
import {
  ANEMONE_MODEL_0214,
  PARROTFISH_MODEL_0215,
  normalizeRenderStyle0214,
  parrotfish,
  prepareSpatialScene028,
  projectInstalledSourceToSuccessor028,
  renderSvg,
  resolveParrotfishModel,
  successorSequenceDisplay028,
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
    // Default monochrome hifi must NOT emit Anemone v2 canvas, elevation, or tinted surfaces
    expect(hifiSvg).not.toContain('#f8fafc');
    expect(hifiSvg).not.toContain('anemone-shadow-sm');
    expect(hifiSvg).not.toContain('anemone-dots');
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
    // Anemone v2: Studio Paper canvas + dot grid, soft shadows, restrained semantic borders/accents, layered container tint
    expect(aneFull).toContain('#f8fafc');
    expect(aneFull).toContain('anemone-shadow-sm');
    expect(aneFull).toContain('anemone-dots');
    expect(aneFull).toContain('#be123c');
    expect(aneFull).toContain('#a5f3fc');
    expect(aneFull).toContain('#fde68a');
    expect(aneFull).toContain('#e9d5ff');
    expect(aneFull).toContain('#f1f5f9');
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
    expect(darkResult.svg).toContain('fill="#0b101b"');
    expect(darkResult.svg).toContain('#22d3ee');
    expect(darkResult.svg).toContain('anemone-shadow-sm');
  });

  it('uses the dedicated warm tactile sketch register for @diagram sketch in anemone', async () => {
    const SKETCH_SAMPLE = `@diagram sketch
@coralVersion "0.2.14"
idea step as "Rough Idea"
check decision as "Looks right?"
ship step as "Commit SVG"
idea -> check as "draft"
check -> ship as "Yes"
`;
    const { laid, display, successorSource } = await layoutSample(SKETCH_SAMPLE, 'hifi');
    const svg = renderSvg(laid, {
      renderStyle: 'anemone',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    expect(svg).toContain('fill="#faf8f4"');
    expect(svg).toContain('fill="#e0f2fe"');
    expect(svg).toContain('fill="#fef3c7"');
    expect(svg).toContain('stroke="#1e293b"');
  });

  it('parrotfish preset applies classic lavender/butter styling to non-UML diagrams without altering geometry', async () => {
    expect(resolveParrotfishModel('parrotfish')).toBe(PARROTFISH_MODEL_0215);
    expect(resolveParrotfishModel('pf')).toBe(PARROTFISH_MODEL_0215);

    const { laid, display, successorSource } = await layoutSample(ARCH_SAMPLE, 'hifi');
    const baseScene = prepareSpatialScene028(laid, {
      style: 'hifi',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    const res = parrotfish(baseScene, 'pf', { theme: 'light' });
    expect(res.modelName).toBe('parrotfish');

    // Geometry invariants preserved identically
    expect(res.scene.viewport).toEqual(baseScene.viewport);
    expect(res.scene.bounds).toEqual(baseScene.bounds);
    expect(res.scene.portContacts).toEqual(baseScene.portContacts);

    // Classic non-UML palette: lavender nodes, mediumpurple borders, butter solid clusters, gray edge labels, no left stripes
    expect(res.svg).toContain('fill="#ececff"');
    expect(res.svg).toContain('stroke="#9370db"');
    expect(res.svg).toContain('fill="#ffffde"');
    expect(res.svg).toContain('stroke="#aaaa33"');
    expect(res.svg).toContain('stroke="#333333"');
    expect(res.svg).toContain('fill="#e8e8e8"');
    expect(res.svg).not.toContain('parrotfish-accent');
    // Container border must be solid (not dashed)
    const platformChunk = res.svg.slice(res.svg.indexOf('data-coral-node="platform"'), res.svg.indexOf('data-coral-edge="e1"'));
    expect(platformChunk).not.toContain('stroke-dasharray');

    // Dark variant
    const darkRes = parrotfish(baseScene, 'parrotfish', { theme: 'dark' });
    expect(darkRes.svg).toContain('fill="#1f2020"');
    expect(darkRes.svg).toContain('stroke="#81b1db"');
  });

  it('parrotfish preset switches to classic parchment-and-maroon styling on UML Class diagrams', async () => {
    const UML_CLASS_SAMPLE = `@diagram uml-class
Order class as "Order" {
  attributes {
    + id: UUID
  }
  operations {
    + total(): Money
  }
}
Payable interface as "Payable" {
  operations {
    + charge(): Receipt
  }
}
e1 = Order -> Payable [realization] as "implements"
`;
    const { laid, display, successorSource } = await layoutSample(UML_CLASS_SAMPLE, 'hifi');
    const baseScene = prepareSpatialScene028(laid, {
      style: 'hifi',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    const res = parrotfish(baseScene, 'parrotfish', { theme: 'light' });
    expect(res.scene.viewport).toEqual(baseScene.viewport);
    expect(res.scene.portContacts).toEqual(baseScene.portContacts);

    // Classic UML palette: parchment cream boxes, deep maroon strokes/dividers/arrows, black ink, zero lavender
    expect(res.svg).toContain('fill="#fefece"');
    expect(res.svg).toContain('stroke="#a80036"');
    expect(res.svg).toContain('fill="#000000"');
    expect(res.svg).not.toContain('#ececff');
    expect(res.svg).not.toContain('parrotfish-accent');
  });

  it('parrotfish preset styles UML Sequence diagrams with classic parchment, maroon, and yellow notes', () => {
    const SEQ_SAMPLE = `@diagram uml-sequence
client participant as "Client"
api participant as "Order API"
m1 = client -> api [sync] as "POST /orders"
note "Idempotent 24h" on api
m2 = api -.-> client [return] as "201 Created"
`;
    const projected = projectInstalledSourceToSuccessor028(SEQ_SAMPLE);
    const seqGraph = successorSequenceDisplay028(projected.graph!);
    const res = parrotfish(seqGraph, 'pf', { theme: 'light' });
    expect(res.modelName).toBe('parrotfish');
    expect(res.scene.kind).toBe('sequence');
    expect(res.svg).toContain('fill="#fefece"');
    expect(res.svg).toContain('stroke="#a80036"');
    expect(res.svg).toContain('fill="#fbfb77"');
    expect(res.svg).toContain('fill="#000000"');
    expect(res.svg).not.toContain('#ececff');

    // Direct renderSvg option parity
    const directSvg = renderSvg(seqGraph, { style: 'hifi', parrotfish: 'parrotfish' });
    expect(directSvg).toBe(res.svg);
  });

  it('parrotfish preset styles 0.2.17 UML State markers, notes, annotations, sketch labels, and BPMN end rings', async () => {
    const STATE_0217 = `@diagram uml-state
@coralVersion "0.2.17"
start initial
idle state as "Idle"
fork1 fork
running state as "Running"
done final
n1 note as "Check"
start -> idle
idle -> fork1
fork1 -> running
running -> done
n1 -.- running [annotation]
`;
    const { laid, display, successorSource } = await layoutSample(STATE_0217, 'hifi');
    const baseScene = prepareSpatialScene028(laid, {
      style: 'hifi',
      notation: 'uml-state',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource,
    });
    const light = parrotfish(baseScene, 'parrotfish', { theme: 'light' });
    expect(light.svg).toMatch(/data-coral-part-id="start:outline"[^>]*fill="#222222"[^>]*stroke="#222222"/);
    expect(light.svg).toMatch(/data-coral-part-id="fork1:outline"[^>]*fill="#222222"[^>]*stroke="#222222"/);
    expect(light.svg).toMatch(/data-coral-part-id="done:outline"[^>]*fill="#ffffff"[^>]*stroke="#222222"/);
    expect(light.svg).toMatch(/data-coral-part-id="done:inner-outline"[^>]*fill="#222222"/);
    expect(light.svg).toMatch(/data-coral-part-id="idle:outline"[^>]*fill="#fefece"[^>]*stroke="#a80036"/);
    expect(light.svg).toMatch(/data-coral-part-id="n1:outline"[^>]*fill="#fbfb77"[^>]*stroke="#a80036"/);
    expect(light.svg).toContain('stroke-dasharray="4 3"');

    const dark = parrotfish(baseScene, 'pf', { theme: 'dark' });
    expect(dark.svg).toMatch(/data-coral-part-id="start:outline"[^>]*fill="#d46a84"[^>]*stroke="#d46a84"/);
    expect(dark.svg).toMatch(/data-coral-part-id="done:outline"[^>]*fill="#1b1b1b"[^>]*stroke="#d46a84"/);
    expect(dark.svg).toMatch(/data-coral-part-id="done:inner-outline"[^>]*fill="#d46a84"/);

    // Sketch labels stay borderless and unboxed in parrotfish preset
    const SKETCH_SAMPLE = `@diagram sketch
a box as "Idea"
lbl label as "Loose Note"
a -> lbl
`;
    const sketchLay = await layoutSample(SKETCH_SAMPLE, 'hifi');
    const sketchScene = prepareSpatialScene028(sketchLay.laid, {
      style: 'hifi',
      notation: 'sketch',
      edgeRoutes: sketchLay.laid.edgeRoutes,
      semanticGraph: sketchLay.display,
      successorSource: sketchLay.successorSource,
    });
    const sketchPf = parrotfish(sketchScene, 'parrotfish', { theme: 'light' });
    expect(sketchPf.svg).toMatch(/data-coral-part-id="lbl:outline"[^>]*fill="none"[^>]*stroke="none"/);

    // BPMN end events keep thick outer ring in parrotfish preset
    const BPMN_SAMPLE = `@diagram bpmn
s start as "Start"
t task as "Work"
e end as "End"
s -> t
t -> e
`;
    const bpmnLay = await layoutSample(BPMN_SAMPLE, 'hifi');
    const bpmnScene = prepareSpatialScene028(bpmnLay.laid, {
      style: 'hifi',
      notation: 'bpmn',
      edgeRoutes: bpmnLay.laid.edgeRoutes,
      semanticGraph: bpmnLay.display,
      successorSource: bpmnLay.successorSource,
    });
    const bpmnPf = parrotfish(bpmnScene, 'parrotfish', { theme: 'light' });
    const startPart = bpmnPf.scene.parts.find((p) => p.id === 's:outline');
    const endPart = bpmnPf.scene.parts.find((p) => p.id === 'e:outline');
    expect(startPart?.geometry.kind).toBe('stencil-path');
    expect(endPart?.geometry.kind).toBe('stencil-path');
    if (startPart?.geometry.kind === 'stencil-path' && endPart?.geometry.kind === 'stencil-path') {
      expect(endPart.geometry.strokeWidth * endPart.geometry.transform.scale).toBeCloseTo(3, 4);
      expect(startPart.geometry.strokeWidth * startPart.geometry.transform.scale).toBeCloseTo(1.5, 4);
    }
  });
});
