import { expect, it } from 'vitest';
import { parseCoralDSL } from '../../src/parsers';
import { parseGraphFixture, validateFixtureOutput } from './graph-interchange-fixture';

it('keeps legacy printer fixtures explicit without admitting them as saved 0.2.8 source', () => {
  const text = 'service "API" as api\ndatabase "DB" as db\napi -> db [dashed, label: "writes"]';
  expect(parseCoralDSL(text).errors.some(({ code }) => code === 'header.diagram.required')).toBe(true);
  const parsed = parseGraphFixture(text);
  expect(parsed.errors).toEqual([]);
  expect(parsed.nodes.map(({ id }) => id)).toEqual(['api', 'db']);
  expect(parsed.edges[0]).toMatchObject({ source: 'api', target: 'db', lineStyle: 'dashed', label: 'writes' });
  expect(validateFixtureOutput(text, 'coral').valid).toBe(true);
  expect(validateFixtureOutput('service "API" as api\napi -> missing', 'coral').valid).toBe(false);
});
it('keeps current source fixtures on the production source-owned reader', () => {
  const text = '@diagram architecture\napi service\ndb database\napi -> db';
  expect(parseGraphFixture(text)).toEqual(parseCoralDSL(text));
  expect(validateFixtureOutput(text, 'coral').valid).toBe(true);
});
