import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  admitSvgArtwork029, SVG_ARTWORK_CODES_029, userSymbolSvgDefinition029,
  type SvgArtworkAdmission029,
} from '../src/index.js';
import { documentSymbolDefinition029 } from '../src/graphIrDocumentSymbols029.js';

const fuzzDigest = (text: string): string => documentSymbolDefinition029({ id: 'fuzz', symbolId: 'local.fuzz',
  name: 'Fuzz', tags: [], size: { width: 1, height: 1 }, label: 'below', outline: 'rectangle', tint: 'none',
  anchors: [], ports: [], artwork: { format: 'svg', text } }).digest;

// Seeded fuzzing of the coral.svg-artwork 1 tokenizer, parser and admitter
// (c2-design.md "Fuzzing"). Seeds are fixed so every run is reproducible; set
// CORAL_FUZZ_ITERATIONS for a longer run. A failure message names its seed.

const ITERATIONS = Number(process.env.CORAL_FUZZ_ITERATIONS ?? 400);
const TIMEOUT = Math.max(10_000, ITERATIONS * 5);

/** mulberry32: a 32-bit mixing PRNG. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const int = (limit: number) => Math.floor(next() * limit);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
  return { next, int, pick, chance: (p: number) => next() < p };
}
type Random = ReturnType<typeof random>;

const PRIMITIVE = /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/g;
const CODES = new Set<string>(SVG_ARTWORK_CODES_029);

/** Properties every admission result must have. */
function check(input: string, result: SvgArtworkAdmission029, where: string) {
  if (!result.ok) {
    expect(result.failures.length, where).toBeGreaterThan(0);
    for (const failure of result.failures) {
      expect(CODES.has(failure.code), where).toBe(true);
      expect(failure.start >= 0 && failure.start <= failure.end && failure.end <= input.length, where).toBe(true);
      expect(failure.detail, where).toMatch(/^[\x20-\x7e]{1,200}$/);
    }
    return;
  }
  const canonical = result.artwork.canonicalText;
  expect(canonical.endsWith('\n'), where).toBe(true);
  for (const line of canonical.slice(0, -1).split('\n')) {
    expect(line, where).toMatch(/^(?: {2})*<[^\n]*>$/);
    expect(line, where).not.toBe('"""');
  }
  const again = admitSvgArtwork029(canonical);
  expect(again.ok, where).toBe(true);
  if (!again.ok) return;
  expect(again.artwork.canonicalText, where).toBe(canonical);
  expect(again.artwork.inputIsCanonical, where).toBe(true);
  expect(again.artwork.tier, where).toBe(result.artwork.tier);
  for (const svg of [canonical.replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, ''),
    userSymbolSvgDefinition029('fuzz', 'icon', result.artwork).replace(/<clipPath\b.*?<\/clipPath>/g, '')]) {
    for (const [tag] of svg.matchAll(PRIMITIVE)) {
      for (const name of ['fill', 'stroke', 'stroke-width', 'opacity']) expect(tag, where).toMatch(new RegExp(` ${name}="`));
    }
  }
}

const vectorsUrl = new URL('../spec/svg-artwork-1/vectors/', import.meta.url);
const corpus = (JSON.parse(readFileSync(new URL('manifest.json', vectorsUrl), 'utf8')) as { files: string[] }).files
  .flatMap((file) => (JSON.parse(readFileSync(new URL(file, vectorsUrl), 'utf8')) as { vectors: { input?: string }[] }).vectors)
  .map((vector) => vector.input).filter((input): input is string => input !== undefined && input.length < 4_000);
const METACHARACTERS = ['<', '>', '&', '"', "'", ']]>', '<!', '<?', '--', '&#x0;', '&amp;', '\r', '\ud800', '"""', '=', '/>',
  'url(', '#', ':', ' xmlns:x="u"', '<!DOCTYPE x>', '<![CDATA[', '\u0000'];

