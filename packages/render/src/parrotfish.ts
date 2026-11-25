/**
 * Parrotfish — Coral's modeled presentation renderer (0.2.14).
 *
 * Facilitates modeled visual outputs (style, colors, accents, symbols,
 * palettes) strictly decoupled from layout, flow, and edge routing.
 */
import type { PreparedSpatialScene028, SvgOptions } from './svg/serialize.js';
import { prepareSpatialScene028, serializePreparedSpatialScene028 } from './svg/serialize.js';
import {
  applyParrotfishToScene0214,
  resolveParrotfishModel,
  type ParrotfishModelInput,
} from './parrotfishCore.js';

export * from './parrotfishCore.js';

export interface ParrotfishOptions {
  readonly theme?: 'light' | 'dark';
  readonly title?: string;
  readonly description?: string;
  readonly domIdNamespace?: string;
  /** Used only when passing a laid-out graph instead of a prepared scene. */
  readonly svgOptions?: SvgOptions;
}

export interface ParrotfishResult {
  readonly scene: PreparedSpatialScene028;
  readonly svg: string;
  readonly modelName: string;
  readonly theme: 'light' | 'dark';
}

function isPreparedSpatialScene(value: unknown): value is PreparedSpatialScene028 {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'spatial'
    && Array.isArray((value as { parts?: unknown }).parts));
}

/**
 * Render a modeled Coral visual output via `parrotfish`.
 *
 * Accepts either a pre-laid-out `PreparedSpatialScene028` (zero re-layout!) or
 * a laid-out graph, applies modeled presentation rules (style, colors,
 * accents, decorative symbols — never layout, flow, or routing), and returns
 * both the styled scene and standalone SVG.
 */
export function parrotfish(
  input: PreparedSpatialScene028 | Parameters<typeof prepareSpatialScene028>[0],
  model: ParrotfishModelInput = 'anemone',
  options: ParrotfishOptions = {},
): ParrotfishResult {
  const theme: 'light' | 'dark' = options.theme
    ?? (options.svgOptions?.theme === 'dark' ? 'dark' : 'light');
  const resolvedModel = resolveParrotfishModel(model);
  const baseScene = isPreparedSpatialScene(input)
    ? input
    : prepareSpatialScene028(input, {
      ...options.svgOptions,
      style: 'hifi',
      renderStyle: 'hifi',
      parrotfish: undefined,
      theme,
    });
  const styledScene = applyParrotfishToScene0214(baseScene, resolvedModel, theme);
  const svg = serializePreparedSpatialScene028(styledScene, {
    ...options.svgOptions,
    theme,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.domIdNamespace !== undefined ? { domIdNamespace: options.domIdNamespace } : {}),
  });
  return {
    scene: styledScene,
    svg,
    modelName: resolvedModel.name,
    theme,
  };
}
