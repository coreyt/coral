import { chromium, expect } from '@playwright/test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const source = id => readFileSync(`packages/diagram-editor/src/example-sources/${id}.coral`, 'utf8');
const editor = page => page.getByLabel('DSL editor', { exact: true });
const fileInput = page => page.locator('.coral-file-controls input[type="file"]');
// Same visible update-owner contract used by e2e/support/editorReadiness.ts.
async function settle(page) {
  await expect.poll(() => page.evaluate(() => {
    const reflow = document.querySelector('button[aria-label="Reflow layout"]');
    return !!document.querySelector('[data-testid="visible-update-status"], [data-coral-scene-transient="true"]')
      || [...document.querySelectorAll('span')].some(element => element.textContent === 'updating...')
      || reflow?.getAttribute('title') === 'Finish the current diagram update before Reflow.'
      || document.querySelector('[data-testid="canvas-status"]')?.textContent === 'Laying out the diagram';
  }), { timeout: 15_000 }).toBe(false);
}

async function verifyHappyPath(page, request, screenshots) {
  await page.goto('/coral/examples/');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(12);
  for (const id of ['flowchart', 'order-service', 'uml-class', 'uml-sequence', 'user-symbol']) {
    const card = page.locator(`article#${id}`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('img')).toBeVisible();
    await expect.poll(() => card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    if (screenshots) await card.screenshot({ path: join(screenshots, `coral-slice40-${id}.png`) });
  }
  await page.getByRole('link', { name: 'Open An order, from request to storage in Coral', exact: true }).click();
  await expect(page).toHaveURL(/example=order-service&catalog=1.0.0/);
  await expect(page.getByRole('dialog', { name: 'Welcome to Coral' })).toBeVisible();
  await page.getByRole('button', { name: 'Open requested example' }).click();
  await expect(editor(page)).toHaveValue(source('order-service'));
  await expect(page.getByRole('combobox', { name: 'Diagram style' })).toHaveValue('hifi');
  const downloaded = await request.get('/coral/examples/order-service.coral.json');
  expect(downloaded.ok()).toBe(true);
  const document = await downloaded.json();
  expect(document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source('order-service') });
  await fileInput(page).setInputFiles({ name: 'order-service.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect(editor(page)).toHaveValue(source('order-service'));
  await expect(page.getByRole('combobox', { name: 'Diagram style' })).toHaveValue('hifi');
  const edited = `${source('order-service')}// Local catalog verification\n`;
  await editor(page).fill(edited);
  const save = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(await readFile((await (await save).path()), 'utf8'));
  expect(saved.content.text).toBe(edited);
  expect(saved.settings.renderStyle028).toBe('hifi');
  await fileInput(page).setInputFiles({ name: 'edited.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(editor(page)).toHaveValue(edited);
  await settle(page);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Export SVG');
  await expect(page.getByRole('option', { name: 'Export SVG', exact: true })).toBeVisible();
  const exporting = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const svg = await readFile((await (await exporting).path()), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Orders API');
  expect(source('order-service')).not.toContain('Local catalog verification');
}

const invalidQueries = ['catalog=1.0.0', 'example=order-service', 'example=order-service&catalog=99.0.0', 'example=missing&catalog=1.0.0', 'example=erd&catalog=1.0.0'];
async function verifyInvalidLink(page, query) {
  const draft = '@diagram flowchart\nlocal process as "Existing work"\n';
  await page.goto('/coral/');
  await page.evaluate(text => localStorage.setItem('coral-diagram-recovery', JSON.stringify({
    timestamp: Date.now(), documentName: 'Existing work', dslType: 'coral', dsl: text,
    notation: 'flowchart', nodePositions: {},
  })), draft);
  await page.goto(`/coral/?${query}`);
  await expect(page.getByRole('dialog', { name: 'Welcome to Coral' }).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open requested example' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('coral-diagram-recovery')).dsl)).toBe(draft);
  await page.getByRole('button', { name: 'Recover your work' }).click();
  await expect(editor(page)).toHaveValue(draft);
}

async function verifyCancellation(page) {
  const draft = '@diagram flowchart\nlocal process as "Keep this draft"\n';
  await page.goto('/coral/');
  await page.evaluate(text => localStorage.setItem('coral-diagram-recovery', JSON.stringify({
    timestamp: Date.now(), documentName: 'Keep this draft', dslType: 'coral', dsl: text,
    notation: 'flowchart', nodePositions: {},
  })), draft);
  await page.goto('/coral/?example=order-service&catalog=1.0.0');
  await expect(page.getByRole('button', { name: 'Recover your work' })).toBeFocused();
  await page.getByRole('button', { name: 'Open requested example' }).click();
  await expect(editor(page)).toHaveValue(source('order-service'));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('coral-diagram-recovery')).dsl)).toBe(draft);
  await page.getByRole('button', { name: 'Restore recovered diagram' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Coral' })).toHaveCount(0);
  await expect(editor(page)).toHaveValue(draft);
  await settle(page);
  const edited = `${draft}// Keep current edits too\n`;
  await editor(page).fill(edited);
  await expect(editor(page)).toHaveValue(edited);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('coral-diagram-recovery'))?.dsl)).toBe(edited);
  await settle(page);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Welcome and Examples');
  await page.keyboard.press('Enter');
  const cancellation = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toBe('Replace your unsaved work?');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Open requested example' }).click();
  await cancellation;
  await page.getByRole('button', { name: 'Close welcome' }).click();
  await expect(editor(page)).toHaveValue(edited);
}

async function verifyUserSymbolCopy(page) {
  await page.goto('/coral/?example=user-symbol&catalog=1.0.0');
  await page.getByRole('button', { name: 'Open requested example' }).click();
  await expect(editor(page)).toHaveValue(source('user-symbol'));
  await settle(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__node[data-id="ingress"]')).toContainText('Gateway');
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(await readFile((await (await downloading).path()), 'utf8'));
  expect(saved.content.text).toBe(source('user-symbol'));
}

/** Exercise real assembled gallery/editor paths; no test-only product hooks. */
export async function verifyExampleGalleryBrowser(origin, { screenshots } = {}) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const scenarios = [
    (page, context) => verifyHappyPath(page, context.request, screenshots),
    page => verifyUserSymbolCopy(page),
    ...invalidQueries.map(query => page => verifyInvalidLink(page, query)),
    page => verifyCancellation(page),
  ];
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ baseURL: origin, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on('pageerror', error => errors.push(error.message));
      try { await scenario(page, context); }
      finally { await context.close(); }
    }
    expect(errors).toEqual([]);
    return { scenarios: scenarios.length, previews: 5 };
  } finally { await browser.close(); }
}
