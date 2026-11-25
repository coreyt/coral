import type { GraphNode } from '@graph-ir/core';
import { isContainerNode028 } from '../containerGeometry028.js';
import { measureEdgeLabel028 } from '../edgeLabelPlacement028.js';
import type { CatalogSnapshot028 } from '../interpretation028.js';
import { renderSymbolId } from '../scene.js';
import { resolveSvgNodeFont, type SvgOptions } from '../svg/serialize.js';
import type { LayoutDirection, LayoutEdge, LayoutNode, OutsideLabel029 } from './types.js';

type Side = OutsideLabel029['side'];
const FORWARD: Record<LayoutDirection, Side> = { DOWN: 'below', UP: 'above', RIGHT: 'right', LEFT: 'left' };
const BACKWARD: Record<LayoutDirection, Side> = { DOWN: 'above', UP: 'below', RIGHT: 'left', LEFT: 'right' };
const PORT_SIDE = { NORTH: 'above', SOUTH: 'below', WEST: 'left', EAST: 'right' } as const;

interface UserSymbolOutsideLabelsInput029 {
  /** The ELK input nodes, as passed to `computeElkLayout`. */
  nodes: readonly LayoutNode[];
  /** The ELK input edges, after rank reversal. */
  edges: readonly LayoutEdge[];
  /** The display nodes the ELK nodes came from, nested or flat. */
  sourceNodes: readonly GraphNode[];
  notationId?: string;
  catalog?: CatalogSnapshot028;
  direction: LayoutDirection;
  /** Outside labels and the forward and backward sides are layered semantics; other algorithms reserve nothing. */
  layered: boolean;
  /** Font context; the reserved box is the larger of the `lowfi` and `hifi` measurements under it. */
  sceneOptions?: Pick<SvgOptions, 'style' | 'fontSettings' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'lineHeight'>;
}

/**
 * Reserve each user symbol's definition label side in the ELK input (C4
 * revision 5): one outside node label, so ELK keeps neighbours and its
 * connectors clear while the node box and its ports stay as they are. A side
 * the node's own connectors use is not reserved; the scene then places the
 * label on the first clear side. Returns `nodes` itself when nothing qualifies.
 */
export function userSymbolOutsideLabels029(input: UserSymbolOutsideLabelsInput029): readonly LayoutNode[] {
  if (!input.layered || !input.catalog?.userSymbols?.size) return input.nodes;
  const layoutNodes = new Map<string, LayoutNode>();
  const indexLayout = (nodes: readonly LayoutNode[]) => {
    for (const node of nodes) { layoutNodes.set(node.id, node); indexLayout(node.children ?? []); }
  };
  indexLayout(input.nodes);
  const labels = new Map<string, OutsideLabel029>();
  const visit = (nodes: readonly GraphNode[]) => {
    for (const node of nodes) {
      visit(node.children ?? []);
      const layoutNode = layoutNodes.get(node.id);
      if (!layoutNode || node.labelPlacement || node.label === '' || isContainerNode028(node)) continue;
      const symbolId = renderSymbolId(node, input.notationId, input.catalog);
      const side = symbolId ? input.catalog?.userSymbols?.get(symbolId)?.definition.label : undefined;
      if (!side || side === 'center' || sideInUse(layoutNode, side, input.edges, input.direction)) continue;
      const sizes = (['lowfi', 'hifi'] as const).map((style) => {
        const font = resolveSvgNodeFont(node, { ...input.sceneOptions, style });
        return measureEdgeLabel028({ text: node.label ?? node.id, fontFamily: font?.cssFamily,
          fontSize: font?.size, fontWeight: font?.weight, lineHeight: font?.lineHeight });
      });
      labels.set(node.id, { side, width: Math.max(...sizes.map((size) => size.width)),
        height: Math.max(...sizes.map((size) => size.height)) });
    }
  };
  visit(input.sourceNodes);
  if (!labels.size) return input.nodes;
  const apply = (node: LayoutNode): LayoutNode => {
    const label = labels.get(node.id);
    return { ...node, ...(label ? { outsideLabel029: label } : {}),
      ...(node.children ? { children: node.children.map(apply) } : {}) };
  };
  return input.nodes.map(apply);
}

/**
 * Whether a connector at the node leaves or enters through `side` (revision 5
 * rule 4). Port sides are the ELK input's, so a corner anchor counts as the
 * side its layout port maps to.
 */
function sideInUse(node: LayoutNode, side: Side, edges: readonly LayoutEdge[], direction: LayoutDirection): boolean {
  return edges.some((edge) => {
    if (edge.source !== node.id && edge.target !== node.id) return false;
    if (edge.source === edge.target) return true;
    const leaving = edge.source === node.id;
    const port = node.ports?.find((item) => item.id === (leaving ? edge.sourcePort : edge.targetPort));
    if (port && port.attachment !== 'free') return PORT_SIDE[port.side] === side;
    if (port && PORT_SIDE[port.side] === side) return true;
    return (leaving ? FORWARD : BACKWARD)[direction] === side;
  });
}
