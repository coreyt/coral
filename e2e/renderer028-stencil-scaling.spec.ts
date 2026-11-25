import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const diamondSource = '@diagram flowchart\ncheck decision as "Q" @ (80, 120) pinned {\n' +
  '  departure port [direction: out, anchor: NE]\n}\n' +
  'done process @ (700, 120) pinned {\n  arrival port [direction: in, anchor: W]\n}\n' +
  'flow = check:departure -> done:arrival\n';

for (const [width, height, pinX, pinY] of [[320, 120, 190, 30], [120, 320, 90, 130]]) {
  test(`typed ${width}x${height} diamond uses the same fit in the browser canvas projector and static SVG`, async ({ page }) => {
    const { prepareSpatialScene028, projectInstalledSourceToSuccessor028, renderSvg,
      successorSourceDisplayWithSemanticPorts028, semanticLayoutPorts028, symbolRegistry } = await import('../packages/render/dist/index.js');
    const { layoutGraphForSvg } = await import('../packages/render/dist/svg/layout.js');
    const { resolveSpatialLayout } = await import('../packages/render/dist/layout/index.js');
    const { SpatialSceneSvg028 } = await import('../packages/viz/dist/components/SpatialSceneSvg028.js');
    const meaning = projectInstalledSourceToSuccessor028(diamondSource).graph!;
    meaning.nodes[0].dimensions = { width, height };
    meaning.nodes[1].dimensions = { width: 120, height: 80 };
    const before = JSON.stringify(meaning);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
    const loaded = await layoutGraphForSvg(display, { semanticInterpretations });
    const reflow = await resolveSpatialLayout({ revision: 'stencil-reflow', graph: { ...display, nodes: loaded.nodes.map((node) => {
      const interpreted = semanticInterpretations.get(node.id)!;
      return { ...node, ports: semanticLayoutPorts028(interpreted, symbolRegistry.get(interpreted.effectiveSymbolId!),
        interpreted.effectiveVariantId, 'DOWN').ports };
    }) },
      operation: 'reflow', defaults: { algorithm: 'layered', direction: 'DOWN' } });
    const reflowed = { ...loaded, nodes: loaded.nodes.map((node) => {
      const rect = reflow.nodes.find((item) => item.id === node.id)!;
      return { ...node, position: rect.absolutePosition, dimensions: { width: rect.width, height: rect.height } };
    }), edgeRoutes: new Map(reflow.edges.map((edge) => [edge.id, edge.sections])) };
    for (const drawing of [loaded, reflowed]) {
      for (const style of ['lowfi', 'hifi'] as const) {
        const options = { style, successorSource: meaning, semanticGraph: display, edgeRoutes: drawing.edgeRoutes };
        const scene = prepareSpatialScene028(drawing, options);
        const canvas = renderToStaticMarkup(React.createElement(SpatialSceneSvg028, { scene, namespace: 'canvas' }));
        const exported = renderSvg(drawing, options);
        await page.setContent(`<html><body style="margin:16px;font:14px sans-serif;color:black;background:white">
          <section id="canvas">${canvas}</section>
          <section id="exported">${exported}</section></body></html>`);
        const geometry = await page.evaluate(() => ['canvas', 'exported'].map((id) => {
          const root = document.querySelector(`#${id} svg`)!;
          const body = root.querySelector<SVGGraphicsElement>('[data-coral-part-id="check:outline"]')!;
          const matrix = body.getCTM()!;
          const contact = new DOMPoint(75, 25).matrixTransform(matrix);
          const route = root.querySelector('[data-coral-part-id="flow:shaft"]')!.getAttribute('d')!;
          const first = /^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(route)!;
          return { x: contact.x, y: contact.y, scaleX: Math.hypot(matrix.a, matrix.b),
            scaleY: Math.hypot(matrix.c, matrix.d), routeX: Number(first[1]), routeY: Number(first[2]) };
        }));
        expect(geometry[0]).toEqual(geometry[1]);
        for (const actual of geometry) {
          expect(actual.scaleX).toBeCloseTo(1.2, 6);
          expect(actual.scaleY).toBeCloseTo(1.2, 6);
          expect(actual.x).toBeCloseTo(80 + pinX + scene.viewport.shiftX, 3);
          expect(actual.y).toBeCloseTo(120 + pinY + scene.viewport.shiftY, 3);
          expect(actual.routeX).toBeCloseTo(actual.x, 2);
          expect(actual.routeY).toBeCloseTo(actual.y, 2);
        }
        const legacyPoint = await page.evaluate(({ width, height, shiftX, shiftY }) => {
          const body = document.querySelector<SVGGraphicsElement>('#exported [data-coral-part-id="check:outline"]')!;
          const parent = body.parentElement!;
          const original = parent.getAttribute('transform')!;
          parent.setAttribute('transform', `translate(${80 + shiftX},${120 + shiftY}) scale(${width / 100},${height / 100})`);
          const point = new DOMPoint(75, 25).matrixTransform(body.getCTM()!);
          parent.setAttribute('transform', original);
          return { x: point.x, y: point.y };
        }, { width, height, shiftX: scene.viewport.shiftX, shiftY: scene.viewport.shiftY });
        // A browser measurement of the former export policy misses the same
        // exact anchor by 50px.
        expect(Math.hypot(legacyPoint.x - geometry[0].x, legacyPoint.y - geometry[0].y)).toBeCloseTo(50, 3);
      }
    }
    expect(JSON.stringify(meaning)).toBe(before);
  });
}

