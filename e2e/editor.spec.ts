import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { waitForEditorSettled, waitForRecoveryDraft } from './support/editorReadiness.js';

/**
 * The cases jsdom cannot reach - R-029.
 */

// Coral sources live in fixtures so the corpus guard parses them (Slice 53).
const DSL = readFileSync(join(__dirname, 'fixtures', 'basic.coral'), 'utf8').trimEnd();
const RICH_028_DSL = readFileSync(join(__dirname, 'fixtures', 'rich-028.coral'), 'utf8').trimEnd();
const POSITIONED_RICH_028_DSL = RICH_028_DSL
  .replace('as "Alpha Payment Processing Service"', 'as "Alpha Payment Processing Service" @ (100, 200)')
  .replace('as "Beta"', 'as "Beta" @ (500, 400)');
const AIML_DSL = readFileSync(join(__dirname, '../packages/diagram-editor/src/example-sources/aiml.coral'), 'utf8').trimEnd();

/** Select the Coral source editor before exercising the saved 0.2.8 fixture. */
async function typeDiagram(page: Page, text = DSL, expectedNodes = 2) {
  await page.getByRole('radio', { name: /coral/i }).click();
  const editor = page.getByLabel('DSL editor', { exact: true });
  await editor.fill(text);
  await expect(page.getByTestId('canvas-status')).toContainText(new RegExp(`${expectedNodes} nodes`, 'i'), { timeout: 10_000 });
}

async function openDiagramSettings(page: Page) {
  await page.getByRole('tab', { name: 'Diagram' }).click();
}

async function downloadThroughPalette(page: Page, label: RegExp) {
  await waitForEditorSettled(page);
  await page.keyboard.press('Control+k');
  const pending = page.waitForEvent('download');
  await page.getByRole('option', { name: label }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return { download, path: path! };
}

test('loads all portable font weights and matches deterministic metrics in Chromium', async ({ page }) => {
  const { PORTABLE_FONTS, embeddedFontCssFor, measureLine, measureText } = await import('@coral-viz/render');
  const externalFontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font' && !request.url().startsWith('data:')) {
      externalFontRequests.push(request.url());
    }
  });
  await page.goto('/');
  const cases = PORTABLE_FONTS.flatMap((font) => ([400, 700] as const).map((weight) => ({
    family: font.cssFamily,
    weight,
    expected: {
      narrow: measureLine('iiii', 16, font.cssFamily, weight),
      wide: measureLine('WWWW', 16, font.cssFamily, weight),
      wrap: measureText({
        text: 'Payment Processing Service',
        fontSize: 16,
        fontFamily: font.cssFamily,
        fontWeight: weight,
        maxWidth: 100,
      }),
    },
  })));
  const css = embeddedFontCssFor(cases.map(({ family, weight }) => ({
    id: PORTABLE_FONTS.find((font) => font.cssFamily === family)!.id,
    weight,
  })));

  const actual = await page.evaluate(async ({ css, cases }) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const results = [];
    for (const { family, weight } of cases) {
      const font = `${weight} 16px "${family}"`;
      const loadedFaces = await document.fonts.load(font, 'iiii WWWW Payment Processing Service');
      const sample = document.createElement('span');
      sample.className = 'coral-font-text';
      Object.assign(sample.style, {
        fontFamily: `"${family}"`,
        fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0',
        fontKerning: 'none',
        fontOpticalSizing: 'none',
        fontSize: '16px',
        fontVariantLigatures: 'none',
        fontWeight: String(weight),
        lineHeight: '1.4',
        position: 'absolute',
        whiteSpace: 'pre',
        visibility: 'hidden',
      });
      document.body.append(sample);
      const rawWidth = (text: string) => {
        sample.textContent = text;
        return sample.getBoundingClientRect().width;
      };
      const width = (text: string) => Math.ceil(rawWidth(text));
      const words = ['Payment', 'Processing', 'Service'];
      const lines: string[] = [];
      let current = words[0];
      for (let index = 1; index < words.length; index++) {
        const candidate = `${current} ${words[index]}`;
        if (width(candidate) <= 100) current = candidate;
        else {
          lines.push(current);
          current = words[index];
        }
      }
      lines.push(current);
      const normalizedFamily = (value: string) => value.replace(/^['"]|['"]$/g, '');
      const matchingFaces = Array.from(document.fonts).filter((face) =>
        normalizedFamily(face.family) === family && face.weight === String(weight));
      const result = {
        family,
        weight,
        textRendering: getComputedStyle(sample).textRendering,
        loaded: loadedFaces.length >= 1
          && matchingFaces.some((face) => face.status === 'loaded'),
        narrow: width('iiii'),
        wide: width('WWWW'),
        wrap: {
          width: Math.max(...lines.map(width)),
          height: lines.length * Math.ceil(16 * 1.4),
          lines,
        },
      };
      sample.remove();
      results.push(result);
    }
    return results;
  }, { css, cases });

  // Shared geometricPrecision text (ff1dc0b24), measured on pinned Chromium 153.
  // The prior grid-fitted auto-mode fixtures do not describe production CSS.
  const browserFixtures = [
    ['Coral Inter', 400, 16, 64, 85],
    ['Coral Inter', 700, 18, 67, 88],
    ['Coral Source Serif 4', 400, 22, 65, 83],
    ['Coral Source Serif 4', 700, 23, 67, 87],
    ['Coral JetBrains Mono', 400, 39, 39, 97],
    ['Coral JetBrains Mono', 700, 39, 39, 97],
    ['Coral Comic Neue', 400, 15, 56, 74],
    ['Coral Comic Neue', 700, 16, 55, 74],
  ] as const;
  for (const rendered of actual) expect(rendered.textRendering).toMatch(/^geometricprecision$/i);
  expect(actual.map(({ textRendering: _textRendering, ...rendered }) => rendered)).toEqual(browserFixtures.map(([family, weight, narrow, wide, wrapWidth]) => ({
    family,
    weight,
    loaded: true,
    narrow,
    wide,
    wrap: {
      width: wrapWidth,
      height: 69,
      lines: ['Payment', 'Processing', 'Service'],
    },
  })));
  for (const [index, rendered] of actual.entries()) {
    const deterministic = cases[index]!.expected;
    expect(rendered.narrow).toBeLessThanOrEqual(deterministic.narrow);
    expect(rendered.wide).toBeLessThanOrEqual(deterministic.wide);
    expect(rendered.wrap.width).toBeLessThanOrEqual(deterministic.wrap.width);
    expect(rendered.wrap.lines).toEqual(deterministic.wrap.lines);
  }
  expect(externalFontRequests).toEqual([]);
});

