/** Value grammars of coral.svg-artwork 1 (profile §7). Every parser reads
 * the whole value and returns a typed value or undefined; callers choose the
 * failure code. Regular expressions here are sticky or anchored and have no
 * nested quantifiers, so matching is linear. */
import type { SvgLength029, SvgPathCommand029, SvgTransform029, SvgViewBox029 } from './svgArtworkModel029.js';

/** Bound N1 (profile §7.1). */
export const SVG_ARTWORK_N1_029 = 1_000_000_000;

const NUMBER = /[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/y;
const isWsp = (code: number) => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const trimWsp = (value: string) => value.replace(/^[ \t\n\r]+/, '').replace(/[ \t\n\r]+$/, '');

/** A detail-safe rendering of an input value: at most 32 code units, printable ASCII only. */
export function describeValue029(value: string): string {
  const cut = value.length > 32 ? value.slice(0, 32) : value;
  let out = '';
  for (const char of cut) {
    const code = char.codePointAt(0)!;
    out += code >= 0x20 && code <= 0x7e && char !== '\\' ? char : `\\u{${code.toString(16)}}`;
  }
  return `"${out}${value.length > 32 ? '...' : ''}"`;
}

/** A finite binary64 value within N1, from an ECMAScript StringToNumber conversion. */
function bounded(text: string): number | undefined {
  const value = Number(text);
  return Number.isFinite(value) && Math.abs(value) <= SVG_ARTWORK_N1_029 ? value : undefined;
}

export function parseNumber029(raw: string): number | undefined {
  const text = trimWsp(raw);
  NUMBER.lastIndex = 0;
  const match = NUMBER.exec(text);
  return match && match[0].length === text.length ? bounded(text) : undefined;
}

/** The number before a unit suffix; whitespace is ignored only around the whole value (profile §7). */
function beforeSuffix(text: string, suffixLength: number): number | undefined {
  const body = text.slice(0, -suffixLength);
  return body === trimWsp(body) ? parseNumber029(body) : undefined;
}

/** `number "px"?` (profile §7). */
export function parseLength029(raw: string): number | undefined {
  const text = trimWsp(raw);
  return /px$/i.test(text) ? beforeSuffix(text, 2) : parseNumber029(text);
}

/** `length | percentage` for gradient coordinates, keeping the authored kind. */
export function parseLengthOrPercent029(raw: string): SvgLength029 | undefined {
  const text = trimWsp(raw);
  if (text.endsWith('%')) {
    const value = beforeSuffix(text, 1);
    return value === undefined ? undefined : { value, percent: true };
  }
  const value = parseLength029(text);
  return value === undefined ? undefined : { value, percent: false };
}

export function parseUnitNumber029(raw: string): number | undefined {
  const value = parseNumber029(raw);
  return value !== undefined && value >= 0 && value <= 1 ? value : undefined;
}

/** A scanner over one value for the list grammars. */
class Scanner {
  index = 0;
  constructor(readonly text: string) {}
  get done() { return this.index >= this.text.length; }
  get code() { return this.text.charCodeAt(this.index); }
  skipWsp(): boolean {
    const from = this.index;
    while (!this.done && isWsp(this.code)) this.index++;
    return this.index > from;
  }
  /** `comma-wsp`; returns false when neither whitespace nor a comma was read. */
  commaWsp(): boolean {
    const spaced = this.skipWsp();
    if (this.code === 0x2c) {
      this.index++;
      this.skipWsp();
      return true;
    }
    return spaced;
  }
  number(): number | undefined {
    NUMBER.lastIndex = this.index;
    const match = NUMBER.exec(this.text);
    if (!match) return undefined;
    this.index += match[0].length;
    return bounded(match[0]);
  }
  startsNumber(): boolean {
    const code = this.code;
    return (code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2d || code === 0x2e;
  }
}

/** Numbers separated by `comma-wsp`; `units` admits a `px` suffix on each. */
function parseNumberList(raw: string, units = false): number[] | undefined {
  const scanner = new Scanner(raw);
  scanner.skipWsp();
  const values: number[] = [];
  if (scanner.done) return values;
  for (;;) {
    const value = scanner.number();
    if (value === undefined) return undefined;
    if (units && /^px/i.test(scanner.text.slice(scanner.index, scanner.index + 2))) scanner.index += 2;
    values.push(value);
    const separated = scanner.commaWsp();
    if (scanner.done) return scanner.text.charCodeAt(scanner.index - 1) === 0x2c ? undefined : values;
    if (!separated) return undefined;
  }
}

export function parseViewBox029(raw: string): SvgViewBox029 | undefined {
  const values = parseNumberList(raw);
  if (!values || values.length !== 4 || !(values[2]! > 0) || !(values[3]! > 0)) return undefined;
  return { minX: values[0]!, minY: values[1]!, width: values[2]!, height: values[3]! };
}

/** `points`: an even count of at least 2 (profile §7.6). */
export function parsePoints029(raw: string): number[] | undefined {
  const values = parseNumberList(raw);
  return values && values.length >= 2 && values.length % 2 === 0 ? values : undefined;
}

/** `none | dash-list`; each length at least 0, at most 64 lengths. */
export function parseDashArray029(raw: string): number[] | 'none' | undefined {
  if (trimWsp(raw).toLowerCase() === 'none') return 'none';
  const values = parseNumberList(raw, true);
  return values && values.length >= 1 && values.length <= 64 && values.every((value) => value >= 0) ? values : undefined;
}

const TRANSFORM_ARITY: Record<string, readonly number[]> = {
  matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1],
};

/** SVG 1.1 transform list (profile §7.4); an empty list is admitted. */
export function parseTransformList029(raw: string): SvgTransform029[] | undefined {
  const scanner = new Scanner(raw);
  const transforms: SvgTransform029[] = [];
  scanner.skipWsp();
  while (!scanner.done) {
    const name = /[A-Za-z]+/y;
    name.lastIndex = scanner.index;
    const match = name.exec(scanner.text);
    if (!match || !Object.hasOwn(TRANSFORM_ARITY, match[0])) return undefined;
    scanner.index += match[0].length;
    scanner.skipWsp();
    if (scanner.code !== 0x28) return undefined;
    scanner.index++;
    scanner.skipWsp();
    const args: number[] = [];
    for (;;) {
      const value = scanner.number();
      if (value === undefined) return undefined;
      args.push(value);
      const separated = scanner.commaWsp();
      if ((scanner.code as number) === 0x29) {
        if (scanner.text.charCodeAt(scanner.index - 1) === 0x2c) return undefined;
        break;
      }
      if (!separated) return undefined;
    }
    scanner.index++;
    if (!TRANSFORM_ARITY[match[0]]!.includes(args.length)) return undefined;
    const [a, b, c] = args as [number, number?, number?];
    switch (match[0]) {
      case 'matrix': transforms.push({ kind: 'matrix', values: args as unknown as [number, number, number, number, number, number] }); break;
      case 'translate': transforms.push({ kind: 'translate', x: a, y: b ?? 0 }); break;
      case 'scale': transforms.push({ kind: 'scale', x: a, y: b ?? a }); break;
      case 'rotate': transforms.push(c === undefined ? { kind: 'rotate', angle: a } : { kind: 'rotate', angle: a, center: [b!, c] }); break;
      default: transforms.push({ kind: match[0] as 'skewX' | 'skewY', angle: a });
    }
    const separated = scanner.commaWsp();
    if (scanner.done) {
      if (scanner.text.charCodeAt(scanner.index - 1) === 0x2c) return undefined;
      break;
    }
    if (!separated) return undefined;
  }
  return transforms;
}

const PATH_ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** SVG path data (profile §7.5), with every implicit repetition made explicit. */
export function parsePathData029(raw: string): SvgPathCommand029[] | undefined {
  const scanner = new Scanner(raw);
  const commands: SvgPathCommand029[] = [];
  scanner.skipWsp();
  if (scanner.done) return undefined;
  while (!scanner.done) {
    const letter = scanner.text[scanner.index]!;
    const arity = PATH_ARITY[letter.toUpperCase()];
    if (arity === undefined || (commands.length === 0 && letter !== 'M' && letter !== 'm')) return undefined;
    scanner.index++;
    scanner.skipWsp();
    if (arity === 0) {
      commands.push({ command: letter, values: [] });
      continue;
    }
    const repeat = letter === 'M' ? 'L' : letter === 'm' ? 'l' : letter;
    let first = true;
    for (;;) {
      const values: number[] = [];
      for (let argument = 0; argument < arity; argument++) {
        if (argument > 0) scanner.commaWsp();
        if (arity === 7 && (argument === 3 || argument === 4)) {
          const flag = scanner.code;
          if (flag !== 0x30 && flag !== 0x31) return undefined;
          scanner.index++;
          values.push(flag - 0x30);
          continue;
        }
        const value = scanner.number();
        if (value === undefined) return undefined;
        values.push(value);
      }
      commands.push({ command: first ? letter : repeat, values });
      first = false;
      scanner.skipWsp();
      if (scanner.code === 0x2c) {
        scanner.index++;
        scanner.skipWsp();
        if (!scanner.startsNumber()) return undefined;
        continue;
      }
      if (scanner.done || !scanner.startsNumber()) break;
    }
  }
  return commands;
}

/** XML `id` grammar of the profile (§7): `[A-Za-z_][A-Za-z0-9_.-]*`. */
export const isSvgArtworkId029 = (value: string) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value);

