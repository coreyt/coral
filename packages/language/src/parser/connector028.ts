import type { EndpointMarker } from '../types.js';

/** Approved connector-end spellings shared by the staged and preview readers. */
export interface ConnectorSyntax028 {
  /** Authored shaft positions, including a second-position period if dashed. */
  dashCount?: 1 | 2 | 3 | 4 | 5 | 6;
  stroke: 'solid' | 'dashed';
  /** Whether the operator itself specified the end, before keyed fields. */
  firstEndAuthored: boolean;
  secondEndAuthored: boolean;
  firstEnd: EndpointMarker;
  secondEnd: EndpointMarker;
}

/** Approved keyed end names; multiplicity marks have no compact operator spelling. */
const keyedEnds028: Readonly<Record<string, EndpointMarker>> = {
  none: { kind: 'none', fill: 'unspecified' },
  arrow: { kind: 'arrow', fill: 'open' },
  filledArrow: { kind: 'arrow', fill: 'filled' },
  triangle: { kind: 'triangle', fill: 'open' },
  filledTriangle: { kind: 'triangle', fill: 'filled' },
  diamond: { kind: 'diamond', fill: 'open' },
  filledDiamond: { kind: 'diamond', fill: 'filled' },
  circle: { kind: 'circle', fill: 'open' },
  filledCircle: { kind: 'circle', fill: 'filled' },
  bar: { kind: 'bar', fill: 'unspecified' },
  crowFoot: { kind: 'crow-foot', fill: 'unspecified' },
  zeroOrOne: { kind: 'zero-or-one', fill: 'unspecified' },
  one: { kind: 'one', fill: 'unspecified' },
  zeroOrMany: { kind: 'zero-or-many', fill: 'unspecified' },
  oneOrMany: { kind: 'one-or-many', fill: 'unspecified' },
};
/** Semantic end names are first-class author spellings with an explicit
 * reference to the canonical mark in the portable model. */
export const SEMANTIC_END_MARKS_028: Readonly<Record<string, EndpointMarker>> = {
  zeroToMany: keyedEnds028.zeroOrMany!,
};
const noShortformKinds028 = new Set<EndpointMarker['kind']>([
  'zero-or-one', 'one', 'zero-or-many', 'one-or-many',
]);

export function keyedConnectorEnd028(value: string): EndpointMarker | undefined {
  const marker = keyedEnds028[value] ?? SEMANTIC_END_MARKS_028[value];
  return marker ? { ...marker } : undefined;
}

export function connectorEndHasShorthand028(marker: EndpointMarker, side: 'first' | 'second'): boolean {
  if (side === 'first') {
    // Only a bare first end and the open <- arrow have compact spellings.
    return marker.kind === 'none' || (marker.kind === 'arrow' && marker.fill === 'open');
  }
  return !noShortformKinds028.has(marker.kind);
}

/** Longest spellings first so a filled marker is never split into two tokens. */
export const CONNECTOR_END_SPELLINGS_028 = [
  '#|>', '|#>', '|>#', '#<>', '<#>', '<>#', '#o', 'o#',
  '|>', '<>', '#>', '>#', '>', '|', 'o', '{',
] as const;

export function parseConnector028(raw: string): ConnectorSyntax028 | undefined {
  const none = { kind: 'none' as const, fill: 'unspecified' as const };
  const arrow = { kind: 'arrow' as const, fill: 'open' as const };
  const firstArrow = /^<(-{1,6})(>)?$/.exec(raw);
  if (firstArrow) return { dashCount: firstArrow[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
    stroke: 'solid', firstEndAuthored: true, secondEndAuthored: !!firstArrow[2],
    firstEnd: arrow, secondEnd: firstArrow[2] ? arrow : none };
  const dashed = /^(-\.-{1,4})(.*)$/.exec(raw);
  const match = dashed ?? /^(-{1,6})(.*)$/.exec(raw);
  if (!match) return undefined;
  const ends: Record<string, ConnectorSyntax028['secondEnd']> = {
    '': none,
    '>': arrow,
    '#>': { kind: 'arrow', fill: 'filled' },
    '>#': { kind: 'arrow', fill: 'filled' },
    '|>': { kind: 'triangle', fill: 'open' },
    '#|>': { kind: 'triangle', fill: 'filled' },
    '|#>': { kind: 'triangle', fill: 'filled' },
    '|>#': { kind: 'triangle', fill: 'filled' },
    '<>': { kind: 'diamond', fill: 'open' },
    '#<>': { kind: 'diamond', fill: 'filled' },
    '<#>': { kind: 'diamond', fill: 'filled' },
    '<>#': { kind: 'diamond', fill: 'filled' },
    '|': { kind: 'bar', fill: 'unspecified' },
    'o': { kind: 'circle', fill: 'open' },
    '#o': { kind: 'circle', fill: 'filled' },
    'o#': { kind: 'circle', fill: 'filled' },
    '{': { kind: 'crow-foot', fill: 'unspecified' },
  };
  const secondEnd = ends[match[2]!];
  return secondEnd ? { dashCount: match[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
    stroke: dashed ? 'dashed' : 'solid', firstEndAuthored: match[2] === '',
    secondEndAuthored: true, firstEnd: none, secondEnd } : undefined;
}

/** A shaft-length hint must not change UML sequence creation recognition. */
export function isDashedOpenArrow028(connector: ConnectorSyntax028 | undefined): boolean {
  return connector?.stroke === 'dashed' && connector.firstEnd.kind === 'none' &&
    connector.secondEnd.kind === 'arrow' && connector.secondEnd.fill === 'open';
}
