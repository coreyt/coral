import { describe, expect, it } from 'vitest';
import type { EdgeLabelPlacement } from '@graph-ir/core';
import { fontMetrics, resolveFont } from '../src/text/fonts.js';
import { layoutSequence, prepareSequenceScene028, projectInstalledSourceToSuccessor028,
  renderSvg, successorSourceDisplay028 } from '../src/index.js';

function fixture(placement: EdgeLabelPlacement, connector = 'a -> b') {
  const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\n' +
    `call = ${connector} as "Review\\nrequest"\nfinish = b -> a as "Finish"`).graph!;
  source.edges[0].labelPlacement = placement;
  return { source, display: successorSourceDisplay028(source) };
}

describe('typed sequence message label placement', () => {
  it.each([1, .6])('contains single and multiline descenders at line-height %s', (lineHeight) => {
    for (const label of ['gyp', 'gyp\ngyp']) {
      const { source } = fixture({ side: 'above', at: .5, offset: 0 });
      source.edges[0].label = label;
      const display = successorSourceDisplay028(source);
      const options = { fontSize: 18, fontFamily: 'Coral Inter', lineHeight };
      const { scene, ownerLookup } = prepareSequenceScene028(display, options);
      const message = scene.messages[0];
      const font = resolveFont({ family: 'Coral Inter', size: 18 });
      const metrics = fontMetrics(font.id, font.weight);
      const top = message.label!.y - metrics.ascent * 18;
      const bottom = message.label!.y + (message.label!.lines.length - 1) * scene.messageFont.lineHeight + metrics.descent * 18;
      expect(top).toBeGreaterThanOrEqual(message.labelBounds!.y - 1e-8);
      expect(bottom).toBeLessThanOrEqual(message.labelBounds!.y + message.labelBounds!.height + 1e-8);
      expect(bottom).toBeLessThanOrEqual(message.points[0].y + 1e-8);
      expect(ownerLookup.hitBounds['message:call'].y).toBeLessThanOrEqual(top);
      expect(renderSvg(display, options)).toContain('data-coral-message-label-background="call"');
    }
  });

  it.each(['lowfi', 'hifi'] as const)('uses final sequence message geometry and exact shared bounds in %s', (style) => {
    const { source, display } = fixture({ side: 'above', at: .25, offset: 0 });
    const before = JSON.stringify(source);
    const { scene, ownerLookup } = prepareSequenceScene028(display, { style, successorSource: source });
    const message = scene.messages[0];
    expect(message.labelBounds).toBeDefined();
    expect(message.label!.x).toBeCloseTo(message.points[0].x + (message.points.at(-1)!.x - message.points[0].x) * .25);
    expect(message.labelBounds!.y + message.labelBounds!.height).toBe(message.points[0].y);
    const hit = ownerLookup.hitBounds['message:call'];
    expect(hit.x).toBeLessThanOrEqual(message.labelBounds!.x);
    expect(hit.y).toBeLessThanOrEqual(message.labelBounds!.y);
    expect(renderSvg(display, { style, successorSource: source })).toContain('data-coral-message-label-background="call"');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('keeps reverse-authored at in written order while source intent remains unchanged', () => {
    const { source, display } = fixture({ side: 'above', at: .25 }, 'a <- b');
    const scene = layoutSequence(display);
    const message = scene.messages[0];
    expect(message.sourceId).toBe('b');
    expect(message.label!.x).toBeCloseTo(message.points[0].x + (message.points.at(-1)!.x - message.points[0].x) * .75);
    expect(source.edges[0].labelPlacement).toEqual({ side: 'above', at: .25 });
  });

  it('applies placement once after recursive regions and operands expand', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\n' +
      'retry = loop {\ncall = a -> b as "Review"\n}\nfinish = b -> a').graph!;
    source.edges[0].labelPlacement = { side: 'above', at: .5, offset: 0 };
    const display = successorSourceDisplay028(source);
    const scene = layoutSequence(display);
    expect(scene.messages[0].labelBounds!.y).toBeGreaterThan(scene.fragments[0].y + scene.fragments[0].tab.height);
    expect(scene.messages[0].labelBounds!.y + scene.messages[0].labelBounds!.height).toBe(scene.messages[0].points[0].y);
  });

  it('refuses a nested label wholly outside its operand without relying on border intersection', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\n' +
      'retry = loop {\ncall = a -> b as "Review"\n}').graph!;
    source.edges[0].labelPlacement = { side: 'above', offset: 5000 };
    expect(() => layoutSequence(successorSourceDisplay028(source))).toThrow(/containment|outside/);
  });

  it('translates every scene coordinate to contain an off-canvas label without extending a dead lifeline', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\n' +
      'call = a -> b as "Review"\nclose = a -> b [destroy]\nlast = a -> a').graph!;
    source.edges[0].labelPlacement = { side: 'left', at: 0, offset: 500 };
    const scene = layoutSequence(successorSourceDisplay028(source));
    const bounds = scene.messages[0].labelBounds!;
    expect(bounds.x).toBeGreaterThanOrEqual(16);
    expect(scene.participants[0].lifeline.x).toBeGreaterThan(500);
    const close = scene.messages.find((message) => message.id === 'close')!;
    expect(scene.participants[1].lifeline.y2).toBe(close.points.at(-1)!.y);
    expect(scene.messages[0].labelBounds!.x + bounds.width).toBe(scene.messages[0].points[0].x - 500);
    expect(scene.messages[0].labelBounds!.x + bounds.width).toBeLessThan(scene.width);
  });

  it.each(['lowfi', 'hifi'] as const)('reserves a self-message loop for centered multiline text in %s', (style) => {
    const { display } = fixture({ side: 'center', at: .5 }, 'a -> a');
    const { scene } = prepareSequenceScene028(display, { style });
    const message = scene.messages[0];
    expect(message.labelBounds!.x).toBeGreaterThan(scene.participants[0].lifeline.x + 1);
    expect(message.labelBounds!.x + message.labelBounds!.width).toBeLessThan(scene.participants[1].lifeline.x);
    expect(message.points[1].y + 10).toBeLessThan(message.labelBounds!.y);
    expect(message.points[2].y - 10).toBeGreaterThan(message.labelBounds!.y + message.labelBounds!.height);
    expect(scene.messages[1].points[0].y).toBeGreaterThan(message.labelBounds!.y + message.labelBounds!.height);
  });

  it.each([1, .6])('keeps a visible self-loop above and below its multiline mask at line-height %s', (lineHeight) => {
    for (const style of ['lowfi', 'hifi'] as const) {
      const { display } = fixture({ side: 'center', at: .5 }, 'a -> a');
      const { scene } = prepareSequenceScene028(display, { style, lineHeight });
      const message = scene.messages[0];
      expect(message.points[1].y + 10).toBeLessThan(message.labelBounds!.y);
      expect(message.points[2].y - 10).toBeGreaterThan(message.labelBounds!.y + message.labelBounds!.height);
      expect(message.points[1].x).toBeCloseTo(message.label!.x);
    }
  });

  it.each(['above', 'below', 'left', 'right', 'center'] as const)('reserves a collision-free interior %s placement', (side) => {
    const { display } = fixture({ side, at: .5, offset: side === 'center' ? 0 : 16 });
    expect(layoutSequence(display).messages[0].labelBounds).toBeDefined();
  });

  it('resolves message identity separately from its backing edge ID', () => {
    const { source } = fixture({ side: 'above' });
    source.edges[0].id = 'call-edge'; source.interaction!.messages[0].edgeId = 'call-edge';
    const message = layoutSequence(successorSourceDisplay028(source)).messages[0];
    expect(message.id).toBe('call');
    expect(message.labelBounds).toBeDefined();
  });

  it('reserves own terminal arrowhead and destruction X instead of masking them', () => {
    const { display } = fixture({ side: 'center', at: 1 });
    expect(() => layoutSequence(display)).toThrow(/terminal|marker|overlap/);
  });
});