const HEX = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const RGB = /^rgb\([ \t\n\r]*([0-9]+)[ \t\n\r]*,[ \t\n\r]*([0-9]+)[ \t\n\r]*,[ \t\n\r]*([0-9]+)[ \t\n\r]*\)$/i;
const NAMED = new Map<string, string>(
  (
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc ' +
    'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a ' +
    'burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 ' +
    'cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b ' +
    'darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b ' +
    'darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
    'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f ' +
    'darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 ' +
    'dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 ' +
    'fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 ' +
    'green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c ' +
    'indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 ' +
    'lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 ' +
    'lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a ' +
    'lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
    'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff ' +
    'maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db ' +
    'mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc ' +
    'mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 ' +
    'navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 ' +
    'orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee ' +
    'palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd ' +
    'powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 ' +
    'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d ' +
    'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
    'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 ' +
    'turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 ' +
    'yellowgreen:9acd32 '
  ).trim().split(' ').map((entry) => {
    const [name, hex] = entry.split(':');
    return [name!, `#${hex!}`];
  }));

/** `color` (profile §7.2) as `#rrggbb`; `currentColor` is not a color here. */
export function parseColor029(raw: string): string | undefined {
  const text = trimWsp(raw);
  if (HEX.test(text)) {
    const digits = text.slice(1).toLowerCase();
    return digits.length === 3 ? `#${[...digits].map((digit) => digit + digit).join('')}` : `#${digits}`;
  }
  const rgb = RGB.exec(text);
  if (rgb) {
    const channels = rgb.slice(1, 4).map((digits) => Number(digits));
    if (channels.some((channel) => channel > 255)) return undefined;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return NAMED.get(text.toLowerCase());
}

export type ParsedPaint029 =
  | { kind: 'none' } | { kind: 'color'; hex: string } | { kind: 'current' } | { kind: 'url'; id: string };

/** `paint` (profile §7.3) and the `clip-path` value; `reference` marks a non-local URL part. */
export function parsePaint029(raw: string, allowColors: boolean): ParsedPaint029 | 'grammar' | 'reference' {
  const text = trimWsp(raw);
  const at = text.toLowerCase().indexOf('url(');
  if (at >= 0) {
    const close = text.indexOf(')', at);
    const part = close < 0 ? text.slice(at) : text.slice(at, close + 1);
    const local = /^url\(#([A-Za-z_][A-Za-z0-9_.-]*)\)$/i.exec(part);
    if (!local || part.slice(0, 4).toLowerCase() !== 'url(') return 'reference';
    return part === text ? { kind: 'url', id: local[1]! } : 'grammar';
  }
  const keyword = text.toLowerCase();
  if (keyword === 'none') return { kind: 'none' };
  if (!allowColors) return 'grammar';
  if (keyword === 'currentcolor') return { kind: 'current' };
  const hex = parseColor029(text);
  return hex ? { kind: 'color', hex } : 'grammar';
}

/** `href` and `xlink:href`: exactly `#` and an `id`. */
export function parseHref029(raw: string): string | undefined {
  return raw.startsWith('#') && isSvgArtworkId029(raw.slice(1)) ? raw.slice(1) : undefined;
}

const ALIGN = /^(?:none|x(?:min|mid|max)y(?:min|mid|max))(?:[ \t\n\r]+(?:meet|slice))?$/i;
export const isPreserveAspectRatio029 = (raw: string) => ALIGN.test(trimWsp(raw));

/** Root `width` and `height`: a number with an optional unit (profile §7.7). */
export function isRootDimension029(raw: string): boolean {
  const text = trimWsp(raw);
  const unit = /(?:px|pt|pc|mm|cm|in|em|ex|%)$/i.exec(text);
  return (unit ? beforeSuffix(text, unit[0].length) : parseNumber029(text)) !== undefined;
}

export function parseKeyword029<T extends string>(raw: string, keywords: readonly T[], caseSensitive = false): T | undefined {
  const text = trimWsp(raw);
  return keywords.find((keyword) => caseSensitive ? keyword === text : keyword.toLowerCase() === text.toLowerCase());
}
