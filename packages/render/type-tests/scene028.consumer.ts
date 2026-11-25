/** External Node consumer of the 0.2.8 typed scene contract. This file is
 * compiled by `npm run typecheck` and deliberately has no runtime side effects. */
import type { GraphIR } from '@graph-ir/core';
import { prepareSequenceScene028, prepareSpatialScene028, renderSvg,
  RenderCapabilityError, type PreparedSpatialScene028,
  type ScenePartRecord028, type SequenceGraph } from '@coral-viz/render';

declare const laidOutGraph: GraphIR;
declare const nestedGraph: GraphIR;
declare const sequenceGraph: SequenceGraph;

const scene: PreparedSpatialScene028 = prepareSpatialScene028(laidOutGraph, {
  style: 'hifi', revision: 'document-12',
});
const ownerParts: readonly string[] = scene.ownerLookup.partIds['node:example'] ?? [];
const hitBounds = scene.ownerLookup.hitBounds['node:example'];
const connectedPort = scene.portContacts.example?.output;
const routeParts: readonly ScenePartRecord028[] = scene.parts.filter((part) =>
  part.owner.kind === 'edge' && part.geometry.kind === 'route');
const svg: string = renderSvg(laidOutGraph, { style: scene.style });
const nested = prepareSpatialScene028(nestedGraph, { style: scene.style });
const nestedChildParts: readonly string[] = nested.ownerLookup.partIds['node:child'] ?? [];
const sequence = prepareSequenceScene028(sequenceGraph, { style: 'hifi' });
const messageParts: readonly string[] = sequence.ownerLookup.partIds['message:call'] ?? [];
try {
  prepareSpatialScene028(laidOutGraph, { notation: 'unsupported-profile' });
} catch (error) {
  if (error instanceof RenderCapabilityError) {
    const portDiagnostic = error.diagnostics.find((diagnostic) =>
      diagnostic.subject?.kind === 'port');
    void portDiagnostic?.code;
  }
}

void [ownerParts, hitBounds, connectedPort, routeParts, svg, nestedChildParts, messageParts];
