import type { NodeInterpretation028 } from './interpretation028.js';

export interface SourceRange028 {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

export interface PortReferenceCheck028 {
  edgeId: string;
  source: NodeInterpretation028;
  target: NodeInterpretation028;
  /** Explicit semantic direction, independent of written first/second endpoints.
   * Omission is unverified, never an implicit first-to-second direction. */
  edgeDirection?: 'first-to-second' | 'second-to-first' | 'none' | 'both' | 'unverified';
  sourcePort?: string;
  targetPort?: string;
  sourceRange?: SourceRange028;
  targetRange?: SourceRange028;
}

export interface PortReferenceDiagnostic028 {
  code: 'coral.port.reference.missing' | 'coral.port.reference.direction';
  edgeId: string;
  nodeId: string;
  role: 'source' | 'target';
  portId: string;
  message: string;
  range?: SourceRange028;
}

export interface PortReferenceObligation028 {
  id: 'CORAL.PORT.REFERENCE.UNVERIFIED';
  message: string;
}

export interface PortReferenceAssessment028 {
  diagnostics: PortReferenceDiagnostic028[];
  obligations: PortReferenceObligation028[];
}

/** Check edge references against one U1-resolved semantic-port set. */
export function assessPortReferences028(input: PortReferenceCheck028): PortReferenceAssessment028 {
  const diagnostics: PortReferenceDiagnostic028[] = [];
  const obligations: PortReferenceObligation028[] = [];
  for (const role of ['source', 'target'] as const) {
    const node = input[role];
    const portId = role === 'source' ? input.sourcePort : input.targetPort;
    const range = role === 'source' ? input.sourceRange : input.targetRange;
    if (portId === undefined) continue;
    if (node.portCollisions.includes(portId)) {
      obligations.push({ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
        message: `Edge ${input.edgeId} ${role} port ${portId} on ${node.nodeId} has a colliding semantic-port declaration` });
      continue;
    }
    if (node.invalidAnchorPortIds.includes(portId)) {
      obligations.push({ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
        message: `Edge ${input.edgeId} ${role} port ${portId} on ${node.nodeId} has an unresolved named anchor` });
      continue;
    }
    // A failed symbol/variant lookup leaves the inherited port namespace
    // unknown. The capability diagnostic is authoritative; absence from this
    // partial set is not evidence that the referenced port is missing.
    if (node.status === 'unknown-symbol' || node.status === 'unknown-variant') {
      obligations.push({ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
        message: `Edge ${input.edgeId} ${role} port ${portId} on ${node.nodeId} cannot be verified until its symbol and variant resolve` });
      continue;
    }
    const port = node.semanticPorts.find((candidate) => candidate.id === portId);
    if (!port) {
      diagnostics.push({ code: 'coral.port.reference.missing', edgeId: input.edgeId,
        nodeId: node.nodeId, role, portId,
        message: `Edge ${input.edgeId} references missing ${role} port ${portId} on ${node.nodeId}`,
        ...(range ? { range } : {}) });
    } else if (input.edgeDirection !== 'first-to-second' && input.edgeDirection !== 'second-to-first') {
      obligations.push({ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
        message: `Edge ${input.edgeId} ${role} port ${portId} on ${node.nodeId} has no verified port-role rule for ${input.edgeDirection ?? 'unspecified'} direction` });
    } else if ((role === 'source' &&
      (input.edgeDirection === 'second-to-first' ? port.direction === 'out' : port.direction === 'in')) ||
      (role === 'target' &&
        (input.edgeDirection === 'second-to-first' ? port.direction === 'in' : port.direction === 'out'))) {
      diagnostics.push({ code: 'coral.port.reference.direction', edgeId: input.edgeId,
        nodeId: node.nodeId, role, portId,
        message: `${role} port ${portId} on ${node.nodeId} cannot carry this ${input.edgeDirection === 'second-to-first' ? 'reverse ' : ''}connection`,
        ...(range ? { range } : {}) });
    }
  }
  return { diagnostics, obligations };
}

export function validatePortReferences028(input: PortReferenceCheck028): PortReferenceDiagnostic028[] {
  return assessPortReferences028(input).diagnostics;
}