test('selected portable font survives full recovery and matches vector/raster exports', async ({ page }) => {
  test.setTimeout(60_000);
  const externalFontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font' && !request.url().startsWith('data:')) {
      externalFontRequests.push(request.url());
    }
  });
  await page.goto('/');
  await typeDiagram(page, POSITIONED_RICH_028_DSL);
  await openDiagramSettings(page);

  const sceneText = page.locator('[data-coral-scene-kind="spatial"] text.coral-font-text, '
    + '[data-coral-scene-node] text.coral-font-text, [data-coral-scene-edge] text.coral-font-text');
  const graphPositions = async () => {
    const exported = await downloadThroughPalette(page, /export graphir 4 candidate/i);
    const graph = JSON.parse(await readFile(exported.path, 'utf8'));
    return graph.nodes.map((node: { id: string; position: { x: number; y: number } }) =>
      ({ id: node.id, x: node.position.x, y: node.position.y }));
  };
  const beforePositions = await graphPositions();
  expect(beforePositions).toEqual([{ id: 'alpha', x: 100, y: 200 }, { id: 'beta', x: 500, y: 400 }]);
  const alphaScene = page.locator('[data-coral-scene-node="alpha"]');
  const beforeSceneLayout = await alphaScene.evaluate((svg: SVGSVGElement) => ({
    viewBox: svg.getAttribute('viewBox'),
    width: svg.getAttribute('width'),
    height: svg.getAttribute('height'),
    textSizes: Array.from(svg.querySelectorAll('text')).map((text) => Number(text.getAttribute('font-size'))),
  }));
  expect(beforeSceneLayout.textSizes.length).toBeGreaterThan(1);
  expect(beforeSceneLayout.textSizes.every((size) => size !== 16)).toBe(true);
  const expectSceneFont = async (family: RegExp, size: number) => {
    const rendered = await sceneText.evaluateAll((elements) => elements.map((element) => ({
      text: element.textContent ?? '',
      family: element.getAttribute('font-family') ?? '',
      size: Number(element.getAttribute('font-size')),
    })));
    expect(rendered).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringMatching(/Alpha/), family: expect.stringMatching(family), size }),
      expect.objectContaining({ text: expect.stringMatching(/Persists/), family: expect.stringMatching(family), size }),
    ]));
    return true;
  };

  await page.getByLabel('Font Family').selectOption('serif');
  await page.getByLabel('Font Size Preset').selectOption('large');
  await page.getByRole('button', { name: /apply font changes/i }).click();
  await expect.poll(() => sceneText.count()).toBeGreaterThan(0);
  await expect.poll(() => expectSceneFont(/Coral Source Serif 4/, 16)).toBe(true);
  expect(await graphPositions()).toEqual(beforePositions);
  const afterSceneLayout = await alphaScene.evaluate((svg: SVGSVGElement) => {
    const [originX, originY, width, height] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    return Array.from(svg.querySelectorAll('text')).map((text) => {
      const box = text.getBBox();
      return {
        text: text.textContent,
        size: Number(text.getAttribute('font-size')),
        contained: box.x >= originX! - 0.5 && box.y >= originY! - 0.5
          && box.x + box.width <= originX! + width! + 0.5
          && box.y + box.height <= originY! + height! + 0.5,
      };
    });
  });
  expect(afterSceneLayout.length).toBeGreaterThan(1);
  expect(afterSceneLayout.every((label) => label.size === 16 && label.contained)).toBe(true);
  expect(afterSceneLayout.map((label) => label.text).join(' ')).toMatch(/Alpha Payment Processing Service/);
  const afterViewBox = await alphaScene.getAttribute('viewBox');
  expect(afterViewBox).not.toBe(beforeSceneLayout.viewBox);

  const serifSvgDownload = await downloadThroughPalette(page, /export svg/i);
  const serifSvg = await readFile(serifSvgDownload.path, 'utf8');
  const serifHtmlDownload = await downloadThroughPalette(page, /export html/i);
  const serifHtml = await readFile(serifHtmlDownload.path, 'utf8');
  const serifPngDownload = await downloadThroughPalette(page, /export png/i);
  const serifPng = (await readFile(serifPngDownload.path)).toString('base64');

  expect(serifSvg).toContain('Coral Source Serif 4');
  expect(serifSvg).toContain('font-size="16"');
  expect(serifSvg).toContain('data:font/woff2;base64,');
  // C4 moves @font-face rules to the document head so the shadow drawing
  // can load them. Compare the actual drawing and load its embedded face.
  const htmlPage = await page.context().newPage();
  try {
    const url = new URL('portable-font-export.html', page.url()).href;
    await htmlPage.route(url, (route) => route.fulfill({ contentType: 'text/html', body: serifHtml }));
    await htmlPage.goto(url);
    await expect(htmlPage.locator('.coral-diagram svg')).toHaveCount(1);
    const htmlEvidence = await htmlPage.evaluate(async (svgMarkup) => {
      const exported = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
      const embedded = document.querySelector('.coral-diagram')!.shadowRoot!.querySelector('svg')!;
      const withoutStyles = (element: Element) => {
        const clone = element.cloneNode(true) as Element;
        clone.querySelectorAll('style').forEach((style) => style.remove());
        return clone;
      };
      const faces = await document.fonts.load('16px "Coral Source Serif 4"', 'Alpha Persists');
      return {
        sameDrawing: withoutStyles(embedded).isEqualNode(withoutStyles(exported)),
        headFonts: document.head.textContent?.includes('data:font/woff2;base64,') ?? false,
        loadedFaces: faces.length,
        facesLoaded: faces.every((face) => face.status === 'loaded'),
      };
    }, serifSvg);
    expect(htmlEvidence).toMatchObject({ sameDrawing: true, headFonts: true, facesLoaded: true });
    expect(htmlEvidence.loadedFaces).toBeGreaterThan(0);
  } finally { await htmlPage.close(); }
  const liveAndExportedParts = await page.evaluate((svgMarkup) => {
    const exported = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
    const owners = [
      ...Array.from(document.querySelectorAll('[data-coral-scene-node="alpha"], [data-coral-scene-node="beta"]')),
      ...Array.from(document.querySelectorAll('[data-coral-scene-edge]')),
    ];
    const description = (part: Element) => part.tagName.toLowerCase() === 'path'
      ? { kind: 'path', d: part.getAttribute('d') }
      : {
        kind: 'text', content: part.textContent?.trim(), x: part.getAttribute('x'),
        y: part.getAttribute('y'), size: part.getAttribute('font-size'),
        family: part.getAttribute('font-family'),
      };
    return owners.map((owner) => {
      const live = Array.from(owner.querySelectorAll('path[data-coral-part-id], text[data-coral-part-id]'));
      return live.map((part) => {
        const partId = part.getAttribute('data-coral-part-id')!;
        const rendered = Array.from(exported.querySelectorAll('[data-coral-part-id]'))
          .find((candidate) => candidate.getAttribute('data-coral-part-id') === partId);
        return { partId, live: description(part), exported: rendered ? description(rendered) : null };
      });
    });
  }, serifSvg);
  expect(liveAndExportedParts.length).toBe(3);
  for (const ownerParts of liveAndExportedParts) {
    expect(ownerParts.length).toBeGreaterThan(0);
    for (const part of ownerParts) expect(part.exported).toEqual(part.live);
  }

  const savedDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const savedPath = await (await savedDownload).path();
  const saved = JSON.parse(await readFile(savedPath!, 'utf8'));
  expect(saved.settings.font.default).toMatchObject({ size: 16 });
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: POSITIONED_RICH_028_DSL });
  const exportedGraph = await downloadThroughPalette(page, /export graphir 4 candidate/i);
  const savedGraphExport = JSON.parse(await readFile(exportedGraph.path, 'utf8'));
  expect(savedGraphExport.nodes.map((node: { id: string; position: { x: number; y: number } }) =>
    ({ id: node.id, x: node.position.x, y: node.position.y })))
    .toEqual([{ id: 'alpha', x: 100, y: 200 }, { id: 'beta', x: 500, y: 400 }]);
  expect(savedGraphExport.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: 'Persists' }),
  ]));

  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('coral-diagram-recovery');
    if (!raw) return null;
    const recovered = JSON.parse(raw);
    return recovered.document?.settings?.font?.default?.family;
  }), { timeout: 10_000 }).toContain('Georgia');
  await page.reload();
  const restore = page.getByRole('button', { name: /recover your work/i });
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.getByTestId('canvas-status')).toContainText(/2 nodes/i, { timeout: 10_000 });
  await expect(page.getByLabel('Font Family')).toHaveValue('serif');
  await expect.poll(() => expectSceneFont(/Coral Source Serif 4/, 16)).toBe(true);
  const recoveredDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const recoveredPath = await (await recoveredDownload).path();
  const recovered = JSON.parse(await readFile(recoveredPath!, 'utf8'));
  expect(recovered.settings.font.default).toMatchObject({
    family: '"Georgia", "Times New Roman", serif',
    size: 16,
  });
  expect(recovered.content).toEqual({ format: 'dsl', dslType: 'coral', text: POSITIONED_RICH_028_DSL });

  await openDiagramSettings(page);
  await page.getByLabel('Font Family').selectOption('mono');
  await page.getByRole('button', { name: /apply font changes/i }).click();
  await expect.poll(() => expectSceneFont(/Coral JetBrains Mono/, 16)).toBe(true);

  const monoSvgDownload = await downloadThroughPalette(page, /export svg/i);
  const monoSvg = await readFile(monoSvgDownload.path, 'utf8');
  const monoPngDownload = await downloadThroughPalette(page, /export png/i);
  const monoPng = (await readFile(monoPngDownload.path)).toString('base64');
  expect(monoSvg).toContain('Coral JetBrains Mono');

  const rasterEvidence = await page.evaluate(async ({ serifPng, serifSvg, monoPng, monoSvg }) => {
    const inspect = async (png: string, svg: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const label = Array.from(parsed.querySelectorAll('text'))
        .find((element) => element.textContent?.includes('Alpha'))!;
      const x = Number(label.getAttribute('x')) * 2;
      const y = Number(label.getAttribute('y')) * 2;
      const region = context.getImageData(
        Math.max(0, Math.floor(x - 80)),
        Math.max(0, Math.floor(y - 28)),
        Math.min(160, canvas.width),
        Math.min(48, canvas.height),
      ).data;
      let checksum = 0;
      let ink = 0;
      for (let index = 0; index < region.length; index += 4) {
        const darkness = 765 - region[index]! - region[index + 1]! - region[index + 2]!;
        if (darkness > 60) ink += 1;
        checksum = (checksum * 33 + darkness) >>> 0;
      }
      return {
        checksum,
        ink,
        corner: [...context.getImageData(0, 0, 1, 1).data],
      };
    };
    return {
      serif: await inspect(serifPng, serifSvg),
      mono: await inspect(monoPng, monoSvg),
    };
  }, { serifPng, serifSvg, monoPng, monoSvg });
  expect(rasterEvidence.serif.ink).toBeGreaterThan(0);
  expect(rasterEvidence.mono.ink).toBeGreaterThan(0);
  expect(rasterEvidence.serif.checksum).not.toBe(rasterEvidence.mono.checksum);
  expect(rasterEvidence.serif.corner).toEqual(rasterEvidence.mono.corner);
  expect(externalFontRequests).toEqual([]);
});

