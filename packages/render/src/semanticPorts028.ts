/** U1 port union; no GraphIR persistence or geometric attachment is implied. */
export type PortDirection = 'in' | 'out' | 'inout';
export type ExactAnchor = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
export type AnchorConstraint = ExactAnchor | 'side' | 'corner' | 'auto' |
  { kind: 'symbol'; id: string };

export interface SemanticPortInput {
  id: string;
  label?: string;
  /** Positive connection limit; omitted means unlimited. */
  maxConnections?: number;
  direction: PortDirection;
  anchor?: AnchorConstraint;
}

export interface ResolvedSemanticPort {
  id: string;
  label?: string;
  maxConnections?: number;
  direction: PortDirection;
  anchor: AnchorConstraint;
  origin: 'catalog' | 'authored';
  anchorWasExplicit: boolean;
}

export interface PortUnionResult {
  ports: readonly ResolvedSemanticPort[];
  collisions: readonly string[];
}

export function mergeSemanticPorts028(
  catalog: readonly SemanticPortInput[],
  authored: readonly SemanticPortInput[],
): PortUnionResult {
  const ports: ResolvedSemanticPort[] = [];
  const collisions: string[] = [];
  const seen = new Set<string>();
  for (const [origin, inputs] of [['catalog', catalog], ['authored', authored]] as const) {
    for (const input of inputs) {
      if (seen.has(input.id)) { collisions.push(input.id); continue; }
      seen.add(input.id);
      ports.push({ id: input.id, direction: input.direction,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.maxConnections !== undefined ? { maxConnections: input.maxConnections } : {}),
        anchor: input.anchor ?? 'auto', anchorWasExplicit: input.anchor !== undefined, origin });
    }
  }
  return { ports, collisions };
}
