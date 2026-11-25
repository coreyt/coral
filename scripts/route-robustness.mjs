#!/usr/bin/env node
/**
 * Extended generated-route robustness run (0.2.10 renderer robustness, RR-3).
 * `npm test` already runs the default corpus; this widens it to more seeds and
 * both styles. Every diagram without authored geometry must draw in all four
 * directions with no hard failure and no slanted leg in a bent orthogonal route.
 *
 *   node scripts/route-robustness.mjs [--seeds=25] [--styles=lowfi,hifi]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const result = spawnSync(process.execPath, [
  join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'test/routeRobustness0210.test.ts',
], {
  cwd: join(root, 'packages/render'), stdio: 'inherit',
  env: { ...process.env, ROUTE_ROBUSTNESS_SEEDS: argument('seeds', '25'),
    ROUTE_ROBUSTNESS_STYLES: argument('styles', 'lowfi,hifi') },
});
process.exit(result.status ?? 1);
