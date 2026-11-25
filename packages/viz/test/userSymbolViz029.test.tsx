import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { documentCatalog029, projectInstalledSourceToSuccessor028, resolveNotationNode028,
  userOutlineExitPoint029 } from '@coral-viz/render';
import { CompatibilityEdge } from '../src/compatibility/CompatibilityEdge';
import { getEdgeCompatibility, validateConnection } from '../src/compatibility/validateConnection';
import { routeWithWaypoints, waypointRoutingKey } from '../src/waypoints/router.js';
import type { ConnectionValidationContext, CoralEdge, CoralNode, NodeConnectionInfo } from '../src/types.js';

vi.mock('@xyflow/react', async () => ({
  ...await vi.importActual<Record<string, unknown>>('@xyflow/react'),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const SOURCE = (exit = 'E') => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  outline ellipse', `  anchor core [x: 0.5, y: 0.5, exit: ${exit}]`,
  '  login port [direction: in, maxConnections: 1]', '  deep port [direction: out, anchor: core]',
  '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', 'a service', 'b service', ''].join('\n');
const catalogFor = (exit = 'E') =>
  documentCatalog029('architecture', projectInstalledSourceToSuccessor028(SOURCE(exit)).graph!.userSymbols029!);

describe('editor connection limits for user-symbol ports (R-065 AC-5)', () => {
  const catalog = catalogFor();
  const gate = resolveNotationNode028({ id: 'g', type: 'service', symbol: 'local.probe' }, 'architecture', catalog);
  const nodeInfo = new Map<string, NodeConnectionInfo>([
    ['g', { id: 'g', symbolId: 'local.probe', documentCatalog029: catalog,
      semanticPorts: gate.semanticPorts }],
    ['a', { id: 'a', symbolId: 'arch-service', semanticPorts: [{ id: 'out', direction: 'out' }] }],
    ['b', { id: 'b', symbolId: 'arch-service', semanticPorts: [{ id: 'out', direction: 'out' }] }],
  ]);
  const context = (existingEdges: ConnectionValidationContext['existingEdges'], refuse: boolean):
    ConnectionValidationContext => ({ notationId: 'architecture', nodeInfo, existingEdges,
    ...(refuse ? { portLimits029: 'refuse' as const } : {}) });
  const second = { sourceNodeId: 'b', targetNodeId: 'g', targetPortId: 'login' };

  it('refuses a connection beyond a resolved limit in an edition 0.2.9 document', () => {
    expect(validateConnection(second, context([{ source: 'a', target: 'g', targetPort: 'login' }], true)))
      .toMatchObject({ valid: false, reason: 'max-connections-exceeded' });
  });

  it('keeps the edition 0.2.8 warning', () => {
    expect(validateConnection(second, context([{ source: 'a', target: 'g', targetPort: 'login' }], false)))
      .toMatchObject({ valid: true, hasWarning: true, reason: 'max-connections-exceeded' });
  });

  it('counts only endpoints that name the port in edition 0.2.9', () => {
    expect(validateConnection(second, context([{ source: 'a', target: 'g' }], true)))
      .toMatchObject({ valid: true, hasWarning: false });
  });

  it('re-checks existing edges excluding only the edge itself', () => {
    const edges = [{ id: 'e1', source: 'a', target: 'g', targetPort: 'login' },
      { id: 'e2', source: 'a', target: 'g', targetPort: 'login' }];
    expect(getEdgeCompatibility(edges, context(edges, true)).map((item) => [item.status, item.validation.reason]))
      .toEqual([['incompatible', 'max-connections-exceeded'], ['incompatible', 'max-connections-exceeded']]);
  });

  it('keeps port direction enforced in a document that selects a user symbol', () => {
    expect(validateConnection({ sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'g', targetPortId: 'deep' },
      context([], true)))
      .toMatchObject({ valid: false, reason: 'port-direction-mismatch' });
  });
});

describe('no profile connection rules in a document that selects a user symbol', () => {
  const flow = (withUserSymbol: boolean) => new Map<string, NodeConnectionInfo>([
    ['p', { id: 'p', symbolId: 'flowchart-process' }],
    ['s', { id: 's', symbolId: 'flowchart-terminal', variant: 'start' }],
    ['e', { id: 'e', symbolId: 'flowchart-terminal', variant: 'end' }],
    ...(withUserSymbol ? [['g', { id: 'g', symbolId: 'local.probe',
      documentCatalog029: documentCatalog029('flowchart', projectInstalledSourceToSuccessor028(
        SOURCE().replace('@diagram architecture', '@diagram flowchart').replace(/service/g, 'process'))
        .graph!.userSymbols029!) }] as const] : []),
  ]);
  const check = (withUserSymbol: boolean, sourceNodeId: string, targetNodeId: string) => validateConnection(
    { sourceNodeId, targetNodeId }, { notationId: 'flowchart', nodeInfo: flow(withUserSymbol), existingEdges: [],
      ...(withUserSymbol ? { portLimits029: 'refuse' as const } : {}) });

  it('still refuses process -> terminal(start) and terminal(end) -> process without a user-symbol node', () => {
    expect(check(false, 'p', 's')).toMatchObject({ valid: false, reason: 'symbol-not-allowed' });
    expect(check(false, 'e', 'p')).toMatchObject({ valid: false, reason: 'symbol-not-allowed' });
  });

  it('applies no symbol rule anywhere in the document once a node selects a user symbol', () => {
    for (const [source, target] of [['p', 's'], ['e', 'p'], ['g', 's'], ['e', 'g']] as const)
      expect(check(true, source, target)).toEqual({ valid: true, hasWarning: false });
  });

  it('re-checks existing edges without profile rules too', () => {
    const edges = [{ id: 'e1', source: 'p', target: 's' }, { id: 'e2', source: 'e', target: 'p' }];
    expect(getEdgeCompatibility(edges, { notationId: 'flowchart', nodeInfo: flow(true), existingEdges: edges,
      portLimits029: 'refuse' }).map((item) => item.status)).toEqual(['compatible', 'compatible']);
  });
});

describe('escape segments on the canvas', () => {
  const base = { id: 'e1', source: 'g', target: 'b', sourceX: 0, sourceY: 0, targetX: 200, targetY: 100,
    sourcePosition: 'right', targetPosition: 'left' } as const;
  const start = (data: Record<string, unknown>) => {
    const { container } = render(<ReactFlowProvider><svg>
      <CompatibilityEdge {...(base as any)} data={data} />
    </svg></ReactFlowProvider>);
    const d = container.querySelector('path')!.getAttribute('d')!;
    return d.match(/^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/)!.slice(1).map(Number);
  };
  const escape029 = { source: { x: -30, y: 0 } };

  it('draws the escape before a fresh routed path', () => {
    expect(start({ escape029, routedPath: { startPoint: { x: 0, y: 0 }, endPoint: { x: 200, y: 100 },
      bendPoints: [{ x: 100, y: 0 }, { x: 100, y: 100 }] } })).toEqual([-30, 0]);
  });

  it('draws the escape with manual waypoints and during a drag', () => {
    expect(start({ escape029, waypoints: [{ x: 100, y: 0 }] })).toEqual([-30, 0]);
    expect(start({ escape029 })).toEqual([-30, 0]);
  });
});

describe('waypoint routing on user-symbol nodes', () => {
  const nodes = (catalog = catalogFor()): CoralNode[] => [
    { id: 'g', type: 'symbol', position: { x: 0, y: 0 }, width: 60, height: 40,
      data: { label: 'g', nodeType: 'service', symbolId: 'local.probe', notationId: 'architecture',
        canonical: { symbol: 'local.probe' }, documentCatalog029: catalog } },
    { id: 'b', type: 'symbol', position: { x: 300, y: 0 }, width: 100, height: 60,
      data: { label: 'b', nodeType: 'service', notationId: 'architecture' } },
  ] as CoralNode[];
  const edges: CoralEdge[] = [{ id: 'e', source: 'g', target: 'b', sourceHandle: 'deep',
    data: { label: '' } } as CoralEdge];

  it('starts the route at the interior anchor attachment point', () => {
    const route = routeWithWaypoints(nodes(), edges, new Map(), { direction: 'RIGHT', notation: 'architecture' })
      .get('e')!;
    const attachment = userOutlineExitPoint029({ symbolId: 'local.probe', outline: 'ellipse', width: 60, height: 40 },
      'E', { x: 0.5, y: 0.5 });
    expect(route.startPoint.x).toBeCloseTo(attachment.x * 60, 6);
    expect(route.startPoint.y).toBeCloseTo(attachment.y * 40, 6);
  });

  it('invalidates cached routes when a definition anchor changes', () => {
    expect(waypointRoutingKey(nodes(catalogFor('E')), edges, new Map()))
      .not.toBe(waypointRoutingKey(nodes(catalogFor('S')), edges, new Map()));
  });
});
