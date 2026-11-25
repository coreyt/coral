import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  downloadFromPalette, openBuffer, openSavedDocument,
  saveDocument, startCleanEditor, waitForEditorSettled,
} from './support/user-journey.js';

const source = readFileSync(resolve(__dirname,
  '../packages/browser/test/fixtures/acceptance028/architecture-ports.coral'), 'utf8');

test('flowchart canvas and exported SVG paint the same scene parts in both approved styles', async ({ page }) => {
  test.setTimeout(90_000);
  const flowchart = readFileSync(resolve(__dirname,
    '../packages/browser/test/fixtures/acceptance028/flowchart-draft.coral'), 'utf8');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'flowchart-draft.coral', buffer: Buffer.from(flowchart) });
  await waitForEditorSettled(page);
  await expect(page.locator('[data-coral-scene-node="review"]')).toBeVisible();
  await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(3);
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style').selectOption(style);
    await expect(page.locator('[data-coral-scene-node="approved"]')).toBeVisible();
    const canvasIds = await page.locator('.react-flow [data-coral-part-id]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-coral-part-id'))
        .filter((id): id is string => Boolean(id)).sort());
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const exportedIds = [...svg.matchAll(/data-coral-part-id="([^"]+)"/g)]
      .map((match) => match[1]!).sort();
    expect(canvasIds).toEqual(exportedIds);
  }
});

