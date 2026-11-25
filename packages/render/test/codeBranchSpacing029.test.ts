import '../src/index.js';
import { expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { resolveSpatialLayout } from '../src/layout/index.js';
import { measureSvgNode, prepareSpatialScene028 } from '../src/svg/serialize.js';
import { spatialQualityFixtures029 } from './fixtures/spatialQuality029.js';

it.each([
  { defaultSpacing: 10, optionSpacing: undefined, expected: 10 },
  { defaultSpacing: 40, optionSpacing: undefined, expected: 40 },
  { defaultSpacing: 10, optionSpacing: 40, expected: 40 },
  { defaultSpacing: 40, optionSpacing: 10, expected: 10 },
])('respects Code branch spacing defaults $defaultSpacing and options $optionSpacing', async ({ defaultSpacing, optionSpacing, expected }) => {
  const source = projectInstalledSourceToSuccessor028(spatialQualityFixtures029.find(f => f.id === 'code-containment')!.source).graph!;
  const { display } = successorSourceDisplayWithSemanticPorts028(source);
  const graph = { ...display, nodes: display.nodes.map(node => ({ ...node,
    dimensions: measureSvgNode(node, { style: 'hifi' }) })) };
  const before = structuredClone(graph);
  const key = 'elk.layered.spacing.edgeNodeBetweenLayers';
  const result = await resolveSpatialLayout({ graph, revision: 'code-spacing', operation: 'load',
    defaults: { algorithm: 'layered', direction: 'DOWN', elkOptions: { [key]: defaultSpacing } },
    ...(optionSpacing !== undefined ? { options: { elkOptions: { [key]: optionSpacing } } } : {}),
    proximitySceneOptions: { style: 'hifi' } });
  const drawing = { ...graph, nodes: graph.nodes.map(node => ({ ...node,
    position: result.nodes.find(rect => rect.id === node.id)!.absolutePosition })) };
  const scene = prepareSpatialScene028(drawing, { style: 'hifi', layoutDirection: 'DOWN',
    edgeRoutes: new Map(result.edges.map(edge => [edge.id, edge.sections])) });
  const renderer = scene.resolved.nodes.find(node => node.id === 'renderer')!;
  let checkedTraverse = 0;
  for (const id of ['classRender', 'classVersion']) {
    const points = scene.resolved.edges.find(edge => edge.id === id)!.points;
    // Under 0.2.11 BRANDES_KOEPF, one branch aligns straight beneath renderer (0 bends);
    // verify the configured traverse gap on every bent branch.
    if (points.length <= 2) continue;
    const traverse = points.slice(1).find((point, index) => Math.abs(point.y - points[index]!.y) < 1e-5 &&
      Math.abs(point.x - points[index]!.x) > 1)!;
    expect(traverse).toBeDefined();
    expect(traverse.y - renderer.y - renderer.height).toBeCloseTo(expected);
    checkedTraverse += 1;
  }
  expect(checkedTraverse).toBeGreaterThanOrEqual(1);
  expect(graph).toEqual(before);
});
