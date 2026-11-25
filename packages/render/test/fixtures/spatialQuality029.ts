import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LayoutDirection } from '../../src/layout/types.js';

export interface SpatialQualityFixture029 {
  id: string;
  source: string;
  direction: LayoutDirection;
  zeroCrossings?: boolean;
  forwardEdges?: readonly string[];
}

/** Positive production-source examples shared by layout and consumer tests. */
export const spatialQualityFixtures029: readonly SpatialQualityFixture029[] = [
  { id: 'tree', direction: 'DOWN', zeroCrossings: true, forwardEdges: ['ab', 'ac', 'bd', 'be'],
    source: '@diagram block\na block\nb block\nc block\nd block\ne block\nab = a -> b\nac = a -> c\nbd = b -> d\nbe = b -> e\n' },
  { id: 'diamond', direction: 'RIGHT', zeroCrossings: true, forwardEdges: ['ab', 'ac', 'bd', 'cd'],
    source: '@diagram flowchart\na decision as "Ready?"\nb process as "Approve"\nc process as "Revise"\nd process as "Continue"\nab = a -> b\nac = a -> c\nbd = b -> d\ncd = c -> d\n' },
  { id: 'cycle', direction: 'DOWN', zeroCrossings: true, forwardEdges: ['ab', 'bc'],
    source: '@diagram block\na block\nb block\nc block\nab = a -> b\nbc = b -> c\nca = c -> a\n' },
  { id: 'fanout', direction: 'LEFT', zeroCrossings: true,
    source: '@diagram block\nroot block\n' + Array.from({ length: 7 }, (_, i) => `leaf${i} block\nbranch${i} = root -> leaf${i}\n`).join('') },
  { id: 'parallel-only', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block\nb block\nfirst = a -> b\nsecond = a -> b\n' },
  { id: 'pinned-parallel', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (300, 0) pinned\nfirst = a -> b\nsecond = a -> b\n' },
  { id: 'reverse-parallel', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (300, 0) pinned\nfirst = a -> b\nsecond = b -> a\n' },
  { id: 'obstacle-parallel', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (400, 0) pinned\n' +
      'wall block @ (200, 0) pinned\nfirst = a -> b\nsecond = a -> b\n' },
  { id: 'exact-parallel', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (300, 0) pinned\n' +
      'first = a -> b\nroute edge first {\n  pin = waypoint at (200, 31)\n}\nsecond = a -> b\n' },
  ...[3, 4].map(count => ({ id: `parallel-${count}`, direction: 'RIGHT' as const, zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (300, 0) pinned\n' +
      Array.from({ length: count }, (_, index) => `edge${index} = a -> b\n`).join('') })),
  ...[false, true].map(pinned => ({ id: pinned ? 'pinned-parallel-terminals-3' : 'parallel-terminals-3',
    direction: 'RIGHT' as const, zeroCrossings: true,
    source: '@diagram flowchart\na terminal' + (pinned ? ' @ (0, 0) pinned' : '') +
      '\nb terminal' + (pinned ? ' @ (300, 0) pinned' : '') +
      '\nedge0 = a -> b\nedge1 = a -> b\nedge2 = a -> b\n' })),
  { id: 'parallel-self', direction: 'RIGHT',
    source: '@diagram block\na block\nb block\nfirst = a -> b\nsecond = a -> b\nloop = a -> a\n' },
  { id: 'nested', direction: 'DOWN',
    source: '@diagram architecture\ncluster group as "Cluster" {\n  api service as "API"\n  worker service as "Worker"\n}\nstore database as "Store"\ncall = cluster.api -> cluster.worker\nsave = cluster.worker -> store\n' },
  { id: 'disconnected', direction: 'UP', zeroCrossings: true, forwardEdges: ['ab', 'cd'],
    source: '@diagram block\na block\nb block\nc block\nd block\nalone block\nab = a -> b\ncd = c -> d\n' },
  { id: 'mixed-shapes', direction: 'DOWN', zeroCrossings: true, forwardEdges: ['ab', 'bc', 'cd', 'de'],
    source: '@diagram flowchart\na terminal\nb process\nc decision\nd io\ne document\nab = a -> b\nbc = b -> c\ncd = c -> d\nde = d -> e\n' },
  { id: 'long-labels', direction: 'RIGHT', zeroCrossings: true, forwardEdges: ['query'],
    source: '@diagram architecture\napi service as "Validate authorization and reconcile the complete customer request"\nstore database as "Durable customer transaction and audit history"\nquery = api -> store [reads] as "Fetch the current customer transaction history"\n' },
  { id: 'mixed-ports', direction: 'DOWN',
    source: '@diagram architecture\napi service {\n  fixed port [direction: out, anchor: E]\n  free port [direction: out, anchor: side]\n}\nstore database {\n  receive port [direction: in, anchor: auto]\n}\nfixed = api:fixed -> store:receive [reads]\nfree = api:free -> store:receive [reads]\n' },
  { id: 'pinned-corridor', direction: 'RIGHT', zeroCrossings: true,
    source: '@diagram block\na block @ (0, 0) pinned\nb block @ (500, 0) pinned\nwall block @ (220, 0) pinned\ne = a -> b\nroute edge e {\n  first = waypoint at (180, 180)\n  second = waypoint at (440, 180)\n}\n' },
  { id: 'code-containment', direction: 'DOWN', zeroCrossings: true,
    source: readFileSync(resolve(import.meta.dirname, './code-containment.coral'), 'utf8') },
];

export const impossibleSpatialSource029 = '@diagram block\na block @ (0, 0) pinned\nb block @ (500, 0) pinned\nwall block @ (220, 0) pinned\ne = a -> b\nroute edge e {\n  blocked = waypoint at (250, 30)\n}\n';


export function seededTreeSource029(seed: number): SpatialQualityFixture029 {
  let state = seed >>> 0;
  const count = 12;
  const lines = ['@diagram block', ...Array.from({ length: count }, (_, index) => `n${index} block`)];
  const forwardEdges = [];
  for (let index = 1; index < count; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const parent = state % index;
    lines.push(`e${index} = n${parent} -> n${index}`);
    forwardEdges.push(`e${index}`);
  }
  return { id: `tree-${seed}`, source: lines.join('\n'), direction: 'DOWN', zeroCrossings: true, forwardEdges };
}

export { waypointPaintSource029 } from './waypointPaint029.js';