test('raster font-load failure is visible, downloads nothing, and balances object URLs', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeFontFace = window.FontFace;
    class RejectingFontFace extends NativeFontFace {
      load(): Promise<FontFace> {
        return Promise.reject(new Error('forced C10 font failure'));
      }
    }
    Object.defineProperty(window, 'FontFace', { configurable: true, value: RejectingFontFace });
    const created: string[] = [];
    const revoked: string[] = [];
    const nativeCreate = URL.createObjectURL.bind(URL);
    const nativeRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      const url = nativeCreate(value);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
      nativeRevoke(url);
    };
    Object.assign(window, { __c10ObjectUrls: { created, revoked } });
  });
  await page.goto('/');
  await typeDiagram(page);

  await page.keyboard.press('Control+k');
  const download = page.waitForEvent('download').then(() => true);
  await page.getByRole('option', { name: /export png/i }).click();
  await expect(page.getByRole('alert')).toContainText(/forced C10 font failure/i);
  expect(await Promise.race([download, page.waitForTimeout(500).then(() => false)])).toBe(false);
  expect(await page.evaluate(() => {
    const urls = (window as unknown as {
      __c10ObjectUrls: { created: string[]; revoked: string[] };
    }).__c10ObjectUrls;
    return urls;
  })).toEqual({ created: [], revoked: [] });
});

