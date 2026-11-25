import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { ACTIVE_RENDERER_SOURCE_CASES_028, DISABLED_RENDERER_SOURCE_CASES_028 }
  from '../scripts/renderer-source-cases.mjs';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const fixtures = ACTIVE_RENDERER_SOURCE_CASES_028;

for (const name of fixtures) for (const theme of ['light', 'dark'] as const) {
  test(`${name}/${theme} retains scene paint and source through both styles and reopen`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((theme) => {
      localStorage.setItem('coral:user-preferences', JSON.stringify({ theme }));
    }, theme);
    const source = readFileSync(resolve(__dirname,
      `../packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: `${name}.coral`, buffer: Buffer.from(source) });
    await waitForEditorSettled(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    const exportCandidate = async (): Promise<unknown> => {
      if (name !== 'uml-class-mixed-anchors') return JSON.parse((await downloadFromPalette(page,
        'Export GraphIR 4 candidate')).bytes.toString('utf8'));
      // Neutral inheritance has no verified directed semantic-port role in the
      // exact frozen Core. Draft SVG remains supported; portable export refuses.
      let downloads = 0;
      const observedDownload = () => { downloads++; };
      page.on('download', observedDownload);
      try {
        await waitForEditorSettled(page);
        await page.keyboard.press('Control+k');
        await page.getByLabel('Search commands').fill('Export GraphIR 4 candidate');
        await page.getByRole('option', { name: 'Export GraphIR 4 candidate', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'coral.editor.source-export.unverified' }))
          .toContainText('PORT_DIRECTION_RULE_UNVERIFIED at /edges/0/second/port');
        await waitForEditorSettled(page);
        expect(downloads).toBe(0);
        await expect(editor).toHaveValue(source);
        return { disposition: 'unverified', code: 'PORT_DIRECTION_RULE_UNVERIFIED',
          path: '/edges/0/second/port' };
      } finally { page.removeListener('download', observedDownload); }
    };
    await expect(editor).toHaveValue(source);
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
    let baselineMeaning: unknown;
    for (const style of ['lowfi', 'hifi'] as const) {
      await page.getByLabel('Diagram style').selectOption(style);
      await waitForEditorSettled(page);
      if (name === 'uml-sequence-created-after-nested') {
        const worker = page.locator('[data-coral-sequence-participant="worker"]');
        await expect(worker).toHaveAttribute('aria-label', /worker/);
        await worker.focus();
        await worker.press('Enter');
        await expect(worker).toHaveAttribute('aria-current', 'true');
        await expect(page.getByRole('region', { name: 'Participant', exact: true }).getByLabel('Name')).toHaveValue('worker');
        await expect(editor).toHaveValue(source);
      }
      if (name === 'uml-sequence-lifecycle') {
        const close = page.locator('[data-coral-sequence-message="close"]');
        await expect(close).toHaveAttribute('aria-label', /destruction/);
        await close.focus();
        await close.press('Enter');
        await expect(close).toHaveAttribute('aria-current', 'true');
        const inspector = page.getByRole('region', { name: 'Message', exact: true });
        await expect(inspector.getByRole('combobox', { name: 'Kind', exact: true }).first()).toHaveValue('destroy');
        await expect(inspector.getByRole('combobox', { name: 'Kind', exact: true }).first()).toBeDisabled();
        const termination = await page.evaluate(() => {
          const marker = document.querySelector<SVGPathElement>('[data-coral-destruction="worker"]')!;
          const box = marker.getBBox();
          const line = document.querySelector('[data-coral-sequence-participant="worker"] line')!;
          const surviving = document.querySelector('[data-coral-sequence-participant="audit"] line')!;
          return { x: box.x + box.width / 2, y: box.y + box.height / 2,
            lifelineX: Number(line.getAttribute('x1')), lifelineEnd: Number(line.getAttribute('y2')),
            survivingEnd: Number(surviving.getAttribute('y2')) };
        });
        expect(termination.x).toBe(termination.lifelineX);
        expect(termination.y).toBe(termination.lifelineEnd);
        expect(termination.survivingEnd).toBeGreaterThan(termination.y);
        await expect(editor).toHaveValue(source);
      }
      if (name === 'uml-sequence-activation-notes') {
        for (const [kind, id, detail] of [['activation', 'work', 'Auth'],
          ['fragment', 'choice', 'alt'], ['note', 'note-1', 'Targets: Auth']]) {
          const item = page.locator(`[data-coral-sequence-${kind}="${id}"]`).first();
          const selectable = kind === 'fragment' ? item.locator('[data-coral-fragment-frame]').first() : item;
          await expect(selectable).toHaveAttribute('aria-label', /.+/);
          await selectable.focus();
          await selectable.press('Enter');
          await expect(selectable).toHaveAttribute('aria-current', 'true');
          await expect(page.getByRole('region', { name: kind[0].toUpperCase() + kind.slice(1), exact: true }))
            .toContainText(detail);
        }
        await expect(page.getByRole('region', { name: 'Note', exact: true }).getByLabel('Text'))
          .toHaveValue('Passwords are never logged');
        await expect(editor).toHaveValue(source);
      }
      const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
      const comparison = await page.evaluate((svg) => {
        // React Flow displays scene parts in world coordinates; the exported
        // scene adds one viewport translation. Derive that translation from
        // every node's viewBox and world position, and verify every edge uses it.
        const shifts = [...document.querySelectorAll('svg[data-coral-scene-node]')].map((node) => {
          const origin = node.getAttribute('viewBox')!.split(/[ ,]+/).map(Number);
          const owner = node.closest('.react-flow__node')!;
          const world = new DOMMatrix((owner as HTMLElement).style.transform || getComputedStyle(owner).transform);
          return { x: Number((origin[0] - world.e).toFixed(6)),
            y: Number((origin[1] - world.f).toFixed(6)) };
        });
        if (shifts.some((shift) => Math.abs(shift.x - shifts[0].x) > 0.01 || Math.abs(shift.y - shifts[0].y) > 0.01))
          throw new Error('Canvas nodes do not share the export viewport translation');
        const attributes = ['d', 'transform', 'x', 'y', 'dx', 'dy', 'x1', 'y1', 'x2', 'y2',
          'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'font-family',
          'font-size', 'font-weight', 'text-anchor', 'fill', 'stroke', 'stroke-width',
          'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-style',
          'text-decoration', 'data-coral-marker-contact'];
        const transforms = (element: Element) => {
          const chain: string[] = [];
          for (let parent = element.parentElement; parent && parent.tagName.toLowerCase() !== 'svg';
            parent = parent.parentElement) {
            if (parent.hasAttribute('data-coral-scene-edge')) {
              // SVGTransformList exposes float32 translations. Read the exact
              // authored translate while still refusing any non-translation.
              const translated = parent.getAttribute('transform')?.match(
                /^translate\(\s*([-+\d.eE]+)[ ,]+\s*([-+\d.eE]+)\s*\)$/);
              const x = Number(translated?.[1]), y = Number(translated?.[2]);
              if (!translated || !Number.isFinite(x) || !Number.isFinite(y) ||
                Math.abs(x + shifts[0].x) > 0.01 || Math.abs(y + shifts[0].y) > 0.01)
                throw new Error(`Canvas edge has unexpected viewport translation: ${parent.getAttribute('transform')}; expected inverse ${JSON.stringify(shifts)}`);
              continue;
            }
            if (parent.hasAttribute('transform')) chain.unshift(parent.getAttribute('transform')!);
          }
          return chain;
        };
        const marker = (element: Element, key: string) => {
          const reference = element.getAttribute(key);
          if (!reference) return null;
          const id = reference.match(/^url\(#(.+)\)$/)?.[1];
          const definition = [...element.ownerDocument.querySelectorAll('marker')]
            .find((candidate) => candidate.id === id);
          if (!definition) throw new Error(`Missing ${key} definition: ${reference}`);
          const properties = (node: Element) => Object.fromEntries([...node.attributes]
            .filter(({ name }) => name !== 'id').map(({ name, value }) => [name, value])
            .sort(([a], [b]) => a.localeCompare(b)));
          return { properties: properties(definition),
            children: [...definition.children].map((child) => ({ tag: child.tagName.toLowerCase(),
              properties: properties(child) })) };
        };
        const projection = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
          .map((element) => ({ id: element.getAttribute('data-coral-part-id')!,
            tag: element.tagName.toLowerCase(),
            text: element.tagName.toLowerCase() === 'text' ? element.textContent : null,
            transforms: transforms(element),
            markerStart: marker(element, 'marker-start'), markerEnd: marker(element, 'marker-end'),
            paint: Object.fromEntries(attributes.map((key) => [key, element.getAttribute(key)])),
          })).sort((a, b) => a.id.localeCompare(b.id));
        const canvas = document.querySelector('.coral-sequence-diagram') ??
          document.querySelector('.react-flow')!;
        return { canvas: projection(canvas),
          exported: projection(new DOMParser().parseFromString(svg, 'image/svg+xml')) };
      }, svg);
      expect(comparison.canvas.length).toBeGreaterThan(0);
      expect(comparison.canvas).toEqual(comparison.exported);
      expect(svg).toContain('text-rendering:geometricPrecision');
      expect(await page.locator('text.coral-font-text').evaluateAll((texts) =>
        [...new Set(texts.map((text) => getComputedStyle(text).textRendering.toLowerCase()))]))
        .toEqual(['geometricprecision']);
      if (name.startsWith('bpmn-')) {
        const crossings = await page.evaluate(() => {
          const captions = ['received', 'completed'].flatMap((id) => {
            const text = document.querySelector<SVGTextElement>(`text[data-coral-part-id="${id}:label:1"]`);
            return text ? [{ id, box: text.getBoundingClientRect() }] : [];
          });
          const hits: string[] = [];
          for (const shaft of document.querySelectorAll<SVGPathElement>('path[data-coral-part-id$=":shaft"]')) {
            const matrix = shaft.getScreenCTM();
            if (!matrix) throw new Error('Visible shaft has no screen transform');
            const length = shaft.getTotalLength();
            for (let distance = 0; distance <= length; distance += 0.5) {
              const point = shaft.getPointAtLength(distance).matrixTransform(matrix);
              for (const { id, box } of captions) if (point.x > box.left - 1 && point.x < box.right + 1 &&
                point.y > box.top - 1 && point.y < box.bottom + 1) {
                hits.push(`${shaft.dataset.coralPartId} crosses ${id} caption`);
                break;
              }
              if (hits.length) break;
            }
          }
          return hits;
        });
        expect(crossings).toEqual([]);
      }
      const meaning = await exportCandidate();
      if (baselineMeaning) expect(meaning).toEqual(baselineMeaning);
      else baselineMeaning = meaning;
      await expect(editor).toHaveValue(source);
    }
    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    const semantic = await exportCandidate();
    await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
    await openSavedDocument(page, saved.path);
    await waitForEditorSettled(page);
    await expect(editor).toHaveValue(source);
    expect(await exportCandidate())
      .toEqual(semantic);
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  });
}

for (const name of DISABLED_RENDERER_SOURCE_CASES_028) {
  test(`${name} stays exact saveable text with blocked semantic export`, async ({ page }) => {
    const source = readFileSync(resolve(__dirname,
      `../packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: `${name}.coral`, buffer: Buffer.from(source) });
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(source);
    await page.getByRole('tab', { name: 'Diagnostics' }).click();
    await expect(page.getByText(/Diagram type erd is disabled in Coral 0\.2\.8/).first()).toBeVisible();
    for (const command of ['Export SVG', 'Export GraphIR 4 candidate']) {
      await page.keyboard.press('Control+k');
      await page.getByLabel('Search commands').fill(command);
      // A command may be disabled or report an actionable refusal. Neither
      // outcome may download a stale graph from the previous valid diagram.
      const downloads: string[] = [];
      const record = (download: { suggestedFilename(): string }) => downloads.push(download.suggestedFilename());
      page.on('download', record);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await waitForEditorSettled(page);
      page.off('download', record);
      expect(downloads).toEqual([]);
      await expect(editor).toHaveValue(source);
    }
    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(source);
    await expect(page.getByText(/Diagram type erd is disabled in Coral 0\.2\.8/).first()).toBeVisible();
  });
}
