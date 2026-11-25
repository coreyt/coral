import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { startCleanEditor } from './support/user-journey.js';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('Blank diagram enters source-first authoring after Welcome closes', async ({ page }) => {
  await page.goto('/coral/');
  await page.evaluate(key => {
    localStorage.setItem(key, 'true');
    localStorage.removeItem('coral-diagram-recovery');
  }, `coral-welcome-seen:${version}`);
  await page.reload();

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'Open Welcome and examples' }).click();
  const welcome = page.getByRole('dialog', { name: 'Welcome to Coral' });
  await expect(welcome).toBeVisible();
  await expect(page.getByRole('button', { name: 'Blank diagram' })).toBeFocused();
  await page.getByRole('button', { name: 'Blank diagram' }).click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Create node' })).toHaveCount(0);
  await expect(page.getByLabel('DSL editor', { exact: true })).toBeFocused();
});

test('loaded Coral source fills its dock', async ({ page }) => {
  await page.goto('/coral/');
  const source = '@diagram flowchart\nparse process as "Parse"\n' +
    'render process as "Render"\nparse -.-> render [flow]\n';
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'loaded-source-sizing.coral', mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });

  const sourceRegion = page.getByLabel('DSL editor region');
  const editor = page.getByLabel('DSL editor', { exact: true });
  const status = page.getByTestId('status-bar');
  await expect(editor).toHaveValue(source);
  const geometry = await sourceRegion.evaluate((region, elements) => {
    const editorRect = (elements.editor as HTMLElement).getBoundingClientRect();
    const statusRect = (elements.status as HTMLElement).getBoundingClientRect();
    const regionRect = region.getBoundingClientRect();
    return {
      fillRatio: editorRect.height / regionRect.height,
      gapBeforeStatus: statusRect.top - editorRect.bottom,
      statusBottomDelta: regionRect.bottom - statusRect.bottom,
    };
  }, { editor: await editor.elementHandle(), status: await status.elementHandle() });
  expect(geometry.fillRatio).toBeGreaterThan(0.75);
  expect(Math.abs(geometry.gapBeforeStatus)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.statusBottomDelta)).toBeLessThanOrEqual(2);
});

test('opens, saves, reopens, edits, and saves every Coral-authored Welcome example', async ({ page }) => {
  await startCleanEditor(page);
  const examples = [
    ['Signal path', 'block'], ['Request review', 'flowchart'],
    ['Approve invoice', 'bpmn'], ['Render call graph', 'code'],
    ['Service and database', 'architecture'], ['Model training', 'aiml'],
    ['Batch pipeline', 'data-engineering'], ['Idea sketch', 'sketch'],
    ['Order model', 'uml-class'], ['Sign-in sequence', 'uml-sequence'],
  ] as const;
  for (const [name, file] of examples) {
    const source = readFileSync(`packages/diagram-editor/src/example-sources/${file}.coral`, 'utf8');
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Welcome and Examples');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: `Open ${name} example` }).click();
    await expect(page.getByLabel('Document name')).toHaveValue(name);
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
    await page.getByLabel('Document name').fill(`${name} edited`);
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const buffer = await readFile(path!);
    expect(JSON.parse(buffer.toString('utf8')).content)
      .toMatchObject({ format: 'dsl', dslType: 'coral', text: source });
    await page.locator('input[type="file"]').first().setInputFiles({
      name: `${name}.coral.json`, mimeType: 'application/json', buffer,
    });
    await expect(page.getByLabel('Document name')).toHaveValue(`${name} edited`);
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(source);
    const edited = `${source}// Edited after reopening\n`;
    await editor.fill(edited);
    await expect(editor).toHaveValue(edited);
    await expect(page.getByTestId('visible-update-status')).toHaveCount(0);
    const editedDownloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const editedDownload = await editedDownloadPromise;
    const editedPath = await editedDownload.path();
    expect(editedPath).not.toBeNull();
    const editedBuffer = await readFile(editedPath!);
    expect(JSON.parse(editedBuffer.toString('utf8')).content)
      .toMatchObject({ format: 'dsl', dslType: 'coral', text: edited });
    await expect(page.getByTestId('visible-update-status')).toHaveCount(0);
  }
});

test('Help and About are keyboard accessible and display truthful release facts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help).toContainText('provider AI features and composer voice input are not available.');
  await expect(help).toContainText('The on-device editing model is experimental.');
  await expect(help).toContainText('experimental, untested');
  // The two on-device Use pages, then source and support.
  await expect(help.getByRole('link')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await page.getByRole('button', { name: 'About Coral' }).click();
  const about = page.getByRole('dialog', { name: 'About Coral' });
  await expect(about).toContainText(`Version ${version}`);
  await expect(about).toContainText(/Commit [0-9a-f]{40}/);
  await expect(about).toContainText('LFM Open License v1.0, not Apache-2.0');
  await expect(about.getByRole('link', { name: 'Understanding the on-device editing model' })).toHaveAttribute('href', '/coral/docs/use/explain/on-device-editing-model');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(about.getByRole('button', { name: 'Close about' })).toBeFocused();
});
