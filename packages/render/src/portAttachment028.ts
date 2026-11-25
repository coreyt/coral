import type { LayoutDirection } from './layout/types.js';
import type { ExactAnchor, ResolvedSemanticPort } from './semanticPorts028.js';

export interface PortAttachmentPolicy028 {
  /** Shape-relative anchors that layout may consider. */
  eligible: readonly ExactAnchor[];
  /** Flow-relative preference only; not a saved or hard-pinned attachment. */
  preferred: ExactAnchor | undefined;
  fixed: boolean;
}

const sides: readonly ExactAnchor[] = ['N', 'S', 'E', 'W'];
const corners: readonly ExactAnchor[] = ['NE', 'NW', 'SE', 'SW'];
const exactAnchors: readonly ExactAnchor[] = [...sides, ...corners];

export class SemanticPortAnchorCapabilityError extends Error {
  readonly code = 'coral.port.anchor.unsupported';
  constructor(readonly portId: string) {
    super(`coral.port.anchor.unsupported: port ${portId} has no resolved stencil anchor geometry`);
    this.name = 'SemanticPortAnchorCapabilityError';
  }
}
const flowSide: Record<LayoutDirection, { source: ExactAnchor; target: ExactAnchor }> = {
  RIGHT: { source: 'E', target: 'W' },
  LEFT: { source: 'W', target: 'E' },
  DOWN: { source: 'S', target: 'N' },
  UP: { source: 'N', target: 'S' },
};

/** Convert a semantic port constraint into layout choices without writing geometry to source. */
export function portAttachmentPolicy028(
  port: ResolvedSemanticPort,
  direction: LayoutDirection,
  endpoint: 'source' | 'target',
  options?: { hasBottomCaption?: boolean },
): PortAttachmentPolicy028 {
  const noSouth = Boolean(options?.hasBottomCaption);
  const pickPreferred = (): ExactAnchor => {
    const base = flowSide[direction][endpoint];
    if (noSouth && base === 'S') return endpoint === 'source' ? 'E' : 'W';
    return base;
  };
  if (port.anchor === 'corner') {
    const elig = noSouth ? corners.filter((a) => !a.startsWith('S')) : corners;
    return { eligible: elig, preferred: undefined, fixed: false };
  }
  if (port.anchor === 'side') {
    const elig = noSouth ? sides.filter((a) => a !== 'S') : sides;
    return { eligible: elig, preferred: pickPreferred(), fixed: false };
  }
  if (port.anchor === 'auto') {
    const elig = noSouth ? exactAnchors.filter((a) => !a.startsWith('S')) : exactAnchors;
    return { eligible: elig, preferred: pickPreferred(), fixed: false };
  }
  // Named stencil pins are projected with the selected catalog's geometry.
  if (typeof port.anchor !== 'string') throw new SemanticPortAnchorCapabilityError(port.id);
  if (!exactAnchors.includes(port.anchor)) throw new SemanticPortAnchorCapabilityError(port.id);
  return { eligible: [port.anchor], preferred: port.anchor, fixed: true };
}
