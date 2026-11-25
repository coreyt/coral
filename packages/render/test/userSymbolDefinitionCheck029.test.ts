import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';

const document = (outline: string, ...lines: string[]) => ['@diagram architecture', '@coralVersion "0.2.9"',
  '@symbol shield {', '  name "Shield"', '  size 48 x 56', `  outline ${outline}`, ...lines, '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28"><path d="M0 0 L24 0 L24 28 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'gate service [symbol: "local.shield"]', ''].join('\n');
const findings = (source: string) => {
  const parsed = parseInstalledDocument028(source);
  return { parsed, codes: parsed.syntax.diagnostics.map(({ code, line, column }) => [code, line, column]) };
};

describe('user-symbol definition geometry checks on read', () => {
  it('accepts inside, on-outline outward and boundary anchors and named or generic port anchors', () => {
    const { parsed, codes } = findings(document('rounded', '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
      '  anchor top [x: 0.5, y: 0, exit: N]', '  anchor crest [side: W, at: 0.1]',
      '  audit port [direction: out, anchor: keyhole]', '  token port [direction: out, anchor: NE]',
      '  free port [direction: in, anchor: auto]'));
    expect(codes).toEqual([]);
    expect(parsed.definitions).toHaveLength(1);
    expect(parsed.artwork?.has('shield')).toBe(true);
  });

  it('refuses an interior anchor outside the outline at the anchor ID and withholds the definition', () => {
    const { parsed, codes } = findings(document('diamond', '  anchor notch [x: 0.05, y: 0.05, exit: N]'));
    expect(codes).toEqual([['coral.symbol.local.anchor.invalid', 7, 9]]);
    expect(parsed.syntax.diagnostics[0]!.message).toMatch(/notch.*outside.*diamond.*local\.shield/);
    expect(parsed.definitions).toEqual([]);
    expect(parsed.artwork?.size).toBe(0);
  });

  it.each([
    ['ellipse', '0.5', '0', 'E'], ['rectangle', '0', '0.5', 'N'], ['rectangle', '0.5', '0', 'S'],
    ['rounded', '0', '0.5', 'S'],
  ])('refuses an on-outline %s anchor at (%s, %s) whose exit %s is not strictly outward', (outline, x, y, exit) => {
    const { codes, parsed } = findings(document(outline, `  anchor edge [x: ${x}, y: ${y}, exit: ${exit}]`));
    expect(codes).toEqual([['coral.symbol.local.anchor.invalid', 7, 9]]);
    expect(parsed.syntax.diagnostics[0]!.message).toMatch(/exit/i);
  });

  it('refuses a definition port anchor that names no anchor at the anchor value', () => {
    const { codes, parsed } = findings(document('rectangle', '  audit port [direction: out, anchor: keyhole]'));
    expect(codes).toEqual([['coral.port.anchor.symbol-unknown', 7, 38]]);
    expect(parsed.syntax.diagnostics[0]!.message).toMatch(/local\.shield.*keyhole.*audit/);
    expect(parsed.definitions).toEqual([]);
  });
});
