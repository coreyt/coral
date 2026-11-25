#!/usr/bin/env node
/** Mechanical report only. No browser, storage, placement or import-flow gate. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { prepareSvgIconImport029, checkSvgIconBounds029 } from '../packages/render/dist/artwork/svgIconImport029.js';
const require = createRequire(import.meta.url);
const { Resvg, initWasm } = await import('@resvg/resvg-wasm');
await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const corpus = JSON.parse(readFileSync(require.resolve('@iconify-json/simple-icons/icons.json'), 'utf8'));
const icons = Object.entries(corpus.icons).map(([name, icon]) => ({ name: `${name}.svg`, source: 'corpus',
  text: `<svg xmlns="http://www.w3.org/2000/svg" color="#000000" viewBox="0 0 ${icon.width ?? corpus.width} ${icon.height ?? corpus.height}">${icon.body}</svg>` }));
const directory = option('--directory');
const pattern = new RegExp(option('--pattern', '[.]svg$'), 'i');
if (directory) for (const name of readdirSync(directory).filter((name) => pattern.test(name)).sort())
  icons.push({ name, source: 'supplied', text: readFileSync(resolve(directory, name), 'utf8') });
const rows = icons.map((icon) => {
  const start = performance.now();
  try { const prepared = prepareSvgIconImport029(icon.text); const bounds = checkSvgIconBounds029(prepared.artwork, (text) => new Resvg(text));
    return { name: icon.name, source: icon.source, accepted: true, ...prepared.measures, ...bounds, checkMs: performance.now() - start };
  } catch (error) { return { name: icon.name, source: icon.source, accepted: false, inputBytes: Buffer.byteLength(icon.text), error: String(error instanceof Error ? error.message : error) }; }
});
const report = { kind: 'mechanical icon report; no product import flow', checked: rows.length,
  accepted: rows.filter((row) => row.accepted).length, refused: rows.filter((row) => !row.accepted).length,
  bounds: 'resvg estimate, not exact full-stroke ink', rows };
writeFileSync(option('--output', '/tmp/coral-icon-mechanical029.json'), JSON.stringify(report, null, 2) + '\n');
// Three fixed stratified samples, not a whole-corpus import-flow assertion.
const corpusIcons = icons.filter((icon) => icon.source === 'corpus').sort((a, b) => a.text.length - b.text.length);
const eligible = new Set(rows.filter((row) => row.accepted && row.source === 'supplied').map((row) => row.name));
const supplied = icons.filter((icon) => icon.source === 'supplied' && eligible.has(icon.name));
const rounds = [0, 1, 2].map((round) => {
  const picks = [];
  for (const base of [0, Math.floor(corpusIcons.length / 2), corpusIcons.length - 18])
    for (let i = 0; i < 6; i++) picks.push(corpusIcons[base + round * 6 + i]);
  if (round === 0) {
    const path = 'M2 2' + ['L22 2', 'L22 22', 'L2 22', 'L2 2'].map((s) => s + ' ').join('').repeat(7) + 'L22 2Z';
    const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${`<path d="${path}" fill="#265e9c" opacity="0.05"/>`.repeat(100)}</svg>`;
    const padding = 131072 - Buffer.byteLength(body) - 7;
    picks[6] = { name: 'profile-boundary.svg', source: 'synthetic', text: body.replace('</svg>', `<!--${' '.repeat(padding)}--></svg>`) };
  }
  if (supplied.length) {
    const first = (round * 13) % supplied.length; picks.push(supplied[first]);
    if (supplied.length > 1) picks.push(supplied[(first + Math.max(1, Math.floor(supplied.length / 7))) % supplied.length]);
  }
  return picks.map((icon) => ({ ...icon, name: `round${round + 1}-${icon.name}` }));
});
writeFileSync(option('--samples', '/tmp/coral-icon-samples029.json'), JSON.stringify(rounds) + '\n');
console.log(JSON.stringify({ checked: report.checked, accepted: report.accepted, refused: report.refused,
  sampledRounds: rounds.map((round) => round.length), report: option('--output', '/tmp/coral-icon-mechanical029.json') }));
