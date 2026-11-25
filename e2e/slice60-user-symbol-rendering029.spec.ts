import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

/**
 * Slice 60 C4: user-symbol artwork in real Chromium (R-065 AC-3, AC-6;
 * c4-design.md "Style boundary", "Raster export"). Every request is served
 * from memory at http://coral.test; any other request is recorded and aborted.
 */

const ORIGIN = 'http://coral.test';
const root = resolve(__dirname, '..');
const browserDist = resolve(root, 'packages/browser/dist');
const renderDist = resolve(root, 'packages/render/dist');
const CSP = `default-src 'none'; script-src ${ORIGIN}; style-src 'unsafe-inline'; font-src data:; img-src blob: data:`;
const GREEN: [number, number, number] = [0x2f, 0x6f, 0x4f];
const RED: [number, number, number] = [0xb0, 0x30, 0x30];

const hex = (rgb: [number, number, number]) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
const source = (colour: [number, number, number], id = 'probe') => ['@diagram architecture', '@coralVersion "0.2.9"',
  `@symbol ${id} {`, '  name "Probe"', '  size 80 x 80', '  label center', '  outline ellipse', '  artwork svg """',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${hex(colour)}" stroke="#123456"/></svg>`,
  '"""', '}', `g service [symbol: "local.${id}"] as " "`, ''].join('\n');
const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inherited painting properties on every host, and drawing-element rules that must not cross the boundary. */
const HOSTILE = `<style>
* { fill: #ff00ff !important; stroke: #00ff00 !important; stroke-width: 40px !important; fill-opacity: 0.1 !important;
  stroke-dasharray: 1 !important; paint-order: stroke !important; clip-rule: evenodd !important; fill-rule: evenodd !important;
  color: #ff00ff !important; shape-rendering: crispEdges !important; }
svg *, use, symbol, g, rect, path, clipPath { fill: #ff00ff !important; opacity: 0 !important; display: none !important;
  transform: scale(0) !important; visibility: hidden !important; }
</style>`;

