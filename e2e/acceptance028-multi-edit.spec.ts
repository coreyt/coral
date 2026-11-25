import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

interface CandidateGraph {
  version: string;
  nodes: Array<{ id: string; label?: string; [key: string]: unknown }>;
  edges: Array<{ first: { node: string }; second: { node: string }; label?: string }>;
}

const cases = [
  {
    name: 'BPMN branch', fixture: 'bpmn-branch', nodes: 6, edges: 5,
    edits: [
      ['check task', 'check task as "Validate invoice"'],
      ['fulfill task', 'fulfill task as "Schedule payment"'],
      ['approved -> fulfill', 'approved -> fulfill as "yes"'],
    ],
    check: (graph: CandidateGraph) => {
      expect(graph.nodes.find((node: { id: string }) => node.id === 'check')?.label)
        .toBe('Validate invoice');
      expect(graph.nodes.find((node: { id: string }) => node.id === 'fulfill')?.label)
        .toBe('Schedule payment');
      expect(graph.edges.some((edge) => edge.first.node === 'approved' &&
        edge.second.node === 'fulfill' && edge.label === 'yes')).toBe(true);
    },
  },
  {
    name: 'UML class member', fixture: 'uml-class-named', nodes: 2, edges: 1,
    edits: [
      ['Order class {', 'Order class as "Purchase" {'],
      ['+ id: String', '+ orderId: String'],
    ],
    check: (graph: CandidateGraph) => {
      const order = graph.nodes.find((node: { id: string }) => node.id === 'Order');
      expect(order?.label).toBe('Purchase');
      expect(JSON.stringify(order)).toContain('orderId');
      expect(graph.edges.some((edge) => edge.first.node === 'Order' &&
        edge.second.node === 'Base')).toBe(true);
    },
  },
] as const;

for (const journey of cases) {
  test(`${journey.name} keeps authored meaning through successive edits and reopen`,
    async ({ page }) => {
      test.setTimeout(90_000);
      const original = readFileSync(resolve(__dirname,
        `../packages/browser/test/fixtures/acceptance028/${journey.fixture}.coral`), 'utf8');
      await startCleanEditor(page);
      await openBuffer(page, { name: `${journey.fixture}.coral`, buffer: Buffer.from(original) });
      const editor = page.getByLabel('DSL editor', { exact: true });
      await expect(editor).toHaveValue(original);

      let source = original;
      for (const [before, after] of journey.edits) {
        expect(source).toContain(before);
        source = source.replace(before, after);
        await editor.fill(source);
        await waitForEditorSettled(page);
        await expect(editor).toHaveValue(source);
      }
      await expect(page.locator('[data-coral-scene-node]')).toHaveCount(journey.nodes);
      await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(journey.edges);
      const exportGraph = async (): Promise<CandidateGraph> => JSON.parse((await downloadFromPalette(page,
        'Export GraphIR 4 candidate')).bytes.toString('utf8'));
      const meaning = await exportGraph();
      expect(meaning.version).toBe('4.0.0');
      journey.check(meaning);

      const reflow = page.getByRole('button', { name: 'Reflow layout' });
      await expect(reflow).toBeEnabled();
      await reflow.click();
      await waitForEditorSettled(page);
      await expect(editor).toHaveValue(source);
      expect(await exportGraph()).toEqual(meaning);

      const saved = await saveDocument(page);
      expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      await openBuffer(page, { name: 'temporary.coral',
        buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
      await openSavedDocument(page, saved.path);
      await expect(editor).toHaveValue(source);
      const reopened = await exportGraph();
      expect(reopened).toEqual(meaning);
      journey.check(reopened);
    });
}
