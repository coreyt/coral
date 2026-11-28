/** Coordinate inspection of an already rendered character preview. */
import stringWidth from 'string-width';

export interface CharacterDebugView028 {
  /** Zero-based column rulers and row labels around unchanged, space-padded text. */
  grid: string;
  /** One RFC 4180-style record per cell, including padded space cells. */
  csv: string;
  width: number;
  height: number;
}

// The renderer permits 1,024 rows of at most 120 columns. Padding those rows
// into a rectangle may exceed its 65,536 occupied-cell budget.
const MAX_DEBUG_CELLS = 120 * 1024;

function csvField(character: string): string {
  if (character === ' ' || /[",\r\n]/.test(character)) {
    return `"${character.replaceAll('"', '""')}"`;
  }
  return character;
}

/**
 * Inspect a saved character preview or `renderInstalledCharacterPreview028(...).text`.
 * Each source code point must occupy exactly one terminal cell. Coordinates are
 * zero-based. The terminal line ending is not a cell, and shorter rows are padded
 * with spaces to the longest row so the CSV and grid have the same rectangle.
 *
 * @deprecated No longer supported as of Coral 0.2.17. Part of the retired 0.2.8
 * character preview surface replaced by the Coral 0.2.17 Plain-Text and ASCII
 * Diagram Renderer (`dev/designs/text-renderer-spec.md`).
 */
export function createCharacterDebugView028(text: string): CharacterDebugView028 {
  if (!text) throw new Error('A nonempty character preview is required.');
  const rawRows = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const rows = rawRows.map((line, row) => {
    const characters = [...line];
    for (const [column, character] of characters.entries()) {
      if (stringWidth(character) !== 1) {
        throw new Error(`Expected one printable single-cell character at row ${row}, column ${column}; found U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}.`);
      }
    }
    return characters;
  });
  const height = rows.length;
  if (height > 1024) throw new Error('Debug view exceeds 1,024 rows.');
  const width = rows.reduce((longest, line) => Math.max(longest, line.length), 0);
  if (width * height > MAX_DEBUG_CELLS) {
    throw new Error(`Debug view exceeds ${MAX_DEBUG_CELLS} cells.`);
  }
  const rowDigits = String(height - 1).length;
  const columnDigits = Math.max(2, String(Math.max(0, width - 1)).length);
  const margin = ' '.repeat(rowDigits + 3);
  const ruler = Array.from({ length: columnDigits }, (_, index) => {
    const divisor = 10 ** (columnDigits - index - 1);
    return margin + Array.from({ length: width }, (_cell, column) => String(Math.floor(column / divisor) % 10)).join('');
  });
  const grid = [...ruler, ...rows.map((line, row) =>
    `  ${String(row).padStart(rowDigits, ' ')} ${line.join('').padEnd(width, ' ')}`)].join('\n') + '\n';
  const csv = ['row,column,character,code_point'];
  for (const [row, line] of rows.entries()) {
    for (let column = 0; column < width; column++) {
      const character = line[column] ?? ' ';
      const codePoint = `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
      csv.push(`${row},${column},${csvField(character)},${codePoint}`);
    }
  }
  return { grid, csv: csv.join('\n') + '\n', width, height };
}
