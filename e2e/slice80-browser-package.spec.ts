import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Slice 80: the built @coral-viz/browser artifacts in real Chromium (R-061).
 *
 * Every request is fulfilled from memory at http://coral.test under a strict
 * CSP with no 'unsafe-eval', so evaluation, network use, Worker construction,
 * and new globals are all observable failures.
 */

const ORIGIN = 'http://coral.test';
const root = resolve(__dirname, '..');
const dist = resolve(root, 'packages/browser/dist');
const fixture = (name: string): string =>
  readFileSync(resolve(root, 'packages/browser/test/fixtures', name), 'utf8');
const FIXTURES = ['flowchart-25.coral', 'bpmn.coral', 'relationship-ends.coral', 'uml-class.coral', 'uml-sequence.coral'];
const STRICT_CSP = `default-src 'none'; script-src ${ORIGIN}; style-src 'unsafe-inline'; font-src data:`;

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const normalizedSvg = (svg: string): string => {
  const ids = new Map<string, string>();
  return svg.replace(/(?:coral-instance|coral-glyph-title)-[0-9a-f]+(?:-[0-9a-f]+)*/g, (id) => {
    if (!ids.has(id)) ids.set(id, `DOM-SCOPE-${ids.size + 1}`);
    return ids.get(id)!;
  });
};

const INSTRUMENT = `(() => {
  const baseline = new Set(Object.getOwnPropertyNames(window));
  const state = { workers: 0, violations: [], added: () => Object.getOwnPropertyNames(window).filter((name) => !baseline.has(name) && name !== '__coral') };
  Object.defineProperty(window, '__coral', { value: state, enumerable: false });
  const NativeWorker = window.Worker;
  window.Worker = function (...args) { state.workers += 1; return new NativeWorker(...args); };
  document.addEventListener('securitypolicyviolation', (event) => state.violations.push(event.violatedDirective + ' ' + event.blockedURI));
})();`;

interface Site { unexpected: string[] }

async function serve(page: Page, files: Record<string, string>, csp = STRICT_CSP): Promise<Site> {
  const site: Site = { unexpected: [] };
  await page.addInitScript(INSTRUMENT);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const body = url.origin === ORIGIN
      ? (files[url.pathname] ?? (url.pathname.startsWith('/dist/') ? readFileSync(resolve(dist, url.pathname.slice(6)), 'utf8') : undefined))
      : undefined;
    if (body === undefined) {
      site.unexpected.push(url.href);
      await route.abort();
      return;
    }
    const contentType = url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html';
    await route.fulfill({ status: 200, body, headers: { 'content-type': `${contentType}; charset=utf-8`, 'content-security-policy': csp } });
  });
  return site;
}

