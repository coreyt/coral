import { expect, test } from '@playwright/test';
import { openBuffer, openSavedDocument, saveDocument, startCleanEditor } from './support/user-journey.js';

test('notice threshold persists as a user preference without changing saved Coral meaning', async ({ page }) => {
  const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'client -#> server [async]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'notice-threshold.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  const threshold = page.getByLabel('Notice threshold for this check');
  await threshold.selectOption('warning');
  await expect(threshold).toHaveValue('warning');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  const report = page.getByRole('region', { name: 'Conformance report' });
  await expect(report).toContainText('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
  await expect(page.getByLabel('Notices for last check')).toContainText('Notices for last check (1)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('coral:user-preferences')!)))
    .toMatchObject({ notificationLevel: 'warning' });

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  expect(JSON.stringify(saved.document)).not.toContain('notificationLevel');
  await page.reload();
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await expect(threshold).toHaveValue('warning');
  await threshold.selectOption('error');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  await expect(report).toContainText('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
  await expect(page.getByLabel('Notices for last check')).toContainText('Notices for last check (0)');
  await expect(editor).toHaveValue(source);
});

test('strict bounded success is qualified and preserves the saved level and exact source', async ({ page }) => {
  const source = '@diagram block\n@conformanceLevel typical\nitem block as "Item"\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'bounded-check.coral', buffer: Buffer.from(source) });
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByLabel('Conformance level for this check').selectOption('strict');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  const report = page.getByRole('region', { name: 'Conformance report' });
  await expect(report).toContainText('Strict · conformant');
  await expect(report).toContainText('Coral bounded profile; full external-standard conformance is not claimed.');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await page.reload();
  await openSavedDocument(page, saved.path);
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conformance report' })).toContainText('Typical · not-claimed');
});
