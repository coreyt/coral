/** Source port-anchor spellings: generic kinds, exact sides and corners
 * (with the `up`/`down`/`right`/`left` aliases), or a named symbol anchor. */
export type ProjectedPortAnchor028 =
  | { kind: 'auto' | 'side' | 'corner' }
  | { kind: 'exact'; position: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' }
  | { kind: 'symbol'; id: string };

const exactAnchors028 = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const anchorAliases028: Readonly<Record<string, 'N' | 'S' | 'E' | 'W'>> = {
  up: 'N', down: 'S', right: 'E', left: 'W',
};
export function projectPortAnchor028(value: string): ProjectedPortAnchor028 {
  if (value === 'auto' || value === 'side' || value === 'corner') return { kind: value };
  const exact = anchorAliases028[value] ?? value;
  if (exactAnchors028.has(exact)) return { kind: 'exact', position: exact as
    'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' };
  return { kind: 'symbol', id: value };
}
