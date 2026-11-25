import { beforeEach, describe, expect, it, vi } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028, verifyPortableSuccessorSource028 } from '@coral-viz/render';

const layoutRequests = vi.hoisted(() => [] as Array<{ nodes: Array<Record<string, unknown>> }>);
const refuseLabelled = vi.hoisted(() => ({ on: false }));
vi.mock('../src/layoutWorkerClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/layoutWorkerClient')>();
  return { ...actual, runEditorLayout: vi.fn(async (request: never, options: never) => {
    layoutRequests.push(structuredClone(request));
    if (refuseLabelled.on && JSON.stringify(request).includes('outsideLabel029')) {
      const { LayoutExecutionError } = await import('@coral-viz/render/layout');
      throw new LayoutExecutionError({ code: 'layout.engine.failed', severity: 'error', message: 'refused' });
    }
    return actual.runEditorLayout(request, options);
  }) };
});
const resolverRequests = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@coral-viz/render/layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/render/layout')>();
  return { ...actual, resolveSpatialLayout: vi.fn(async (request: never) => {
    resolverRequests.push(request);
    return actual.resolveSpatialLayout(request);
  }) };
});

import { layoutNodes } from '../src/hooks/diagramUtils.js';

// C4 revision 6 (c4-design.md "Reservation in layout"): the editor's ELK
// request reserves a user symbol's definition label side with the same helper
// as the SVG path and lays out again without it when the reserved layout fails.

const SOURCE = (side: string) => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', `  label ${side}`, '  outline ellipse', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'p service', 'a service [symbol: "local.probe"] as "Auth gateway"', 'q service', 'p -> a', 'a -> q',
  'p -> q', ''].join('\n');

async function editorLayout(side: string, positioned = false) {
  const meaning = verifyPortableSuccessorSource028(SOURCE(side)).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
  const nodes = positioned ? display.nodes.map((node, index) => ({ ...node, position: { x: index * 200, y: 40 } })) : display.nodes;
  const laid = await layoutNodes(nodes, display.edges, 'architecture', { algorithm: 'layered', direction: 'RIGHT' },
    positioned, undefined, undefined, [], positioned ? 'incremental' : 'load', semanticInterpretations);
  return { laid, display };
}
const requestNode = (index: number, id: string) => layoutRequests[index]!.nodes.find((node) => node.id === id)!;

beforeEach(() => {
  layoutRequests.length = 0;
  resolverRequests.length = 0;
  refuseLabelled.on = false;
});

describe('editor layout reserves the definition label side', () => {
  it('puts the outside label in the ELK request', async () => {
    await editorLayout('above');
    expect(layoutRequests).toHaveLength(1);
    const label = requestNode(0, 'a').outsideLabel029 as { side: string; width: number; height: number };
    expect(label.side).toBe('above');
    expect(requestNode(0, 'p')).not.toHaveProperty('outsideLabel029');
  });

  it('makes room: the bypassing connector clears the reserved label', async () => {
    const { laid } = await editorLayout('above');
    const label = requestNode(0, 'a').outsideLabel029 as { width: number; height: number };
    const a = laid.nodes.find((node) => node.id === 'a')!;
    const box = { x: a.position.x + 30 - label.width / 2, y: a.position.y - label.height, width: label.width, height: label.height };
    const bypass = laid.edgeRouting.get('edge-3')!;
    for (const point of [bypass.startPoint, ...bypass.bendPoints, bypass.endPoint].filter(Boolean) as Array<{ x: number; y: number }>)
      expect(point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height).toBe(false);
    expect([a.width, a.height]).toEqual([60, 40]);
  });

  it('sends the same request as today when nothing is reserved', async () => {
    await editorLayout('center');
    expect(JSON.stringify(layoutRequests[0])).not.toContain('outsideLabel029');
  });

  it('lays out again without labels when the reserved layout fails', async () => {
    refuseLabelled.on = true;
    const { laid } = await editorLayout('above');
    expect(layoutRequests).toHaveLength(2);
    expect(JSON.stringify(layoutRequests[1])).not.toContain('outsideLabel029');
    // The refused request never reached the resolver; only the retry did.
    expect(resolverRequests).toHaveLength(1);
    expect(laid.nodes.map((node) => node.id).sort()).toEqual(['a', 'p', 'q']);
  });

  it('keeps an incremental layout of positioned nodes working', async () => {
    const { laid } = await editorLayout('above', true);
    expect(laid.nodes.find((node) => node.id === 'a')!.position).toEqual({ x: 200, y: 40 });
  });

  it('never shows the side as authored', async () => {
    const { laid, display } = await editorLayout('above');
    expect(display.nodes.find((node) => node.id === 'a')).not.toHaveProperty('labelPlacement');
    expect(laid.nodes.find((node) => node.id === 'a')!.data).not.toHaveProperty('labelPlacement');
  });
});
