/** Compatibility exports for the original embedded Coral Inter release face. */
import { embeddedFontCssFor } from './fonts.js';
import { LEGACY_INTER_FONT_DATA } from './legacy-inter.js';

export const INTER_FONT_FAMILY = 'Coral Inter';
export const INTER_FONT_DATA = LEGACY_INTER_FONT_DATA;

export function embeddedFontCss(): string {
  return embeddedFontCssFor([{ id: 'sans', weight: 400 }]);
}
