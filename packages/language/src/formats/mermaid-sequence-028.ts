import type { GraphIR } from '../types.js';

/** Canonical appearance implied by a simple imported Mermaid sequence kind.
 * Every other field stays untouched for the installed writer's exact reparse
 * comparison. Advanced interactions return undefined rather than flattening. */
export function canonicalSimpleMermaidSequence028(graph: GraphIR): GraphIR | undefined {
  if (graph.metadata?.notation !== 'uml-sequence' || graph.profile?.id !== 'uml' ||
      graph.profile.kind !== 'sequence' || !graph.interaction ||
      (graph.interaction.notes?.length ?? 0) > 0 ||
      (graph.interaction.activations?.length ?? 0) > 0 ||
      (graph.interaction.fragments?.length ?? 0) > 0 ||
      graph.interaction.messages.length !== graph.edges.length) return undefined;
  const messages = new Map(graph.interaction.messages.map((message) => [message.edgeId, message]));
  if (messages.size !== graph.edges.length) return undefined;
  const edges: GraphIR['edges'] = [];
  for (const edge of graph.edges) {
    const message = messages.get(edge.id);
    const kind = message?.kind;
    if (!message || edge.source !== message.sourceParticipantId ||
        edge.target !== message.targetParticipantId ||
        !((kind === 'synchronous' && edge.type === 'sync') ||
          (kind === 'asynchronous' && edge.type === 'async') ||
          (kind === 'return' && edge.type === 'return')) ||
        edge.sourceEnd !== undefined || edge.targetEnd !== undefined || edge.style !== undefined)
      return undefined;
    edges.push({ ...edge,
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: kind === 'synchronous'
        ? { kind: 'triangle', fill: 'filled' } : { kind: 'arrow', fill: 'open' } },
      ...(kind === 'return' ? { style: { lineStyle: 'dashed' as const } } : {}),
    });
  }
  return { ...graph, edges };
}
