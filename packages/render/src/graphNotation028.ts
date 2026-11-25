import type { NotationProfile } from '@graph-ir/core';

/** GraphIR's UML family discriminator is portable; notation metadata is optional. */
export function effectiveGraphNotationId028(graph: {
  profile?: NotationProfile;
  metadata?: { notation?: string };
}): string | undefined {
  return graph.metadata?.notation ?? (graph.profile ? `uml-${graph.profile.kind}` : undefined);
}
