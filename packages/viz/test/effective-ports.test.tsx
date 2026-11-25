/**
 * Slice 93 S93-WI-07 / R-063 AC-3: an explicit node port list is complete and
 * authoritative for canvas handles and connection validation; its existing
 * `properties.direction` is `in`, `out`, or `inout`, and omission is `inout`.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { SymbolNode } from '../src/components/SymbolNode';
import { EditProvider } from '../src/components/EditContext';
import { validateConnection } from '../src/compatibility/validateConnection';
import { effectiveSymbolPorts } from '../src/compatibility/effectivePorts';
import type { ConnectionValidationContext, NodeConnectionInfo } from '../src/types';

function renderNode(data: Record<string, unknown>) {
  return render(
    <ReactFlowProvider>
      <EditProvider onLabelEdit={() => {}}>
        <SymbolNode id="n1" data={data as never} selected={false} />
      </EditProvider>
    </ReactFlowProvider>,
  ).container;
}

/** Handles that name a port; port-less handles and hidden anchors are excluded. */
function handles(data: Record<string, unknown>) {
  const container = renderNode(data);
  return [...container.querySelectorAll('.react-flow__handle[data-handleid]:not(.coral-edge-anchor):not(.coral-portless-handle)')].map((handle) => ({
    id: handle.getAttribute('data-handleid'),
    type: handle.classList.contains('source') ? 'source' : 'target',
  }));
}

describe('authored ports on the canvas', () => {
  it('places catalog handles on the derived layout sides without changing port IDs', () => {
    const container = renderNode({ label: 'Process', nodeType: 'process', notationId: 'flowchart',
      symbolId: 'flowchart-process', canonical: {},
      resolvedPortAttachments: { in: 'WEST', out: 'EAST' } });
    const input = container.querySelector('.react-flow__handle[data-handleid="in"]');
    const output = container.querySelector('.react-flow__handle[data-handleid="out"]');
    expect(input?.classList.contains('react-flow__handle-left')).toBe(true);
    expect(output?.classList.contains('react-flow__handle-right')).toBe(true);
  });

  it('keeps a semantic corner port connectable at its derived attachment', () => {
    const container = renderNode({ label: 'API', nodeType: 'service', notationId: 'architecture',
      symbolId: 'arch-service', canonical: { id: 'n1', type: 'service', label: 'API' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'corner' }],
      resolvedPortAttachments: { audit: 'EAST' }, resolvedPortPositions: { audit: 1 } });
    const handle = container.querySelector<HTMLElement>('.react-flow__handle[data-handleid="audit"]');
    expect(handle).not.toBeNull();
    expect(handle?.classList.contains('connectable')).toBe(true);
    expect(handle?.classList.contains('react-flow__handle-right')).toBe(true);
    expect(handle?.style.top).not.toBe('50%');
  });

  it('does not move an explicitly authored geometric port to a derived side', () => {
    const container = renderNode({ label: 'Pinned', nodeType: 'process', notationId: 'flowchart',
      symbolId: 'flowchart-process',
      canonical: { ports: [{ id: 'fixed', side: 'SOUTH', properties: { direction: 'out' } }] },
      resolvedPortAttachments: { fixed: 'EAST' } });
    const fixed = container.querySelector('.react-flow__handle[data-handleid="fixed"]');
    expect(fixed?.classList.contains('react-flow__handle-bottom')).toBe(true);
  });

  it('renders an authored directed port instead of the symbol ports', () => {
    expect(handles({
      label: 'Primary', symbolId: 'arch-database',
      canonical: { ports: [{ id: 'replicate', side: 'EAST', properties: { direction: 'out' } }] },
    })).toEqual([{ id: 'replicate', type: 'source' }]);
  });

  it('treats an authored port without a direction as inout', () => {
    expect(handles({
      label: 'Primary', symbolId: 'arch-database',
      canonical: { ports: [{ id: 'replicate', side: 'EAST' }] },
    })).toEqual([{ id: 'replicate-in', type: 'target' }, { id: 'replicate-out', type: 'source' }]);
  });

  it('renders no handles for an explicit empty list', () => {
    expect(handles({ label: 'Closed', symbolId: 'arch-database', canonical: { ports: [] } })).toEqual([]);
  });

  // A registry symbol that declares `ports: []`, or an authored empty list,
  // is portless: it offers visible, connectable handles that carry no port id,
  // so a canvas connection to it saves as a plain port-less edge.
  it.each([
    ['registry', { label: 'Tier', symbolId: 'arch-container', canonical: {} }],
    ['authored', { label: 'Tier', symbolId: 'arch-container', canonical: { ports: [] } }],
  ])('offers port-less connectable handles on a %s portless node', (_kind, data) => {
    const container = renderNode(data);
    expect(handles(data)).toEqual([]);
    const portless = [...container.querySelectorAll('.coral-portless-handle')];
    expect(portless.map((handle) => handle.classList.contains('source') ? 'source' : 'target')).toEqual(['target', 'source']);
    expect(portless.every((handle) => handle.classList.contains('connectable'))).toBe(true);
    expect(portless.every((handle) => !handle.getAttribute('data-handleid'))).toBe(true);
    expect(container.querySelectorAll('.coral-edge-anchor')).toHaveLength(0);
    // Positioned inline like port handles, so the canvas hover rule that
    // replaces `transform` cannot shift a handle out from under the pointer.
    expect(portless.map((handle) => (handle as HTMLElement).style.transform)).toEqual(['translateX(-50%)', 'translateX(-50%)']);
  });

  it('colours port-less handles with the drag state for the whole node', () => {
    const container = renderNode({ label: 'Tier', symbolId: 'arch-container', canonical: {}, dragStates: { '*': 'compatible' } });
    const portless = [...container.querySelectorAll<HTMLElement>('.coral-portless-handle')];
    expect(portless.map((handle) => handle.style.background)).toEqual(['rgb(34, 197, 94)', 'rgb(34, 197, 94)']);
  });

  // Found by the Slice 92 pairwise supplement (PS-01): an edge without
  // explicit ports whose source has only input ports must still draw.
  it('anchors an edge end on a node that has no port for that direction', () => {
    const container = renderNode({ label: 'Primary', symbolId: 'arch-database', canonical: {} });
    expect(handles({ label: 'Primary', symbolId: 'arch-database', canonical: {} })).toEqual([{ id: 'query', type: 'target' }]);
    const anchors = [...container.querySelectorAll('.coral-edge-anchor')];
    expect(anchors.map((anchor) => anchor.classList.contains('source') ? 'source' : 'target')).toEqual(['source']);
    expect(anchors.every((anchor) => !anchor.classList.contains('connectable'))).toBe(true);
  });

  it('keeps symbol ports when no list is authored', () => {
    expect(handles({ label: 'Primary', symbolId: 'arch-database', canonical: {} }))
      .toEqual([{ id: 'query', type: 'target' }]);
  });
});

