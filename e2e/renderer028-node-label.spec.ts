import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('authored node label geometry agrees on canvas, SVG and Reflow', async ({ page }) => {
  test.setTimeout(60_000);
  const source = '@diagram architecture\napi service as "API" label below offset 12\nstore database\n' +
    'request = api -> store as "Request" label above at 0.25 offset 8\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'node-label-v1.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const label = page.locator('.react-flow [data-coral-part-id="api:label:1"]');
  await expect(label).toHaveText('API');
  const geometry = async () => {
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    return page.evaluate((exported) => {
      const doc = new DOMParser().parseFromString(exported, 'image/svg+xml');
      const canvasLabel = document.querySelector<SVGTextElement>('.react-flow [data-coral-part-id="api:label:1"]')!;
      const exportedLabel = doc.querySelector('[data-coral-part-id="api:label:1"]')!;
      const canvasBody = document.querySelector<SVGGraphicsElement>('.react-flow [data-coral-part-id="api:outline"]')!;
      const body = canvasBody.getBoundingClientRect();
      const label = canvasLabel.getBoundingClientRect();
      return { canvas: ['x', 'y'].map((key) => Number(canvasLabel.getAttribute(key))),
        svg: ['x', 'y'].map((key) => Number(exportedLabel.getAttribute(key))),
        below: label.top > body.bottom,
        edge: doc.querySelector('[data-coral-part-id="request:label"]')?.textContent };
    }, svg);
  };
  const initial = await geometry();
  expect(initial.canvas).toEqual(initial.svg);
  expect(initial.below).toBe(true);
  expect(initial.edge).toBe('Request');
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await waitForEditorSettled(page);
  const reflow = await geometry();
  expect(reflow.canvas).toEqual(reflow.svg);
  expect(reflow.below).toBe(true);
  expect(reflow.edge).toBe('Request');
  await expect(editor).toHaveValue(source);
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style', { exact: true }).selectOption(style);
    await waitForEditorSettled(page);
    const styled = await geometry();
    expect(styled.canvas).toEqual(styled.svg);
    expect(styled.below).toBe(true);
    await page.getByRole('button', { name: 'Fit diagram to view' }).click();
    await expect(page.locator('.react-flow__node[data-id="store"]')).toBeInViewport({ ratio: .5 });
  }
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(label).toHaveText('API');
  expect((await geometry()).below).toBe(true);
});