interface Site { unexpected: string[] }
async function serve(page: Page, files: Record<string, { body: string | Buffer; type: string }>): Promise<Site> {
  const site: Site = { unexpected: [] };
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === ORIGIN ? files[url.pathname] ??
      (url.pathname.startsWith('/dist/') ? { body: readFileSync(resolve(browserDist, url.pathname.slice(6)), 'utf8'), type: 'text/javascript' } : undefined)
      : undefined;
    if (!file) { site.unexpected.push(url.href); await route.abort(); return; }
    await route.fulfill({ status: 200, body: file.body, headers: { 'content-type': `${file.type}; charset=utf-8`, 'content-security-policy': CSP } });
  });
  return site;
}
const html = (head: string, body: string) => ({ type: 'text/html',
  body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>C4</title>${head}</head><body style="margin:0;background:#ffffff">${body}</body></html>` });

/** The rendered colour at a viewport point, from a real screenshot. */
async function pixel(page: Page, point: { x: number; y: number }): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 } });
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return [data[0]!, data[1]!, data[2]!];
}
const near = (actual: [number, number, number], expected: [number, number, number]) =>
  actual.every((value, index) => Math.abs(value - expected[index]!) <= 6);

/** Centre and a frame corner (outside the ellipse clip) of each host's artwork <use>. */
async function useGeometry(page: Page, ids: string[]) {
  return page.evaluate((hosts) => hosts.map((id) => {
    const host = document.getElementById(id)!;
    const root = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? host.shadowRoot;
    const use = root?.querySelector('[data-coral-artwork] use');
    if (!use) throw new Error(`no artwork in ${id}`);
    const box = use.getBoundingClientRect();
    return { centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, corner: { x: box.x + 3, y: box.y + 3 } };
  }), ids);
}

test.describe('Slice 60 C4 user-symbol rendering in Chromium', () => {
  test('a hostile host stylesheet cannot restyle artwork in the element, renderTo or scan', async ({ page }) => {
    const text = escapeHtml(`${source(GREEN)}n service as "Label"\n`);
    const site = await serve(page, {
      '/': html(HOSTILE, `<coral-diagram id="element">${text}</coral-diagram><div id="target">${text}</div>` +
        `<pre data-coral id="scanned">${text}</pre><script src="/dist/coral-browser.iife.js"></script><script src="/run.js"></script>`),
      '/run.js': { type: 'text/javascript', body: `window.done = Promise.all([Coral.renderTo('#target'), Coral.scan(),
        new Promise((resolve) => { document.getElementById('element').addEventListener('coral-render', resolve, { once: true }); Coral.defineCustomElement(); })]);` },
    });
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(() => (window as unknown as { done: Promise<unknown> }).done);
    // Coral's own labels stop inherited host values too (c4-design.md F-1).
    const labels = await page.evaluate(() => ['element', 'target', 'scanned'].map((id) => {
      const host = document.getElementById(id)!;
      const root = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? host.shadowRoot!;
      const style = getComputedStyle(root.querySelector('text')!);
      return [style.stroke, style.strokeWidth, style.paintOrder, style.fillOpacity];
    }));
    for (const label of labels) expect(label).toEqual(['none', '1px', 'normal', '1']);
    for (const [index, geometry] of (await useGeometry(page, ['element', 'target', 'scanned'])).entries()) {
      expect(near(await pixel(page, geometry.centre), GREEN), `artwork ${index}`).toBe(true);
      // The ellipse clip keeps the frame corner free of artwork.
      expect(near(await pixel(page, geometry.corner), GREEN), `clip ${index}`).toBe(false);
    }
    expect(site.unexpected).toEqual([]);
  });

  test('a hostile stylesheet cannot restyle artwork in an HTML export, and fonts still load', async ({ page }) => {
    const render = await import(pathToFileURL(resolve(renderDist, 'index.js')).href) as typeof import('../packages/render/src/index');
    const layout = await import(pathToFileURL(resolve(renderDist, 'svg/layout.js')).href) as typeof import('../packages/render/src/svg/layout');
    const text = source(GREEN).replace('as " "', 'as "Gate"');
    const graph = render.projectInstalledSourceToSuccessor028(text).graph!;
    const { display, semanticInterpretations } = render.successorSourceDisplayWithSemanticPorts028(graph);
    const laidOut = await layout.layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const, semanticGraph: display, successorSource: graph };
    const exported = render.renderHtml(laidOut, options).replace('</head>', `${HOSTILE}</head>`)
      .replace('<div class="coral-diagram">', '<div class="coral-diagram" id="export">');
    const svg = render.renderSvg(laidOut, options);
    const site = await serve(page, { '/': { type: 'text/html', body: exported }, '/standalone.svg': { type: 'image/svg+xml', body: svg } });
    await page.goto(`${ORIGIN}/`);
    const measured = await page.evaluate(async () => {
      await document.fonts.ready;
      const host = document.getElementById('export')!;
      const text = host.shadowRoot!.querySelector('text') as SVGTextElement;
      const face = [...document.fonts].find((candidate) => candidate.family.replace(/["']/g, '') === text.getAttribute('font-family'));
      await face?.load();
      return { status: face?.status, width: text.getComputedTextLength(), shadowFaces: host.shadowRoot!.innerHTML.includes('@font-face') };
    });
    expect(measured).toMatchObject({ status: 'loaded', shadowFaces: false });
    const [geometry] = await page.evaluate(() => {
      const use = document.getElementById('export')!.shadowRoot!.querySelector('[data-coral-artwork] use')!;
      const box = use.getBoundingClientRect();
      // Off centre: the centred label "Gate" covers the middle of the artwork.
      return [{ x: box.x + box.width / 2, y: box.y + box.height * 0.25 }];
    });
    const colour = await pixel(page, geometry!);
    expect(near(colour, GREEN), String(colour)).toBe(true);
    await page.goto(`${ORIGIN}/standalone.svg`);
    const standalone = await page.evaluate(async () => { await document.fonts.ready;
      return (document.querySelector('text') as SVGTextElement).getComputedTextLength(); });
    expect(measured.width).toBeCloseTo(standalone, 1);
    expect(site.unexpected).toEqual([]);
  });

  test('two documents that both define local.probe keep their own artwork and unique IDs', async ({ page }) => {
    const site = await serve(page, {
      '/': html('', `<coral-diagram id="one">${escapeHtml(source(GREEN))}</coral-diagram>` +
        `<coral-diagram id="two">${escapeHtml(source(RED))}</coral-diagram><div id="three"></div><div id="four"></div>` +
        '<script src="/dist/coral-browser.iife.js"></script><script src="/run.js"></script>'),
      '/run.js': { type: 'text/javascript', body: `const rendered = (id) => new Promise((resolve) =>
        document.getElementById(id).addEventListener('coral-render', resolve, { once: true }));
        const elements = Promise.all([rendered('one'), rendered('two')]);
        Coral.defineCustomElement();
        // Light DOM: two string renders inserted side by side in one tree.
        window.done = Promise.all([elements, Coral.render(${JSON.stringify(source(GREEN))}), Coral.render(${JSON.stringify(source(RED))})])
          .then(([, a, b]) => { document.getElementById('three').innerHTML = a.svg; document.getElementById('four').innerHTML = b.svg; });` },
    });
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(() => (window as unknown as { done: Promise<unknown> }).done);
    const [one, two] = await useGeometry(page, ['one', 'two']);
    expect(near(await pixel(page, one!.centre), GREEN)).toBe(true);
    expect(near(await pixel(page, two!.centre), RED)).toBe(true);
    const light = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
      const centre = (id: string) => { const box = document.querySelector(`#${id} [data-coral-artwork] use`)!.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
      return { duplicates: ids.length - new Set(ids).size, three: centre('three'), four: centre('four') };
    });
    expect(light.duplicates).toBe(0);
    expect(near(await pixel(page, light.three), GREEN)).toBe(true);
    expect(near(await pixel(page, light.four), RED)).toBe(true);
    expect(site.unexpected).toEqual([]);
  });

  test('PNG and JPEG rasterize the same SVG with no network request', async ({ page }) => {
    const site = await serve(page, { '/': html('', '<script src="/dist/coral-browser.iife.js"></script>') });
    await page.goto(`${ORIGIN}/`);
    const result = await page.evaluate(async (text) => {
      const { svg } = await (window as unknown as { Coral: { render: (s: string) => Promise<{ svg: string }> } }).Coral.render(text);
      const external = [...svg.matchAll(/(?:href="([^"]*)"|url\(([^)]*)\))/g)].map((match) => match[1] ?? match[2]!)
        .filter((reference) => !reference.startsWith('#') && !reference.startsWith("'data:") && !reference.startsWith('data:'));
      const width = Number(/width="(\d+)"/.exec(svg)![1]); const height = Number(/height="(\d+)"/.exec(svg)![1]);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode();
      const colours: Record<string, number[]> = {};
      for (const type of ['image/png', 'image/jpeg']) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((done) => canvas.toBlob((value) => done(value!), type));
        const decoded = await createImageBitmap(blob);
        const check = document.createElement('canvas'); check.width = width; check.height = height;
        const checkContext = check.getContext('2d')!; checkContext.drawImage(decoded, 0, 0);
        colours[type] = [...checkContext.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data].slice(0, 3);
      }
      URL.revokeObjectURL(url);
      return { external, colours };
    }, source(GREEN));
    expect(result.external).toEqual([]);
    for (const colour of Object.values(result.colours)) expect(near(colour as [number, number, number], GREEN)).toBe(true);
    expect(site.unexpected).toEqual([]);
  });
});