test('loads the shell with all three panes', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('Document name')).toBeVisible();
  await expect(page.getByLabel('DSL editor', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Diagram editor')).toBeVisible();
});

test('renders typed DSL as nodes on the canvas', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);

  await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('refuses Coral-to-Mermaid conversion without replacing the current source', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);

  await page.getByRole('radio', { name: /mermaid/i }).click();
  await expect(page.getByRole('radio', { name: /coral/i })).toBeChecked();
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(DSL);
  await expect(page.getByRole('status').filter({ hasText: /Edit this 0\.2\.8 diagram in Coral source/i }))
    .toContainText(/Edit this 0\.2\.8 diagram in Coral source/i);
});

test('C50 renders an AI/ML notation symbol through the production canvas', async ({ page }) => {
  const { getShape } = await import('@coral-viz/render');
  await page.goto('/');
  await typeDiagram(page, AIML_DSL, 4);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(AIML_DSL);
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  for (const id of ['dataset', 'training', 'model', 'inference']) {
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  }
  const model = page.getByRole('group', { name: 'Model, ML Model', exact: true });
  await expect(model).toBeVisible();
  await expect(model.locator('svg path').first()).toHaveAttribute('d', getShape('brain')!.path);
  await openDiagramSettings(page);
  const notationSelect = page.locator('label').filter({ hasText: /^Notation$/ })
    .locator('..').locator('select');
  await expect(notationSelect).toHaveValue('aiml');
});

