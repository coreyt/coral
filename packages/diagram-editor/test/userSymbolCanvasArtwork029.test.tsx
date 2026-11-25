import { render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { SymbolNode } from '../../viz/src/components/SymbolNode.js';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { prepareSpatialScene028, renderSvg, successorSourceDisplayWithSemanticPorts028,
  verifyPortableSuccessorSource028 } from '@coral-viz/render';
import { CanvasPane, type CanvasPaneProps } from '../src/components/CanvasPane.js';
import { layoutGraphForSvg } from '../../render/src/svg/layout.js';

vi.mock('@xyflow/react', async () => ({
  ...await vi.importActual<Record<string, unknown>>('@xyflow/react'),
  ReactFlow: ({ children, nodes }: { children: ReactNode; nodes: ComponentProps<typeof SymbolNode>[] }) =>
    <div>{nodes.map((node) => <SymbolNode key={node.id} {...node} />)}{children}</div>,
  Handle: () => null,
}));

// C4: the editor canvas shares one set of user-symbol definitions beside its
// marker definitions, with the scope the node and edge parts use
// (c4-design.md "Editor canvas").

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  label center', '  outline diamond', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', 'h service [symbol: "local.probe"]', 'b service', 'g -> b', ''].join('\n');

async function scene() {
  const meaning = verifyPortableSuccessorSource028(SOURCE).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const,
    semanticGraph: display, successorSource: meaning };
  return { prepared: prepareSpatialScene028(laidOut, options), svg: renderSvg(laidOut, options) };
}

const props = (scene028: CanvasPaneProps['scene028']): CanvasPaneProps => ({
  scene028, renderStyle028: 'lowfi', onRenderStyle028Change: vi.fn(), nodes: ['g', 'h'].map((id) => ({ id, type: 'symbol', position: { x: 0, y: 0 },
    data: { label: id, nodeType: 'service', symbolId: 'local.probe' } })), edges: [],
  onNodesChange: vi.fn(), onEdgesChange: vi.fn(), onSelectionChange: vi.fn(), onLabelEdit: vi.fn(),
  onReflow: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), canUndo: false, canRedo: false, undoCount: 0,
  redoCount: 0, isReflowing: false, isLoading: false, showMinimap: false, showControls: false,
  notation: 'architecture', theme: {},
});

describe('user-symbol definitions on the editor canvas', () => {
  it('writes each used definition once, in the marker definitions scope', async () => {
    const { prepared, svg } = await scene();
    const { container } = render(<ReactFlowProvider><CanvasPane {...props(prepared)} /></ReactFlowProvider>);
    const symbols = [...container.querySelectorAll('symbol')];
    expect(symbols).toHaveLength(1);
    const uses = [...container.querySelectorAll('[data-coral-artwork] use')];
    expect(uses).toHaveLength(2);
    for (const use of uses) expect(use.getAttribute('href')).toBe(`#${symbols[0]!.id}`);
    const markerScope = container.querySelector('marker')?.id.split('-coral-marker-')[0];
    expect(markerScope).toBeTruthy();
    expect(symbols[0]!.id).toBe(`${markerScope}-coral-sym-probe`);
    // The same definition, element for element, as the SVG serializer's (modulo scope).
    const serialized = svg.slice(svg.indexOf('<symbol '), svg.indexOf('</symbol>') + '</symbol>'.length);
    const scope = serialized.match(/<symbol id="([^"]+)-coral-sym-probe"/)![1]!;
    const parsed = new DOMParser().parseFromString(serialized.replaceAll(scope, markerScope!), 'image/svg+xml');
    expect(symbols[0]!.outerHTML.replace(/ xmlns="[^"]+"/g, '').replace(/<(\w+)([^>]*)><\/\1>/g, '<$1$2/>'))
      .toBe(new XMLSerializer().serializeToString(parsed.documentElement).replace(/ xmlns="[^"]+"/g, ''));
  });
});
