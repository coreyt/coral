import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { downloadFromPalette, expectBlockedPaletteCommand, openSavedDocument,
  saveDocument, startCleanEditor, waitForEditorSettled, openBuffer } from './support/user-journey.js';

type Profile = 'architecture' | 'flowchart' | 'bpmn' | 'uml-class' | 'uml-sequence';
type Edit = 'source' | 'canvas-label';
type Interruption = 'none' | 'invalid-source' | 'failed-open';
type Row = { profile: Profile; edit: Edit; interruption: Interruption };

const profiles: Record<Profile, { fixture: string; id: string; declaration: string }> = {
  architecture: { fixture: 'architecture-ports.coral', id: 'api', declaration: 'api service' },
  flowchart: { fixture: 'flowchart-draft.coral', id: 'review', declaration: 'review process' },
  bpmn: { fixture: 'bpmn-event.coral', id: 'work', declaration: 'work task' },
  'uml-class': { fixture: 'uml-class-named.coral', id: 'Order', declaration: 'Order class' },
  'uml-sequence': { fixture: 'uml-sequence-flat.coral', id: 'client', declaration: 'client participant' },
};

// Current 0.2.8 authoring factors. Sequence canvas mutation belongs to U3
// in 0.2.10; AI mutation and manual Reflow are unavailable source-owned paths.
const rows = [
  { profile: 'architecture', edit: 'source', interruption: 'none' },
  { profile: 'architecture', edit: 'canvas-label', interruption: 'invalid-source' },
  { profile: 'architecture', edit: 'source', interruption: 'failed-open' },
  { profile: 'flowchart', edit: 'canvas-label', interruption: 'none' },
  { profile: 'flowchart', edit: 'source', interruption: 'invalid-source' },
  { profile: 'flowchart', edit: 'canvas-label', interruption: 'failed-open' },
  { profile: 'bpmn', edit: 'source', interruption: 'none' },
  { profile: 'bpmn', edit: 'canvas-label', interruption: 'invalid-source' },
  { profile: 'bpmn', edit: 'canvas-label', interruption: 'failed-open' },
  { profile: 'uml-class', edit: 'canvas-label', interruption: 'none' },
  { profile: 'uml-class', edit: 'source', interruption: 'invalid-source' },
  { profile: 'uml-class', edit: 'source', interruption: 'failed-open' },
  { profile: 'uml-sequence', edit: 'source', interruption: 'none' },
  { profile: 'uml-sequence', edit: 'source', interruption: 'invalid-source' },
  { profile: 'uml-sequence', edit: 'source', interruption: 'failed-open' },
] as const satisfies readonly Row[];

test('current source-owned rows cover every feasible pair of profile, edit, and interruption', () => {
  const observed = (first: keyof Row, second: keyof Row) =>
    new Set(rows.map((row) => `${row[first]}/${row[second]}`));
  const profileInterruption = observed('profile', 'interruption');
  const profileEdit = observed('profile', 'edit');
  const editInterruption = observed('edit', 'interruption');
  for (const profile of Object.keys(profiles) as Profile[]) {
    for (const interruption of ['none', 'invalid-source', 'failed-open'] as const)
      expect(profileInterruption.has(`${profile}/${interruption}`)).toBe(true);
    for (const edit of (profile === 'uml-sequence' ? ['source'] : ['source', 'canvas-label']))
      expect(profileEdit.has(`${profile}/${edit}`)).toBe(true);
  }
  for (const edit of ['source', 'canvas-label'] as const)
    for (const interruption of ['none', 'invalid-source', 'failed-open'] as const)
      expect(editInterruption.has(`${edit}/${interruption}`)).toBe(true);
});

for (const row of rows) {
  test(`${row.profile}/${row.edit}/${row.interruption} retains source authority`, async ({ page }) => {
    test.setTimeout(90_000);
    const { fixture, id, declaration } = profiles[row.profile];
    const original = readFileSync(resolve(__dirname,
      '../packages/browser/test/fixtures/acceptance028', fixture), 'utf8');
    await startCleanEditor(page);
    await openBuffer(page, { name: fixture, buffer: Buffer.from(original) });
    const editor = page.getByLabel('DSL editor', { exact: true });
    await expect(editor).toHaveValue(original);

    if (row.edit === 'source') {
      expect(original).toContain(declaration);
      await editor.fill(original.replace(declaration, `${declaration} as "Reviewed"`));
      await waitForEditorSettled(page);
    } else {
      await page.getByRole('button', { name: 'Fit diagram to view' }).click();
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node).toBeVisible();
      await node.dblclick();
      const label = node.locator('input[type="text"]');
      await label.fill('Reviewed');
      await label.press('Enter');
      await waitForEditorSettled(page);
    }
    const edited = await editor.inputValue();
    expect(edited.replace(' as "Reviewed"', '')).toBe(original);
    if (row.profile === 'uml-sequence') {
      await page.getByRole('region', { name: 'Sequence diagram canvas' })
        .locator('svg').click({ position: { x: 10, y: 10 } });
      await page.keyboard.press('Control+z');
      await expect(editor).toHaveValue(original);
      await page.keyboard.press('Control+Shift+z');
    } else {
      await page.getByRole('button', { name: /^Undo \(/ }).click();
      await expect(editor).toHaveValue(original);
      await page.getByRole('button', { name: /^Redo \(/ }).click();
    }
    await expect(editor).toHaveValue(edited);
    const acceptedMeaning = JSON.parse((await downloadFromPalette(page,
      'Export GraphIR 4 candidate')).bytes.toString('utf8'));
    expect(acceptedMeaning.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, label: 'Reviewed' }),
    ]));

    let expectedSource = edited;
    if (row.interruption === 'invalid-source') {
      expectedSource += `${expectedSource.endsWith('\n') ? '' : '\n'}${declaration}\n`;
      await editor.fill(expectedSource);
      await waitForEditorSettled(page);
      await page.getByRole('tab', { name: 'Diagnostics' }).click();
      await expect(page.getByText(`Duplicate node ID: ${id}`).first()).toBeVisible();
      await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
        /coral\.editor\.source-export\.stale|Export blocked/);
    } else {
      if (row.interruption === 'failed-open') {
        await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
          name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ broken'),
        });
        const alert = page.getByRole('alert').filter({ hasText: 'Could not open broken.json' });
        await expect(alert).toBeVisible();
        await expect(editor).toHaveValue(edited);
        await alert.getByRole('button', { name: 'Dismiss' }).click();
      }
      const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
        .bytes.toString('utf8'));
      expect(exported).toEqual(acceptedMeaning);
      expect((await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8'))
        .toContain('Reviewed');
    }

    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: expectedSource });
    await editor.fill('@diagram flowchart\ntemporary process');
    await waitForEditorSettled(page);
    await openSavedDocument(page, saved.path);
    await expect(editor).toHaveValue(expectedSource);
    if (row.interruption === 'invalid-source') {
      await expect(page.getByText(`Duplicate node ID: ${id}`).first()).toBeVisible();
      await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
        /coral\.editor\.source-export\.stale|Export blocked/);
    } else {
      const reopened = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate'))
        .bytes.toString('utf8'));
      expect(reopened).toEqual(acceptedMeaning);
    }
  });
}
