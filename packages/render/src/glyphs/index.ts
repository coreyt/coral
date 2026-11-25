import { freezeCatalog028 } from '../catalogFreeze028.js';

export interface GlyphPath {
  d: string;
  filled?: boolean;
}

export interface GlyphDefinition {
  id: string;
  name: string;
  viewBox: string;
  paths: GlyphPath[];
  /** Present only on glyphs introduced after the frozen 0.2.8 catalog. */
  addedInEdition?: string;
}

const glyphs: GlyphDefinition[] = [
  { id: 'globe', name: 'Web globe', viewBox: '0 0 24 24', paths: [
    { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20' },
    { d: 'M2 12h20M12 2c3 3 4 6 4 10s-1 7-4 10M12 2C9 5 8 8 8 12s1 7 4 10' },
  ] },
  { id: 'api', name: 'API connection', viewBox: '0 0 24 24', paths: [
    { d: 'M7 7h10v10H7zM2 12h5M17 12h5M12 2v5M12 17v5' },
  ] },
  { id: 'cog', name: 'Worker cog', viewBox: '0 0 24 24', paths: [
    { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
  ] },
  { id: 'shield', name: 'Gateway shield', viewBox: '0 0 24 24', paths: [
    { d: 'M12 2l8 3v6c0 5-3 9-8 11c-5-2-8-6-8-11V5zM8 12l3 3l5-6' },
  ] },
  { id: 'user', name: 'User task', viewBox: '0 0 24 24', paths: [
    { d: 'M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1-5 4-7 8-7s7 2 8 7' },
  ] },
  { id: 'gear', name: 'Service task gear', viewBox: '0 0 24 24', paths: [
    { d: 'M9 3h6l1 3l3 1l2-1l3 5l-2 2v3l2 2l-3 5l-3-1l-3 2H9l-1-3l-3-1l-2 1l-3-5l2-2v-3L0 9l3-5l3 1zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6' },
  ] },
  { id: 'code', name: 'Script task code', viewBox: '0 0 24 24', paths: [
    { d: 'M8 6l-6 6l6 6M16 6l6 6l-6 6M14 3l-4 18' },
  ] },
  { id: 'hand', name: 'Manual task hand', viewBox: '0 0 24 24', paths: [
    { d: 'M6 12V7a2 2 0 0 1 4 0v3V5a2 2 0 0 1 4 0v5V6a2 2 0 0 1 4 0v6l1-1a2 2 0 0 1 3 3l-6 7H9l-6-6a2 2 0 0 1 3-3z' },
  ] },
];

const byId = new Map<string, GlyphDefinition>();
for (const glyph of glyphs) {
  if (!glyph.id || !glyph.name.trim() || byId.has(glyph.id)
    || !glyph.paths.length
    || glyph.paths.some((path) => !path.d.trim() || !/^[MmLlHhVvCcSsQqTtAaZz0-9,.\s+\-]+$/.test(path.d))) {
    throw new Error(`render.catalog.invalid-glyph: ${glyph.id || '<blank>'}`);
  }
  byId.set(glyph.id, glyph);
}
freezeCatalog028(glyphs);

export const glyphRegistry = {
  get(id: string): GlyphDefinition | undefined { return byId.get(id); },
  require(id: string): GlyphDefinition {
    const glyph = byId.get(id);
    if (!glyph) throw new Error(`render.catalog.unsupported-glyph: ${id}`);
    return glyph;
  },
  getAll(): GlyphDefinition[] { return [...glyphs]; },
};