test('refuses a target text format switch and preserves authored Coral source', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, RICH_028_DSL);

  await page.getByRole('radio', { name: /mermaid/i }).click();
  await expect(page.getByRole('radio', { name: /coral/i })).toBeChecked();
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(RICH_028_DSL);
  await expect(page.getByRole('status').filter({ hasText: /Edit this 0\.2\.8 diagram in Coral source/i }))
    .toContainText(/Edit this 0\.2\.8 diagram in Coral source/i);
});

test('downloads an SVG export', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();

  // Register before clicking: the download fires synchronously from the click.
  const download = page.waitForEvent('download');
  await page.getByRole('option', { name: /export svg/i }).click();

  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
});

test('downloads a standalone HTML export with its embedded font', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, RICH_028_DSL);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(RICH_028_DSL);

  await page.keyboard.press('Control+k');
  const pending = page.waitForEvent('download');
  await page.getByRole('option', { name: /export html/i }).click();
  const completed = await pending;
  const path = await completed.path();
  const html = await readFile(path!, 'utf8');

  expect(completed.suggestedFilename()).toMatch(/\.html$/);
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('data:font/woff2;base64,');
  expect(html).toContain('Alpha');
  expect(html).toContain('@media print');
  await expect(editor).toHaveValue(RICH_028_DSL);
});

