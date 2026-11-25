import {
  migrateGraphIR2To3,
  migrateIR,
  type GraphIR,
  type GraphIR2,
} from '@graph-ir/core';
import { convertGraphToFlow } from '@coral-viz/viz';

const storedGraphIR1: unknown = {
  version: '1.0.0',
  id: 'stored',
  nodes: [{ id: 'service', type: 'service' }],
  edges: [],
};

const result = migrateIR(storedGraphIR1);
if (!result.success || !result.migrated) {
  throw new Error(result.errors.join('\n'));
}

const graph2: GraphIR2 = result.migrated;
const upgraded = migrateGraphIR2To3(graph2);
if (!upgraded.success || !upgraded.migrated) {
  throw new Error(upgraded.errors.join('\n'));
}
const graph: GraphIR = upgraded.migrated;
// Projected edges use the `compatibility` type and shared marker URLs. A
// standalone <ReactFlow> host registers
// `edgeTypes={{ compatibility: CompatibilityEdge }}` and renders
// `<EndpointMarkerDefinitions edges={flow.edges} />`; CoralEditor does both.
const flow = convertGraphToFlow(graph);
if (flow.nodes.length !== 1) throw new Error('Migrated graph was not projected');

const ambiguousGraphIR1: unknown = {
  version: '1.0.0',
  id: 'ambiguous',
  nodes: [
    { id: 'a', type: 'service' },
    { id: 'b', type: 'database' },
  ],
  edges: [{
    id: 'edge',
    source: 'a',
    target: 'b',
    routingPoints: [{ x: 1, y: 2 }],
  }],
};

const refused = migrateIR(ambiguousGraphIR1);
if (refused.success || !refused.losses.some(
  (loss) => loss.path === '/edges/0/routingPoints',
)) {
  throw new Error('Ambiguous geometry was not refused');
}

const dropped = migrateIR(ambiguousGraphIR1, { ambiguousGeometry: 'drop' });
if (!dropped.success || !dropped.migrated) {
  throw new Error(dropped.errors.join('\n'));
}
if (!dropped.losses.some((loss) =>
  loss.path === '/edges/0/routingPoints' && loss.field === 'routingPoints')) {
  throw new Error('Explicit migration loss was not attributed');
}
for (const loss of dropped.losses) console.warn(loss.path, loss.reason);

const droppedUpgrade = migrateGraphIR2To3(dropped.migrated);
if (!droppedUpgrade.success || !droppedUpgrade.migrated) {
  throw new Error(droppedUpgrade.errors.join('\n'));
}
