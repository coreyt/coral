import { expect, test } from '@playwright/test';
import {
  downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  startCleanEditor, waitForEditorSettled,
} from './support/user-journey.js';

const profiles = [
  ['architecture', 'node'], ['block', 'node'], ['flowchart', 'node'],
  ['bpmn', 'node'], ['code', 'node'],
  ['aiml', 'node'], ['data-engineering', 'node'], ['sketch', 'node'],
  ['uml-class', 'class'], ['uml-sequence', 'participant'],
] as const;

for (const [profile, kind] of profiles) {
  test(`${profile} keeps a plain directed connector source-owned through export and reopen`, async ({ page }) => {
    test.setTimeout(90_000);
    const source = `@diagram ${profile}\na ${kind}\nb ${kind}\na -> b\n`;
    const edited = `${source}// Author comment\n`;
    await startCleanEditor(page);
    await openBuffer(page, { name: `${profile}-plain.coral`, buffer: Buffer.from(source) });
    await waitForEditorSettled(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(source);

    const exportCandidate = async () => JSON.parse((await downloadFromPalette(
      page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
    const candidate = await exportCandidate();
    expect(candidate.edges).toHaveLength(1);
    expect(candidate.edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'b' }, direction: 'first-to-second',
    });
    expect(candidate.edges[0].type).toBe(profile === 'uml-sequence' ? 'async' : undefined);

    await editor.fill(edited);
    await waitForEditorSettled(page);
    await expect(editor).toHaveValue(edited);
    expect(await exportCandidate()).toEqual(candidate);
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Undo');
    await page.keyboard.press('Enter');
    await expect(editor).toHaveValue(source);
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Redo');
    await page.keyboard.press('Enter');
    await expect(editor).toHaveValue(edited);

    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    await openBuffer(page, {
      name: 'temporary.coral', buffer: Buffer.from('@diagram flowchart\ntemporary process\n'),
    });
    await openSavedDocument(page, saved.path);
    await waitForEditorSettled(page);
    await expect(editor).toHaveValue(edited);
    expect(await exportCandidate()).toEqual(candidate);
  });
}
