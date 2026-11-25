import { describe, expect, it } from 'vitest';
import {
  createDocument, deserialize, resolveNotationLayout, type LayoutSettings,
} from '../src/file/index.js';

const legacy: LayoutSettings = {
  algorithm: 'force', direction: 'UP',
  spacing: { nodeNode: 33, edgeNode: 12, layerSpacing: 44 },
  elkOptions: { 'elk.edgeRouting': 'POLYLINE', legacy: 'kept' },
  sizingMode: 'uniform',
};

describe('notation layout resolution', () => {
  it('is exactly legacy-compatible when profile mode is absent', () => {
    const result = resolveNotationLayout('flowchart', legacy);
    expect(result).toEqual({ settings: legacy, diagnostics: [] });
    expect(result.settings).toBe(legacy);
  });

  it('resolves the installed profile and sparse per-key overrides', () => {
    const result = resolveNotationLayout('bpmn', {
      ...legacy,
      profile: 'notation',
      profileOverrides: {
        direction: 'LEFT', spacing: { nodeNode: 77 },
        elkOptions: { 'elk.layered.crossingMinimization.forceNodeModelOrder': false },
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.settings).toMatchObject({
      algorithm: 'layered', direction: 'LEFT', sizingMode: 'uniform',
      spacing: { nodeNode: 77, edgeNode: 25, layerSpacing: 90 },
      elkOptions: {
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.crossingMinimization.forceNodeModelOrder': false,
      },
    });
  });

  it('round-trips profile selection and sparse overrides without materializing defaults', () => {
    const layout: LayoutSettings = {
      ...legacy,
      profile: 'notation',
      profileOverrides: { direction: 'LEFT', spacing: { nodeNode: 77 } },
    };
    const document = createDocument({
      name: 'Profile roundtrip', settings: { notation: 'bpmn', layout },
    });
    const loaded = deserialize(JSON.parse(JSON.stringify(document)));
    expect(loaded.settings.layout).toEqual(layout);
    expect(loaded.settings.layout.profileOverrides).toEqual({
      direction: 'LEFT', spacing: { nodeNode: 77 },
    });
  });

  it('falls back completely for unknown notation or any invalid override', () => {
    for (const settings of [
      { ...legacy, profile: 'notation' as const },
      { ...legacy, profile: 'notation' as const, profileOverrides: { spacing: { nodeNode: -1 } } },
      { ...legacy, profile: 'notation' as const, profileOverrides: { elkOptions: { unsupported: 'x' } } },
    ]) {
      const notation = settings.profileOverrides ? 'flowchart' : 'unknown';
      const result = resolveNotationLayout(notation, settings);
      expect(result.settings).toBe(settings);
      expect(result.diagnostics).toHaveLength(1);
    }
  });

  it('totally rejects null/array persisted overrides and accepts shared legacy algorithms', () => {
    for (const profileOverrides of [null, [], { spacing: null }, { elkOptions: [] }]) {
      const settings = { ...legacy, profile: 'notation' as const, profileOverrides } as unknown as LayoutSettings;
      expect(() => resolveNotationLayout('flowchart', settings)).not.toThrow();
      expect(resolveNotationLayout('flowchart', settings).settings).toBe(settings);
      expect(resolveNotationLayout('flowchart', settings).diagnostics).toHaveLength(1);
    }
    for (const algorithm of ['tree', 'fixed']) {
      const result = resolveNotationLayout('flowchart', {
        ...legacy, profile: 'notation', profileOverrides: { algorithm },
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.settings.algorithm).toBe(algorithm);
    }
  });
});
