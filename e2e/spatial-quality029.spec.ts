import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { downloadFromPalette, openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const source = readFileSync(resolve(__dirname,
  '../packages/render/test/fixtures/code-containment.coral'), 'utf8');

async function geometry(page: Page, exported: string) {
  return page.evaluate(svg => {
    const snapshot = (root: ParentNode) => {
      const outlines = ['module', 'renderer', 'render', 'version'].map(id => {
        const body = root.querySelector<SVGGeometryElement>(`[data-coral-part-id="${id}:outline"]`)!;
        const ownSvg = body.ownerSVGElement!;
        const matrix = ownSvg.getCTM()!.inverse().multiply(body.getCTM()!);
        const length = body.getTotalLength();
        const points = Array.from({ length: 257 }, (_, i) => {
          const p = body.getPointAtLength(length * i / 256);
          const transformed = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          return { x: transformed.x, y: transformed.y };
        });
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        return { id, points, left: Math.min(...xs), right: Math.max(...xs),
          top: Math.min(...ys), bottom: Math.max(...ys) };
      });
      const routes = ['moduleClass', 'classRender', 'classVersion'].map(id => {
        const path = root.querySelector<SVGGeometryElement>(`[data-coral-part-id="${id}:shaft"]`)!;
        const length = path.getTotalLength();
        return { id, d: path.getAttribute('d'), points: Array.from({ length: 129 }, (_, i) => {
          const p = path.getPointAtLength(length * i / 128);
          return { x: p.x, y: p.y };
        }) };
      });
      return { outlines, routes };
    };
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-10000px;top:0';
    holder.append(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));
    document.body.append(holder);
    try { return { canvas: snapshot(document.querySelector('.react-flow')!), exported: snapshot(holder) }; }
    finally { holder.remove(); }
  }, exported);
}
type Snapshot = Awaited<ReturnType<typeof geometry>>['canvas'];
function checkTree(actual: Snapshot, style: 'lowfi' | 'hifi') {
  const byId = Object.fromEntries(actual.outlines.map(node => [node.id, node]));
  const center = (id: string) => (byId[id].left + byId[id].right) / 2;
  const tolerance = style === 'lowfi' ? 3 : .25;
  expect(Math.abs(center('module') - center('renderer'))).toBeLessThan(tolerance);
  expect(center('render')).toBeLessThan(center('version'));
  expect(byId.module.bottom).toBeLessThan(byId.renderer.top);
  expect(byId.renderer.bottom).toBeLessThan(Math.min(byId.render.top, byId.version.top));
  const spine = actual.routes.find(route => route.id === 'moduleClass')!.points;
  expect(Math.max(...spine.map(p => p.x)) - Math.min(...spine.map(p => p.x))).toBeLessThan(tolerance);
  const endpoints: Record<string, [string, string]> = {
    moduleClass: ['module', 'renderer'], classRender: ['renderer', 'render'], classVersion: ['renderer', 'version'],
  };
  for (const route of actual.routes) {
    const [first, second] = endpoints[route.id];
    for (const [point, node] of [[route.points[0], byId[first]], [route.points.at(-1)!, byId[second]]] as const)
      expect(Math.min(...node.points.map(p => Math.hypot(p.x - point.x, p.y - point.y))), `${route.id} contour contact`).toBeLessThan(4);
    for (let i = 1; i < route.points.length; i++)
      expect(route.points[i].y - route.points[i - 1].y, `${route.id} backtracks`).toBeGreaterThan(-.2);
    for (const node of actual.outlines.filter(node => ![first, second].includes(node.id)))
      for (const point of route.points.slice(1, -1))
        expect(point.x > node.left + 2 && point.x < node.right - 2 &&
          point.y > node.top + 2 && point.y < node.bottom - 2, `${route.id} penetrates ${node.id}`).toBe(false);
  }
  const side = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crossings: string[] = [];
  for (let i = 0; i < actual.routes.length; i++) for (let j = i + 1; j < actual.routes.length; j++) {
    const a = actual.routes[i].points, b = actual.routes[j].points;
    for (let p = 1; p < a.length; p++) for (let q = 1; q < b.length; q++) {
      const crosses = side(a[p - 1], a[p], b[q - 1]) * side(a[p - 1], a[p], b[q]) < -1e-5 &&
        side(b[q - 1], b[q], a[p - 1]) * side(b[q - 1], b[q], a[p]) < -1e-5;
      if (crosses) crossings.push(`${actual.routes[i].id} crosses ${actual.routes[j].id}`);
    }
  }
  expect(crossings).toEqual([]);
}

