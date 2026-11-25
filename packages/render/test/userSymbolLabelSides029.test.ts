import { describe, expect, it } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

// C4 label sides (c4-design.md "Label sides"; C3 Q-6): the definition's
// `label` is the preferred side of a node label outside the frame; the label
// takes the first clear side and never makes the render fail.

type Side = 'above' | 'below' | 'left' | 'right' | 'center';
const source = (side: Side, body: string[], ports: string[] = []) => ['@diagram architecture', '@coralVersion "0.2.9"', '',
  '@symbol probe {', '  name "Probe"', '  size 60 x 40', `  label ${side}`, '  outline ellipse', ...ports,
  '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', '', ...body, ''].join('\n');

async function labelOf(text: string, nodeId = 'a') {
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const prepared = prepareSpatialScene028(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT',
    semanticGraph: display, successorSource: graph });
  const node = prepared.resolved.nodes.find((item) => item.id === nodeId)!;
  const frame = { x: node.x + prepared.viewport.shiftX, y: node.y + prepared.viewport.shiftY,
    width: node.width, height: node.height };
  const labels = prepared.parts.filter((part) => part.owner.kind === 'node' && part.owner.id === nodeId &&
    part.geometry.kind === 'text');
  return { frame, labels, display, prepared };
}

const outside = (bounds: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number }): Side | undefined =>
  bounds.y >= frame.y + frame.height - 1e-6 ? 'below' : bounds.y + bounds.height <= frame.y + 1e-6 ? 'above'
    : bounds.x >= frame.x + frame.width - 1e-6 ? 'right' : bounds.x + bounds.width <= frame.x + 1e-6 ? 'left' : undefined;

describe('definition label sides', () => {
  it.each(['above', 'below', 'left', 'right'] as const)('places the label %s the frame', async (side) => {
    const { frame, labels, display } = await labelOf(source(side, ['a service [symbol: "local.probe"] as "Auth gateway"']));
    expect(labels).toHaveLength(1);
    expect(outside(labels[0]!.bounds, frame)).toBe(side);
    // The frame never grows for its label, and the display projection is untouched.
    expect([frame.width, frame.height]).toEqual([60, 40]);
    expect(display.nodes.find((node) => node.id === 'a')).not.toHaveProperty('labelPlacement');
  });

  it('keeps a centre label inside the frame', async () => {
    const { frame, labels } = await labelOf(source('center', ['a service [symbol: "local.probe"] as "Auth"']));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(outside(label.bounds, frame)).toBeUndefined();
  });

  it('defaults to below', async () => {
    const text = source('below', ['a service [symbol: "local.probe"] as "Auth gateway"']).replace('  label below\n', '');
    const { frame, labels } = await labelOf(text);
    expect(outside(labels[0]!.bounds, frame)).toBe('below');
  });

  it('moves off a side that a connector leaves through, instead of refusing the render', async () => {
    const { frame, labels, prepared } = await labelOf(source('below',
      ['a service [symbol: "local.probe"] as "Auth gateway"', 'b service', 'a:down -> b'],
      ['  down port [direction: out, anchor: S]']));
    const side = outside(labels[0]!.bounds, frame);
    expect(side).toBeDefined();
    expect(side).not.toBe('below');
    const route = prepared.parts.find((part) => part.role === 'edge-shaft')!;
    if (route.geometry.kind !== 'route') throw new Error('route');
    const bounds = labels[0]!.bounds;
    for (const point of route.geometry.points) expect(point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y && point.y <= bounds.y + bounds.height).toBe(false);
  });

  it('renders the approved design example with its label clear of every connector', async () => {
    const example = ['@diagram architecture', '@coralVersion "0.2.9"', '', '@symbol shield {', '  name "Shield"',
      '  description "Security boundary or policy enforcement point"', '  tags "security" "auth"', '  size 48 x 56',
      '  label below', '  outline rounded', '  source "Drawn in-house"', '  license "CC0-1.0"',
      '  anchor crest [side: N, at: 0.5]', '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
      '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]',
      '  token port [direction: out, anchor: E, label: "Token"]', '  audit port [direction: out, anchor: keyhole]',
      '  artwork svg """', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">',
      '  <path d="M12 0 L24 4 L24 14 C24 21 18 26 12 28 C6 26 0 21 0 14 L0 4 Z" fill="#2f6f4f"/>', '</svg>', '"""', '}', '',
      'gate service [symbol: "local.shield"] as "Auth gateway"', 'vault database as "Secrets" {',
      '  ingest port [direction: in, anchor: W, label: "Writes"]', '}', 'gate:token -> vault [reads]',
      'gate:audit -> vault:ingest [type: writes, secondEnd: arrow]', ''].join('\n');
    const { frame, labels, prepared } = await labelOf(example, 'gate');
    expect(labels).toHaveLength(1);
    // The audit connector leaves through the bottom, so the label takes another side.
    const side = outside(labels[0]!.bounds, frame);
    expect(side).toBeDefined();
    expect(side).not.toBe('below');
    const bounds = labels[0]!.bounds;
    for (const part of prepared.parts) if (part.geometry.kind === 'route') for (const point of part.geometry.points)
      expect(point.x > bounds.x && point.x < bounds.x + bounds.width && point.y > bounds.y && point.y < bounds.y + bounds.height).toBe(false);
  });

  it('lets an authored label placement win', async () => {
    const { frame, labels } = await labelOf(source('below', ['a service [symbol: "local.probe"] as "Auth gateway" label right offset 6']));
    expect(outside(labels[0]!.bounds, frame)).toBe('right');
    expect(labels[0]!.bounds.x).toBeCloseTo(frame.x + frame.width + 6, 6);
  });
});
