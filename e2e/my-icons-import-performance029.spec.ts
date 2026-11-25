import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { startCleanEditor, openBuffer, waitForEditorSettled } from './support/user-journey.js';
import { openPage } from './support/browserRenderContract.js';
import { calibrationDocument029 } from '../packages/render/test/fixtures/svgArtworkCalibration029.js';
// Explicit local benchmark: exactly three sampled rounds, never whole-set UI acceptance.
const samplesPath = process.env.CORAL_ICON_SAMPLES_029;
const rounds: { name: string; text: string; source: string }[][] = samplesPath ? JSON.parse(readFileSync(samplesPath, 'utf8')) : [];
const p95 = (numbers: number[]) => [...numbers].sort((a, b) => a - b)[Math.ceil(numbers.length * .95) - 1]!;
for (let round = 0; round < 3; round++) test(`My Icons sampled round ${round + 1}: import, reopen, paint and zoom`, async ({ page, browser }) => {
  test.skip(!samplesPath, 'Generate local sampled inputs with scripts/check-icons.mjs.');
  test.setTimeout(180_000);
  const samples = rounds[round]!;
  await startCleanEditor(page);
  await openBuffer(page, { name: 'icons.coral', buffer: Buffer.from('@diagram architecture\n@coralVersion "0.2.9"\na service\nb service\na -> b\n') });
  await waitForEditorSettled(page);
  const openLibrary = async () => { await page.getByRole('button', { name: 'More actions' }).click(); await page.getByRole('menuitem', { name: 'My Icons', exact: true }).click(); };
  await openLibrary();
  const dialog = page.getByRole('dialog', { name: 'My Icons', exact: true });
  await page.evaluate(() => {
    const state = window as unknown as { iconFrames: number[]; iconStop: boolean };
    state.iconFrames = []; state.iconStop = false; let prior = performance.now();
    const frame = (now: number) => { state.iconFrames.push(now - prior); prior = now; if (!state.iconStop) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  const started = Date.now();
  await dialog.getByLabel('Add SVG or icon bundle').setInputFiles(samples.map((sample) => ({ name: sample.name, mimeType: 'image/svg+xml', buffer: Buffer.from(sample.text) })));
  await expect(dialog.getByRole('status')).toContainText(`${samples.length} icons ready`, { timeout: 15_000 });
  const importMs = Date.now() - started;
  const frameP95Ms = await page.evaluate(() => { const state = window as unknown as { iconFrames: number[]; iconStop: boolean }; state.iconStop = true;
    const frames = state.iconFrames.slice(2).sort((a, b) => a - b); return frames[Math.max(0, Math.ceil(frames.length * .95) - 1)] ?? 0; });
  await dialog.getByRole('button', { name: 'Save imported icons', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved to My Icons');
  await dialog.getByRole('button', { name: samples[0]!.name.replace(/\.svg$/i, ''), exact: true }).click();
  await dialog.getByRole('button', { name: 'Place in diagram', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await waitForEditorSettled(page);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.reload();
  await waitForEditorSettled(page);
  const reopenStarted = Date.now(); await openLibrary();
  await expect(page.getByRole('button', { name: samples[0]!.name.replace(/\.svg$/i, ''), exact: true })).toBeVisible();
  const reopenMs = Date.now() - reopenStarted;
  // Paint the largest sampled icon through the actual browser renderer, separate from UI import.
  const largest = [...samples].sort((a, b) => b.text.length - a.text.length)[0]!;
  const largestName = largest.name.replace(/\.svg$/i, '');
  await page.getByRole('button', { name: largestName, exact: true }).click();
  const preview = await page.getByRole('img', { name: `${largestName}, 24 pixels, light`, exact: true }).getAttribute('src');
  const artwork = decodeURIComponent(preview!.slice(preview!.indexOf(',') + 1));
  await page.getByRole('button', { name: 'Close My Icons' }).click();
  const bundle = readFileSync(resolve(__dirname, '../packages/browser/dist/coral-browser.iife.js'), 'utf8');
  const painting = [];
  for (const count of [1, 100, 500]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const drawing = await openPage(context, bundle);
      const drawMs = await drawing.evaluate(async (source) => {
        const host = Object.assign(document.createElement('div'), { id: 'host' }); document.body.append(host);
        host.style.transformOrigin = '0 0'; const begin = performance.now();
        await (window as unknown as { Coral: { renderTo(target: Element, text: string): Promise<unknown> } }).Coral.renderTo(host, source);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        return performance.now() - begin;
      }, calibrationDocument029([artwork], count));
      const uses = await drawing.evaluate(() => document.getElementById('host')!.shadowRoot!.querySelectorAll('[data-coral-artwork] use').length);
      expect(uses).toBe(count);
      const zoomFrames = [];
      for (let i = 0; i < 11; i++) {
        const duration = await drawing.evaluate((scale) => { const begin = performance.now(); document.getElementById('host')!.style.transform = `scale(${scale})`;
          return new Promise<number>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - begin)))); }, i % 2 ? .8 : 1);
        if (i) zoomFrames.push(duration);
      }
      painting.push({ count, drawMs, zoomP95Ms: p95(zoomFrames) });
    } finally { await context.close(); }
  }
  console.info('MY_ICONS_SAMPLED_029', JSON.stringify({ round: round + 1, samples: samples.length, importMs, frameP95Ms, reopenMs, largest: largest.name, painting, stress500Above55Ms: painting.some((item) => item.count === 500 && item.zoomP95Ms >= 55) }));
  expect(importMs).toBeLessThan(3000);
  expect(reopenMs).toBeLessThan(1000);
  // Refresh-quantized interactive target; draw timings are reported, not a hardware guarantee.
  expect(frameP95Ms).toBeLessThan(55);
  // 500 copies are a reported stress case, as in the existing artwork
  // calibration. Admission limits are not a universal paint-time guarantee.
  expect(painting.filter((item) => item.count <= 100).every((item) => item.zoomP95Ms < 55)).toBe(true);
});