function mutate(rng: Random, input: string): string {
  let text = input;
  for (let step = 1 + rng.int(4); step > 0; step--) {
    const at = rng.int(text.length + 1);
    switch (rng.int(6)) {
      case 0: text = text.slice(0, at) + String.fromCharCode(rng.int(128)) + text.slice(at + 1); break;
      case 1: text = text.slice(0, at) + rng.pick(METACHARACTERS) + text.slice(at); break;
      case 2: text = text.slice(0, at); break;
      case 3: text = text.slice(0, at) + rng.pick(corpus).slice(rng.int(200)) ; break;
      case 4: {
        const end = Math.min(text.length, at + rng.int(40));
        text = text.slice(0, end) + text.slice(at, end) + text.slice(end);
        break;
      }
      default: text = text.slice(0, at) + text.slice(at + 1 + rng.int(8));
    }
  }
  return text;
}

const TOKENS = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">', '</svg>', '<g>', '</g>', '<g/>', '<defs>', '</defs>',
  '<path d="M0 0L1 1"/>', '<rect width="2" height="2"/>', '<circle r="1"/>', '<title>t</title>', '<!-- c -->',
  '<linearGradient id="a">', '</linearGradient>', '<stop offset="0"/>', '<clipPath id="k">', '</clipPath>',
  ' fill="url(#a)"', ' clip-path="url(#k)"', ' style="fill:red"', ' transform="scale(2)"', '<script>', '&lt;', ' ', '\n',
  'x', '"', '>', '<', '&', '<![CDATA[x]]>', '<?pi?>', '<!DOCTYPE svg>',
  // Long lists within every ceiling, which must not exhaust the call stack.
  `<polyline points="${'1 2 '.repeat(100_000)}"/>`, `<polygon points="${'3,4 '.repeat(80_000)}"/>`,
  `<path d="M0 0${' L1 1'.repeat(60_000)}"/>`, `<path d="M0 0" stroke-dasharray="${'1 '.repeat(64)}"/>`];

// ── Generation and respelling ───────────────────────────────────────────

const number = (rng: Random, low: number, high: number) => Math.round((low + rng.next() * (high - low)) * 4) / 4;
const COLORS = ['#000000', '#ffffff', '#ff0000', '#2f6f4f', '#aabbcc', '#123456', '#008080'];

