import { expect, test } from '@playwright/test';
import { showProperties, openBuffer, saveDocument, startCleanEditor } from './support/user-journey.js';

/**
 * Slice 93 browser evidence for the Slice 92 findings that need a real
 * browser: Fit hit-safety (S93-WI-06) and raw Mermaid open (S93-WI-04).
 */
for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 640 }]) {
  test(`S93-WI-06: explicit Fit leaves every node selectable outside overlays at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startCleanEditor(page);
    const source = '@diagram flowchart\n' +
      Array.from({ length: 20 }, (_, index) => `n${index + 1} process`).join('\n') + '\n' +
      Array.from({ length: 19 }, (_, index) => `n${index + 1} -> n${index + 2}`).join('\n') + '\n';
    await openBuffer(page, { name: 'fit-network.coral', buffer: Buffer.from(source) });
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
    await showProperties(page);
    await page.getByRole('button', { name: 'Fit diagram to view' }).click();
    await expect.poll(async () => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const overlays = [
        rect('[aria-label="Canvas controls"]'),
        rect('.react-flow__minimap'),
        rect('[aria-label="Properties panel"]'),
      ].filter((value): value is DOMRect => Boolean(value));
      const canvas = rect('.react-flow')!;
      return [...document.querySelectorAll<HTMLElement>('.react-flow__node')].filter((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        const hit = document.elementFromPoint(x, y);
        return !inside(canvas) || overlays.some(inside) || !hit || !node.contains(hit);
      }).map((node) => node.dataset.id);
    }), { timeout: 5_000 }).toEqual([]);
  });
}

test('S93-WI-04: raw Mermaid open keeps its exact source', async ({ page }) => {
  await startCleanEditor(page);
  const source = 'flowchart LR\n  a[Start] --> b[End]';
  await openBuffer(page, { name: 'flow.mmd', buffer: Buffer.from(source) });
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
  await expect(page.getByLabel('Source format')).toHaveText('Mermaid source');
  await expect(page.locator('[role="status"][aria-live="polite"]')
    .filter({ hasText: 'Opened flow.mmd.' }))
    .toHaveCount(1);
  expect((await saveDocument(page)).document.content)
    .toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
});