for (const style of ['lowfi', 'hifi'] as const) test(`Code containment keeps its spine, ordered branches and contacts in ${style} canvas, Reflow and SVG`, async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'code-containment.coral', buffer: Buffer.from(source) });
  await page.getByLabel('Diagram style', { exact: true }).selectOption(style);
  await waitForEditorSettled(page);
  await expect(page.locator('[data-coral-scene-node]')).toHaveCount(4);
  await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(3);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  for (const phase of ['load', 'reflow'] as const) {
    if (phase === 'reflow') {
      await page.getByRole('button', { name: 'Reflow layout', exact: true }).click();
      await waitForEditorSettled(page);
    }
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const actual = await geometry(page, svg);
    checkTree(actual.canvas, style);
    checkTree(actual.exported, style);
    expect(actual.canvas.routes).toEqual(actual.exported.routes);
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(source);
  }
});

const reviewedDiagrams = [
  { id: 'nested', style: 'lowfi',
    source: '@diagram architecture\ncluster group as "Cluster" {\n api service as "API"\n worker service as "Worker"\n}\nstore database as "Store"\ncall = cluster.api -> cluster.worker\nsave = cluster.worker -> store\n',
    nodes: ['cluster', 'cluster.api', 'cluster.worker', 'store'], edges: ['call', 'save'] },
  ...(['lowfi', 'hifi'] as const).map(style => ({ id: 'mixed-shapes', style,
    source: '@diagram flowchart\na terminal as "Start"\nb process as "Validate"\nc decision as "Approved?"\nd io as "Send response"\ne document as "Receipt"\nab = a -> b\nbc = b -> c\ncd = c -> d\nde = d -> e\n',
    nodes: ['a', 'b', 'c', 'd', 'e'], edges: ['ab', 'bc', 'cd', 'de'] })),
  { id: 'social-network', style: 'hifi', source: readFileSync(resolve(__dirname,
    '../packages/diagram-editor/test/llm/fixtures/corpus/coral/social-network-class.coral'), 'utf8')
    .replace('@diagram uml-class\n', '@diagram uml-class\nlayout [direction: RIGHT]\n'),
    nodes: ['User', 'Profile', 'Post', 'Comment', 'Like', 'Friendship', 'Message', 'Conversation', 'Group',
      'GroupMembership', 'Notification', 'Album', 'Photo', 'NewsFeed'],
    edges: Array.from({ length: 17 }, (_, index) => `rel_${index + 1}`) },
] as const;

async function reviewedGeometry(page: Page, exported: string, ids: readonly string[]) {
  return page.evaluate(({ svg, ids }) => {
    const snapshot = (root: ParentNode) => {
      const parts = [...root.querySelectorAll<SVGElement>('[data-coral-part-id]')].map(part => ({
        id: part.getAttribute('data-coral-part-id'), tag: part.tagName,
        geometry: ['d', 'x', 'y', 'width', 'height', 'transform', 'font-family', 'font-size', 'font-weight', 'text-anchor']
          .map(name => [name, part.getAttribute(name)]),
        text: part.tagName === 'text' ? part.textContent : null,
      })).sort((a, b) => a.id!.localeCompare(b.id!));
      const context = document.createElement('canvas').getContext('2d')!;
      const textInk = (text: SVGTextElement) => {
        const style = getComputedStyle(text);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink = context.measureText(text.textContent ?? '');
        const x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y'));
        const origin = text.getAttribute('text-anchor') === 'middle' ? x - ink.width / 2 : x;
        return { id: text.getAttribute('data-coral-part-id'), text: text.textContent,
          left: origin - ink.actualBoundingBoxLeft, right: origin + ink.actualBoundingBoxRight,
          top: y - ink.actualBoundingBoxAscent, bottom: y + ink.actualBoundingBoxDescent };
      };
      const texts = [...root.querySelectorAll<SVGTextElement>('text[data-coral-part-id]')];
      const edgeLabels = texts.filter(text => ['rel_2:label', 'rel_13:label']
        .includes(text.getAttribute('data-coral-part-id')!)).map(textInk);
      const nodes = ids.map(id => {
        const body = root.querySelector<SVGGeometryElement>(`[data-coral-part-id="${id}:outline"]`)!;
        const matrix = body.ownerSVGElement!.getCTM()!.inverse().multiply(body.getCTM()!);
        const length = body.getTotalLength();
        const points = Array.from({ length: 513 }, (_, index) => {
          const p = body.getPointAtLength(length * index / 512);
          const transformed = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          return { x: transformed.x, y: transformed.y };
        });
        const labels = texts.filter(text => text.getAttribute('data-coral-part-id')!.startsWith(`${id}:`))
          .map(textInk);
        return { id, left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
          top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)), labels };
      });
      return { parts, nodes, edgeLabels };
    };
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-10000px;top:0';
    holder.append(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));
    document.body.append(holder);
    try { return { canvas: snapshot(document.querySelector('.react-flow')!), exported: snapshot(holder) }; }
    finally { holder.remove(); }
  }, { svg: exported, ids });
}

