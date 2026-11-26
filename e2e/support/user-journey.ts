import { expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { waitForEditorSettled } from './editorReadiness.js';

export { waitForEditorSettled };

/** Reusable browser user-journey primitives. */

export interface OpenBuffer {
  name: string;
  mimeType?: string;
  buffer: Buffer;
}

/** Explicit Properties action, including viewports where the header toggle is hidden. */
export async function showProperties(page: Page) {
  const panel = page.getByLabel('Properties panel', { exact: true });
  if (await panel.count()) return;
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Show Inspector');
  await page.getByRole('option', { name: 'Show Inspector', exact: true }).click();
  await expect(panel).toBeVisible();
}

export async function startCleanEditor(page: Page) {
  await page.goto('/coral/');
  const closeWelcome = page.getByRole('button', { name: 'Close welcome' });
  if (await closeWelcome.isVisible()) await closeWelcome.click();
  await page.evaluate(() => localStorage.removeItem('coral-diagram-recovery'));
  await page.reload();
  if (await closeWelcome.isVisible()) await closeWelcome.click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

export async function openBuffer(page: Page, file: OpenBuffer) {
  const editor = page.getByLabel('DSL editor', { exact: true });
  const before = await editor.inputValue();
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: file.name,
    mimeType: file.mimeType ?? 'text/plain',
    buffer: file.buffer,
  });
  await expect(editor).not.toHaveValue(before, { timeout: 15_000 });
  await waitForEditorSettled(page);
}

export function fieldByLabel(container: Locator, label: string) {
  return container.locator('label').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('..').locator('input, textarea, select').first();
}

export async function saveDocument(page: Page) {
  await waitForEditorSettled(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return {
    path: path!,
    filename: download.suggestedFilename(),
    document: JSON.parse(await readFile(path!, 'utf8')),
  };
}

export async function openSavedDocument(page: Page, path: string) {
  const editor = page.getByLabel('DSL editor', { exact: true });
  const before = await editor.inputValue();
  page.once('dialog', dialog => dialog.accept());
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(editor).not.toHaveValue(before, { timeout: 15_000 });
  await waitForEditorSettled(page);
}

export async function downloadFromPalette(page: Page, command: string) {
  await waitForEditorSettled(page);
  await page.keyboard.press('Control+k');
  const search = page.getByLabel('Search commands');
  await search.fill(command);
  await expect(page.getByRole('option', { name: command, exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return {
    path: path!,
    filename: download.suggestedFilename(),
    bytes: await readFile(path!),
  };
}

export async function canvasGeometry(page: Page) {
  return page.locator('.react-flow__node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => {
    const element = node as HTMLElement;
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return [element.dataset.id, { x: matrix.m41, y: matrix.m42 }];
  })));
}

export async function expectBlockedPaletteCommand(
  page: Page,
  command: string,
  expectedAlert: RegExp,
) {
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill(command);
  const alert = page.getByRole('alert').filter({ hasText: expectedAlert });
  const unexpectedDownload = page.waitForEvent('download', { timeout: 750 })
    .then(() => true, () => false);
  await page.keyboard.press('Enter');
  await expect(alert).toBeVisible();
  expect(await unexpectedDownload, `${command} downloaded despite a blocking error`).toBe(false);
  return alert;
}
