export type SourceDisposition =
  | 'parity'
  | 'projection-only'
  | 'generated-geometry'
  | 'document-state'
  | 'later-slice';

export interface SourceFieldDisposition {
  field: string;
  disposition: SourceDisposition;
  sourceComparable: boolean;
  opaqueWhenPresent: boolean;
  owner?: string;
}

/** Internal audit authority for fields retained by the reference editor. */
export const SOURCE_FIELD_DISPOSITIONS = {
  graph: [
    ...['version', 'id', 'name', 'metadata', 'layoutOptions', 'constraints', 'nodes', 'edges']
      .map((field) => ({ field, disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false }) as const),
    { field: 'profile', disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false, owner: 'Slice 60' },
    { field: 'interaction', disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false, owner: 'Slice 70' },
  ],
  node: [
    ...[
      'id', 'type', 'label', 'description', 'properties', 'position', 'pinned', 'dimensions',
      'symbol', 'variant', 'ports', 'labelPlacement', 'layoutOptions', 'parent', 'children',
    ].map((field) => ({ field, disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false }) as const),
    { field: 'sourceInfo', disposition: 'projection-only', sourceComparable: true, opaqueWhenPresent: false },
    { field: 'data', disposition: 'document-state', sourceComparable: true, opaqueWhenPresent: false },
    { field: 'classifier', disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false, owner: 'Slice 60' },
  ],
  edge: [
    ...[
      'id', 'source', 'target', 'sourcePort', 'targetPort', 'type', 'label', 'description', 'properties',
      'labelPlacement', 'routeIntent', 'style', 'sourceEnd', 'targetEnd',
    ].map((field) => ({ field, disposition: 'parity', sourceComparable: true, opaqueWhenPresent: false }) as const),
    { field: 'sourceInfo', disposition: 'projection-only', sourceComparable: true, opaqueWhenPresent: false },
    { field: 'data', disposition: 'document-state', sourceComparable: true, opaqueWhenPresent: false },
    { field: 'lineStyle', disposition: 'document-state', sourceComparable: true, opaqueWhenPresent: false },
    { field: 'routingPoints', disposition: 'generated-geometry', sourceComparable: false, opaqueWhenPresent: true },
  ],
} as const satisfies Record<'graph' | 'node' | 'edge', readonly SourceFieldDisposition[]>;

export function sourceComparableFields(kind: keyof typeof SOURCE_FIELD_DISPOSITIONS): Set<string> {
  return new Set(SOURCE_FIELD_DISPOSITIONS[kind]
    .filter((entry) => entry.sourceComparable)
    .map((entry) => entry.field));
}
