import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  FONT_SIZE_PRESETS,
  FontSettingsForm,
  DiagramFontFaces,
  CORAL_NODE_VIEW_METADATA,
  CORAL_EDGE_VIEW_METADATA,
  getFontFamilyPreset,
  getFontSizePreset,
  normalizeDiagramFontSettings,
  type DiagramFontSettings,
  type FontFamilyPreset,
  type FontSettings,
  type FontSettingsFormProps,
  type FontSizePreset,
  type CoralNodeViewMetadata,
  type CoralEdgeViewMetadata,
  type DiagramFontFacesProps,
  type DimensionSource,
  type FontAwareCoralNodeData,
  type FontAwareCoralEdgeData,
} from '../src/index.js';

const HISTORICAL_DEFAULT = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  weight: 'normal' as const,
  lineHeight: 1.3,
};

describe('diagram font document contract', () => {
  it('exposes the complete additive font API at the package root', () => {
    expect(DEFAULT_FONT_SETTINGS).toEqual(HISTORICAL_DEFAULT);
    expect(DEFAULT_DIAGRAM_FONT_SETTINGS).toEqual({ default: HISTORICAL_DEFAULT });
    expect(FONT_FAMILY_PRESETS).toHaveLength(5);
    expect(FONT_SIZE_PRESETS).toHaveLength(4);
    expect(getFontFamilyPreset('mono')?.id).toBe('mono');
    expect(getFontSizePreset('large')?.size).toBe(16);
    expect(FontSettingsForm).toBeDefined();
    expect(DiagramFontFaces).toBeDefined();
    expect(Symbol.keyFor(CORAL_NODE_VIEW_METADATA)).toBe('@coral-viz/viz/node-view-metadata');
    expect(Symbol.keyFor(CORAL_EDGE_VIEW_METADATA)).toBe('@coral-viz/viz/edge-view-metadata');

    expectTypeOf<FontSettings>().toMatchTypeOf<typeof HISTORICAL_DEFAULT>();
    expectTypeOf<DiagramFontSettings>().toHaveProperty('default');
    expectTypeOf<FontFamilyPreset>().toHaveProperty('family');
    expectTypeOf<FontSizePreset>().toHaveProperty('size');
    expectTypeOf<FontSettingsFormProps>().toHaveProperty('settings');
    expectTypeOf<DiagramFontFacesProps>().toHaveProperty('settings');
    expectTypeOf<CoralNodeViewMetadata>().toHaveProperty('dimensionSource');
    expectTypeOf<CoralEdgeViewMetadata>().toHaveProperty('font');
    expectTypeOf<DimensionSource>().toEqualTypeOf<'graph' | 'editor-font'>();
    expectTypeOf<FontAwareCoralNodeData>().toMatchTypeOf<Record<string, unknown>>();
    expectTypeOf<FontAwareCoralEdgeData>().toMatchTypeOf<Record<string, unknown>>();
  });

  it.each([
    undefined,
    null,
    false,
    7,
    'font',
    [],
    {},
    { default: null },
  ])('normalizes absent or unusable input without throwing: %j', (input) => {
    expect(normalizeDiagramFontSettings(input)).toEqual({ default: HISTORICAL_DEFAULT });
  });

  it('defaults invalid members while preserving valid requested values exactly', () => {
    const input = {
      default: {
        family: '  "Private Face", serif  ',
        size: 19.25,
        weight: 575,
        lineHeight: 1.75,
      },
    };

    expect(normalizeDiagramFontSettings(input)).toEqual({
      default: {
        family: '  "Private Face", serif  ',
        size: 19.25,
        weight: 575,
        lineHeight: 1.75,
      },
    });

    expect(normalizeDiagramFontSettings({
      default: {
        family: '   ',
        size: Number.NaN,
        weight: Number.POSITIVE_INFINITY,
        lineHeight: 0,
      },
    })).toEqual({ default: HISTORICAL_DEFAULT });
  });

  it('keeps only valid known members from usable symbol overrides', () => {
    const input = {
      default: { family: 'serif', size: 20, weight: 'bold', lineHeight: 1.1 },
      symbolOverrides: {
        service: { size: 18, weight: 650, extension: 'raw-only' },
        database: { family: 'monospace', lineHeight: 1.8 },
        invalidKnown: { family: '', size: -1, weight: {}, lineHeight: Infinity },
        extensionOnly: { vendor: true },
        scalar: 'bad',
        array: [12],
        nil: null,
      },
    };

    expect(normalizeDiagramFontSettings(input)).toEqual({
      default: { family: 'serif', size: 20, weight: 'bold', lineHeight: 1.1 },
      symbolOverrides: {
        service: { size: 18, weight: 650 },
        database: { family: 'monospace', lineHeight: 1.8 },
      },
    });
  });

  it('does not mutate or retain mutable nested input/default references', () => {
    const input = {
      default: { family: 'Inter', size: 16, weight: 'normal', lineHeight: 1.4 },
      symbolOverrides: { service: { size: 18 } },
    };
    const before = structuredClone(input);

    const first = normalizeDiagramFontSettings(input);
    const second = normalizeDiagramFontSettings(undefined);
    first.default.size = 99;
    first.symbolOverrides!.service.size = 88;
    second.default.family = 'changed';

    expect(input).toEqual(before);
    expect(normalizeDiagramFontSettings(input)).toEqual(before);
    expect(normalizeDiagramFontSettings(undefined)).toEqual({ default: HISTORICAL_DEFAULT });
    expect(DEFAULT_DIAGRAM_FONT_SETTINGS).toEqual({ default: HISTORICAL_DEFAULT });
  });
});