test('saves the exact authored Coral source in a .coral.json document', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);

  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');

  const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/\.coral\.json$/);
  const path = await saved.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8')).content)
    .toEqual({ format: 'dsl', dslType: 'coral', text: DSL });
});

test('saved document keeps exact Coral source while graph export has finite geometry', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, POSITIONED_RICH_028_DSL);

  const pending = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  const doc = JSON.parse(await readFile(path!, 'utf8'));
  expect(doc.content).toEqual({ format: 'dsl', dslType: 'coral', text: POSITIONED_RICH_028_DSL });
  const graphDownload = await downloadThroughPalette(page, /export graphir 4 candidate/i);
  const graph = JSON.parse(await readFile(graphDownload.path, 'utf8'));
  expect(graph.nodes.map((node: { id: string }) => node.id).sort()).toEqual(['alpha', 'beta']);
  expect(graph.edges).toHaveLength(1);
  for (const node of graph.nodes as Array<{ position: { x: number; y: number } }>) {
    expect(Number.isFinite(node.position.x)).toBe(true);
    expect(Number.isFinite(node.position.y)).toBe(true);
  }
});

test('SVG export preserves separate canvas positions', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, RICH_028_DSL);

  await page.keyboard.press('Control+k');
  const pending = page.waitForEvent('download');
  await page.getByRole('option', { name: /export svg/i }).click();
  const path = await (await pending).path();
  const svg = await readFile(path!, 'utf8');
  const transforms = svg.match(/translate\([^)]*\)/g) ?? [];
  expect(new Set(transforms).size).toBe(2);
});