for (const [name, nodes, edges] of [
  ['flowchart-branch', 5, 5], ['flowchart-cycle', 4, 4],
  ['block-branch', 3, 2], ['block-cycle', 3, 3],
  ['uml-class-chain', 3, 2], ['uml-class-fork', 4, 3],
  ['uml-class-mixed-anchors', 5, 4],
  ['bpmn-branch', 6, 5], ['bpmn-loop', 5, 5],
] as const) {
  test(`${name} preserves its source topology through canvas, export, save, and reopen`, async ({ page }) => {
    test.setTimeout(90_000);
    const source = readFileSync(resolve(__dirname,
      `../packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: `${name}.coral`, buffer: Buffer.from(source) });
    await waitForEditorSettled(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(source);
    await expect(page.locator('[data-coral-scene-node]')).toHaveCount(nodes);
    await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(edges);
    for (const style of ['lowfi', 'hifi'] as const) {
      await page.getByLabel('Diagram style').selectOption(style);
      const canvasIds = await page.locator('.react-flow [data-coral-part-id]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-coral-part-id'))
          .filter((id): id is string => Boolean(id)).sort());
      const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
      expect(canvasIds).toEqual([...svg.matchAll(/data-coral-part-id="([^"]+)"/g)]
        .map((match) => match[1]!).sort());
    }
    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    const notation = name.startsWith('uml-class') ? 'uml-class'
      : name.startsWith('block') ? 'block'
        : name.startsWith('bpmn') ? 'bpmn' : 'flowchart';
    await editor.fill(`@diagram ${notation}\ntemporary class`);
    await waitForEditorSettled(page);
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(source);
    await expect(page.locator('[data-coral-scene-node]')).toHaveCount(nodes);
    await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(edges);
  });
}

test('UML sequence canvas and exported SVG project the same owned primitives', async ({ page }) => {
  test.setTimeout(90_000);
  const source = readFileSync(resolve(__dirname,
    '../packages/browser/test/fixtures/acceptance028/uml-sequence-flat.coral'), 'utf8');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'uml-sequence-flat.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  await expect(page.locator('.coral-sequence-diagram')).toBeVisible();
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style').selectOption(style);
    const exported = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const parts = await page.evaluate((svg) => {
      const projection = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
        .map((element) => ({
          id: element.getAttribute('data-coral-part-id'),
          tag: element.tagName.toLowerCase(),
          path: element.getAttribute('d'),
          text: element.tagName.toLowerCase() === 'text' ? element.textContent : null,
        })).sort((a, b) => a.id!.localeCompare(b.id!));
      return { canvas: projection(document.querySelector('.coral-sequence-diagram')!),
        svg: projection(new DOMParser().parseFromString(svg, 'image/svg+xml')) };
    }, exported);
    expect(parts.canvas.length).toBeGreaterThan(0);
    expect(parts.canvas).toEqual(parts.svg);
  }
});

test('participant-group source keeps scene, meaning, history, and exact saved text', async ({ page }) => {
  test.setTimeout(90_000);
  const original = '@diagram uml-sequence\napi participant\nworker participant\n' +
    'team = participants worker, api [label: "Operations"]\napi -> worker';
  const edited = original.replace('Operations', 'Support');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'grouped-sequence.coral', buffer: Buffer.from(original) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(original);
  const group = page.locator('[data-coral-sequence-group="team"]');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-label', /Operations/);
  await expect(group.locator('[data-coral-group-member]')).toHaveCount(2);
  await editor.fill(edited);
  await waitForEditorSettled(page);
  await expect(group).toHaveAttribute('aria-label', /Support/);
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveValue(original);
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toHaveValue(edited);
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(graph.interaction.groups).toEqual([
    { id: 'team', label: 'Support', participantIds: ['worker', 'api'] },
  ]);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-sequence-group="team"');
  expect(svg).toContain('data-coral-group-member="worker"');
  expect(svg).toContain('data-coral-group-member="api"');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram uml-sequence\ntemporary participant');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(group).toHaveAttribute('aria-label', /Support/);
});

test('six-position dashed creation survives source-owned save, export, and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\nclient participant\n' +
    'spawn = client -.----> worker [create]';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'long-create.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.locator('[data-coral-sequence-participant="worker"]')).toBeVisible();
  await expect(page.locator('[data-coral-sequence-message="spawn"]')).toBeVisible();
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.edges[0]).toMatchObject({ id: 'spawn', proximityHint: 6 });
  expect(exported.interaction.messages[0]).toMatchObject({ id: 'spawn', kind: 'create' });
  expect((await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8'))
    .toContain('data-coral-sequence-message="spawn"');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram uml-sequence\nclient participant\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'))).toEqual(exported);
});

test('UML sequence self-message survives canvas, export, save, and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const content = readFileSync(resolve(__dirname,
    '../packages/browser/test/fixtures/acceptance028/uml-sequence-loop.coral'), 'utf8');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'uml-sequence-loop.coral', buffer: Buffer.from(content) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(content);
  await expect(page.locator('[data-coral-sequence-message]')).toHaveCount(5);
  const checkProjection = async () => {
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const comparison = await page.evaluate((exported) => {
      const projection = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
        .map((element) => ({
          id: element.getAttribute('data-coral-part-id'),
          tag: element.tagName.toLowerCase(),
          path: element.getAttribute('d'),
          dash: element.getAttribute('stroke-dasharray'),
          text: element.tagName.toLowerCase() === 'text' ? element.textContent : null,
        })).sort((a, b) => a.id!.localeCompare(b.id!));
      const geometry = (root: ParentNode) => ({
        retry: root.querySelector('[data-coral-sequence-message="retry"] path[d]')?.getAttribute('d'),
        hitDash: root.querySelector('[data-coral-sequence-message="hit"] path[d]')?.getAttribute('stroke-dasharray'),
        replyDash: root.querySelector('[data-coral-sequence-message="reply"] path[d]')?.getAttribute('stroke-dasharray'),
      });
      const canvas = document.querySelector('.coral-sequence-diagram')!;
      const svg = new DOMParser().parseFromString(exported, 'image/svg+xml');
      return { canvas: projection(canvas), exported: projection(svg),
        canvasGeometry: geometry(canvas), exportedGeometry: geometry(svg) };
    }, svg);
    expect(comparison.canvas.length).toBeGreaterThan(0);
    expect(comparison.canvas).toEqual(comparison.exported);
    expect(comparison.canvasGeometry).toEqual(comparison.exportedGeometry);
    expect(comparison.exportedGeometry.retry?.match(/\b[CL]/g)).toHaveLength(3);
    expect(comparison.exportedGeometry.hitDash).toBeTruthy();
    expect(comparison.exportedGeometry.replyDash).toBeTruthy();
  };
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style').selectOption(style);
    await checkProjection();
  }
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: content });
  await editor.fill('@diagram uml-sequence\ntemporary participant');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(content);
  await expect(page.locator('[data-coral-sequence-message]')).toHaveCount(5);
  await checkProjection();
});

test('bounded Mermaid sequence fragments become editable Coral with exact save and export', async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  const mermaid = 'sequenceDiagram\nactor Client\nparticipant Server\nClient->>Server: request\nServer-->>Client: response';
  await openBuffer(page, { name: 'exchange.mmd', buffer: Buffer.from(mermaid) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const imported = await editor.inputValue();
  expect(imported).toContain('@diagram uml-sequence\n');
  expect(imported).toContain('msg_1 = Client -#> Server as "request"');
  expect(imported).toContain('msg_2 = Server -.-> Client as "response"');
  await expect(page.locator('[data-coral-sequence-message]')).toHaveCount(2);

  const edited = imported.replace('as "request"', 'as "request edited"');
  await editor.fill(edited);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(edited);
  await page.getByRole('region', { name: 'Sequence diagram canvas' }).locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(imported);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('request edited');
  expect(svg).toContain('response');

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram uml-sequence\ntemporary participant');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(page.locator('[data-coral-sequence-message]')).toHaveCount(2);

  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'choice.mmd', mimeType: 'text/plain',
    buffer: Buffer.from('sequenceDiagram\nparticipant A\nparticipant B\nNote over A,B: shared\n' +
      'alt accepted\nA->>B: yes\nelse rejected\nA->>B: no\nend\nloop retry\nA->>B: again\nend'),
  });
  await expect(editor).toHaveValue(/alt "accepted" \{/);
  const choice = await editor.inputValue();
  expect(choice).toContain('note "shared" on A, B');
  expect(choice).toContain('} else "rejected" {');
  expect(choice).toContain('loop "retry" {');
  await expect(page.locator('[data-coral-sequence-fragment="fragment-1"]')).toBeVisible();
  await expect(page.locator('[data-coral-sequence-fragment="fragment-2"]')).toBeVisible();
  const choiceSvg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(choiceSvg).toContain('data-coral-sequence-fragment="fragment-1"');
  expect(choiceSvg).toContain('data-coral-sequence-fragment="fragment-2"');
  expect(choiceSvg).toContain('shared');
  const choiceSaved = await saveDocument(page);
  expect(choiceSaved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: choice });
  await editor.fill('@diagram uml-sequence\ntemporary participant');
  await waitForEditorSettled(page);
  await openSavedDocument(page, choiceSaved.path);
  await expect(editor).toHaveValue(choice);

  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'retry.mmd', mimeType: 'text/plain',
    buffer: Buffer.from('sequenceDiagram\nparticipant A\nparticipant B\nopt cache miss\nA->>B: retry\nend'),
  });
  await expect(editor).toHaveValue(/opt "cache miss" \{/);
  const retry = await editor.inputValue();
  await expect(page.locator('[data-coral-sequence-fragment="fragment-1"]')).toBeVisible();
  const retrySvg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(retrySvg).toContain('cache miss');
  const retrySaved = await saveDocument(page);
  expect(retrySaved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: retry });
  await editor.fill('@diagram uml-sequence\ntemporary participant');
  await waitForEditorSettled(page);
  await openSavedDocument(page, retrySaved.path);
  await expect(editor).toHaveValue(retry);

  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'activation.mmd', mimeType: 'text/plain',
    buffer: Buffer.from('sequenceDiagram\nparticipant A\nparticipant B\nA->>+B: yes\nB-->>-A: no'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'coral.open.import.sequence.unsupported' })).toBeVisible();
  await expect(editor).toHaveValue(retry);
});

for (const fixture of [
  { name: 'block-ports', notation: 'block', nodes: 2, edges: 1 },
  { name: 'uml-class-named', notation: 'uml-class', nodes: 2, edges: 1 },
  { name: 'bpmn-event', notation: 'bpmn', nodes: 2, edges: 1 },
  { name: 'bpmn-branch', notation: 'bpmn', nodes: 6, edges: 5 },
  { name: 'bpmn-loop', notation: 'bpmn', nodes: 5, edges: 5 },
]) {
  test(`${fixture.name} canvas and exported SVG share scene geometry and text`, async ({ page }) => {
    test.setTimeout(90_000);
    const content = readFileSync(resolve(__dirname,
      `../packages/browser/test/fixtures/acceptance028/${fixture.name}.coral`), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: `${fixture.name}.coral`, buffer: Buffer.from(content) });
    await waitForEditorSettled(page);
    await expect(page.locator('[data-coral-scene-node]')).toHaveCount(fixture.nodes);
    await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(fixture.edges);
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
    for (const style of ['lowfi', 'hifi'] as const) {
      await page.getByLabel('Diagram style').selectOption(style);
      const exported = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
      const comparison = await page.evaluate((svg) => {
        const properties = (element: Element) => ({
          id: element.getAttribute('data-coral-part-id'),
          tag: element.tagName.toLowerCase(),
          path: element.getAttribute('d'),
          text: element.textContent?.trim() ?? '',
        });
        const parts = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
          .map(properties).sort((a, b) => a.id!.localeCompare(b.id!));
        return { canvas: parts(document.querySelector('.react-flow')!),
          exported: parts(new DOMParser().parseFromString(svg, 'image/svg+xml')) };
      }, exported);
      expect(comparison.canvas).toEqual(comparison.exported);
      if (fixture.name === 'block-ports') {
        const contact = await page.evaluate((svg) => {
          const owner = document.querySelector('.react-flow__node[data-id="producer"]')!;
          const handle = owner.querySelector<HTMLElement>('[data-handleid="telemetry"]')!;
          const viewBox = owner.querySelector('svg[data-coral-scene-node="producer"]')!
            .getAttribute('viewBox')!.split(/\s+/).map(Number);
          const exportDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          const route = exportDoc.querySelector('[data-coral-part-id="transfer:shaft"]')!
            .getAttribute('d')!;
          const start = /^M([\d.-]+) ([\d.-]+)/.exec(route)!;
          return { handleX: viewBox[0]! + parseFloat(handle.style.left),
            handleY: viewBox[1]! + parseFloat(handle.style.top),
            routeX: Number(start[1]), routeY: Number(start[2]) };
        }, exported);
        expect(contact.handleX).toBeCloseTo(contact.routeX, 5);
        expect(contact.handleY).toBeCloseTo(contact.routeY, 5);
      }
    }
  });
}

test('saved-header source owns a real editor edit, history, save, reopen, and exports', async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'architecture-ports.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.locator('.react-flow__node[data-id="api"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="store"]')).toBeVisible();
  await expect(page.locator('.react-flow__edge[data-testid="rf__edge-read"]')).toBeVisible();

  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const apiNode = page.locator('.react-flow__node[data-id="api"]');
  await apiNode.dblclick();
  const inlineLabel = apiNode.locator('input[type="text"]');
  await inlineLabel.fill('API reviewed');
  await inlineLabel.press('Enter');
  await expect(editor).toHaveValue(/as "API reviewed"/);
  await waitForEditorSettled(page);
  const edited = await editor.inputValue();
  expect(edited).toContain('  audit port [direction: out, anchor: side]');
  expect(edited).toContain('read = api:audit -> store:query [reads] as "Order IDs"');

  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByLabel('Conformance level for this check').selectOption('strict');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conformance report' }))
    .toContainText('Strict · conformant');
  await expect(page.getByRole('region', { name: 'Conformance report' }))
    .toContainText('Coral bounded profile; full external-standard conformance is not claimed.');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });

  const graphDownload = await downloadFromPalette(page, 'Export GraphIR 4 candidate');
  const graph = JSON.parse(graphDownload.bytes.toString('utf8'));
  expect(graph).toMatchObject({ version: '4.0.0', profile: { id: 'architecture' },
    nodes: expect.arrayContaining([expect.objectContaining({ id: 'api', label: 'API reviewed',
      semanticPorts: [expect.objectContaining({ id: 'audit' })] })]),
    edges: [expect.objectContaining({ id: 'read', first: { node: 'api', port: 'audit' },
      second: { node: 'store', port: 'query' } })],
  });
  const svg = await downloadFromPalette(page, 'Export SVG');
  expect(svg.bytes.toString('utf8')).toContain('>API reviewed</text>');

  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(page.locator('.react-flow__node[data-id="api"]')).toBeVisible();
  await expect(page.locator('.react-flow__edge[data-testid="rf__edge-read"]')).toBeVisible();
});

test('a canvas edge double click edits only its authored label through history and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const labelSource = '@diagram flowchart\napi process\nstore process\n' +
    'read = api -> store as "Order IDs"\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'flowchart-label.coral', buffer: Buffer.from(labelSource) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const edge = page.locator('.react-flow__edge[data-testid="rf__edge-read"]');
  await expect(edge).toBeVisible();
  const edgeHit = edge.locator('[data-coral-edge-hit="read"]');
  const midPoint = async () => edgeHit.evaluate((element) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM();
    if (!matrix) return null;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(matrix);
    return { x: point.x, y: point.y,
      hitsEdge: document.elementFromPoint(point.x, point.y) === path };
  });
  const openLabelEditor = async () => {
    await page.getByRole('button', { name: 'Fit diagram to view' }).click();
    await expect.poll(async () => (await midPoint())?.hitsEdge).toBe(true);
    const point = (await midPoint())!;
    await page.mouse.dblclick(point.x, point.y);
  };
  await openLabelEditor();
  const label = page.getByRole('textbox', { name: 'Connector label for read' });
  await expect(label).toHaveValue('Order IDs');
  await label.fill('Reads invoices');
  await label.press('Enter');
  const edited = labelSource.replace('as "Order IDs"', 'as "Reads invoices"');
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(labelSource);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('Reads invoices');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(edge).toBeVisible();
  await openLabelEditor();
  await page.getByRole('main', { name: 'Diagram editor' })
    .getByRole('button', { name: 'Remove connector label' }).click({ timeout: 5_000 });
  const removed = labelSource.replace(' as "Order IDs"', '');
  await expect(editor).toHaveValue(removed);
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(removed);
  const withoutLabel = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(withoutLabel).not.toContain('Reads invoices');
  const savedWithoutLabel = await saveDocument(page);
  expect(savedWithoutLabel.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: removed });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, savedWithoutLabel.path);
  await expect(editor).toHaveValue(removed);
});

test('malformed and strict-conflict sequence source stay saveable as exact text', async ({ page }) => {
  test.setTimeout(90_000);
  const malformed = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'choice = alt "yes" {\n  client -> server\n}';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'unfinished.coral', buffer: Buffer.from(malformed) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(malformed);
  const savedMalformed = await saveDocument(page);
  expect(savedMalformed.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: malformed });

  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, savedMalformed.path);
  await expect(editor).toHaveValue(malformed);

  const conflict = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'client -#> server [async]';
  await editor.fill(conflict);
  await waitForEditorSettled(page);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByLabel('Conformance level for this check').selectOption('strict');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  const report = page.getByRole('region', { name: 'Conformance report' });
  await expect(report).toContainText('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
  await expect(report).toContainText('Strict · failed');
  const savedConflict = await saveDocument(page);
  expect(savedConflict.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: conflict });
});

test('unverified semantic port roles stay saveable while GraphIR export refuses', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database\n' +
    'link = api:out -- store:query\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'port-role.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);

  const downloads: string[] = [];
  const record = (download: { suggestedFilename(): string }) => downloads.push(download.suggestedFilename());
  page.on('download', record);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Export GraphIR 4 candidate');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toContainText('PORT_DIRECTION_RULE_UNVERIFIED');
  page.off('download', record);
  expect(downloads).toEqual([]);

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
});

test('a top-level group deletion keeps exact source through history and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const grouped = '@diagram architecture\nteam group {\n  api service\n}\nstore database\n';
  const edited = '@diagram architecture\nstore database\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'group.coral', buffer: Buffer.from(grouped) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(grouped);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const group = page.locator('.react-flow__node[data-id="team"]');
  await expect(group).toBeVisible();
  await group.click({ position: { x: 5, y: 5 } });
  await expect(group).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(editor).toHaveValue(edited);
  await expect(group).toHaveCount(0);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(grouped);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.nodes.map((node: { id: string }) => node.id)).toEqual(['store']);
  expect(exported.edges).toEqual([]);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('store');
  expect(svg).not.toContain('data-coral-node="team"');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(page.locator('.react-flow__node[data-id="store"]')).toBeVisible();
});

test('a nested group deletion keeps its parent and surviving connector through reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\nouter group {\n  inner group {\n' +
    '    api service {\n      send port [direction: out]\n    }\n  }\n' +
    '  peer service\n}\nstore database\nread = outer.inner.api:send -> store:query\n' +
    '// retain\nkeep = outer.peer -> store\n';
  const edited = '@diagram architecture\nouter group {\n  peer service\n}\n' +
    'store database\n// retain\nkeep = outer.peer -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-group.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const inner = page.locator('.react-flow__node[data-id="outer.inner"]');
  await expect(inner).toBeVisible();
  const bounds = await inner.boundingBox();
  expect(bounds).not.toBeNull();
  await inner.click({ position: { x: bounds!.width - 8, y: 5 } });
  await expect(inner).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(editor).toHaveValue(edited);
  await expect(inner).toHaveCount(0);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.nodes[0].children.map((node: { id: string }) => node.id)).toEqual(['outer.peer']);
  expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep']);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-edge="keep"');
  expect(svg).not.toContain('data-coral-edge="read"');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
});

test('a canvas group deletion preserves comments inside the authored group', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\nteam group {\n  // retain this note\n  api service\n}\n' +
    'store database\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'commented-group.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const group = page.locator('.react-flow__node[data-id="team"]');
  await expect(group).toBeVisible();
  await group.click({ position: { x: 5, y: 5 } });
  await expect(group).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(editor).toHaveValue(source);
  await expect(group).toBeVisible();
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
});

test('a keyed visual end cannot hide an invalid saved-source port role', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\na service\nb service\n' +
    'link = a:in -> b:out [secondEnd: zeroOrOne]';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'port-role.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByLabel('Conformance level for this check').selectOption('none');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conformance report' }))
    .toContainText('coral.port.reference.direction');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
});

test('deleting a nested port node preserves its authored group and surviving connector', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\nteam group {\n  api service {\n' +
    '    send port [direction: out, anchor: side]\n  }\n  peer service\n}\n' +
    'store database\nread = team.api:send -> store:query\n// retain\nkeep = team.peer -> store\n';
  const edited = '@diagram architecture\nteam group {\n  peer service\n}\n' +
    'store database\n// retain\nkeep = team.peer -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-leaf.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const api = page.locator('.react-flow__node[data-id="team.api"]');
  await expect(api).toBeVisible();
  await api.focus();
  await page.keyboard.press('Enter');
  await expect(api).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(editor).toHaveValue(edited);
  await expect(api).toHaveCount(0);
  await page.getByRole('button', { name: /^Undo \(/ }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: /^Redo \(/ }).click();
  await expect(editor).toHaveValue(edited);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.nodes[0].children.map((node: { id: string }) => node.id)).toEqual(['team.peer']);
  expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep']);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-edge="keep"');
  expect(svg).not.toContain('data-coral-edge="read"');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
});

const profileCases = [
  ['block', 'block-ports.coral', 'producer'],
  ['flowchart', 'flowchart-draft.coral', 'review'],
  ['bpmn', 'bpmn-event.coral', 'work'],
  ['uml-class', 'uml-class-named.coral', 'Order'],
] as const;

for (const [profile, filename, nodeId] of profileCases) {
  test(`${profile} keeps a visible source-owned edit through history, save, and export`, async ({ page }) => {
    test.setTimeout(90_000);
    const original = readFileSync(resolve(__dirname,
      '../packages/browser/test/fixtures/acceptance028', filename), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: filename, buffer: Buffer.from(original) });
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(original);
    await expect(page.locator(`.react-flow__node[data-id="${nodeId}"]`)).toBeVisible();
    await page.getByRole('button', { name: 'Fit diagram to view' }).click();
    const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
    await node.dblclick();
    const inlineLabel = node.locator('input[type="text"]');
    await inlineLabel.fill('Reviewed');
    await inlineLabel.press('Enter');
    await waitForEditorSettled(page);
    const edited = await editor.inputValue();
    expect(edited.replace(' as "Reviewed"', '')).toBe(original);
    await page.getByRole('button', { name: /^Undo \(/ }).click();
    await expect(editor).toHaveValue(original);
    await page.getByRole('button', { name: /^Redo \(/ }).click();
    await expect(editor).toHaveValue(edited);

    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
      .bytes.toString('utf8'));
    expect(exported.profile).toMatchObject(profile === 'uml-class'
      ? { id: 'uml', kind: 'class' } : { id: profile });
    expect(exported.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: nodeId, label: 'Reviewed' }),
    ]));
    expect((await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8'))
      .toContain('>Reviewed</text>');

    await editor.fill('@diagram flowchart\ntemporary process');
    await waitForEditorSettled(page);
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(edited);
    await expect(page.locator(`.react-flow__node[data-id="${nodeId}"]`)).toBeVisible();
  });
}

test('UML sequence keeps a visible source edit through save, export, and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const original = readFileSync(resolve(__dirname,
    '../packages/browser/test/fixtures/acceptance028/uml-sequence-flat.coral'), 'utf8');
  const edited = original.replace('client participant', 'client participant as "Reviewed"');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'uml-sequence-flat.coral', buffer: Buffer.from(original) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(original);
  await expect(page.getByRole('region', { name: 'Sequence diagram canvas' })).toContainText('client');
  await editor.fill(edited);
  await waitForEditorSettled(page);
  await expect(page.getByRole('region', { name: 'Sequence diagram canvas' })).toContainText('Reviewed');
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.profile).toMatchObject({ id: 'uml', kind: 'sequence' });
  expect(exported.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'client', label: 'Reviewed' }),
  ]));
  expect((await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8'))
    .toContain('>Reviewed</tspan>');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(page.getByRole('region', { name: 'Sequence diagram canvas' })).toContainText('Reviewed');
});

test('a flat UML alternative keeps its branches through scene, check, save, and export', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'choice = alt "yes" {\n  client -#> server [async] as "request"\n' +
    '} else "no" {\n  server -> client as "decline"\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'flat-alt.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await expect(scene).toContainText('[yes]');
  await expect(scene).toContainText('[no]');
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByLabel('Conformance level for this check').selectOption('strict');
  await page.getByRole('button', { name: 'Check conformance', exact: true }).click();
  const report = page.getByRole('region', { name: 'Conformance report' });
  await expect(report).toContainText('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
  await expect(report).toContainText('Strict · failed');
  await expect(editor).toHaveValue(source);

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.interaction.items).toEqual([{ kind: 'fragment', id: 'choice' }]);
  expect(exported.interaction.fragments[0].operands.map((operand: { guard: { text: string } }) =>
    operand.guard.text)).toEqual(['yes', 'no']);
  expect((await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8'))
    .toContain('data-coral-sequence-fragment="choice"');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
});

test('nested UML alternatives keep their frames through edit, history, save, and export', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'choice = alt "yes" {\n  retry = alt "again" {\n' +
    '    call = client -#> server as "request"\n' +
    '  } else "stop" {\n    reply = server -> client\n  }\n' +
    '} else "no" {\n  decline = server -> client\n}\n';
  const edited = source.replace('"request"', '"request revised"');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-alt.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await expect(editor).toHaveValue(source);
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-fragment="retry"]')).toBeVisible();
  await expect(scene).toContainText('[again]');
  await scene.locator('[data-coral-sequence-message="call"]').click();
  const label = page.getByRole('region', { name: 'Message' }).getByLabel('Label');
  await label.fill('request revised');
  await label.press('Enter');
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(edited);
  await expect(scene).toContainText('request revised');
  await scene.locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-fragment="retry"]')).toBeVisible();
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.interaction.items).toEqual([{ kind: 'fragment', id: 'choice' }]);
  expect(exported.interaction.fragments.map((fragment: { id: string }) => fragment.id))
    .toEqual(['choice', 'retry']);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-sequence-fragment="choice"');
  expect(svg).toContain('data-coral-sequence-fragment="retry"');
  expect(svg).toContain('request revised');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-fragment="retry"]')).toBeVisible();
});

test('nested UML operand and frame hit regions select their own source identities', async ({ page }) => {
  test.setTimeout(90_000);
  const source = readFileSync(resolve(__dirname,
    '../packages/browser/test/fixtures/acceptance028/uml-sequence-nested.coral'), 'utf8');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'uml-sequence-nested.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  const operand = scene.locator('[data-coral-sequence-operand="retry-operand-2"]');
  await expect(operand).toHaveAttribute('role', 'button');
  await operand.locator('[data-coral-interaction-hit]').click();
  await expect(operand).toHaveAttribute('aria-current', 'true');
  const details = page.getByRole('region', { name: 'Operand' });
  await expect(details).toContainText('retry');
  await expect(details.getByLabel('Guard')).toHaveValue('stop');
  const frame = scene.locator('[data-coral-fragment-frame="retry"]');
  await frame.focus();
  await frame.press('Enter');
  await expect(frame).toHaveAttribute('aria-current', 'true');
  await expect(operand).not.toHaveAttribute('aria-current', 'true');
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style').selectOption(style);
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const parts = await page.evaluate((exported) => {
      const projection = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
        .map((element) => ({ id: element.getAttribute('data-coral-part-id'),
          tag: element.tagName.toLowerCase(), path: element.getAttribute('d'),
          text: element.tagName.toLowerCase() === 'text' ? element.textContent : null }))
        .sort((a, b) => a.id!.localeCompare(b.id!));
      return { canvas: projection(document.querySelector('.coral-sequence-diagram')!),
        exported: projection(new DOMParser().parseFromString(exported, 'image/svg+xml')) };
    }, svg);
    expect(parts.canvas).toEqual(parts.exported);
    expect(parts.canvas.some((part) => part.id?.includes('operand:retry-operand-2'))).toBe(true);
  }
});

test('nested UML message deletion uses source history and preserves the remaining scene', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'choice = alt "yes" {\n  keep = client -> server\n' +
    '  remove = server -> client\n} else "no" {\n' +
    '  fallback = client -.-> server\n}\n';
  const edited = source.replace('  remove = server -> client\n', '');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-delete.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await expect(scene.locator('[data-coral-sequence-message="remove"]')).toBeVisible();
  await scene.locator('[data-coral-sequence-message="remove"]').click();
  await page.getByRole('region', { name: 'Message' }).getByRole('button', { name: 'Delete message' }).click();
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(scene.locator('[data-coral-sequence-message="remove"]')).toHaveCount(0);
  await expect(scene.locator('[data-coral-sequence-message="keep"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await scene.locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep', 'fallback']);
  expect(exported.interaction.fragments[0].operands[0].items)
    .toEqual([{ kind: 'message', id: 'keep' }]);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-sequence-message="keep"');
  expect(svg).not.toContain('data-coral-sequence-message="remove"');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-message="keep"]')).toBeVisible();
});

test('an empty UML alternative after deletion preserves its frame in canvas, SVG, and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\na participant\nb participant\n' +
    'choice = alt "yes" {\n  only = a -> b\n' +
    '} else "no" {\n  other = b -> a\n}\n';
  const edited = source.replace('  only = a -> b\n', '');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'empty-alt.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await scene.locator('[data-coral-sequence-message="only"]').click();
  await page.getByRole('region', { name: 'Message' }).getByRole('button', { name: 'Delete message' }).click();
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(page.locator('[data-coral-sequence-message="only"]')).toHaveCount(0);
  for (const style of ['lowfi', 'hifi'] as const) {
    await page.getByLabel('Diagram style').selectOption(style);
    await waitForEditorSettled(page);
    await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
    await expect(scene.locator('[data-coral-sequence-operand="choice-operand-1"]')).toHaveCount(1);
    await expect(scene.locator('[data-coral-sequence-operand="choice-operand-2"]')).toHaveCount(1);
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    expect(svg).toContain('data-coral-sequence-fragment="choice"');
    expect(svg).toContain('[yes]');
    expect(svg).toContain('[no]');
    expect(svg).toContain('data-coral-sequence-message="other"');
    expect(svg).not.toContain('data-coral-sequence-message="only"');
    const paint = await page.evaluate((svg) => {
      const keys = ['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points'];
      const project = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
        .map((part) => ({ id: part.getAttribute('data-coral-part-id'), tag: part.tagName.toLowerCase(),
          text: part.tagName.toLowerCase() === 'text' ? part.textContent : null,
          geometry: Object.fromEntries(keys.map((key) => [key, part.getAttribute(key)])) }))
        .sort((a, b) => a.id!.localeCompare(b.id!));
      return { canvas: project(document.querySelector('.coral-sequence-diagram')!),
        exported: project(new DOMParser().parseFromString(svg, 'image/svg+xml')) };
    }, svg);
    expect(paint.canvas).toEqual(paint.exported);
    await expect(editor).toHaveValue(edited);
  }
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.interaction.fragments[0].operands[0].items).toEqual([]);
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(page.locator('[data-coral-sequence-message="only"]')).toHaveCount(0);
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  const reopenedSvg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(reopenedSvg).toContain('data-coral-sequence-fragment="choice"');
  expect(reopenedSvg).toContain('[yes]');
  expect(reopenedSvg).toContain('[no]');
});

test('nested UML participant deletion cascades named messages through source', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
    'choice = alt "yes" {\n  removeYes = a -> b\n  keepYes = a -> c\n' +
    '} else "no" {\n  removeNo = b -> a\n  keepNo = c -> a\n}\n';
  const edited = source.replace('b participant\n', '')
    .replace('  removeYes = a -> b\n', '')
    .replace('  removeNo = b -> a\n', '');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-participant-delete.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await scene.locator('[data-coral-sequence-participant="b"]').click();
  await page.getByRole('region', { name: 'Participant' })
    .getByRole('button', { name: 'Delete participant' }).click();
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(scene.locator('[data-coral-sequence-participant="b"]')).toHaveCount(0);
  await expect(scene.locator('[data-coral-sequence-message="keepYes"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await scene.locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.nodes.map((node: { id: string }) => node.id)).toEqual(['a', 'c']);
  expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keepYes', 'keepNo']);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).not.toContain('data-coral-sequence-participant="b"');
  expect(svg).toContain('data-coral-sequence-message="keepYes"');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-participant="c"]')).toBeVisible();
});

test('nested UML participant name edit preserves source, fragments, history, and export', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\na participant\nb participant\n' +
    'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
  const edited = source.replace('b participant', 'b participant as "Server"');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'nested-participant-name.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await scene.locator('[data-coral-sequence-participant="b"]').click();
  const name = page.getByRole('region', { name: 'Participant' }).getByLabel('Name');
  await expect(name).toBeEnabled();
  await name.fill('Server');
  await name.press('Enter');
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-message="yes"]')).toBeVisible();
  await scene.locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(exported.nodes.find((node: { id: string }) => node.id === 'b').label).toBe('Server');
  expect(exported.interaction.fragments[0].operands.map((operand: { items: unknown[] }) => operand.items))
    .toEqual([[{ kind: 'message', id: 'yes' }], [{ kind: 'message', id: 'no' }]]);
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-participant="b"]')).toBeVisible();
});

test('Create Edge appends a top-level message after recursive UML alternatives', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\na participant\nb participant\n' +
    'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
  const edited = source + 'after = a -#> b [sync] as "Done"\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'recursive-append.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await page.keyboard.press('Control+Alt+e');
  const dialog = page.getByRole('dialog', { name: 'Create edge' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Edge ID').fill('after');
  await dialog.getByLabel('Connector type').fill('sync');
  await dialog.getByLabel('Source node').selectOption('a');
  await dialog.getByLabel('Target node').selectOption('b');
  await dialog.getByLabel('Edge label').fill('Done');
  await dialog.getByRole('button', { name: 'Create edge', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(scene.locator('[data-coral-sequence-fragment="choice"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-message="after"]')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(graph.interaction.items).toEqual([
    { kind: 'fragment', id: 'choice' }, { kind: 'message', id: 'after' },
  ]);
  expect(graph.interaction.fragments[0].operands.map((operand: { items: unknown[] }) => operand.items))
    .toEqual([[{ kind: 'message', id: 'yes' }], [{ kind: 'message', id: 'no' }]]);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-sequence-message="after"');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-message="after"]')).toBeVisible();
});

test('Add message after inserts inside a nested UML operand through authored source', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram uml-sequence\na participant\nb participant\n' +
    'outer = alt "yes" {\n  inner = alt "again" {\n    nested = a -> b\n' +
    '    unchanged = b -> a\n  } else "stop" {\n    stop = a -> b\n  }\n' +
    '} else "no" {\n  rejected = b -> a\n}\n';
  const edited = source.replace('    nested = a -> b\n',
    '    nested = a -> b\n    follow = b -#> a [sync] as "Retry"\n');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'positioned-message.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const scene = page.getByRole('region', { name: 'Sequence diagram canvas' });
  await scene.locator('[data-coral-sequence-message="nested"]').click();
  await page.getByRole('region', { name: 'Message' })
    .getByRole('button', { name: 'Add message after' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create edge' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create edge', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('existing message identities');
  await dialog.getByLabel('Edge ID').fill('follow');
  await dialog.getByLabel('Connector type').fill('sync');
  await dialog.getByLabel('Source node').selectOption('b');
  await dialog.getByLabel('Target node').selectOption('a');
  await dialog.getByLabel('Edge label').fill('Retry');
  await dialog.getByRole('button', { name: 'Create edge', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue(edited);
  await waitForEditorSettled(page);
  await expect(scene.locator('[data-coral-sequence-fragment="inner"]')).toBeVisible();
  await expect(scene.locator('[data-coral-sequence-message="follow"]')).toBeVisible();
  await scene.locator('svg').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
    .bytes.toString('utf8'));
  expect(graph.interaction.fragments.find((fragment: { id: string }) => fragment.id === 'inner')
    .operands[0].items).toEqual([
    { kind: 'message', id: 'nested' }, { kind: 'message', id: 'follow' },
    { kind: 'message', id: 'unchanged' },
  ]);
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('data-coral-sequence-message="follow"');
  await editor.fill('@diagram flowchart\ntemporary process');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
  await expect(scene.locator('[data-coral-sequence-message="follow"]')).toBeVisible();
});
