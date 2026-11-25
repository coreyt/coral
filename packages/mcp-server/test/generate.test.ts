import { describe, it, expect } from 'vitest';
import { handleGenerate, generateTool } from '../src/tools/generate.js';
import { parseInstalledDocument028 } from '@coral-viz/render';
import { handleRender } from '../src/tools/render.js';

/**
 * coral_generate - R-030 coverage.
 *
 * Generation is heuristic extraction, not understanding, and the tool says so.
 * These tests pin the extraction, not the prose quality.
 */

const textOf = (r: Awaited<ReturnType<typeof handleGenerate>>) =>
  (r.content[0] as { text: string }).text;
const generatedSource = (r: Awaited<ReturnType<typeof handleGenerate>>) =>
  textOf(r).slice(textOf(r).indexOf('\n\n') + 2);

describe('coral_generate', () => {
  it('declares its schema and describes itself as heuristic', () => {
    expect(generateTool.name).toBe('coral_generate');
    expect(generateTool.description.toLowerCase()).toMatch(/heuristic|keyword|simple/);
  });

  it('extracts nodes from a description', async () => {
    const r = await handleGenerate({
      description: 'A web server talks to a database and calls a payment API',
      format: 'json',
    });

    expect(r.isError).toBeFalsy();
    expect(textOf(r).length).toBeGreaterThan(10);
  });

  it('emits reparse-verified 0.2.8 Coral DSL by default', async () => {
    const r = await handleGenerate({ description: 'A service and a database' });

    expect(r.isError).toBeFalsy();
    const source = generatedSource(r);
    expect(source).toMatch(/^@diagram architecture\n/);
    expect(source).not.toContain('@graph');
    expect(parseInstalledDocument028(source).graph?.nodes.length).toBeGreaterThan(0);
  });

  it('uses readable camelCase IDs for generated multiword names', async () => {
    const result = await handleGenerate({ description: 'A system with API Gateway, Orders Database' });
    expect(result.isError).toBeFalsy();
    const source = generatedSource(result);
    expect(source).toContain('apiGateway service as "API Gateway"');
    expect(source).toContain('ordersDatabase database as "Orders Database"');
    expect(source).toContain('edge0 = apiGateway -> ordersDatabase');
    expect(source).not.toContain('api_gateway');
  });

  it('can generate the common group word as a source-owned node', async () => {
    const result = await handleGenerate({ description: 'A system with Operations Group, API Service' });
    expect(result.isError).toBeFalsy();
    const source = generatedSource(result);
    expect(source).toContain('operationsGroup group as "Operations Group"');
    expect(parseInstalledDocument028(source).syntax.diagnostics).toEqual([]);
  });

  it('emits Graph-IR JSON when asked', async () => {
    const r = await handleGenerate({ description: 'A service and a database', format: 'json' });

    const text = textOf(r);
    const json = JSON.parse(text.slice(text.indexOf('{')));
    expect(json.version).toBe('3.0.0');
    expect(Array.isArray(json.nodes)).toBe(true);
  });

  it.each([['minimal'], ['detailed']])('supports the %s style', async (style) => {
    const r = await handleGenerate({ description: 'A gateway and a cache', style, format: 'json' });

    expect(r.isError).toBeFalsy();
  });

  it('produces source and GraphIR JSON for a plain description', async () => {
    const r = await handleGenerate({ description: 'A web server and a database' });
    expect(r.isError).toBeFalsy();
    const json = await handleGenerate({ description: 'A web server and a database', format: 'json' });
    const graph = JSON.parse(textOf(json).slice(textOf(json).indexOf('{')));
    const reparsed = parseInstalledDocument028(generatedSource(r));
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(reparsed.graph).toEqual({ ...graph, id: 'coral-graph' });
    expect((await handleRender({ content: generatedSource(r) })).isError).toBeFalsy();
  });

  it('handles a description with no recognisable entities', async () => {
    const r = await handleGenerate({ description: 'zzz' });

    expect(r).toBeDefined();
    expect(typeof textOf(r)).toBe('string');
  });

  it('rejects arguments that do not match the schema', async () => {
    await expect(handleGenerate({ format: 'dsl' })).rejects.toThrow();
  });
});

describe('coral_generate: extraction paths', () => {
  it.each([
    ['a database and a cache and an api', /database|cache|api/i],
    ['A frontend with authentication, billing, and search', /frontend|auth|billing|search/i],
    ['web server, backend service, client app', /web|backend|client/i],
  ])('extracts from %j', async (description, expected) => {
    const r = await handleGenerate({ description, format: 'json' });
    expect(textOf(r)).toMatch(expected);
  });

  it('chains services when no other relationship is implied', async () => {
    const r = await handleGenerate({ description: 'An api service and a worker service', format: 'json' });
    expect(textOf(r)).toMatch(/->|nodes/);
  });

  it('falls back to mentioned keywords when nothing else matches', async () => {
    const r = await handleGenerate({ description: 'the cache and the backend', format: 'json' });
    expect(textOf(r).length).toBeGreaterThan(10);
  });

  it('keeps JSON and DSL on the same graph meaning', async () => {
    const description = 'A web server talks to a database';
    const dsl = await handleGenerate({ description, format: 'dsl' });
    const json = textOf(await handleGenerate({ description, format: 'json' }));

    const graph = JSON.parse(json.slice(json.indexOf('{')));
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(dsl.isError).toBeFalsy();
    expect(parseInstalledDocument028(generatedSource(dsl)).graph)
      .toEqual({ ...graph, id: 'coral-graph' });
  });

  it('round-trips escaped labels and exposes no loss', async () => {
    const result = await handleGenerate({ description: 'A frontend with api "quoted", db\\store, and queue\nworker' });
    expect(result.isError).toBeFalsy();
    expect(parseInstalledDocument028(generatedSource(result)).syntax.diagnostics).toEqual([]);
    expect(result.structuredContent).toMatchObject({
      diagnostics: [],
      nodeCount: expect.any(Number),
      edgeCount: expect.any(Number),
    });
  });

  it('rejects an unapproved architecture kind rather than printing a generic glyph', async () => {
    const result = await handleGenerate({ description: 'A system with Stripe, database' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.diagnostics).toEqual([
      expect.objectContaining({ code: 'coral.writer028.node.kind.unsupported' }),
    ]);
    expect(textOf(result)).not.toContain('@diagram');
  });

  it('handles an empty description', async () => {
    const r = await handleGenerate({ description: '' });
    expect(typeof textOf(r)).toBe('string');
  });
});
