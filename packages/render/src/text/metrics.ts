import { CAVEAT_INK_028 } from './caveat-ink028.js';
import type { ResolvedFont } from './fonts.js';
/** Deterministic text measurement over the exact bundled release-font metrics. */
import {
  fontMetrics,
  resolveFont,
  type RenderFontWeight,
} from './fonts.js';

/** Report whether the selected bundled Latin face contains every code point. */
export function isCovered(
  text: string,
  fontFamily?: string,
  fontWeight?: string | number,
): boolean {
  const font = resolveFont({
    ...(fontFamily !== undefined ? { family: fontFamily } : {}),
    ...(fontWeight !== undefined ? { weight: compatibleWeight(fontWeight) } : {}),
  });
  const profile = fontMetrics(font.id, font.weight);
  for (const character of text) {
    const codepoint = character.codePointAt(0);
    if (codepoint === undefined || profile.advances[codepoint] === undefined) return false;
  }
  return true;
}

/** Width of a single line, in pixels, at the given settings. */
export function measureLine(
  text: string,
  fontSize: number,
  fontFamily?: string,
  fontWeight?: string | number,
): number {
  const font = resolveFont({
    size: fontSize,
    ...(fontFamily !== undefined ? { family: fontFamily } : {}),
    ...(fontWeight !== undefined ? { weight: compatibleWeight(fontWeight) } : {}),
  });
  const profile = fontMetrics(font.id, font.weight);
  let width = 0;
  for (const character of text) {
    const codepoint = character.codePointAt(0);
    const ratio = codepoint === undefined
      ? profile.fallback
      : profile.advances[codepoint] ?? profile.fallback;
    // Browser grid fitting can move an individual glyph to either adjacent
    // pixel. Round each committed advance upward so deterministic layout is
    // conservative and cannot clip a loaded portable face.
    width += Math.ceil(ratio * fontSize);
  }
  return width;
}

export interface MeasuredText {
  width: number;
  height: number;
  lines: string[];
}

export interface MeasureOptions {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
  maxWidth?: number;
}

function compatibleWeight(weight: string | number): RenderFontWeight {
  return typeof weight === 'number' || weight === 'normal' || weight === 'bold'
    ? weight
    : 'normal';
}

/** Measure text and wrap on whitespace without breaking a long word. */
export function measureText(options: MeasureOptions): MeasuredText {
  const {
    text,
    fontSize = 12,
    fontFamily,
    fontWeight,
    lineHeight = 1.4,
    maxWidth,
  } = options;
  const lineHeightPx = Math.ceil(fontSize * lineHeight);
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (maxWidth === undefined) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let index = 1; index < words.length; index++) {
      const candidate = `${current} ${words[index]}`;
      if (measureLine(candidate, fontSize, fontFamily, fontWeight) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[index];
      }
    }
    lines.push(current);
  }

  const width = lines.reduce(
    (maximum, line) => Math.max(maximum, measureLine(line, fontSize, fontFamily, fontWeight)),
    0,
  );
  return { width, height: lines.length * lineHeightPx, lines };
}

/** Exact bundled Caveat glyph ink, excluding unrelated face extrema and line leading.
 * Other faces retain the conservative existing vertical envelope. */
export function textInkVertical028(text: string, font: ResolvedFont): { ascent: number; descent: number } {
  const fallback = fontMetrics(font.id, font.weight);
  if (font.id !== 'caveat') return fallback;
  const glyphs = CAVEAT_INK_028[font.weight] as Readonly<Record<number, readonly [number, number]>>;
  let ascent = 0, descent = 0;
  for (const character of text) {
    const ink = glyphs[character.codePointAt(0)!];
    if (!ink) return fallback;
    ascent = Math.max(ascent, ink[0]); descent = Math.max(descent, ink[1]);
  }
  return { ascent, descent };
}
