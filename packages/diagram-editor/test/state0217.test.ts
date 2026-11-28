import { describe, expect, it } from 'vitest';
import { parseCoralDSL } from '../src/parsers';
import { layoutNodes } from '../src/hooks/diagramUtils';
import { prepareSpatialScene028 } from '@coral-viz/render';

describe('diagram-editor edition 0.2.17 UML State support', () => {
  it('parses, lays out, and prepares spatial scene for 0.2.17 uml-state without character-only errors', async () => {
    const source = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: DOWN]',
      'start initial',
      'Idle state [description: "Ready"] as "Idle"',
      'Active composite as "Active" {',
      '  entry initial',
      '  Working state as "Working"',
      '  exit final',
      '  entry -> Working',
      '  Working -> exit',
      '}',
      'done final',
      'start -> Idle',
      'Idle -> Active as "start"',
      'Active -> done as "finish"',
      '',
    ].join('\n');

    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(7);
    expect(parsed.semanticInterpretations?.get('start')?.effectiveSymbolId).toBe('uml-state-initial');
    expect(parsed.semanticInterpretations?.get('Active')?.effectiveSymbolId).toBe('uml-state-composite');

    const laid = await layoutNodes(
      parsed.nodes,
      parsed.edges,
      'uml-state',
      { algorithm: 'layered', direction: 'DOWN' },
      false,
      undefined,
      undefined,
      [],
      'load',
      parsed.semanticInterpretations,
      parsed.envelope,
      'hifi',
    );
    expect(laid.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(laid.nodes.length).toBe(parsed.nodes.length);

    const edgeRoutes = new Map(
      [...laid.edgeRouting.entries()].map(([id, r]) => [id, [{ startPoint: r.startPoint, bendPoints: r.bendPoints, endPoint: r.endPoint }]]),
    );
    const laidById = new Map(laid.nodes.map((ln) => [ln.id, ln]));
    const absPos = (id: string): { x: number; y: number } => {
      const ln = laidById.get(id);
      if (!ln) return { x: 0, y: 0 };
      const parent = ln.parentId ? absPos(ln.parentId) : { x: 0, y: 0 };
      return { x: parent.x + ln.position.x, y: parent.y + ln.position.y };
    };
    const scene = prepareSpatialScene028(
      {
        version: '3.0.0',
        id: parsed.envelope?.id ?? parsed.sourceGraph!.id,
        nodes: parsed.nodes.map((n) => {
          const placed = laidById.get(n.id)!;
          return { ...n, position: absPos(n.id), dimensions: { width: placed.width!, height: placed.height! } };
        }),
        edges: parsed.edges,
        metadata: parsed.envelope?.metadata,
      },
      { notation: 'uml-state', style: 'hifi', layoutDirection: 'DOWN', edgeRoutes, successorSource: parsed.sourceGraph },
    );
    expect(scene.status).toBe('complete');
    expect(scene.parts.length).toBeGreaterThan(0);
  });

  it('keeps 0.2.8 uml-state emitting render.capability.character-only-edition', () => {
    const legacy = '@diagram uml-state\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n';
    const parsed = parseCoralDSL(legacy);
    expect(parsed.errors.map((e) => e.code)).toContain('render.capability.character-only-edition');
  });
});