describe('authored ports in connection validation', () => {
  const context = (nodes: NodeConnectionInfo[]): ConnectionValidationContext => ({
    notationId: 'flowchart',
    nodeInfo: new Map(nodes.map((node) => [node.id, node])),
    existingEdges: [{ source: 'a', target: 'c', sourcePort: 'feed', targetPort: 'in' }],
  });
  const target: NodeConnectionInfo = { id: 'b', symbolId: 'flowchart-process' };

  it('does not accept invented default port IDs when the shared interpretation is portless', () => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'out', targetPortId: 'in' },
      { notationId: 'flowchart', existingEdges: [], nodeInfo: new Map([
        ['a', { id: 'a', symbolId: 'unknown', semanticPorts: [] }],
        ['b', { id: 'b', symbolId: 'unknown', semanticPorts: [] }],
      ]) },
    );
    expect(result).toMatchObject({ valid: false, reason: 'port-not-found' });
  });

  it('rejects an authored input-only port used as a source', () => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'feed', targetPortId: 'in' },
      context([{ id: 'a', symbolId: 'flowchart-process', ports: [{ id: 'feed', side: 'EAST', properties: { direction: 'in' } }] }, target]),
    );
    expect(result).toMatchObject({ valid: false, reason: 'port-direction-mismatch' });
  });

  // Review finding 2: an explicit port id that does not resolve is rejected.
  it.each([
    ['authored empty list', { id: 'a', symbolId: 'flowchart-process', ports: [] }],
    ['registry ports', { id: 'a', symbolId: 'flowchart-process' }],
  ])('rejects a missing explicit source port on %s', (_kind, source) => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'missing', targetPortId: 'in' },
      { ...context([source as NodeConnectionInfo, target]), existingEdges: [] },
    );
    expect(result).toMatchObject({ valid: false, reason: 'port-not-found' });
    expect(result.message).toContain('"missing"');
  });

  it('resolves an inout port by its canvas handle id', () => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'sync-out', targetPortId: 'in' },
      { ...context([{ id: 'a', symbolId: 'flowchart-process', ports: [{ id: 'sync', side: 'EAST' }] }, target]),
        existingEdges: [] },
    );
    expect(result).toMatchObject({ valid: true, hasWarning: false });
  });

  it('rejects a missing explicit target port', () => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'out', targetPortId: 'nowhere' },
      { ...context([{ id: 'a', symbolId: 'flowchart-process' }, target]), existingEdges: [] },
    );
    expect(result).toMatchObject({ valid: false, reason: 'port-not-found' });
  });

  it('accepts an authored output port as a source', () => {
    const result = validateConnection(
      { sourceNodeId: 'a', targetNodeId: 'b', sourcePortId: 'feed', targetPortId: 'in' },
      { ...context([{ id: 'a', symbolId: 'flowchart-process', ports: [{ id: 'feed', side: 'EAST', properties: { direction: 'out' } }] }, target]),
        existingEdges: [] },
    );
    expect(result).toMatchObject({ valid: true, hasWarning: false });
  });
});

describe('effectiveSymbolPorts', () => {
  it('keeps authored position, label, and maxConnections', () => {
    expect(effectiveSymbolPorts(undefined, undefined, [
      { id: 'feed', side: 'EAST', label: 'Feed', position: 0.25, properties: { direction: 'out', maxConnections: 2 } },
    ])).toEqual([{ id: 'feed', anchor: 'EAST', direction: 'out', label: 'Feed', position: 0.25, maxConnections: 2 }]);
  });
});
