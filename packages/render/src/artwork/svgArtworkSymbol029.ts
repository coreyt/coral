/** `<symbol>` and `<use>` output for user-symbol artwork (design "Artwork
 * admission"; c2-design.md "Symbol and use output"). Written from the
 * admitted model by the canonical element writer, so every painted primitive
 * carries explicit fill, stroke, stroke-width and opacity. */
import {
  formatNumber029, formatViewBox029, svgArtworkTintsStroke029, writeArtworkContent029,
} from './svgArtworkCanonical029.js';
import type { AdmittedSvgArtwork029 } from './svgArtworkModel029.js';
import { parseColor029 } from './svgArtworkValues029.js';
import { userOutlineShape029, type UserOutline029 } from '../userSymbolGeometry029.js';

const SCOPE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const LOCAL_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `<scope>-coral-sym-<local ID>`: the scope is the renderer's per-render DOM namespace. */
export function userSymbolSvgId029(scope: string, localId: string): string {
  if (!SCOPE.test(scope) || scope.includes('coral-sym')) throw new Error(`Invalid user-symbol render scope ${JSON.stringify(scope)}`);
  if (!LOCAL_ID.test(localId)) throw new Error(`Invalid user-symbol local ID ${JSON.stringify(localId)}`);
  return `${scope}-coral-sym-${localId}`;
}

/** Every inherited painting property at the initial value admission assumed
 * (profile §9 rule 2, SA-2), so no host value inherits into the artwork.
 * `color` is left to the `<use>`, which sets it whenever tint applies. */
const RESET_029 = 'fill="#000000" fill-opacity="1" fill-rule="nonzero" stroke="none" stroke-opacity="1" ' +
  'stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4" stroke-dasharray="none" ' +
  'stroke-dashoffset="0" paint-order="normal" clip-rule="nonzero" marker-start="none" marker-mid="none" ' +
  'marker-end="none" color-interpolation="sRGB" shape-rendering="auto"';

/** The outline clip in artwork coordinates: the frame of `size` mapped back
 * through the `xMidYMid meet` viewBox fit. Exact because every frame keeps
 * the definition's aspect ratio. */
function outlineClip029(id: string, artwork: AdmittedSvgArtwork029, outline: UserOutline029): string {
  const { minX, minY, width, height } = artwork.viewBox;
  const scale = Math.min(outline.width / width, outline.height / height);
  const x = minX - (outline.width / scale - width) / 2;
  const y = minY - (outline.height / scale - height) / 2;
  return `<clipPath id="${id}-outline" clipPathUnits="userSpaceOnUse"><path d="${userOutlineShape029(outline).path}" ` +
    `transform="translate(${formatNumber029(x)} ${formatNumber029(y)}) scale(${formatNumber029(1 / scale)})"/></clipPath>`;
}

/** One `<symbol>` per definition per rendered document, clipped to its outline when given. */
export function userSymbolSvgDefinition029(scope: string, localId: string, artwork: AdmittedSvgArtwork029,
  options: { tint?: 'none' | 'stroke'; outline?: UserOutline029 } = {}): string {
  const id = userSymbolSvgId029(scope, localId);
  const content = writeArtworkContent029(artwork.model, {
    id: (canonical) => `${id}-${canonical}`, tintStroke: options.tint === 'stroke',
  }).map(([, text]) => text).join('');
  const body = options.outline
    ? `${outlineClip029(id, artwork, options.outline)}<g clip-path="url(#${id}-outline)">${content}</g>` : content;
  return `<symbol id="${id}" viewBox="${formatViewBox029(artwork.viewBox)}" preserveAspectRatio="xMidYMid meet">` +
    `<g ${RESET_029}>${body}</g></symbol>`;
}

/** One decorative `<use>` per node, sized to its frame; `color` sets the tint for `currentColor`. */
export function userSymbolSvgInstance029(scope: string, localId: string,
  frame: { x: number; y: number; width: number; height: number }, options: { color?: string } = {}): string {
  const id = userSymbolSvgId029(scope, localId);
  const { x, y, width, height } = frame;
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    throw new Error(`Invalid user-symbol frame ${JSON.stringify(frame)}`);
  }
  const color = options.color === undefined ? undefined : parseColor029(options.color);
  if (options.color !== undefined && color === undefined) throw new Error(`Invalid user-symbol tint colour ${JSON.stringify(options.color)}`);
  if (width === 0 || height === 0) return '';
  return `<use href="#${id}" x="${formatNumber029(x)}" y="${formatNumber029(y)}" width="${formatNumber029(width)}" ` +
    `height="${formatNumber029(height)}" aria-hidden="true"${color ? ` color="${color}"` : ''}/>`;
}

export { svgArtworkTintsStroke029 };
