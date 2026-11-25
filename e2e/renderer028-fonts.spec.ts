import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const root = resolve(__dirname, '..');
const source = readFileSync(resolve(root, 'packages/browser/test/fixtures/acceptance028/bpmn-branch.coral'), 'utf8');
// Read when a test runs, not at collection: listing tests needs no built output.
let bundle: string | undefined;
const browserBundle = () => bundle ??= readFileSync(process.env.CORAL_FONT_TEST_BUNDLE ??
  resolve(root, 'packages/browser/dist/coral-browser.iife.js'), 'utf8');

for (const style of ['lowfi', 'hifi'] as const) for (const mode of ['custom element', 'renderTo', 'scan'] as const) {
  test(`current BPMN ${style} ${mode} loads its real face before any page-level diagram`, async ({ page }) => {
    const script = browserBundle();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://coral.test/**', (route) => route.fulfill({
      contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
      body: route.request().url().endsWith('/bundle.js') ? script
        : '<!doctype html><meta charset="utf-8"><div id="host"></div><div id="light"></div><script src="/bundle.js"></script>',
      headers: { 'Content-Security-Policy': "default-src 'none'; script-src http://coral.test; style-src 'unsafe-inline'; font-src data:" },
    }));
    await page.goto('http://coral.test/');
    const result = await page.evaluate(async ({ source, style, mode }) => {
      const Coral = (window as unknown as { Coral: typeof import('../packages/browser/src/index.js') }).Coral;
      // Every drawing sits in a Coral surface (c4-design.md "renderTo and scan").
      const surface = (host: Element): ShadowRoot => { const found = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null); if (!found) throw new Error('no Coral surface'); return found; };
      let shadow: ShadowRoot;
      if (mode === 'custom element') {
        Coral.defineCustomElement();
        const host = document.createElement('coral-diagram') as import('../packages/browser/src/index.js').CoralDiagramElement;
        host.source = source;
        host.renderOptions = { style };
        const done = new Promise((resolve) => host.addEventListener('coral-render', resolve, { once: true }));
        document.querySelector('#host')!.append(host);
        await done;
        shadow = host.shadowRoot!;
      } else {
        shadow = document.querySelector('#host')!.attachShadow({ mode: 'open' });
        const inner = document.createElement('pre');
        shadow.append(inner);
        if (mode === 'scan') {
          inner.setAttribute('data-coral', '');
          inner.textContent = source;
          await Coral.scan(shadow, { style });
        } else await Coral.renderTo(inner, source, { style });
        shadow = surface(inner);
      }
      const family = style === 'lowfi' ? 'Coral Lowfi Caveat' : 'Coral Inter';
      const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === family);
      await Promise.all(faces.map((face) => face.load()));
      await document.fonts.ready;
      const before = [...shadow.querySelectorAll<SVGTextElement>('text')].map((text) => text.getComputedTextLength());
      await Coral.renderTo('#light', source, { style });
      await document.fonts.ready;
      return { family, faces: faces.map((face) => ({ family: face.family, weight: face.weight, status: face.status })),
        actualFamily: shadow.querySelector('text')!.getAttribute('font-family'), before,
        light: [...surface(document.querySelector('#light')!).querySelectorAll<SVGTextElement>('text')].map((text) => text.getComputedTextLength()) };
    }, { source, style, mode });
    expect(result.faces.length).toBeGreaterThan(0);
    expect(result.actualFamily).toBe(result.family);
    expect(result.faces.every((face) => face.status === 'loaded')).toBe(true);
    if (style === 'lowfi') expect(result.faces.some((face) => face.weight === '400 700')).toBe(true);
    expect(result.before).toHaveLength(result.light.length);
    for (let i = 0; i < result.light.length; i++) expect(result.before[i]).toBeCloseTo(result.light[i], 3);
    expect(errors).toEqual([]);
  });
}
