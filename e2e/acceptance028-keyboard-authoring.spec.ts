import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('keyboard node authoring preserves saved Coral source through history and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Keep this authored comment.\n@diagram flowchart\nA process\nB process\nA -> B\n';
  const edited = source + 'review process as "Review"\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'keyboard-authoring.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const documentName = page.getByLabel('Document name');
  await expect(editor).toHaveValue(source);

  await documentName.focus();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Create Node');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create node' });
  await expect(dialog.getByLabel('Node ID')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(documentName).toBeFocused();
  await expect(editor).toHaveValue(source);

  await page.locator('.react-flow__node[data-id="A"]').focus();
  await page.keyboard.press('Control+Alt+n');
  await expect(dialog.getByLabel('Node ID')).toBeFocused();
  await page.keyboard.type('review');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Node type')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('process');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Node label', { exact: true })).toBeFocused();
  await page.keyboard.type('Review');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  const node = page.locator('.react-flow__node[data-id="review"]');
  await expect(node).toBeVisible();
  await expect(node).toBeFocused();

  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await expect(node).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  await expect(node).toBeVisible();
  const meaning = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(meaning.nodes.find((item: { id: string }) => item.id === 'review'))
    .toMatchObject({ id: 'review', type: 'process', label: 'Review' });
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

test('keyboard edge authoring refuses a duplicate ID, then creates and deletes a saved Coral connection', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram flowchart\nA process\nB process\nC process\nab = A -> B\n';
  const edited = source + 'bc = B -> C\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'keyboard-edge.coral', buffer: Buffer.from(source) });
  // Initialize the original handles before replacing same-sized scene nodes.
  await expect(page.locator('.react-flow__edge[data-id="ab"]')).toHaveCount(1);
  const editor = page.getByLabel('DSL editor', { exact: true });

  await page.locator('.react-flow__node[data-id="A"]').focus();
  await page.keyboard.press('Control+Alt+e');
  const dialog = page.getByRole('dialog', { name: 'Create edge' });
  const edgeId = dialog.getByLabel('Edge ID');
  await expect(dialog.getByLabel('Source node')).toBeFocused();
  await dialog.getByLabel('Source node').selectOption('B');
  await dialog.getByLabel('Target node').selectOption('C');
  await edgeId.focus();
  await page.keyboard.type('ab');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('ab already exists');
  await expect(editor).toHaveValue(source);

  await edgeId.fill('bc');
  await edgeId.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue(edited);
  await expect(page.getByText('Created connection from B to C.')).toBeAttached();
  await waitForEditorSettled(page);

  const created = page.locator('.react-flow__edge[data-id="bc"]');
  await expect(created).toBeFocused();
  await expect(created).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(editor).toHaveValue(source);
  await expect(created).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(edited);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
});