for (const fixture of reviewedDiagrams) test(`${fixture.id} ${fixture.style} preserves reviewed labels and meaning through editor Reflow and SVG`, async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: `${fixture.id}.coral`, buffer: Buffer.from(fixture.source) });
  await page.getByLabel('Diagram style', { exact: true }).selectOption(fixture.style);
  await waitForEditorSettled(page);
  await page.evaluate(() => document.fonts.ready);
  const meaning = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  for (const phase of ['load', 'reflow'] as const) {
    if (phase === 'reflow') {
      await page.getByRole('button', { name: 'Reflow layout', exact: true }).click();
      await waitForEditorSettled(page);
    }
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
    await expect(page.locator('[data-coral-scene-node]')).toHaveCount(fixture.nodes.length);
    await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(fixture.edges.length);
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const actual = await reviewedGeometry(page, svg, fixture.nodes);
    expect(actual.canvas.parts).toEqual(actual.exported.parts);
    const bodyBounds = (drawing: typeof actual.canvas) => drawing.nodes.map(({ labels: _labels, ...body }) => ({
      id: body.id, bounds: [body.left, body.right, body.top, body.bottom].map(value => Number(value.toFixed(4))),
    }));
    expect(bodyBounds(actual.canvas)).toEqual(bodyBounds(actual.exported));
    for (const drawing of [actual.canvas, actual.exported]) {
      const node = (id: string) => drawing.nodes.find(node => node.id === id)!;
      for (const body of drawing.nodes) expect(body.labels.length, `${body.id} painted text`).toBeGreaterThan(0);
      for (const body of drawing.nodes) for (const label of body.labels) {
        // In 0.2.11, architecture database (`store`) is a captioned icon whose
        // caption sits outside its glyph outline (to the right in DOWN layout).
        if (fixture.id === 'nested' && body.id === 'store') {
          expect(label.left, `${label.id} right-caption clearance`).toBeGreaterThan(body.right);
          expect(label.top, `${label.id} vertical alignment`).toBeGreaterThanOrEqual(body.top - 4);
          expect(label.bottom, `${label.id} vertical alignment`).toBeLessThanOrEqual(body.bottom + 4);
          continue;
        }
        expect(label.left, `${label.id} left ink`).toBeGreaterThanOrEqual(body.left - 1);
        expect(label.right, `${label.id} right ink`).toBeLessThanOrEqual(body.right + 1);
        expect(label.top, `${label.id} top ink`).toBeGreaterThanOrEqual(body.top - 1);
        expect(label.bottom, `${label.id} bottom ink`).toBeLessThanOrEqual(body.bottom + 1);
      }
      if (fixture.id === 'mixed-shapes') {
        const io = node('d'), document = node('e'), start = node('a');
        expect(io.labels[0].left).toBeGreaterThan(io.left + (io.right - io.left) / 6);
        expect(io.labels[0].right).toBeLessThan(io.right - (io.right - io.left) / 6);
        expect(document.labels[0].bottom).toBeLessThan(document.top + (document.bottom - document.top) * .7);
        expect(Math.abs((start.labels[0].top + start.labels[0].bottom) / 2 - (start.top + start.bottom) / 2)).toBeLessThan(4);
      }
      if (fixture.id === 'social-network') {
        expect(drawing.edgeLabels.map(label => [label.id, label.text])).toEqual([
          ['rel_2:label', 'creates'], ['rel_13:label', 'membership in'],
        ]);
        for (const [id, from, to] of [['rel_2:label', 'User', 'Post'], ['rel_13:label', 'GroupMembership', 'Group']]) {
          const label = drawing.edgeLabels.find(label => label.id === id)!;
          expect(label.left, `${id} column gap`).toBeGreaterThan(node(from).right + 3);
          expect(label.right, `${id} column gap`).toBeLessThan(node(to).left - 3);
          for (const body of drawing.nodes) expect(label.left < body.right && label.right > body.left &&
            label.top < body.bottom && label.bottom > body.top, `${id} overlaps ${body.id}`).toBe(false);
        }
      }
      if (fixture.id === 'nested') {
        const cluster = node('cluster'), store = node('store');
        for (const id of ['cluster.api', 'cluster.worker']) {
          expect(node(id).top).toBeGreaterThan(cluster.labels[0].bottom + 4);
          expect(node(id).bottom).toBeLessThan(cluster.bottom - 4);
        }
        expect(store.labels[0].left).toBeGreaterThan(store.right);
      }
    }
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(fixture.source);
    const after = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
    expect(after).toEqual(meaning);
  }
});
