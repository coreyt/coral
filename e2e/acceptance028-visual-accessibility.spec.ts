import { expect, test, type Page } from '@playwright/test';
import { startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const targets = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'standard', width: 1024, height: 768 },
  { name: 'constrained', width: 800, height: 600 },
] as const;

async function workspaceState(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
    const canvas = document.querySelector<HTMLElement>('.react-flow');
    const nodes = [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
      .map((node) => [node.dataset.id, node.style.transform] as const).sort(([a], [b]) => a!.localeCompare(b!));
    const routes = [...document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')]
      .map((path) => [path.closest('.react-flow__edge')?.getAttribute('data-id'), path.getAttribute('d')])
      .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''));
    return { camera: viewport?.style.transform, nodes, routes,
      canvas: canvas && { left: canvas.getBoundingClientRect().left, top: canvas.getBoundingClientRect().top } };
  });
}

async function expectReachable(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true }).or(page.getByRole('tab', { name, exact: true })).first();
  await expect(target).toBeVisible();
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds, `${name} should have a visible hit area`).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const theme of ['light', 'dark'] as const) for (const target of targets) {
  test(`${target.name}/${theme}: shell actions remain reachable without moving the diagram`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem('coral:user-preferences', JSON.stringify({ theme: selectedTheme }));
    }, theme);
    await page.setViewportSize({ width: target.width, height: target.height });
    await startCleanEditor(page);
    await waitForEditorSettled(page);

    const editor = page.getByLabel('DSL editor', { exact: true });
    const source = await editor.inputValue();
    await expect(page.locator('.coral-app-header')).toBeVisible();
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize source' })).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize bottom panel' })).toBeVisible();
    const initial = await workspaceState(page);

    // Bottom tabs use the ARIA manual-activation model; keyboard navigation
    // moves focus and Enter changes content without remounting the canvas.
    const bottomTabs = page.getByRole('tablist', { name: 'Bottom panel tabs' });
    await expect(bottomTabs).toBeVisible();
    const diagnostics = page.getByRole('tab', { name: /^Diagnostics/ });
    await diagnostics.focus();
    await expect(diagnostics).toBeFocused();
    await page.keyboard.press('Home');
    await expect(diagnostics).toBeFocused();
    await page.keyboard.press('End');
    const activity = page.getByRole('tab', { name: 'Activity Log' });
    await expect(activity).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(activity).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('bottom-panel').getByRole('tabpanel', { name: 'Activity Log' })).toBeVisible();
    expect(await workspaceState(page)).toEqual(initial);

    // Open Properties by keyboard from a rendered node. The non-modal overlay
    // does not steal focus; closing it preserves source and camera state.
    const firstNode = page.locator('.react-flow__node').first();
    await firstNode.focus();
    const focusedNodeId = await firstNode.getAttribute('data-id');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Show Inspector');
    await page.keyboard.press('Enter');
    const properties = page.getByLabel('Properties panel');
    await expect(properties).toBeVisible();
    await expect(firstNode).toBeFocused();
    await expect(properties.getByRole('tablist')).toBeVisible();
    await expectReachable(page, 'Save');
    if (target.width <= 1024) await expectReachable(page, 'More actions');
    await expectReachable(page, 'Reflow layout');
    const openState = await workspaceState(page);
    expect(openState.camera).toBe(initial.camera);
    expect(openState.nodes).toEqual(initial.nodes);
    expect(openState.routes).toEqual(initial.routes);
    await properties.getByRole('button', { name: 'Close panel' }).click();
    await expect(properties).toHaveCount(0);
    await expect(editor).toHaveValue(source);
    expect(await workspaceState(page)).toEqual(initial);
    expect(focusedNodeId).toBeTruthy();

    // The palette is a modal surface: Escape closes it and restores its
    // invoker. The canvas remains mounted and view-only shell changes preserve it.
    await activity.focus();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await expect(page.getByLabel('Search commands')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(activity).toBeFocused();

  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`standard/${theme}: enlarged text keeps the desktop shell operable`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem('coral:user-preferences', JSON.stringify({ theme: selectedTheme }));
    }, theme);
    await page.setViewportSize({ width: 1024, height: 768 });
    await startCleanEditor(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    const source = await editor.inputValue();
    const firstNode = page.locator('.react-flow__node').first();
    await firstNode.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Show Inspector');
    await page.keyboard.press('Enter');
    const properties = page.getByLabel('Properties panel');
    await expect(properties).toBeVisible();
    await expect(firstNode).toBeFocused();
    const activity = page.getByRole('tab', { name: 'Activity Log' });
    const scaleTargets = [editor, page.locator('.coral-app-header').getByText('Coral', { exact: true }), activity,
      properties.getByRole('tab').first(), properties.getByRole('button', { name: 'Close panel' })];
    const baseSizes = await Promise.all(scaleTargets.map((target) => target.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize))));
    // Emulate browser text-only enlargement while keeping the assigned CSS
    // viewport at 1024×768. Freeze all base sizes before adding a stylesheet,
    // so nested elements do not compound and React rerenders retain the scale.
    await page.evaluate(() => {
      const targets = [...document.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, label, [role="tab"], [role="heading"], h1, h2, h3, p, output, span',
      )];
      const sizes = targets.map((node, index) => {
        const size = Number.parseFloat(getComputedStyle(node).fontSize);
        node.dataset.s50TextScale = String(index);
        return { index, size };
      });
      const stylesheet = document.createElement('style');
      stylesheet.dataset.s50TextScale = 'rules';
      stylesheet.textContent = sizes.map(({ index, size }) =>
        `[data-s50-text-scale="${index}"] { font-size: ${size * 2}px !important; }`).join('\n');
      document.head.append(stylesheet);
      return sizes.map(({ size }) => size);
    });
    const scaledSizes = await Promise.all(scaleTargets.map((target) => target.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize))));
    expect(scaledSizes).toEqual(baseSizes.map((size) => size * 2));
    await expect(editor).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize source' })).toBeVisible();
    await expectReachable(page, 'Save');
    await expectReachable(page, 'More actions');
    await expectReachable(page, 'Reflow layout');
    // Start away from the final tab so this assertion observes Radix's
    // deferred End focus transition before moving focus back to the canvas.
    await page.getByRole('tab', { name: /^Diagnostics/ }).focus();
    await page.keyboard.press('End');
    await expect(activity).toBeFocused();
    await firstNode.focus();
    await expect(firstNode).toBeFocused();
    await expectReachable(page, 'Close panel');
    await expect(editor).toHaveValue(source);
  });
}

test('source resizing retains source, graph world geometry, routes, and camera', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await startCleanEditor(page);
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const source = await editor.inputValue();
  const before = await workspaceState(page);
  const splitter = page.getByRole('separator', { name: 'Resize source' });
  const initialValue = Number(await splitter.getAttribute('aria-valuenow'));
  await splitter.focus();
  await expect(splitter).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await splitter.getAttribute('aria-valuenow'))).toBeGreaterThan(initialValue);
  const after = await workspaceState(page);
  expect(after.camera).toBe(before.camera);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.routes).toEqual(before.routes);
  await expect(editor).toHaveValue(source);
  await expectReachable(page, 'Save');
  await expectReachable(page, 'Reflow layout');
});
