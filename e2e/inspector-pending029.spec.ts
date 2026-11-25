import { expect, test } from '@playwright/test';
import { startCleanEditor, openBuffer, waitForEditorSettled } from './support/user-journey.js';

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol gate {', '  name "Gate"',
  '  size 48 x 48', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" fill="#157580"/></svg>',
  '"""', '}', 'g service [symbol: "local.gate"]', 'a service', 'read = g -> a as "Reads"', ''].join('\n');

test('rapid inspector fields retain both source edits and separate Undo entries', async ({ page }) => {
  await startCleanEditor(page);
  await openBuffer(page, { name: 'pending.coral', buffer: Buffer.from(SOURCE) });
  await page.locator('.react-flow__node[data-id="g"]').click();
  await page.getByRole('button', { name: 'Edit symbol', exact: true }).click();
  const name = page.getByLabel('Name', { exact: true });
  await name.fill('Gateway');
  await name.press('Enter');
  const description = page.getByLabel('Description', { exact: true });
  await description.fill('Checks requests');
  await description.press('Tab');
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(/name "Gateway"[\s\S]*description "Checks requests"/);
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).not.toHaveValue(/description "Checks requests"/);
  await expect(editor).toHaveValue(/name "Gateway"/);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(SOURCE);
});

test('inspector connector label retains keyboard focus after its commit', async ({ page }) => {
  await startCleanEditor(page);
  await openBuffer(page, { name: 'pending.coral', buffer: Buffer.from(SOURCE) });
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const point = await page.locator('.react-flow__edge[data-id="read"] path').first().evaluate(element => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(point.x, point.y);
  const input = page.getByLabel('Connector label', { exact: true });
  await input.fill('Reads values');
  await input.press('Enter');
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();
  await waitForEditorSettled(page);
  await expect(input).toBeFocused();
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(/as "Reads values"/);
});
