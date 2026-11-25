import {
  GENERATED_FONT_ASSETS,
  type GeneratedFontAsset,
  type GeneratedMetricProfile,
} from './generated-fonts.js';
import { cachedFontResolution } from './font-cache.js';
import { CAVEAT_FONT_DATA_028 } from './caveat028.js';
import { CAVEAT_METRICS_028 } from './caveat-metrics028.js';

export type PortableFontId = 'sans' | 'serif' | 'mono' | 'handwritten' | 'caveat';
export type RenderFontWeight = 'normal' | 'bold' | number;
export type EffectiveFontWeight = 400 | 500 | 550 | 700;

export interface RenderFontSettings {
  family: string;
  size: number;
  weight: RenderFontWeight;
  lineHeight: number;
}

export interface DiagramRenderFontSettings {
  default?: Partial<RenderFontSettings>;
  symbolOverrides?: Record<string, Partial<RenderFontSettings>>;
}

export interface PortableFont {
  id: PortableFontId;
  name: string;
  cssFamily: string;
  aliases: readonly string[];
  data400: string;
  data700: string;
  metrics: Readonly<Record<400 | 700, GeneratedMetricProfile> &
    Partial<Record<500 | 550, GeneratedMetricProfile>>>;
  source: GeneratedFontAsset['source'];
}

export interface ResolvedFont {
  id: PortableFontId;
  requestedFamily: string;
  cssFamily: string;
  size: number;
  weight: EffectiveFontWeight;
  lineHeight: number;
  usedFallback: boolean;
}

export interface FontFaceRequest {
  id: PortableFontId;
  weight: EffectiveFontWeight;
}

export const DEFAULT_RENDER_FONT_SETTINGS: Readonly<RenderFontSettings> = {
  family: 'Coral Inter',
  size: 12,
  weight: 'normal',
  lineHeight: 1.4,
};

function generated(id: PortableFontId): GeneratedFontAsset {
  const asset = GENERATED_FONT_ASSETS[id];
  if (!asset) throw new Error(`Missing generated font asset: ${id}`);
  return asset;
}

function portable(
  id: PortableFontId,
  name: string,
  cssFamily: string,
  aliases: readonly string[],
): PortableFont {
  const asset = generated(id);
  return { id, name, cssFamily, aliases, ...asset };
}

const CAVEAT_VISUAL_FONT_028: PortableFont = {
    id: 'caveat', name: 'Caveat', cssFamily: 'Coral Lowfi Caveat',
    aliases: ['coral lowfi caveat', 'caveat'],
    data400: CAVEAT_FONT_DATA_028, data700: CAVEAT_FONT_DATA_028,
    metrics: CAVEAT_METRICS_028,
    source: {
      packageName: 'Caveat Latin variable', version: 'v23', upstreamVersion: 'v23',
      unicodeRange: 'Latin', licensePath: 'third_party/fonts/caveat-OFL-1.1.txt',
      licenseSha256: '163a2b400e16916ad3196296c946c526d0efce6baf22a2164269ffc62fb9f671',
      url400: 'https://fonts.gstatic.com/s/caveat/v23/Wnz6HAc5bAfYB2Q7ZjYY.woff2',
      url700: 'https://fonts.gstatic.com/s/caveat/v23/Wnz6HAc5bAfYB2Q7ZjYY.woff2',
      sha256_400: '891951df5e8b5b0f0bc760d31375405e795c666b5add70437de12d4a6482b33f',
      sha256_700: '891951df5e8b5b0f0bc760d31375405e795c666b5add70437de12d4a6482b33f',
      bytes400: 74932, bytes700: 74932,
      metricsSha256: 'generated-by-scripts/generate-caveat-metrics028.mjs',
    },
};

export const PORTABLE_FONTS: readonly PortableFont[] = [
  portable('sans', 'Sans Serif', 'Coral Inter', [
    'coral inter', 'inter', 'helvetica neue', 'arial', 'segoe ui', 'roboto',
    '-apple-system', 'blinkmacsystemfont', 'system-ui', 'sans-serif',
  ]),
  portable('serif', 'Serif', 'Coral Source Serif 4', [
    'coral source serif 4', 'source serif 4', 'georgia', 'times new roman', 'serif',
  ]),
  portable('mono', 'Monospace', 'Coral JetBrains Mono', [
    'coral jetbrains mono', 'jetbrains mono', 'fira code', 'consolas', 'monospace',
  ]),
  portable('handwritten', 'Handwritten', 'Coral Comic Neue', [
    'coral comic neue', 'comic neue', 'comic sans ms', 'cursive',
  ]),
];