test('source-native non-square actor has exact handle/outline/SVG contact parity through Reflow and reopen', async ({ page }) => {
  test.setTimeout(60_000);
  const source = '@diagram architecture\nperson actor as "Customer operations" @ (40, 80) pinned {\n' +
    '  departure port [direction: out, anchor: E]\n}\napi service @ (740, 80) pinned {\n' +
    '  arrival port [direction: in, anchor: W]\n}\nflow = person:departure -> api:arrival\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'actor-stencil-fit-v1.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const check = async () => {
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const actual = await page.evaluate((exported) => {
      const node = document.querySelector<HTMLElement>('.react-flow__node[data-id="person"]')!;
      const canvasSvg = node.querySelector<SVGSVGElement>('svg[data-coral-scene-node]')!;
      const body = canvasSvg.querySelector<SVGGraphicsElement>('[data-coral-part-id="person:outline"]')!;
      const handle = node.querySelector<HTMLElement>('.react-flow__handle.source[data-handleid="departure"]')!.getBoundingClientRect();
      const screenPoint = new DOMPoint(handle.x + handle.width / 2, handle.y + handle.height / 2);
      const handlePoint = screenPoint.matrixTransform(canvasSvg.getScreenCTM()!.inverse());
      const bodyPoint = new DOMPoint(50, 35).matrixTransform(body.getCTM()!);
      // getCTM() includes this node SVG's nonzero viewBox origin; compare in
      // scene coordinates using the inverse root viewport transformation.
      const localBody = new DOMPoint(bodyPoint.x, bodyPoint.y).matrixTransform(canvasSvg.getCTM()!.inverse());
      const doc = new DOMParser().parseFromString(exported, 'image/svg+xml');
      const route = doc.querySelector('[data-coral-part-id="flow:shaft"]')!.getAttribute('d')!;
      const first = /^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(route)!;
      const exportedRoot = doc.documentElement as unknown as SVGSVGElement;
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:-10000px;top:0';
      holder.append(document.importNode(exportedRoot, true)); document.body.append(holder);
      const exportedBody = holder.querySelector<SVGGraphicsElement>('[data-coral-part-id="person:outline"]')!;
      const exportedPoint = new DOMPoint(50, 35).matrixTransform(exportedBody.getCTM()!);
      holder.remove();
      const width = parseFloat(node.style.width), height = parseFloat(node.style.height);
      const position = new DOMMatrixReadOnly(node.style.transform);
      const origin = canvasSvg.viewBox.baseVal;
      const shiftX = origin.x - position.m41, shiftY = origin.y - position.m42;
      return { width, height, handle: { x: handlePoint.x, y: handlePoint.y }, body: { x: localBody.x, y: localBody.y },
        route: { x: Number(first[1]), y: Number(first[2]) }, exportedBody: { x: exportedPoint.x, y: exportedPoint.y },
        bounds: { left: position.m41 + shiftX, right: position.m41 + shiftX + width,
          top: position.m42 + shiftY, bottom: position.m42 + shiftY + height } };
    }, svg);
    expect(actual.width).not.toBe(actual.height);
    // All four surfaces (React Flow handle, canvas outline, exported SVG outline,
    // and exported route contact) must agree to sub-pixel CSS quantization.
    expect(actual.body.x).toBeGreaterThanOrEqual(actual.bounds.left);
    expect(actual.body.x).toBeLessThanOrEqual(actual.bounds.right);
    expect(actual.body.y).toBeGreaterThanOrEqual(actual.bounds.top);
    expect(actual.body.y).toBeLessThanOrEqual(actual.bounds.bottom);
    for (const point of [actual.handle, actual.exportedBody, actual.route]) {
      // Browser CSS layout quantizes handle centers to 1/64px before zoom.
      expect(Math.abs(point.x - actual.body.x)).toBeLessThan(.1);
      expect(Math.abs(point.y - actual.body.y)).toBeLessThan(.1);
    }
    await expect(editor).toHaveValue(source);
  };
  const original = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style', { exact: true }).selectOption(style);
    await waitForEditorSettled(page);
    await check();
    await page.getByRole('button', { name: 'Reflow layout' }).click();
    await waitForEditorSettled(page);
    await check();
  }
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await check();
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'))).toEqual(original);
});
