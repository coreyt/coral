/** Diagram Set ports name the shaft approach, opposite the marker's pointing direction. */
import { CHARACTER_GLYPH_ROLES_028 as glyph } from './characterGlyphRoles028.js';

type EndpointFamily029 = 'arrow_open' | 'triangle_open' | 'triangle_filled' |
  'diamond_open' | 'diamond_filled' | 'circle_open';

export function getEndpointGlyph029(family: EndpointFamily029, dx: number, dy: number): string {
  if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error('Endpoint requires a cardinal unit direction.');
  const port = dx > 0 ? 'w' : dx < 0 ? 'e' : dy > 0 ? 'n' : 's';
  return glyph[`endpoint.${family}.${port}`].character;
}

/** Direction points out of the wall toward the adjacent route/marker cell. */
export function wallTeeGlyph029(dx: number, dy: number): string {
  if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error('Wall contact requires a cardinal unit direction.');
  const side = dx > 0 ? 'e' : dx < 0 ? 'w' : dy > 0 ? 's' : 'n';
  return glyph[`stroke.single.tee_${side}`].character;
}
