import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { validateGraphIRSuccessor } from '@graph-ir/core';
import { successorCatalogSnapshot028 } from '@coral-viz/render';
import { createSuccessorBrowserBinding028 } from '../scripts/successorBrowserBinding028.mjs';
import { successorBrowserCases028 } from './fixtures/successorBrowserCases028.mjs';

const temporary = mkdtempSync(join(import.meta.dirname, '../../../node_modules/.coral-schema-regression-'));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const binding = createSuccessorBrowserBinding028(temporary);
const validate = createRequire(import.meta.url)(binding.validatorModule);
const base = JSON.parse(readFileSync(new URL('./fixtures/successorBrowserBase028.graphir.json', import.meta.url), 'utf8'));
const cases = successorBrowserCases028(base, successorCatalogSnapshot028(base));

// Core rejects object cycles before calling the compiled schema validator.
for (const { id, graph } of cases.filter(({ id }) => id !== 'cyclic-object')) {
  it(`standalone schema agrees with Core for ${id}`, () => {
    expect(validate(graph)).toBe(validateGraphIRSuccessor(graph, { mode: 'schema' }).valid);
  });
}

it('retains a missing nested field error after later valid siblings', () => {
  const graph = structuredClone(base);
  delete graph.interaction.regions[0].items;
  expect(validate(graph)).toBe(false);
  expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'required',
    params: { missingProperty: 'items' } }));
});


it('rejects combined enum members containing the compact-table separator', () => {
  const graph = structuredClone(base);
  graph.interaction.regions[0].items[0].kind = 'message|fragment';
  expect(validateGraphIRSuccessor(graph, { mode: 'schema' }).valid).toBe(false);
  expect(validate(graph)).toBe(false);
});
