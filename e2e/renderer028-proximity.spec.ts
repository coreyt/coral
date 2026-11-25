import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('D4 source proximity changes update live canvas and retain exact saved source', async ({ page }) => {
  await startCleanEditor(page);
  const near = '@diagram flowchart\na process\nb process\nc process\n' +
    'near = a -> b\nfar = b -> c\n';
  const far = near.replace('far = b -> c', 'far = b ------> c');
  await openBuffer(page, { name: 'proximity.coral', buffer: Buffer.from(near) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await waitForEditorSettled(page);
  const gap = () => page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('.react-flow__node[data-id="b"]')!;
    const c = document.querySelector<HTMLElement>('.react-flow__node[data-id="c"]')!;
    return new DOMMatrixReadOnly(c.style.transform).m42 - new DOMMatrixReadOnly(b.style.transform).m42
      - parseFloat(b.style.height || String(b.offsetHeight));
  });
  const originalGap = await gap();
  await editor.fill(far);
  await waitForEditorSettled(page);
  await expect.poll(gap).toBeGreaterThan(originalGap + 100);
  const farSvg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  const canvasIds = await page.locator('.react-flow [data-coral-part-id]').evaluateAll((parts) =>
    parts.map((part) => part.getAttribute('data-coral-part-id')).filter(Boolean).sort());
  expect([...farSvg.matchAll(/data-coral-part-id="([^"]+)"/g)].map((match) => match[1]).sort()).toEqual(canvasIds);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: far });
  await editor.fill(near);
  await waitForEditorSettled(page);
  await expect.poll(gap).toBeCloseTo(originalGap, 1);
  const nearSvg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  const height = (svg: string) => Number(/<svg[^>]*\bheight="([\d.]+)"/.exec(svg)![1]);
  expect(height(farSvg)).toBeGreaterThan(height(nearSvg) + 100);
});