const page = (head: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coral browser package</title>${head}</head><body>${body}</body></html>`;

async function expectClean(target: Page, site: Site, allowed: string[] = []): Promise<void> {
  const state = await target.evaluate(() => {
    const coral = (window as unknown as { __coral: { workers: number; violations: string[]; added: () => string[] } }).__coral;
    return { workers: coral.workers, violations: coral.violations, added: coral.added() };
  });
  expect(site.unexpected).toEqual([]);
  expect(state.workers).toBe(0);
  expect(state.violations).toEqual([]);
  expect(state.added).toEqual(allowed);
}

async function nodeOutputs(): Promise<Map<string, string>> {
  const built = await import(pathToFileURL(resolve(dist, 'coral-browser.js')).href) as { render: (source: string) => Promise<{ svg: string }> };
  const outputs = new Map<string, string>();
  for (const name of FIXTURES) outputs.set(name, (await built.render(fixture(name))).svg);
  return outputs;
}

test.describe('Slice 80 browser package', () => {
  test('executes the exact documented IIFE scan and custom-element example', async ({ page: tab }) => {
    const html = readFileSync(resolve(root, 'docs/embed/examples/browser-script.html'), 'utf8');
    const site = await serve(tab, {
      '/': page('', html),
      '/assets/coral-browser.iife.js': readFileSync(resolve(dist, 'coral-browser.iife.js'), 'utf8'),
    }, `default-src 'none'; script-src ${ORIGIN} 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:`);
    await tab.goto(`${ORIGIN}/`);
    await expect(tab.locator('[data-coral] svg')).toHaveCount(1);
    await expect.poll(() => tab.locator('coral-diagram').evaluate((element) => element.shadowRoot?.querySelectorAll('svg').length ?? 0)).toBe(1);
    await expectClean(tab, site, ['Coral']);
  });

  test('IIFE adds only Coral, renders byte-identically to Node, and stays offline and eval-free', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', '<script src="/dist/coral-browser.iife.js"></script><script src="/after-eval.js"></script>'),
      '/after-eval.js': 'window.__coral.afterEval = window.__coral.added();',
    });
    await tab.goto(`${ORIGIN}/`);
    expect(await tab.evaluate(() => (window as unknown as { __coral: { afterEval: string[] } }).__coral.afterEval)).toEqual(['Coral']);
    expect(await tab.evaluate(() => Object.keys((window as unknown as { Coral: object }).Coral).sort()))
      .toEqual(['CoralRenderError', 'defineCustomElement', 'render', 'renderText', 'renderTo', 'scan', 'version']);

    const source = fixture('flowchart-25.coral');
    const { renderText } = await import('@coral-viz/render');
    const text = await tab.evaluate(async (input) => {
      const { Coral } = window as unknown as { Coral: typeof import('@coral-viz/browser') };
      return (await Coral.renderText(input)).text;
    }, source);
    expect(text).toBe((await renderText(source)).text);

    const expected = await nodeOutputs();
    for (const name of FIXTURES) {
      const svg = await tab.evaluate(async (source) => (await (window as unknown as { Coral: { render: (text: string) => Promise<{ svg: string }> } }).Coral.render(source)).svg, fixture(name));
      expect(svg, name).toBe(expected.get(name));
    }
    await expectClean(tab, site, ['Coral']);
  });

  test('ESM consumer adds no global and renders the same SVG', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', '<script type="module" src="/consumer.js"></script>'),
      '/consumer.js': "import * as Coral from '/dist/coral-browser.js';\nwindow.__coral.esm = Coral;\n",
    });
    await tab.goto(`${ORIGIN}/`);
    await tab.waitForFunction(() => Boolean((window as unknown as { __coral: { esm?: unknown } }).__coral.esm));
    const svg = await tab.evaluate(async (source) =>
      (await (window as unknown as { __coral: { esm: { render: (text: string) => Promise<{ svg: string }> } } }).__coral.esm.render(source)).svg,
    fixture('flowchart-25.coral'));
    const nodeSvg = (await nodeOutputs()).get('flowchart-25.coral')!;
    expect(normalizedSvg(svg)).toBe(normalizedSvg(nodeSvg));
    await expectClean(tab, site, []);
  });

  test('renderTo, scan, and the element render accessibly; errors stay inline and in place', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', [
        `<div id="target">${escapeHtml(fixture('bpmn.coral'))}</div>`,
        `<pre data-coral id="scanned">${escapeHtml(fixture('uml-class.coral'))}</pre>`,
        '<pre data-coral id="refused">flowchart TD\nA--&gt;B</pre>',
        `<coral-diagram id="element">${escapeHtml(fixture('uml-sequence.coral'))}</coral-diagram>`,
        '<p id="bystander">Unrelated content</p>',
        '<script src="/dist/coral-browser.iife.js"></script><script src="/run.js"></script>',
      ].join('')),
      '/run.js': `document.getElementById('element').renderOptions = { title: 'Sign-in sequence' };
      window.__coral.done = Promise.all([
        Coral.renderTo('#target', undefined, { title: 'Approve invoice' }),
        Coral.scan(),
        new Promise((resolve) => { document.getElementById('element').addEventListener('coral-render', resolve, { once: true }); Coral.defineCustomElement(); }),
      ]).then(([, scanned]) => scanned.map((result) => result.status));`,
    });
    await tab.goto(`${ORIGIN}/`);
    expect(await tab.evaluate(() => (window as unknown as { __coral: { done: Promise<string[]> } }).__coral.done)).toEqual(['rendered', 'error']);

    await expect(tab.locator('#target')).toMatchAriaSnapshot('- img "Approve invoice"');
    await expect(tab.locator('#scanned')).toMatchAriaSnapshot('- img "Coral diagram"');
    await expect(tab.locator('#refused')).toMatchAriaSnapshot(`
      - alert:
        - paragraph: /Coral diagram could not be rendered/
    `);
    expect(await tab.locator('#refused').getAttribute('data-coral-state')).toBe('error');
    await expect(tab.locator('#bystander')).toHaveText('Unrelated content');
    const element = tab.locator('#element');
    expect(await element.getAttribute('data-coral-state')).toBe('rendered');
    expect(await element.evaluate((host) => host.shadowRoot!.querySelector('svg')!.getAttribute('aria-label'))).toBe('Sign-in sequence');
    await expectClean(tab, site, ['Coral']);
  });

  test('an element defined before its markup waits for its content', async ({ page: tab }) => {
    await serve(tab, {
      '/': page(
        '<script src="/dist/coral-browser.iife.js"></script><script src="/define.js"></script>',
        `<coral-diagram id="early">${escapeHtml(fixture('bpmn.coral'))}</coral-diagram>`,
      ),
      '/define.js': 'Coral.defineCustomElement();',
    });
    await tab.goto(`${ORIGIN}/`);
    const early = tab.locator('#early');
    await expect(early).toHaveAttribute('data-coral-state', 'rendered');
    expect(await early.evaluate((host) => host.shadowRoot!.querySelector('svg')!.getAttribute('aria-label'))).toBe('Coral diagram');
  });

  test('embedded text uses its production face in a renderTo surface and in the element alike', async ({ page: tab }) => {
    await serve(tab, {
      '/': page('', `<div id="light">${escapeHtml(fixture('bpmn.coral'))}</div><coral-diagram id="shadow">${escapeHtml(fixture('bpmn.coral'))}</coral-diagram><script src="/dist/coral-browser.iife.js"></script>`),
    });
    await tab.goto(`${ORIGIN}/`);
    const widths = await tab.evaluate(async () => {
      const Coral = (window as unknown as { Coral: { renderTo: (target: string) => Promise<unknown>; defineCustomElement: () => void } }).Coral;
      const shadow = document.getElementById('shadow')!;
      const rendered = new Promise((resolve) => shadow.addEventListener('coral-render', resolve, { once: true }));
      Coral.defineCustomElement();
      await Promise.all([Coral.renderTo('#light'), rendered]);
      await document.fonts.ready;
      const surface = (host: Element): ShadowRoot => { const root = (host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null)); if (!root) throw new Error(`no Coral surface on ${host.id}`); return root; };
      const lightText = surface(document.getElementById('light')!).querySelector('text') as SVGTextElement;
      const family = lightText.getAttribute('font-family');
      const face = [...document.fonts].find((candidate) => candidate.family.replace(/["']/g, '') === family);
      await face?.load();
      const width = (text: SVGTextElement) => text.getComputedTextLength();
      return {
        faceStatus: face?.status,
        light: width(lightText),
        shadow: width(shadow.shadowRoot!.querySelector('text') as SVGTextElement),
      };
    });
    expect(widths.faceStatus).toBe('loaded');
    expect(widths.shadow).toBeCloseTo(widths.light, 3);
  });

  test('a shadow-root diagram alone still gets its production face', async ({ page: tab }) => {
    await serve(tab, {
      '/': page('', `<coral-diagram id="shadow">${escapeHtml(fixture('bpmn.coral'))}</coral-diagram><div id="light"></div><script src="/dist/coral-browser.iife.js"></script>`),
    });
    await tab.goto(`${ORIGIN}/`);
    const widths = await tab.evaluate(async (source) => {
      const Coral = (window as unknown as { Coral: { renderTo: (target: string, text: string) => Promise<unknown>; defineCustomElement: () => void } }).Coral;
      const shadow = document.getElementById('shadow')!;
      const rendered = new Promise((resolve) => shadow.addEventListener('coral-render', resolve, { once: true }));
      Coral.defineCustomElement();
      await rendered;
      await document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 100));
      const alone = (shadow.shadowRoot!.querySelector('text') as SVGTextElement).getComputedTextLength();
      await Coral.renderTo('#light', source);
      await document.fonts.ready;
      const surface = (host: Element): ShadowRoot => { const root = (host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null)); if (!root) throw new Error(`no Coral surface on ${host.id}`); return root; };
      const light = (surface(document.getElementById('light')!).querySelector('text') as SVGTextElement).getComputedTextLength();
      return { alone, light };
    }, fixture('bpmn.coral'));
    expect(widths.alone).toBeCloseTo(widths.light, 3);
  });

  test('scan and renderTo inside a host shadow tree keep their production face', async ({ page: tab }) => {
    await serve(tab, {
      '/': page('', `<div id="component"></div><div id="light"></div><script src="/dist/coral-browser.iife.js"></script>`),
    });
    await tab.goto(`${ORIGIN}/`);
    const widths = await tab.evaluate(async (source) => {
      const Coral = (window as unknown as { Coral: { scan: (root: ParentNode) => Promise<unknown>; renderTo: (target: string, text: string) => Promise<unknown> } }).Coral;
      const shadow = document.getElementById('component')!.attachShadow({ mode: 'open' });
      const inner = document.createElement('pre');
      inner.setAttribute('data-coral', '');
      inner.textContent = source;
      shadow.append(inner);
      await Coral.scan(shadow);
      await document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 100));
      const surface = (host: Element): ShadowRoot => { const root = (host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null)); if (!root) throw new Error(`no Coral surface on ${host.id}`); return root; };
      const scanned = (surface(inner).querySelector('text') as SVGTextElement).getComputedTextLength();
      await Coral.renderTo('#light', source);
      await document.fonts.ready;
      return { scanned, light: (surface(document.getElementById('light')!).querySelector('text') as SVGTextElement).getComputedTextLength() };
    }, fixture('bpmn.coral'));
    expect(widths.scanned).toBeCloseTo(widths.light, 3);
  });

  test('renderTo and scan accept targets owned by a same-origin iframe; a bad scan root is a typed error', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', '<iframe id="frame" src="/frame"></iframe><script src="/dist/coral-browser.iife.js"></script>'),
      '/frame': page('', `<div id="direct">${escapeHtml(fixture('bpmn.coral'))}</div><pre data-coral>${escapeHtml(fixture('uml-class.coral'))}</pre>`),
    }, `${STRICT_CSP}; frame-src ${ORIGIN}`);
    await tab.goto(`${ORIGIN}/`);
    await tab.frameLocator('#frame').locator('#direct').waitFor({ state: 'attached' });
    const outcome = await tab.evaluate(async () => {
      type Result = { status: string };
      const Coral = (window as unknown as { Coral: {
        renderTo: (target: Element) => Promise<unknown>;
        scan: (root?: unknown) => Promise<Result[]>;
      } }).Coral;
      const frame = (document.getElementById('frame') as HTMLIFrameElement).contentDocument!;
      await Coral.renderTo(frame.getElementById('direct')!);
      const scanned = await Coral.scan(frame);
      const surface = (host: Element): ShadowRoot => { const root = (host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null)); if (!root) throw new Error(`no Coral surface on ${host.id}`); return root; };
      // Every drawing sits in a Coral surface; the frame's light DOM holds none.
      const svgs = [frame.getElementById('direct')!, frame.querySelector('pre')!].flatMap((host) => [...surface(host).querySelectorAll('svg')]);
      if (frame.querySelectorAll('svg').length) throw new Error('an SVG escaped its surface');
      const badRoot = await Coral.scan(null).then(() => 'resolved', (error: { name: string; code: string }) => `${error.name} ${error.code}`);
      return {
        scanned: scanned.map((result) => result.status),
        svgs: svgs.length,
        owned: svgs.every((svg) => svg.ownerDocument === frame && svg.getAttribute('role') === 'img'),
        badRoot,
      };
    });
    expect(outcome).toEqual({ scanned: ['rendered'], svgs: 2, owned: true, badRoot: 'CoralRenderError coral.browser.target.missing' });
    // "0" is the window's indexed property for the iframe, not a package global.
    await expectClean(tab, site, ['0', 'Coral']);
  });

  test('hostile and illegal input never become markup, and shared ids stay unique', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', '<div id="hostile"></div><div id="illegal"></div><div id="first"></div><div id="second"></div><script src="/dist/coral-browser.iife.js"></script>'),
    });
    await tab.goto(`${ORIGIN}/`);
    const outcome = await tab.evaluate(async ([ends]) => {
      const Coral = (window as unknown as { Coral: { renderTo: (target: string, source?: string) => Promise<unknown> } }).Coral;
      await Coral.renderTo('#hostile', '@diagram architecture\na service as "<img src=x onerror=alert(1)><script>alert(2)</script>"\nb service as "<svg onload=alert(3)>"\na -> b\n');
      const illegal = await Coral.renderTo('#illegal', '@diagram architecture\na service as "A\u0001"\n').then(() => 'resolved', (error: { code: string }) => error.code);
      await Promise.all([Coral.renderTo('#first', ends), Coral.renderTo('#second', ends)]);
      const surface = (host: Element): ShadowRoot => { const root = (host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null)); if (!root) throw new Error(`no Coral surface on ${host.id}`); return root; };
      const hosts = ['hostile', 'illegal', 'first', 'second'].map((id) => document.getElementById(id)!);
      // IDs stay unique across the page and every surface, as if they shared one tree.
      const ids = [...document.querySelectorAll('[id]'), ...hosts.flatMap((host) => [...surface(host).querySelectorAll('[id]')])]
        .map((element) => element.id);
      const hostile = surface(hosts[0]!);
      const hostileSvg = hostile.querySelector('svg[role="img"]');
      const renderedText = hostileSvg?.textContent?.replace(/\s+/g, '') ?? '';
      return {
        rendered: hostileSvg !== null,
        escapedLabels: renderedText.includes('<imgsrc=xonerror=alert(1)>') &&
          renderedText.includes('<svgonload=alert(3)>'),
        injected: hostile.querySelectorAll('img, script, foreignObject, svg svg').length + hosts[0]!.children.length,
        handlers: [...hostile.querySelectorAll('*')].flatMap((element) => [...element.attributes].map((attribute) => attribute.name)).filter((name) => name.startsWith('on')),
        illegal,
        illegalAlert: surface(hosts[1]!).querySelector('[role="alert"]') !== null,
        duplicates: ids.length - new Set(ids).size,
      };
    }, [fixture('relationship-ends.coral')]);
    expect(outcome).toEqual({ rendered: true, escapedLabels: true, injected: 0, handlers: [],
      illegal: 'coral.browser.input.invalid', illegalAlert: true, duplicates: 0 });
    await expectClean(tab, site, ['Coral']);
  });

  test('without inline styles the diagram is still inserted; only styling degrades', async ({ page: tab }) => {
    const site = await serve(tab, {
      '/': page('', `<div id="target">${escapeHtml(fixture('bpmn.coral'))}</div><script src="/dist/coral-browser.iife.js"></script>`),
    }, `default-src 'none'; script-src ${ORIGIN}; font-src data:`);
    await tab.goto(`${ORIGIN}/`);
    await tab.evaluate(() => (window as unknown as { Coral: { renderTo: (target: string) => Promise<unknown> } }).Coral.renderTo('#target'));
    await expect(tab.locator('#target svg').first()).toBeAttached();
    const violations = await tab.evaluate(() => (window as unknown as { __coral: { violations: string[] } }).__coral.violations);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.startsWith('style-src'))).toBe(true);
    expect(site.unexpected).toEqual([]);
  });
});