test('PNG and JPEG exports decode at useful dimensions with a white JPEG ground', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, POSITIONED_RICH_028_DSL);

  async function exportRaster(label: RegExp) {
    await page.keyboard.press('Control+k');
    const pending = page.waitForEvent('download');
    await page.getByRole('option', { name: label }).click();
    const path = await (await pending).path();
    return (await readFile(path!)).toString('base64');
  }

  const png = await exportRaster(/export png/i);
  const jpeg = await exportRaster(/export jpeg/i);
  const decoded = await page.evaluate(async ({ png, jpeg }) => {
    await document.fonts.ready;
    const inspect = async (mime: string, base64: string) => {
      const image = new Image();
      image.src = `data:${mime};base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        corner: [...context.getImageData(0, 0, 1, 1).data],
      };
    };
    return {
      png: await inspect('image/png', png),
      jpeg: await inspect('image/jpeg', jpeg),
    };
  }, { png, jpeg });

  expect(decoded.png.width).toBeGreaterThan(100);
  expect(decoded.png.height).toBeGreaterThan(100);
  expect(decoded.jpeg.width).toBe(decoded.png.width);
  expect(decoded.jpeg.height).toBe(decoded.png.height);
  // JPEG is lossy, so a white source pixel can decode a few levels below 255.
  expect(decoded.jpeg.corner.slice(0, 3).every((channel) => channel >= 240)).toBe(true);
});

test('current Coral source identities reach the canvas with numeric positions', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page, POSITIONED_RICH_028_DSL);

  const transform = await page.locator('.react-flow__node[data-id="alpha"]')
    .evaluate((element: HTMLElement) => element.style.transform);
  const match = /^translate\(([-\d.]+)px, ([-\d.]+)px\)$/.exec(transform);
  expect(match).not.toBeNull();
  expect(Number.isFinite(Number(match![1]))).toBe(true);
  expect(Number.isFinite(Number(match![2]))).toBe(true);
  const graphDownload = await downloadThroughPalette(page, /export graphir 4 candidate/i);
  const graph = JSON.parse(await readFile(graphDownload.path, 'utf8'));
  expect(graph.nodes.map((node: { id: string; position: { x: number; y: number } }) =>
    ({ id: node.id, x: node.position.x, y: node.position.y })))
    .toEqual([{ id: 'alpha', x: 100, y: 200 }, { id: 'beta', x: 500, y: 400 }]);
});

test('offers to restore the document after a reload', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);
  // The auto-recovery save is debounced; reload only once it holds this draft.
  await waitForRecoveryDraft(page, DSL);

  await page.reload();

  // Recovery is offered, not applied: the user decides. Restoring is what
  // brings the content back.
  const restore = page.getByRole('button', { name: /recover your work/i });
  await expect(restore).toBeVisible({ timeout: 10_000 });
  await restore.click();

  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(/Alpha/, { timeout: 10_000 });
});

test('recovery restores its saved node positions', async ({ page }) => {
  const source = '@diagram architecture\nalpha service as "Alpha"\n' +
    'beta database as "Beta"\nalpha -> beta';
  await page.addInitScript((source) => {
    localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(),
      documentName: 'Recovered',
      dslType: 'coral',
      dsl: source,
      notation: 'architecture',
      nodePositions: { alpha: { x: 777, y: 888 }, beta: { x: 999, y: 444 } },
    }));
  }, source);
  await page.goto('/');
  await page.getByRole('button', { name: /recover your work/i }).click();
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
  const alpha = page.locator('.react-flow__node[data-id="alpha"]');
  await expect(alpha).toHaveCount(1);
  await expect.poll(
    () => alpha.evaluate((element: HTMLElement) => element.style.transform),
  ).toBe('translate(777px, 888px)');
});

test('keeps keyboard focus reachable across the shell', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Document name').focus();
  const reached: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    reached.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20) ?? ''}` : '';
      })
    );
  }

  expect(reached.some((r) => r.includes('TEXTAREA'))).toBe(true);
  expect(new Set(reached).size).toBeGreaterThan(3);
});

test('returns focus after the command palette closes', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByLabel('DSL editor', { exact: true });
  await editor.focus();

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(editor).toBeFocused();
});

test('does not load the speech worker until it is needed', async ({ page }) => {
  const speechRequests: string[] = [];
  page.on('request', (r) => {
    if (/whisper|onnx|\.wasm$/i.test(r.url())) speechRequests.push(r.url());
  });

  await page.goto('/');
  await typeDiagram(page);

  // The speech backend is a lazy asset; nothing has asked for it.
  expect(speechRequests).toHaveLength(0);
});

test('reports a syntax error without blanking the canvas', async ({ page }) => {
  await page.goto('/');
  await typeDiagram(page);

  await page.getByLabel('DSL editor', { exact: true }).fill(
    '@diagram architecture\nalpha service as "Alpha"\n!!!not coral!!!\nbeta database as "Beta"');

  // The good lines still render; only the bad line is reported. Before the
  // partial-parse work, one bad line blanked the canvas entirely.
  await expect(page.getByTestId('canvas-status')).toContainText(/2 nodes/i, { timeout: 10_000 });
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});
