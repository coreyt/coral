import { expect, test } from '@playwright/test';
import { downloadFromPalette, expectBlockedPaletteCommand, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('canvas connection preserves authored semantic ports through save and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Keep this authored comment.\n@diagram flowchart\n' +
    'source process {\n  egress port [direction: out]\n}\n' +
    'target process {\n  ingress port [direction: in]\n}\n';
  const edited = source + 'source:egress -> target:ingress\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'semantic-port-creation.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();

  const first = page.locator('.react-flow__node[data-id="source"] ' +
    '.react-flow__handle.source[data-handleid="egress"]');
  const second = page.locator('.react-flow__node[data-id="target"] ' +
    '.react-flow__handle.target[data-handleid="ingress"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  await page.mouse.move(firstBox!.x + firstBox!.width / 2,
    firstBox!.y + firstBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox!.x + secondBox!.width / 2,
    secondBox!.y + secondBox!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(editor).toHaveValue(edited);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const meaning = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(meaning.edges).toHaveLength(1);
  expect(meaning.edges[0]).toMatchObject({
    first: { node: 'source', port: 'egress' },
    second: { node: 'target', port: 'ingress' },
  });
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(edited);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(meaning);
});

test('canvas connection between portless nodes keeps both ports unspecified', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Keep this authored comment.\n@diagram architecture\n' +
    'first group {}\nsecond group {}\n';
  const edited = source + 'first -> second\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'portless-creation.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();

  const first = page.locator('.react-flow__node[data-id="first"] .coral-portless-handle.source');
  const second = page.locator('.react-flow__node[data-id="second"] .coral-portless-handle.target');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox!.x + secondBox!.width / 2,
    secondBox!.y + secondBox!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(editor).toHaveValue(edited);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const meaning = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(meaning.edges).toHaveLength(1);
  expect(meaning.edges[0].first).toEqual({ node: 'first' });
  expect(meaning.edges[0].second).toEqual({ node: 'second' });
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(edited);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(meaning);
});

test('an incompatible authored port stays saveable while semantic export refuses it', async ({ page }) => {
  test.setTimeout(90_000);
  const valid = '@diagram flowchart\n' +
    'source process {\n  egress port [direction: out]\n}\n' +
    'target process {\n  ingress port [direction: in]\n}\n' +
    'transfer = source:egress -> target:ingress\n';
  const invalid = valid.replace('egress port [direction: out]',
    'egress port [direction: in]');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'port-direction.coral', buffer: Buffer.from(valid) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(valid);
  const accepted = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(accepted.edges[0]).toMatchObject({
    first: { node: 'source', port: 'egress' },
    second: { node: 'target', port: 'ingress' },
  });

  await editor.fill(invalid);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(invalid);
  await page.getByRole('button', { name: 'Show all diagnostics' }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.port.reference.direction');
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.(?:stale|invalid)|Export blocked/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(invalid);
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.port.reference.direction');
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.(?:stale|invalid)|Export blocked/);
});
