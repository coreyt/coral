import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERATED_FONT_ASSETS } from '../../render/src/text/generated-fonts.js';
import { BUNDLED_PACKAGES } from './support/bundledPackages.js';

/**
 * Build intermediates (R-061 AC-1). `scripts/build.mjs` writes these under
 * build/; they are not packaged. Run after a real `npm run build -w
 * @coral-viz/browser`. CI runs this file where the bundles are built, not in
 * unit stages that restore only packaged dist.
 */
const build = resolve(import.meta.dirname, '..', 'build');

describe('browser build intermediates', () => {
  it('records exactly the bundled third-party packages', () => {
    const bundled = JSON.parse(readFileSync(resolve(build, 'bundled-packages.json'), 'utf8')) as string[];
    expect(bundled).toEqual(BUNDLED_PACKAGES);
  });

  it('retains exact Inter font data and metrics in the reduced font module', async () => {
    const generated = await import(pathToFileURL(resolve(build, 'generated-fonts.js')).href);
    expect(generated.GENERATED_FONT_ASSETS.sans).toEqual(GENERATED_FONT_ASSETS.sans);
  });
});
