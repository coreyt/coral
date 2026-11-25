/**
 * Generated-route robustness gate (0.2.10). Diagrams without authored
 * geometry must always draw: zero hard failures across the seeded corpus.
 * ROUTE_ROBUSTNESS_SEEDS widens the corpus for the extended run.
 */
import { describe, expect, it } from 'vitest';
import type { Position } from '@graph-ir/core';
import { routeCorpus0210, routeRegressions0210, ROUTE_CORPUS_DIRECTIONS_0210, type RouteCorpusCase0210 } from './fixtures/routeCorpus0210.js';
import { completeSpatialSource029, type CompleteSpatialSource029 } from './helpers/spatialQuality029.js';
import { notationRegistry } from '../src/index.js';

const SEEDS = Number(process.env.ROUTE_ROBUSTNESS_SEEDS ?? 12);
const STYLES = (process.env.ROUTE_ROBUSTNESS_STYLES ?? 'lowfi,hifi').split(',') as Array<'lowfi' | 'hifi'>;
const corpus = [...routeRegressions0210, ...routeCorpus0210(SEEDS)];

const inside = (point: Position, box: { x: number; y: number; width: number; height: number }) =>
  point.x >= box.x - 0.5 && point.x <= box.x + box.width + 0.5 && point.y >= box.y - 0.5 && point.y <= box.y + box.height + 0.5;

/** Diagonal segments in a bent orthogonal route, excluding a contact stub inside
 * its own endpoint's box. A single straight segment is the deliberate direct
 * shortcut, already checked for clearance from every other node. */
export function slantedSegments0210(result: CompleteSpatialSource029): string[] {
  const issues: string[] = [];
  const boxes = new Map(result.scene.nodes.map(({ node, x, y, width, height }) => [node.id, { x, y, width, height }]));
  // A decision or gateway branch departs diagonally by design.
  const branching = new Set(result.scene.resolved.nodes.filter((node) => node.symbolId === 'flowchart-decision'
    || node.symbolId?.startsWith('bpmn-gateway')).map((node) => node.id));
  for (const edge of result.scene.resolved.edges) {
    if (edge.points.length < 3) continue;
    for (let index = 1; index < edge.points.length; index++) {
      const a = edge.points[index - 1]!, b = edge.points[index]!;
      if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) continue;
      if (index === 1 && branching.has(edge.sourceId)) continue;
      const own = [boxes.get(edge.sourceId), boxes.get(edge.targetId)]
        .some((box) => box && inside(a, box) && inside(b, box));
      if (!own) issues.push(`${edge.id}[${index}]`);
    }
  }
  return issues;
}

function orthogonal(notation: string): boolean {
  return notationRegistry.get(notation)?.layoutProfile?.edgeRouting === 'ORTHOGONAL';
}

async function attempt(fixture: RouteCorpusCase0210, style: 'lowfi' | 'hifi', direction: (typeof ROUTE_CORPUS_DIRECTIONS_0210)[number]) {
  try {
    return { result: await completeSpatialSource029(fixture.source, style, direction) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// A slanted leg remains only where every square alternative would share
// another connector's shaft or cross a caption; keep that rare, not zero.
const SLANTED_BUDGET = 0.05;
const slantedRenders: string[] = [];
let renders = 0;

describe('generated-route robustness corpus', () => {
  for (const style of STYLES) for (const fixture of corpus) it(`${fixture.id} draws in every direction (${style})`, async () => {
    const failures: string[] = [];
    for (const direction of ROUTE_CORPUS_DIRECTIONS_0210) {
      const { result, error } = await attempt(fixture, style, direction);
      renders++;
      if (error) { failures.push(`${direction}: ${error.split('\n')[0]}`); continue; }
      if (result!.scene.status !== 'complete') failures.push(`${direction}: scene ${result!.scene.status}`);
      if (orthogonal(fixture.notation)) {
        const slanted = slantedSegments0210(result!);
        // The named coralsmol regressions must stay fully orthogonal.
        if (slanted.length && fixture.seed === 0) failures.push(`${direction}: slanted ${slanted.join(', ')}`);
        else if (slanted.length) slantedRenders.push(`${fixture.id} ${style} ${direction}: ${slanted.join(', ')}`);
      }
    }
    expect(failures, `${fixture.id}\n${fixture.source}`).toEqual([]);
  }, 120_000);

  it('keeps slanted legs in bent orthogonal routes rare', () => {
    expect(slantedRenders.length / Math.max(1, renders), slantedRenders.join('\n'))
      .toBeLessThanOrEqual(SLANTED_BUDGET);
  });
});
