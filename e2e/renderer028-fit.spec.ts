import { expect, test } from '@playwright/test';
import { openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 640 }]) {
  test(`S93-WI-06 current source: Fit keeps all 20 nodes selectable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startCleanEditor(page);
    const source = '@diagram flowchart\n' +
      Array.from({ length: 20 }, (_, i) => `n${i + 1} process`).join('\n') + '\n' +
      Array.from({ length: 19 }, (_, i) => `n${i + 1} -> n${i + 2}`).join('\n') + '\n';
    await openBuffer(page, { name: 'fit-network.coral', buffer: Buffer.from(source) });
    await waitForEditorSettled(page);
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
    await expect(page.locator('.react-flow__node')).toHaveCount(20);
    await page.getByRole('button', { name: 'Fit diagram to view' }).click();
    await expect.poll(() => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const overlays = [rect('[aria-label="Canvas controls"]'), rect('.react-flow__minimap'),
        rect('[aria-label="Properties panel"]')].filter((value): value is DOMRect => Boolean(value));
      const canvas = rect('.react-flow')!;
      return [...document.querySelectorAll<HTMLElement>('.react-flow__node')].filter((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        const hit = document.elementFromPoint(x, y);
        return !inside(canvas) || overlays.some(inside) || !hit || !node.contains(hit);
      }).map((node) => node.dataset.id);
    }), { timeout: 5_000 }).toEqual([]);
  });
}
