import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'vitest';
import { benchmarkEnvironment, validatePerformanceSamples } from '../../../scripts/performance-policy.mjs';
import { admitSvgArtwork029 } from '../src/index.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { CALIBRATION_ARTWORKS_029, calibrationDocument029 } from './fixtures/svgArtworkCalibration029.js';

// coral.svg-artwork 1 budget calibration (calibration-design.md M1-M3).
// Report-only: samples are validated and printed, and no ceiling is asserted.

const SAMPLES = 5;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const quantile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
const round = (value: number) => Math.round(value * 10) / 10;

/** Time each phase of source to SVG; the salt makes every sample miss the admission cache. */
async function phases(artworks: readonly string[], instances: number, salt: string) {
  const text = calibrationDocument029(artworks, instances, salt);
  let started = performance.now();
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const parse = performance.now() - started;
  started = performance.now();
  projectInstalledSourceToSuccessor028(text);
  const warmParse = performance.now() - started;
  started = performance.now();
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laid = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const layout = performance.now() - started;
  const options = { edgeRoutes: laid.edgeRoutes, layoutDirection: 'RIGHT' as const, semanticGraph: display,
    successorSource: graph };
  started = performance.now();
  prepareSpatialScene028(laid, options);
  const scene = performance.now() - started;
  started = performance.now();
  const svg = renderSvg(laid, options);
  const serialize = performance.now() - started;
  const uses = svg.match(/<use /g)?.length ?? 0;
  if (uses !== instances) throw new Error(`Expected ${instances} artwork instances, drew ${uses}`);
  validatePerformanceSamples('artwork calibration phases', [parse, warmParse, layout, scene, serialize], 5);
  return { parse, warmParse, layout, scene, serialize, svgBytes: Buffer.byteLength(svg) };
}

async function sampled(id: string, artworks: readonly string[], instances: number) {
  await phases(artworks, instances, `${id} ${instances} warm-up`);
  const runs = [];
  for (let sample = 0; sample < SAMPLES; sample++) runs.push(await phases(artworks, instances, `${id} ${instances} ${sample}`));
  const pick = (key: 'parse' | 'warmParse' | 'layout' | 'scene' | 'serialize') => round(median(runs.map((run) => run[key])));
  return { id, instances, parseMs: pick('parse'), warmParseMs: pick('warmParse'), layoutMs: pick('layout'),
    sceneMs: pick('scene'), svgMs: pick('serialize'), svgBytes: runs[0]!.svgBytes };
}

describe.skipIf(!benchmarkEnvironment().measure)('coral.svg-artwork 1 budget calibration', () => {
  it('M1: 1, 100 and 500 instances of artwork at each tier', { timeout: 300_000 }, async () => {
    const observations = [];
    for (const [name, artwork] of Object.entries(CALIBRATION_ARTWORKS_029)) {
      for (const instances of [1, 100, 500]) observations.push(await sampled(name, [artwork()], instances));
    }
    console.info('SVG_ARTWORK_INSTANCES', JSON.stringify(observations));
  });

  it('M3: the GraphIR document limits', { timeout: 300_000 }, async () => {
    const typical = Array.from({ length: 256 }, (_, index) => CALIBRATION_ARTWORKS_029.typical(index));
    const detailed = Array.from({ length: 19 }, (_, index) => CALIBRATION_ARTWORKS_029.detailed(index));
    // GraphIR counts canonical text, which is what export writes.
    const artworkBytes = (artworks: string[]) => artworks.reduce((total, artwork) => {
      const result = admitSvgArtwork029(artwork);
      return total + (result.ok ? result.artwork.measures.bytes : 0);
    }, 0);
    console.info('SVG_ARTWORK_DOCUMENT_LIMITS', JSON.stringify([
      { ...await sampled('256 definitions', typical, 256), artworkBytes: artworkBytes(typical) },
      { ...await sampled('byte limit', detailed, 19), artworkBytes: artworkBytes(detailed) },
    ]));
  });

  it('M2: real icons and raw exports', () => {
    const root = resolve(import.meta.dirname, '../../..');
    let icons: { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }> };
    try {
      icons = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/simple-icons/icons.json'), 'utf8'));
    } catch {
      console.info('SVG_ARTWORK_CORPUS skipped: @iconify-json/simple-icons is not installed');
      return;
    }
    const outcomes: Record<string, number> = {};
    const measures: { bytes: number; segments: number; input: number }[] = [];
    const times: number[] = [];
    for (const icon of Object.values(icons.icons)) {
      // Iconify bodies paint with currentColor; a root color resolves it.
      const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? icons.width ?? 24} ` +
        `${icon.height ?? icons.height ?? 24}" color="#000000">${icon.body}</svg>`;
      const started = performance.now();
      const result = admitSvgArtwork029(text);
      times.push(performance.now() - started);
      const outcome = result.ok ? result.artwork.tier : `${result.failures[0]!.code} ${result.failures[0]!.detail}`;
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      if (result.ok) measures.push({ ...result.artwork.measures, input: Buffer.byteLength(text) });
    }
    validatePerformanceSamples('icon admission', times, times.length);
    const spread = (key: 'bytes' | 'segments' | 'input') => [0.5, 0.95, 0.99, 1]
      .map((fraction) => quantile(measures.map((item) => item[key]), fraction));
    const exports = globSync(['node_modules/playwright-core/lib/vite/**/*.svg', 'docs/public/figures/*.svg',
      'packages/render/test/fixtures/calibration-icons/*.svg'], { cwd: root })
      .map((path) => {
        const result = admitSvgArtwork029(readFileSync(resolve(root, path), 'utf8'));
        return { path, outcome: result.ok ? result.artwork.tier
          : [...new Set(result.failures.map((failure) => `${failure.code} ${failure.detail}`))] };
      });
    console.info('SVG_ARTWORK_CORPUS', JSON.stringify({ icons: Object.keys(icons.icons).length, outcomes,
      p50p95p99max: { canonicalBytes: spread('bytes'), segments: spread('segments'), inputBytes: spread('input') },
      admissionMs: [0.5, 0.95, 1].map((fraction) => round(quantile(times, fraction) * 100) / 100), exports }));
  });
});
