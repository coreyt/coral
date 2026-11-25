import type { GraphIR } from '@coral-viz/language';
import type { CapturedNodeGeometry } from '../../../src/llm/spatial/types';

export const graph: GraphIR = {
  version: '3.0.0',
  id: 'spatial-fixture',
  nodes: [
    { id: 'api', type: 'service', label: 'API Gateway', position: { x: 100, y: 100 }, dimensions: { width: 120, height: 60 } },
    { id: 'db', type: 'database', label: 'Database', position: { x: 360, y: 220 }, dimensions: { width: 100, height: 80 }, pinned: true },
    {
      id: 'platform', type: 'group', label: 'Platform', position: { x: 500, y: 100 }, dimensions: { width: 500, height: 400 },
      children: [
        { id: 'cache', type: 'database', label: 'Shared Cache', position: { x: 40, y: 50 }, dimensions: { width: 80, height: 40 } },
        { id: 'worker', type: 'service', label: 'Worker', dimensions: { width: 100, height: 50 } },
      ],
    },
  ],
  edges: [{
    id: 'api-db', source: 'api', target: 'db', properties: { retained: true },
    routeIntent: { waypoints: [{
      id: 'coral.waypoint.api-db.1',
      placement: { kind: 'absolute', position: { x: 230, y: 140 } },
    }] },
  }],
};

export const geometry: CapturedNodeGeometry[] = [
  { id: 'api', position: { x: 100, y: 100 }, width: 120, height: 60 },
  { id: 'db', position: { x: 410, y: 260 }, width: 100, height: 80, origin: [0.5, 0.5] },
  { id: 'platform', position: { x: 500, y: 100 }, width: 500, height: 400 },
  { id: 'cache', parentId: 'platform', position: { x: 40, y: 50 }, width: 80, height: 40 },
  { id: 'worker', parentId: 'platform', position: { x: 200, y: 180 }, width: 100, height: 50 },
];