const BY_ID = new Map([...PORTABLE_FONTS, CAVEAT_VISUAL_FONT_028].map((font) => [font.id, font]));
const BY_ALIAS = new Map<string, PortableFont>(
  [...PORTABLE_FONTS, CAVEAT_VISUAL_FONT_028]
    .flatMap((font) => font.aliases.map((alias) => [alias, font] as const)),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function requestedWeight(value: unknown, fallback: RenderFontWeight): RenderFontWeight {
  return value === 'normal' || value === 'bold'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? value
      : fallback;
}

/** Return a complete requested setting without mutating or bounding valid values. */
export function normalizeRenderFontSettings(
  value: unknown,
  fallback: RenderFontSettings = DEFAULT_RENDER_FONT_SETTINGS,
): RenderFontSettings {
  const input = isRecord(value) ? value : {};
  const family = typeof input.family === 'string' && input.family.trim().length > 0
    ? input.family
    : fallback.family;
  return {
    family,
    size: positive(input.size, fallback.size),
    weight: requestedWeight(input.weight, fallback.weight),
    lineHeight: positive(input.lineHeight, fallback.lineHeight),
  };
}

function familyTokens(family: string): string[] {
  return family.split(',').map((token) => token.trim()
    .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')
    .toLowerCase()).filter(Boolean);
}

export function getPortableFont(id: PortableFontId): PortableFont {
  const font = BY_ID.get(id);
  if (!font) throw new Error(`Unknown portable font: ${id}`);
  return font;
}

export function resolveFont(value?: Partial<RenderFontSettings> | null): ResolvedFont {
  const requested = normalizeRenderFontSettings(value);
  const familyResolution = cachedFontResolution(requested.family, () => {
    let matched: PortableFont | undefined;
    for (const token of familyTokens(requested.family)) {
      matched = BY_ALIAS.get(token);
      if (matched) break;
    }
    return {
      id: matched?.id ?? 'sans',
      usedFallback: matched === undefined,
    };
  });
  const font = getPortableFont(familyResolution.id);
  const weight = font.id === 'caveat' && typeof requested.weight === 'number'
    && (requested.weight === 500 || requested.weight === 550)
    ? requested.weight
    : requested.weight === 'bold'
      || (typeof requested.weight === 'number' && requested.weight >= 600)
      ? 700 : 400;
  return {
    id: font.id,
    requestedFamily: requested.family,
    cssFamily: font.cssFamily,
    size: requested.size,
    weight,
    lineHeight: requested.lineHeight,
    usedFallback: familyResolution.usedFallback,
  };
}

function partialRecord(value: unknown): Partial<RenderFontSettings> | undefined {
  return isRecord(value) ? value as Partial<RenderFontSettings> : undefined;
}

function usableOverride(value: unknown): Partial<RenderFontSettings> | undefined {
  const override = partialRecord(value);
  if (!override) return undefined;
  const usable = (typeof override.family === 'string' && override.family.trim().length > 0)
    || (typeof override.size === 'number' && Number.isFinite(override.size) && override.size > 0)
    || override.weight === 'normal'
    || override.weight === 'bold'
    || (typeof override.weight === 'number' && Number.isFinite(override.weight))
    || (typeof override.lineHeight === 'number'
      && Number.isFinite(override.lineHeight)
      && override.lineHeight > 0);
  return usable ? override : undefined;
}

/** Resolve a symbol override first, then a semantic-node-type override. */
export function resolveDiagramFont(
  value?: DiagramRenderFontSettings | null,
  symbolId?: string,
  nodeType?: string,
): ResolvedFont {
  const input = isRecord(value) ? value : {};
  const defaults = normalizeRenderFontSettings(input.default);
  const overrides = isRecord(input.symbolOverrides) ? input.symbolOverrides : {};
  const override = (symbolId ? usableOverride(overrides[symbolId]) : undefined)
    ?? (nodeType ? usableOverride(overrides[nodeType]) : undefined);
  return resolveFont(override
    ? normalizeRenderFontSettings(override, defaults)
    : defaults);
}

export function fontData(id: PortableFontId, weight: EffectiveFontWeight): string {
  const font = getPortableFont(id);
  return weight === 700 ? font.data700 : font.data400;
}

export function fontMetrics(
  id: PortableFontId,
  weight: EffectiveFontWeight,
): GeneratedMetricProfile {
  const metrics = getPortableFont(id).metrics;
  return metrics[weight] ?? metrics[400];
}

export const DETERMINISTIC_TEXT_CSS =
  'text-rendering:geometricPrecision;font-kerning:none;font-optical-sizing:none;font-variant-ligatures:none;' +
  'font-feature-settings:"kern" 0,"liga" 0,"clig" 0,"calt" 0';

/** Emit deduplicated embedded faces plus the deterministic shaping class. */
/** The inverse of the embedded font CSS layout: its `@font-face` rules, which
 * are document-global and ignored inside shadow trees, and everything else.
 * A generated face rule holds no nested braces, so the split is exact. */
export function splitFontFaceCss029(css: string): { faces: string; rest: string } {
  const faces = css.match(/@font-face\{[^{}]*\}/g) ?? [];
  return { faces: faces.join(''), rest: css.replace(/@font-face\{[^{}]*\}/g, '') };
}

export function embeddedFontCssFor(requests: Iterable<FontFaceRequest>): string {
  const unique = new Map<string, FontFaceRequest>();
  for (const request of requests) unique.set(request.id === 'caveat' ? 'caveat:variable'
    : `${request.id}:${request.weight}`, request);
  const faces = [...unique.values()].map(({ id, weight }) => {
    const font = getPortableFont(id);
    return `@font-face{font-family:'${font.cssFamily}';font-style:normal;font-weight:${id === 'caveat' ? '400 700' : weight};` +
      `font-display:block;src:url('${fontData(id, weight)}') format('woff2')}`;
  });
  faces.push(`:where(.coral-font-text){${DETERMINISTIC_TEXT_CSS}}`);
  return faces.join('');
}
