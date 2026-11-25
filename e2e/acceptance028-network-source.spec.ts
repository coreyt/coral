import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

type Node = { id: string; label?: string; children?: Node[] };
type Candidate = { version: string; nodes: Node[]; edges: Array<{
  id: string; first: { node: string }; second: { node: string };
}> };

function allNodes(nodes: Node[]): Node[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.children ?? [])]);
}

test('twenty-node network keeps qualified identities through source edits and reopen',
  async ({ page }) => {
    test.setTimeout(90_000);
    const original = readFileSync(resolve(__dirname, 'fixtures/acceptance028/network-20.coral'), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: 'network-20.coral', buffer: Buffer.from(original) });
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(original);

    let source = original.replace('api_a service as "Orders API"',
      'api_a service as "Orders API v2"');
    await editor.fill(source);
    await waitForEditorSettled(page);
    await expect(editor).toHaveValue(source);
    source = source.replace('api_b service as "Catalog API"',
      'api_b service as "Product API"');
    await editor.fill(source);
    await waitForEditorSettled(page);
    await expect(editor).toHaveValue(source);
    await page.getByRole('button', { name: /^Undo \(/ }).click();
    await expect(editor).toHaveValue(source.replace('api_b service as "Product API"',
      'api_b service as "Catalog API"'));
    await page.getByRole('button', { name: /^Redo \(/ }).click();
    await expect(editor).toHaveValue(source);

    const exportGraph = async (): Promise<Candidate> => JSON.parse((await downloadFromPalette(page,
      'Export GraphIR 4 candidate')).bytes.toString('utf8'));
    const meaning = await exportGraph();
    expect(meaning.version).toBe('4.0.0');
    expect(allNodes(meaning.nodes)).toHaveLength(22);
    expect(meaning.edges).toHaveLength(24);
    expect(allNodes(meaning.nodes).find((node) => node.id === 'application_tier.api_a')?.label)
      .toBe('Orders API v2');
    expect(allNodes(meaning.nodes).find((node) => node.id === 'application_tier.api_b')?.label)
      .toBe('Product API');
    expect(meaning.edges.find((edge) => edge.id === 'gateway_to_lb')).toMatchObject({
      first: { node: 'public_edge.edge' }, second: { node: 'public_edge.lb' },
    });
    expect(source).toContain('// Commerce network: source identities and group ownership stay exact.');

    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    await openBuffer(page, { name: 'temporary.coral',
      buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(source);
    expect(await exportGraph()).toEqual(meaning);
  });
