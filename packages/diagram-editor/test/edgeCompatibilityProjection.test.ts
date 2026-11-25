import { describe, expect, it } from 'vitest';
import { getEdgeCompatibility } from '@coral-viz/viz';
import { checkGraphConformance028, resolveRenderScene } from '@coral-viz/render';
import type { GraphEdge, GraphNode } from '../src/parsers';
import { buildNodeConnectionInfo, editorHandlePorts, projectDiagramNodes } from '../src/hooks/diagramUtils';

describe('editor edge compatibility variant authority', () => {
  const nodes: GraphNode[] = [
    { id: 'done', type: 'flowchart-terminal', label: 'Done', properties: { variant: 'end' } },
    { id: 'after', type: 'flowchart-process', label: 'After' },
  ];
  const edges: GraphEdge[] = [{ id: 'e1', source: 'done', target: 'after' }];

  it('does not apply a hidden extension variant to an outgoing terminal edge', () => {
    const projected = projectDiagramNodes(nodes, 'flowchart');
    const info = buildNodeConnectionInfo(projected, 'flowchart');
    expect(info.get('done')?.variant).toBeUndefined();
    const [status] = getEdgeCompatibility(edges, {
      notationId: 'flowchart',
      nodeInfo: info,
      existingEdges: edges.map(({ source, target }) => ({ source, target })),
    });
    expect(status.status).toBe('warning');
    const report = checkGraphConformance028({ version: '3.0.0', id: 'draft',
      metadata: { notation: 'flowchart' }, nodes, edges }, { savedLevel: 'typical' });
    expect(report.findings.some((finding) => finding.severity === 'error')).toBe(false);
  });

  it('keeps canvas appearance variant aligned with the render scene', () => {
    const projected = projectDiagramNodes(nodes, 'flowchart');
    expect(projected[0].data.notationId).toBe('flowchart');
    const scene = resolveRenderScene({ version: '3.0.0', id: 'd', nodes, edges } as never);
    const sceneDone = scene.nodes.find((node) => node.id === 'done')!;
    // SVG applies only top-level variants to appearance; the canvas must too.
    expect(projected[0].data.variant).toBeUndefined();
    expect(sceneDone.style.fill).not.toBe('#ffcdd2');
  });

  it('ignores properties.variant on explicit-symbol and semantic-type nodes', () => {
    const projected = projectDiagramNodes([
      { id: 'a', type: 'terminal', label: 'A', properties: { variant: 'end' } },
      { id: 'b', type: 'service', symbol: 'flowchart-terminal', label: 'B', properties: { variant: 'end' } },
    ], 'flowchart');
    const info = buildNodeConnectionInfo(projected, 'flowchart');
    expect(info.get('a')?.variant).toBeUndefined();
    expect(info.get('b')?.variant).toBeUndefined();
  });

  it('rejects a blank explicit profiled symbol instead of borrowing process rules', () => {
    const projected = projectDiagramNodes([
      { id: 'blank', type: 'process', symbol: '', label: 'Blank' },
      { id: 'after', type: 'process', symbol: 'flowchart-process', label: 'After' },
    ], 'flowchart');
    const info = buildNodeConnectionInfo(projected, 'flowchart');
    expect(info.get('blank')?.symbolId).toBe('unknown');
    const [status] = getEdgeCompatibility(
      [{ id: 'blank-after', source: 'blank', target: 'after' }],
      { notationId: 'flowchart', nodeInfo: info, existingEdges: [] },
    );
    expect(status.status).toBe('incompatible');
    expect(status.validation).toMatchObject({ valid: false, reason: 'symbol-unresolved' });
  });

  it('uses the same profile-scoped symbol decision as the render scene', () => {
    const candidate: GraphNode[] = [
      { id: 'ordinary', type: 'process', label: 'Ordinary' },
      { id: 'foreignWord', type: 'service', label: 'Foreign word' },
      { id: 'chosen', type: 'service', symbol: 'flowchart-document', label: 'Chosen' },
    ];
    const projected = projectDiagramNodes(candidate, 'flowchart');
    const scene = resolveRenderScene({ version: '3.0.0', id: 'd', nodes: candidate, edges: [],
      metadata: { notation: 'flowchart' } });
    for (const item of projected) {
      expect(item.data.symbolId).toBe(scene.nodes.find((node) => node.id === item.id)?.symbolId);
    }
    expect(projected.map((item) => item.data.symbolId)).toEqual([
      'flowchart-process', undefined, 'flowchart-document',
    ]);
  });

  it('passes the shared portless interpretation into editor connection checks', () => {
    const projected = projectDiagramNodes([
      { id: 'a', type: 'service', label: 'A' },
      { id: 'b', type: 'module', label: 'B' },
    ], 'flowchart');
    const info = buildNodeConnectionInfo(projected, 'flowchart');
    expect(info.get('a')?.semanticPorts).toEqual([]);
    expect(info.get('b')?.semanticPorts).toEqual([]);
    const [edge] = getEdgeCompatibility([
      { id: 'invented', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' },
    ], { notationId: 'flowchart', nodeInfo: info, existingEdges: [] });
    expect(edge.validation).toMatchObject({ valid: false, reason: 'port-not-found' });
  });

  it('uses the shared architecture symbols for source, canvas, and connection rules', () => {
    const graphNodes: GraphNode[] = [
      { id: 'api', type: 'service', label: 'API' },
      { id: 'db', type: 'database', label: 'DB' },
    ];
    const projected = projectDiagramNodes(graphNodes, 'architecture');
    const info = buildNodeConnectionInfo(projected, 'architecture');
    const scene = resolveRenderScene({ version: '3.0.0', id: 'architecture',
      metadata: { notation: 'architecture' }, nodes: graphNodes, edges: [] });
    expect(info.get('api')?.symbolId).toBe(scene.nodes.find((node) => node.id === 'api')?.symbolId);
    expect(info.get('db')?.symbolId).toBe(scene.nodes.find((node) => node.id === 'db')?.symbolId);
    const [edge] = getEdgeCompatibility([
      { id: 'query', source: 'api', target: 'db', sourcePort: 'out', targetPort: 'query' },
    ], { notationId: 'architecture', nodeInfo: info, existingEdges: [] });
    expect(edge).toMatchObject({ status: 'compatible', validation: { valid: true, hasWarning: false } });
  });

  it('exposes staged authored semantic ports alongside inherited editor handles', () => {
    const projected = projectDiagramNodes([
      { id: 'api', type: 'service' }, { id: 'db', type: 'database' },
    ], 'architecture');
    projected[0]!.data.authoredSemanticPorts = [{ id: 'audit', direction: 'out', anchor: 'side' }];
    const info = buildNodeConnectionInfo(projected, 'architecture');
    expect(editorHandlePorts(info.get('api'))).toEqual([
      { id: 'in', direction: 'in' }, { id: 'out', direction: 'out' },
      { id: 'data', direction: 'out' }, { id: 'audit', direction: 'out' },
    ]);
    const [edge] = getEdgeCompatibility([
      { id: 'audit-read', source: 'api', target: 'db', sourcePort: 'audit', targetPort: 'query' },
    ], { notationId: 'architecture', nodeInfo: info, existingEdges: [] });
    expect(edge.validation).toMatchObject({ valid: true });
  });

  it('withholds editor handles when a staged semantic port collides with a catalog port', () => {
    const projected = projectDiagramNodes([
      { id: 'api', type: 'service' }, { id: 'db', type: 'database' },
    ], 'architecture');
    projected[0]!.data.authoredSemanticPorts = [{ id: 'out', direction: 'in' }];
    const info = buildNodeConnectionInfo(projected, 'architecture');
    expect(editorHandlePorts(info.get('api'))).toBeUndefined();
    const [edge] = getEdgeCompatibility([
      { id: 'colliding', source: 'api', target: 'db', sourcePort: 'out', targetPort: 'query' },
    ], { notationId: 'architecture', nodeInfo: info, existingEdges: [] });
    expect(edge.validation).toMatchObject({ valid: false, reason: 'port-conflict' });
  });

  it('does not publish a connection when the shared resolver rejects a variant', () => {
    const projected = projectDiagramNodes([
      { id: 'api', type: 'service', variant: 'missing' },
      { id: 'db', type: 'database' },
    ], 'architecture');
    const info = buildNodeConnectionInfo(projected, 'architecture');
    expect(info.get('api')?.resolutionIssue?.code).toBe('coral.variant.unknown');
    const [edge] = getEdgeCompatibility([
      { id: 'query', source: 'api', target: 'db' },
    ], { notationId: 'architecture', nodeInfo: info, existingEdges: [] });
    expect(edge.validation).toMatchObject({ valid: false, reason: 'symbol-unresolved' });
  });

  it('derives drag handles from the same resolved semantic ports as connection validation', () => {
    const architecture = buildNodeConnectionInfo(projectDiagramNodes([
      { id: 'unknown', type: 'service', variant: 'missing' },
      { id: 'known', type: 'service', variant: 'web' },
      { id: 'authored', type: 'service', ports: [{ id: 'custom', side: 'SOUTH',
        properties: { direction: 'out' } }] },
    ], 'architecture'), 'architecture');
    expect(editorHandlePorts(architecture.get('unknown'))).toBeUndefined();
    expect(editorHandlePorts(architecture.get('known'))).toEqual([
      { id: 'in', direction: 'in' }, { id: 'out', direction: 'out' },
      { id: 'data', direction: 'out' },
    ]);
    expect(editorHandlePorts(architecture.get('authored'))).toEqual([
      { id: 'custom', direction: 'out' },
    ]);
    const generic = buildNodeConnectionInfo(projectDiagramNodes([
      { id: 'plain', type: 'service' },
    ], 'flowchart'), 'flowchart');
    expect(editorHandlePorts(generic.get('plain'))).toEqual([]);
  });
});
