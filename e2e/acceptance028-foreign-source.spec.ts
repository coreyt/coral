import { expect, test } from '@playwright/test';
import { downloadFromPalette, expectBlockedPaletteCommand, openBuffer, openSavedDocument, saveDocument, startCleanEditor,
  waitForEditorSettled } from './support/user-journey.js';

for (const [format, name, text, firstId, secondId] of [
  ['mermaid', 'flow.mmd', 'flowchart LR\n  A[Alpha] --> B[Beta]', 'A', 'B'],
  ['dot', 'connections.dot', 'digraph G { a -> b }', 'a', 'b'],
  ['plantuml', 'messages.puml', '@startuml\nA -> B : hi\n@enduml', 'a', 'b'],
] as const) {
  test(`${format} source stays exact through browser save and reopen`, async ({ page }) => {
    test.setTimeout(90_000);
    await startCleanEditor(page);
    await openBuffer(page, { name, buffer: Buffer.from(text) });
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(text);
    await expect(page.getByLabel('Source format')).toHaveText(format === 'dot' ? 'DOT source'
      : format === 'plantuml' ? 'PlantUML source' : 'Mermaid source');
    await expect(page.locator(`[data-coral-scene-node="${firstId}"]`)).toBeVisible();
    await waitForEditorSettled(page);
    const exported = JSON.parse((await downloadFromPalette(page, 'Export Graph-IR')).bytes.toString('utf8'));
    expect(exported.nodes.map((node: { id: string }) => node.id)).toEqual(expect.arrayContaining([firstId, secondId]));
    expect(exported.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: firstId, target: secondId })]));
    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: format, text });
    await openBuffer(page, { name: 'temporary.coral',
      buffer: Buffer.from('@diagram flowchart\ntemporary = process\n') });
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(text);
    expect((await saveDocument(page)).document.content).toEqual({ format: 'dsl', dslType: format, text });
  });
}

test('Mermaid class members retain meaning through source edit and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = 'classDiagram\nclass Order {\n  +UUID id\n  +save(): Void\n}';
  const edited = source.replace('+UUID id', '+String id');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'orders.mmd', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.getByLabel('Source format')).toHaveText('Mermaid source');
  await expect(page.locator('[data-coral-scene-node="Order"]')).toBeVisible();
  await editor.fill(edited);
  await waitForEditorSettled(page);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export Graph-IR')).bytes.toString('utf8'));
  expect(exported.nodes[0].classifier.compartments).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'attributes', items: expect.arrayContaining([
      expect.objectContaining({ name: 'id', type: 'String' }),
    ]) }),
  ]));
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: edited });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary = process\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(edited);
});

test('malformed DOT remains saveable as text', async ({ page }) => {
  test.setTimeout(90_000);
  const text = 'digraph G { a -> }';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'unfinished.dot', buffer: Buffer.from(text) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'dot', text });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary = process\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
});

test('unparsed PlantUML line stays saveable while semantic export refuses it', async ({ page }) => {
  test.setTimeout(90_000);
  const text = '@startuml\nA -> B : hi\nmystery this\n@enduml';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'partial.puml', buffer: Buffer.from(text) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'plantuml', text });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary = process\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
});

test('unparsed Mermaid style stays saveable while semantic export refuses it', async ({ page }) => {
  test.setTimeout(90_000);
  const text = 'flowchart LR\nA[Alpha] --> B[Beta]\nstyle A fill:#fff';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'styled.mmd', buffer: Buffer.from(text) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'mermaid', text });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary = process\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(text);
  await expectBlockedPaletteCommand(page, 'Export Graph-IR', /Recovered graph:.*errors?/);
});
