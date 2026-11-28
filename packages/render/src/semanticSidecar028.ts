import type { GraphIR, GraphNode } from '@graph-ir/core';
import type { NodeInterpretation028 } from './interpretation028.js';
import { catalogForInterpretations029 } from './documentCatalog029.js';
import { notationCatalogIdentityForEdition, resolveNotationNode028 } from './notations/index.js';

export class SemanticSidecarMismatch028 extends Error {
  readonly code = 'render.capability.semantic-port-sidecar';

  constructor(readonly nodeId: string, reason: string) {
    super(`render.capability.semantic-port-sidecar: ${nodeId} ${reason}`);
    this.name = 'SemanticSidecarMismatch028';
  }
}

/** One fail-closed identity gate for layout, port checks, and U2 reports. */
export function assertSemanticSidecar028(
  graph: GraphIR,
  notation: string | undefined,
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
): void {
  const mismatch = (nodeId: string, reason: string): never => {
    throw new SemanticSidecarMismatch028(nodeId, reason);
  };
  if (!notation) return mismatch(graph.id, 'requires an installed notation');
  const edition = typeof graph.metadata?.custom?.coralEdition === 'string' ? graph.metadata.custom.coralEdition : undefined;
  const catalog = notationCatalogIdentityForEdition(notation, edition);
  if (!catalog) return mismatch(graph.id, `has no installed catalog for ${notation}`);
  // User symbols resolve through the document catalog the interpretations carry.
  const documentCatalog = catalogForInterpretations029(notation, interpretations, edition);
  const visited = new Set<string>();
  const visit = (nodes: GraphNode[]): void => {
    for (const node of nodes) {
      if (visited.has(node.id)) mismatch(node.id, 'appears more than once');
      visited.add(node.id);
      if (node.ports !== undefined) mismatch(node.id, 'mixes geometric GraphIR 3 ports with semantic ports');
      const interpreted = interpretations.get(node.id) ??
        mismatch(node.id, 'has no source-owned interpretation');
      const installed = resolveNotationNode028(node, notation, documentCatalog);
      if (interpreted.nodeId !== node.id || interpreted.authoredType !== node.type ||
        interpreted.authoredSymbol !== node.symbol || interpreted.authoredVariant !== node.variant ||
        interpreted.effectiveSymbolId !== installed.effectiveSymbolId ||
        interpreted.effectiveVariantId !== installed.effectiveVariantId ||
        interpreted.status !== installed.status) {
        mismatch(node.id, 'does not match the display node identity');
      }
      if (interpreted.catalogIdentity.id !== catalog.id ||
        interpreted.catalogIdentity.version !== catalog.version ||
        interpreted.catalogIdentity.digest !== catalog.digest) {
        mismatch(node.id, 'uses a different catalog snapshot');
      }
      if (node.children) visit(node.children);
    }
  };
  visit(graph.nodes);
  for (const id of interpretations.keys()) if (!visited.has(id)) mismatch(id, 'has no display node');
}
