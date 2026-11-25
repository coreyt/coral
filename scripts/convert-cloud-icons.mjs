#!/usr/bin/env node
/**
 * Convert official AWS, Azure, or GCP vendor SVG icon files into Coral 0.2.9/0.2.14
 * `@symbol` definitions verified through `admitSvgArtwork029` (coral.svg-artwork v1).
 *
 * Usage:
 *   node scripts/convert-cloud-icons.mjs --provider aws --input <svg-or-dir> [--out <file.coral>] [--size 56]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { admitSvgArtwork029 } from '../packages/render/dist/index.js';

function parseArgs(argv) {
  const opts = { provider: 'cloud', input: '', out: '', size: 56, limit: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') opts.provider = String(argv[++i] ?? 'cloud').toLowerCase();
    else if (a === '--input') opts.input = String(argv[++i] ?? '');
    else if (a === '--out') opts.out = String(argv[++i] ?? '');
    else if (a === '--size') opts.size = Math.max(24, Math.min(128, Number(argv[++i] ?? 56) || 56));
    else if (a === '--limit') opts.limit = Math.max(1, Number(argv[++i] ?? 200) || 200);
  }
  return opts;
}

function collectSvgs(target, out = []) {
  const st = statSync(target);
  if (st.isFile() && extname(target).toLowerCase() === '.svg') { out.push(target); return out; }
  if (!st.isDirectory()) return out;
  for (const entry of readdirSync(target).sort()) {
    collectSvgs(join(target, entry), out);
  }
  return out;
}

function sanitizeSvg(raw) {
  let svg = raw
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  // Inline simple CSS class rules from <style> blocks (common in GCP/Illustrator SVGs).
  const classRules = new Map();
  svg = svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
    for (const rule of css.matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]+)\}/g)) {
      classRules.set(rule[1], rule[2].trim());
    }
    return '';
  });
  if (classRules.size) {
    svg = svg.replace(/\bclass=["']([^"']+)["']/g, (_m, names) => {
      const attrs = [];
      for (const cls of names.trim().split(/\s+/)) {
        const decls = classRules.get(cls);
        if (!decls) continue;
        for (const decl of decls.split(';')) {
          const [k, v] = decl.split(':').map((s) => s?.trim());
          if (k && v && /^(?:fill|stroke|stroke-width|opacity|fill-opacity|fill-rule)$/i.test(k)) {
            attrs.push(`${k.toLowerCase()}="${v}"`);
          }
        }
      }
      return attrs.join(' ');
    });
  }
  svg = svg
    .replace(/\s+(?:version|xmlns:xlink|xml:space|enable-background|data-[A-Za-z0-9_-]+)=["'][^"']*["']/gi, '')
    .replace(/\bid=["']([^"']+)["']/g, (_m, id) => {
      const clean = id.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[^A-Za-z_]/, '_');
      return `id="${clean}"`;
    })
    .replace(/url\(#([^)]+)\)/g, (_m, id) => {
      const clean = id.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[^A-Za-z_]/, '_');
      return `url(#${clean})`;
    })
    .trim();
  const open = /<svg\b([^>]*)>/i.exec(svg);
  if (open && !/viewBox=/i.test(open[1])) {
    const w = /\bwidth=["']([\d.]+)/i.exec(open[1])?.[1] ?? '64';
    const h = /\bheight=["']([\d.]+)/i.exec(open[1])?.[1] ?? '64';
    svg = svg.replace(open[0], `<svg${open[1]} viewBox="0 0 ${w} ${h}">`);
  }
  return svg;
}

function toSymbolId(provider, filePath) {
  const stem = basename(filePath, extname(filePath))
    .replace(/^Arch_|^Res_|^icon-service-/i, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const base = `${provider}_${stem || 'icon'}`.replace(/^[^A-Za-z_]/, '_');
  return base.slice(0, 48);
}

function toDisplayName(filePath) {
  return basename(filePath, extname(filePath))
    .replace(/^Arch_|^Res_|^icon-service-/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.input) {
  console.error('Usage: node scripts/convert-cloud-icons.mjs --provider <aws|azure|gcp> --input <svg-or-dir> [--out <file.coral>]');
  process.exit(1);
}

const files = collectSvgs(resolve(opts.input)).slice(0, opts.limit);
const seen = new Set();
const blocks = [];
let admitted = 0;
let rejected = 0;

for (const file of files) {
  const cleaned = sanitizeSvg(readFileSync(file, 'utf8'));
  const result = admitSvgArtwork029(cleaned);
  if (!result.ok) { rejected += 1; continue; }
  let id = toSymbolId(opts.provider, file);
  let n = 2;
  while (seen.has(id)) id = `${toSymbolId(opts.provider, file)}_${n++}`;
  seen.add(id);
  const name = toDisplayName(file) || id;
  blocks.push([
    `@symbol ${id} {`,
    `  name ${JSON.stringify(name)}`,
    `  tags ${JSON.stringify(opts.provider)} "infrastructure" "cloud"`,
    `  size ${opts.size} x ${opts.size}`,
    `  label below`,
    `  outline rectangle`,
    `  artwork svg """`,
    cleaned,
    `"""`,
    `}`,
  ].join('\n'));
  admitted += 1;
}

const output = blocks.join('\n\n') + (blocks.length ? '\n' : '');
if (opts.out) {
  writeFileSync(resolve(opts.out), output, 'utf8');
  console.log(`Converted ${admitted} icons (${rejected} rejected) -> ${opts.out}`);
} else {
  process.stdout.write(output);
  console.error(`Converted ${admitted} icons (${rejected} rejected)`);
}
