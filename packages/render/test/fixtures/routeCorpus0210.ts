/**
 * Seeded production-source diagrams for generated-route robustness.
 * Every case is reproducible from (notation, seed); failing seeds become
 * named fixtures in spatialQuality029.ts.
 */
import type { LayoutDirection } from '../../src/layout/types.js';

export type RouteCorpusNotation0210 = 'flowchart' | 'architecture' | 'aiml' | 'data-engineering';

export interface RouteCorpusCase0210 {
  id: string;
  notation: RouteCorpusNotation0210;
  seed: number;
  grouped: boolean;
  source: string;
}

const NODE_KINDS: Record<RouteCorpusNotation0210, readonly string[]> = {
  flowchart: ['process', 'process', 'decision', 'data', 'terminal'],
  architecture: ['service', 'database', 'queue', 'service', 'actor'],
  aiml: ['model [symbol: "aiml-model"]', 'dataset [symbol: "aiml-dataset"]',
    'training [symbol: "aiml-training"]', 'inference [symbol: "aiml-inference"]',
    'evaluator [symbol: "aiml-evaluator"]', 'agent [symbol: "aiml-agent"]'],
  'data-engineering': ['source [symbol: "data-source"]', 'transform [symbol: "data-transform"]',
    'quality [symbol: "data-quality"]', 'warehouse [symbol: "data-warehouse"]', 'sink [symbol: "data-sink"]'],
};
const EDGE_KINDS: Record<RouteCorpusNotation0210, readonly string[]> = {
  flowchart: ['flow'], architecture: ['sync', 'data', 'async'],
  aiml: ['training', 'inference', 'embedding'], 'data-engineering': ['batchFlow', 'quality'],
};
const WORDS = ['Coral', 'corpus', 'tokenize', 'train', 'evaluate', 'checkpoint', 'SmolLM2',
  'export', 'validate', 'synthetic', 'pairs', 'pass rate'];

export const ROUTE_CORPUS_DIRECTIONS_0210: readonly LayoutDirection[] = ['RIGHT', 'DOWN', 'LEFT', 'UP'];

/** One deterministic diagram: 5–13 nodes, a spanning tree plus extra and back edges. */
export function routeCorpusCase0210(notation: RouteCorpusNotation0210, seed: number, grouped: boolean): RouteCorpusCase0210 {
  let state = seed * 7919 + (grouped ? 104729 : 0) + notation.length;
  const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const label = () => Array.from({ length: 1 + Math.floor(random() * 6) }, () => pick(WORDS)).join(' ');
  const lines = [`@diagram ${notation}`];
  const ids: string[] = [];
  const node = (indent: string) => {
    const id = `n${ids.length}`;
    lines.push(`${indent}${id} ${pick(NODE_KINDS[notation])} as "${label()}"`);
    return id;
  };
  if (grouped) {
    const groups = 2 + Math.floor(random() * 3);
    for (let group = 0; group < groups; group++) {
      lines.push(`g${group} group as "Stage ${group}" {`);
      const count = 1 + Math.floor(random() * 4);
      for (let index = 0; index < count; index++) ids.push(`g${group}.${node('  ')}`);
      lines.push('}');
    }
  } else {
    const count = 5 + Math.floor(random() * 9);
    for (let index = 0; index < count; index++) ids.push(node(''));
  }
  const edges = new Set<string>();
  for (let index = 1; index < ids.length; index++) edges.add(`${Math.floor(random() * index)}>${index}`);
  const extra = Math.floor(random() * (grouped ? 4 : 5));
  for (let index = 0; index < extra; index++) {
    const a = Math.floor(random() * ids.length), b = Math.floor(random() * ids.length);
    if (a !== b && !edges.has(`${b}>${a}`)) edges.add(`${a}>${b}`);
  }
  let edgeIndex = 0;
  for (const pair of edges) {
    const [a, b] = pair.split('>').map(Number);
    const text = random() < 0.25 ? ` as "${pick(['Yes', 'No', 'retry'])}"` : '';
    lines.push(`e${edgeIndex++} = ${ids[a!]} -> ${ids[b!]} [${pick(EDGE_KINDS[notation])}]${text}`);
  }
  return { id: `${notation}-${grouped ? 'grouped' : 'flat'}-${seed}`, notation, seed, grouped,
    source: `${lines.join('\n')}\n` };
}

/** The gate corpus: `count` seeds per notation, alternating flat and grouped. */
export function routeCorpus0210(count: number, firstSeed = 1): RouteCorpusCase0210[] {
  const notations: RouteCorpusNotation0210[] = ['flowchart', 'architecture', 'aiml', 'data-engineering'];
  return notations.flatMap((notation) => Array.from({ length: count },
    (_, index) => routeCorpusCase0210(notation, firstSeed + index, index % 2 === 1)));
}

/** Named failures from the coralsmol findings (dev/test-candidates/coral-0210-coralsmol-usage-findings-2026-11-15.md). */
export const routeRegressions0210: readonly RouteCorpusCase0210[] = [
  { id: 'coralsmol-contact-lane', notation: 'flowchart', seed: 0, grouped: true, source: `@diagram flowchart
g0 group as "Stage 0" {
  n0 decision as "tokenize"
  n1 terminal as "tokenize"
}
g1 group as "Stage 1" {
  n2 terminal as "pass rate Coral evaluate"
  n3 data as "train SmolLM2 SmolLM2"
  n4 data as "pass rate pass rate"
  n5 terminal as "Coral evaluate pairs"
}
g2 group as "Stage 2" {
  n6 decision as "export"
  n7 process as "pass rate SmolLM2"
  n8 decision as "pairs"
  n9 data as "tokenize pairs Coral"
}
e0 = g0.n0 -> g0.n1 [flow]
e1 = g0.n0 -> g1.n2 [flow]
e2 = g0.n0 -> g1.n3 [flow]
e3 = g1.n2 -> g1.n4 [flow]
e4 = g0.n1 -> g1.n5 [flow]
e5 = g1.n5 -> g2.n6 [flow]
e6 = g0.n1 -> g2.n7 [flow]
e7 = g1.n4 -> g2.n8 [flow]
e8 = g1.n4 -> g2.n9 [flow]
e9 = g1.n5 -> g1.n2 [flow]
e10 = g1.n5 -> g0.n0 [flow]
` },
  { id: 'coralsmol-parallel-corridor', notation: 'architecture', seed: 0, grouped: true, source: `@diagram architecture
g0 group as "Stage 0" {
  n0 service as "Coral pass rate checkpoint"
  n1 service as "validate synthetic synthetic"
}
g1 group as "Stage 1" {
  n2 service as "pairs"
}
e0 = g0.n0 -> g0.n1
e1 = g0.n1 -> g1.n2
e2 = g1.n2 -> g0.n1
` },
];
