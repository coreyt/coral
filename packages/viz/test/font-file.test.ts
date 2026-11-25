import { describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  createDocument,
  deserialize,
  migrateDocument,
  serialize,
  validateDocument,
  type CoralDocument,
  type DiagramFontSettings,
} from '../src/file/index.js';

const HISTORICAL_DEFAULT = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  weight: 'normal' as const,
  lineHeight: 1.3,
};

function documentWithFont(
  schemaVersion: string,
  font: unknown,
  includeFont = true,
): CoralDocument {
  const settings: Record<string, unknown> = {
    notation: 'flowchart',
    layout: { algorithm: 'layered', direction: 'DOWN' },
  };
  if (includeFont) settings.font = font;

  return {
    schemaVersion,
    metadata: {
      name: 'Raw font document',
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
    },
    content: {
      format: 'graph-ir',
      graphIR: { version: '1.0.0', id: 'raw-font', nodes: [], edges: [] },
    },
    settings,
  } as unknown as CoralDocument;
}

describe('font settings at file boundaries', () => {
  it('gives every new document an independent complete diagram default', () => {
    const first = createDocument({ name: 'First' });
    const second = createDocument({ name: 'Second', settings: { notation: 'erd' } });

    expect(first.settings.font).toEqual({ default: HISTORICAL_DEFAULT });
    expect(second.settings.font).toEqual({ default: HISTORICAL_DEFAULT });
    expect(first.settings.font).not.toBe(second.settings.font);
    expect(first.settings.font?.default).not.toBe(second.settings.font?.default);
    expect(first.settings.font).not.toBe(DEFAULT_DIAGRAM_FONT_SETTINGS);

    first.settings.font!.default.size = 31;
    expect(second.settings.font?.default.size).toBe(14);
    expect(DEFAULT_DIAGRAM_FONT_SETTINGS.default.size).toBe(14);
  });

  it('preserves an explicitly supplied partial requested font on creation', () => {
    const raw = {
      default: { family: '  Private Face  ', size: 17 },
      symbolOverrides: { service: 'malformed', extension: { vendor: true } },
      vendorTopLevel: { mode: 'future' },
    };
    const doc = createDocument({
      name: 'Supplied',
      settings: { font: raw as unknown as DiagramFontSettings },
    });

    expect(doc.settings.font).toBe(raw);
    expect(doc.settings.font).toEqual(raw);
  });

  it('does not inject a font when serializing old settings that omit it', () => {
    const doc = serialize([], [], {
      name: 'Old',
      settings: {
        notation: 'flowchart',
        layout: { algorithm: 'layered', direction: 'DOWN' },
      },
    });

    expect(Object.hasOwn(doc.settings, 'font')).toBe(false);
  });

  it('round-trips raw arbitrary, malformed, numeric, and extension data exactly', () => {
    const raw = {
      default: {
        family: '"Arbitrary Face", fantasy',
        size: 19.5,
        weight: 575,
        lineHeight: 1.65,
        vendorDefault: 'keep',
      },
      symbolOverrides: {
        service: { size: 21, extension: ['keep'] },
        malformed: null,
        scalar: 42,
      },
      vendorTopLevel: { keep: true },
    };
    const source = documentWithFont('1.0.0', raw);
    const parsed = JSON.parse(JSON.stringify(source)) as CoralDocument;
    const loaded = deserialize(parsed);
    const saved = serialize([], [], {
      name: loaded.metadata.name,
      created: loaded.metadata.created,
      settings: loaded.settings,
    });

    expect(loaded.settings.font).toEqual(raw);
    expect(saved.settings.font).toEqual(raw);
    expect(JSON.parse(JSON.stringify(saved.settings.font))).toEqual(raw);
    expect(source.settings.font).toEqual(raw);
  });

  it.each(['0.9.0', '1.0', '1.0.0'])('%s migration preserves raw font presence and value', (version) => {
    const raw = { default: { family: 'Legacy', size: -2 }, symbolOverrides: { x: [] } };
    const migrated = migrateDocument(documentWithFont(version, raw));

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.settings.font).toEqual(raw);
  });

  it.each(['0.9.0', '1.0', '1.0.0'])('%s migration does not inject an absent font', (version) => {
    const migrated = migrateDocument(documentWithFont(version, undefined, false));

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.hasOwn(migrated.settings, 'font')).toBe(false);
  });

  it('keeps font permissive in schema 1.0.0 validation', () => {
    const malformed = documentWithFont('1.0.0', {
      default: 'not-an-object',
      symbolOverrides: ['also', 'malformed'],
      future: { arbitrary: true },
    });

    expect(validateDocument(malformed)).toEqual({ valid: true, errors: [] });
  });
});