function generate(rng: Random): string {
  const defs: string[] = [];
  const paint = () => {
    const roll = rng.int(10);
    if (roll === 0) return 'none';
    if (roll === 1) {
      const id = `g${defs.length}`;
      defs.push(`<linearGradient id="${id}" x2="${number(rng, 0, 1)}"><stop offset="0" stop-color="${rng.pick(COLORS)}"/>` +
        `<stop offset="1" stop-color="${rng.pick(COLORS)}" stop-opacity="${number(rng, 0, 1)}"/></linearGradient>`);
      return `url(#${id})`;
    }
    return rng.pick(COLORS);
  };
  const primitive = (): string => {
    const style = ` fill="${paint()}"${rng.chance(0.5) ? ` stroke="${paint()}" stroke-width="${number(rng, 0, 3)}"` : ''}` +
      `${rng.chance(0.2) ? ` opacity="${number(rng, 0, 1)}"` : ''}${rng.chance(0.2) ? ' stroke-linecap="round"' : ''}` +
      `${rng.chance(0.2) ? ` transform="translate(${number(rng, -4, 4)} ${number(rng, -4, 4)})"` : ''}`;
    const p = () => number(rng, 0, 24);
    switch (rng.int(7)) {
      case 0: return `<rect x="${p()}" y="${p()}" width="${p()}" height="${p()}" rx="${number(rng, 0, 2)}" ry="${number(rng, 0, 2)}"${style}/>`;
      case 1: return `<circle cx="${p()}" cy="${p()}" r="${number(rng, 0, 8)}"${style}/>`;
      case 2: return `<ellipse cx="${p()}" cy="${p()}" rx="${number(rng, 0, 8)}" ry="${number(rng, 0, 8)}"${style}/>`;
      case 3: return `<line x1="${p()}" y1="${p()}" x2="${p()}" y2="${p()}"${style}/>`;
      case 4: return `<polyline points="${p()} ${p()} ${p()} ${p()} ${p()} ${p()}"${style}/>`;
      case 5: return `<polygon points="${p()} ${p()} ${p()} ${p()} ${p()} ${p()}"${style}/>`;
      default: {
        const commands = [`M ${p()} ${p()}`];
        for (let count = 1 + rng.int(6); count > 0; count--) {
          commands.push(rng.pick([`L ${p()} ${p()}`, `l ${number(rng, -3, 3)} ${number(rng, -3, 3)}`, `H ${p()}`, `v ${number(rng, -3, 3)}`,
            `C ${p()} ${p()} ${p()} ${p()} ${p()} ${p()}`, `Q ${p()} ${p()} ${p()} ${p()}`, `S ${p()} ${p()} ${p()} ${p()}`,
            `T ${p()} ${p()}`, `A ${number(rng, 0, 6)} ${number(rng, 0, 6)} ${rng.int(90)} ${rng.int(2)} ${rng.int(2)} ${p()} ${p()}`, 'Z']));
        }
        return `<path d="${commands.join(' ')}"${style}/>`;
      }
    }
  };
  const body: string[] = [];
  for (let count = 1 + rng.int(5); count > 0; count--) {
    if (rng.chance(0.3)) {
      const children = Array.from({ length: rng.int(3) }, primitive).join('');
      body.push(`<g${rng.chance(0.5) ? ` opacity="${number(rng, 0, 1)}"` : ''}${rng.chance(0.5) ? ` transform="rotate(${rng.int(90)} 12 12)"` : ''}>${children}</g>`);
    } else body.push(primitive());
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}

/** Write canonical text again in another admissible spelling. */
function respell(rng: Random, canonical: string): string {
  const shorten = (hex: string) => hex[1] === hex[2] && hex[3] === hex[4] && hex[5] === hex[6] && rng.chance(0.5)
    ? `#${hex[1]}${hex[3]}${hex[5]}`.toUpperCase() : hex.toUpperCase();
  const colour = (hex: string) => {
    switch (rng.int(3)) {
      case 0: return shorten(hex);
      case 1: return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)})`;
      default: return hex === '#ff0000' ? 'Red' : hex === '#008080' ? 'TEAL' : hex;
    }
  };
  const numeral = (text: string) => {
    const value = Number(text);
    switch (rng.int(5)) {
      case 0: return value >= 0 ? `+${text}` : text;
      case 1: return Number.isInteger(value) ? `${text}.0` : text;
      case 2: return `${value * 10}e-1`;
      case 3: return text.replace(/^(-?)0\./, '$1.');
      default: return text;
    }
  };
  const respellValue = (name: string, value: string): string => {
    if (/^#[0-9a-f]{6}$/.test(value)) return colour(value);
    if (name === 'd') {
      // Arc flags (arguments 4 and 5 of A and a) stay single 0 or 1 characters.
      let command = '';
      let argument = 0;
      let path = value.split(' ').map((token) => {
        if (/^[A-Za-z]$/.test(token)) { command = token; argument = 0; return token; }
        const flag = /^[Aa]$/.test(command) && argument % 7 >= 3 && argument % 7 <= 4;
        argument++;
        return flag ? token : numeral(token);
      }).join(' ');
      // Drop a repeated command letter: `L 1 1 L 2 2` → `L 1 1 2 2`.
      if (rng.chance(0.5)) path = path.replace(/([LlCcQqSsTtHhVvAa])( [^A-Za-z]+) \1 /g, '$1$2 ');
      return rng.chance(0.5) ? path.replace(/ ([A-Za-z]) /g, '$1').replace(/^([A-Za-z]) /, '$1') : path;
    }
    if (/^(?:x|y|width|height|rx|ry|cx|cy|r|x1|y1|x2|y2|stroke-width|opacity|stroke-opacity|fill-opacity|points|offset|stop-opacity)$/.test(name)) {
      const respelled = value.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, numeral);
      return name === 'points' && rng.chance(0.5) ? respelled.replace(/ /g, (_m, index: number) => index % 2 ? ',' : ' ') : respelled;
    }
    if (name === 'stroke-width' || name === 'x') return `${value}px`;
    return value;
  };
  let text = canonical.replace(/<([A-Za-z]+)((?: [a-zA-Z:-]+="[^"]*")*)(\/?)>/g, (_match, element: string, attributes: string, close: string) => {
    let list = [...attributes.matchAll(/ ([a-zA-Z:-]+)="([^"]*)"/g)].map(([, name, value]) => [name!, respellValue(name!, value!)] as [string, string]);
    // Move presentation properties of primitives into `style`, sometimes.
    const style: string[] = [];
    if (/^(?:path|rect|circle|ellipse|line|polyline|polygon)$/.test(element) && rng.chance(0.4)) {
      list = list.filter(([name, value]) => {
        if (!/^(?:fill|stroke|stroke-width|opacity)$/.test(name) || !rng.chance(0.6) || value.includes('(')) return true;
        style.push(`${name}:${rng.chance(0.5) ? ' ' : ''}${value}`);
        return false;
      });
    }
    if (style.length > 0) list.push(['style', style.join(';')]);
    for (let index = list.length - 1; index > 0; index--) {
      const other = rng.int(index + 1);
      [list[index], list[other]] = [list[other]!, list[index]!];
    }
    const quote = rng.chance(0.3) ? "'" : '"';
    const space = () => rng.pick([' ', '  ', '\n  ', '\t']);
    return `<${element}${list.map(([name, value]) => `${space()}${name}=${quote}${value}${quote}`).join('')}${close ? `${rng.chance(0.5) ? ' ' : ''}/` : ''}>`;
  });
  if (rng.chance(0.3)) text = text.replace('<svg', '<!-- respelled -->\n<svg');
  if (rng.chance(0.3)) text = text.replace(/(<svg[^>]*>)/, '$1<title>Respelled &amp; kept</title>');
  if (rng.chance(0.3)) text = text.replace(/\n/g, '\r\n');
  if (rng.chance(0.3)) text = `<?xml version="1.0" encoding="utf-8"?>\n${text}`;
  return text;
}

describe('coral.svg-artwork 1 fuzzing', () => {
  it(`never throws and keeps result invariants over ${ITERATIONS} mutated vector inputs`, () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = random(seed);
      const input = mutate(rng, rng.pick(corpus));
      check(input, admitSvgArtwork029(input), `mutation seed ${seed}`);
    }
  }, TIMEOUT);

  it(`never throws and keeps result invariants over ${ITERATIONS} token-soup inputs`, () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = random(10_000 + seed);
      const input = Array.from({ length: 1 + rng.int(40) }, () => rng.pick(TOKENS)).join('');
      check(input, admitSvgArtwork029(input), `token seed ${seed}`);
    }
  }, TIMEOUT);

  it(`admits generated artwork and every respelling to the same canonical text, tier and digest`, () => {
    for (let seed = 1; seed <= ITERATIONS / 4; seed++) {
      const rng = random(20_000 + seed);
      const generated = admitSvgArtwork029(generate(rng));
      expect(generated.ok, `generation seed ${seed}: ${JSON.stringify(generated.ok ? '' : generated.failures.slice(0, 2))}`).toBe(true);
      if (!generated.ok) continue;
      check(generate(random(20_000 + seed)), generated, `generation seed ${seed}`);
      const digest = fuzzDigest(generated.artwork.canonicalText);
      for (let variant = 0; variant < 4; variant++) {
        const spelling = respell(rng, generated.artwork.canonicalText);
        const respelled = admitSvgArtwork029(spelling);
        const where = `respelling seed ${seed}.${variant}: ${spelling.slice(0, 300)}`;
        expect(respelled.ok, `${where} ${JSON.stringify(respelled.ok ? '' : respelled.failures.slice(0, 2))}`).toBe(true);
        if (!respelled.ok) continue;
        expect(respelled.artwork.canonicalText, where).toBe(generated.artwork.canonicalText);
        expect(respelled.artwork.tier, where).toBe(generated.artwork.tier);
        expect(fuzzDigest(spelling), where).toBe(digest);
      }
    }
  }, TIMEOUT);
});
