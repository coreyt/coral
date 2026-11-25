import { describe, it, expect } from 'vitest';
import { handleExplain, explainTool } from '../src/tools/explain.js';

/** coral_explain - R-030 coverage. */

const textOf = (r: Awaited<ReturnType<typeof handleExplain>>) =>
  (r.content[0] as { text: string }).text;

const DSL = `@diagram architecture
api_gateway service as "API Gateway"
auth_service service as "Auth Service"
users database as "Users"
stripe external_api as "Stripe"

api_gateway -> auth_service [calls]
auth_service -> users [reads]
api_gateway -> stripe [charges]`;

describe('coral_explain', () => {
  it('declares its schema', () => {
    expect(explainTool.name).toBe('coral_explain');
    expect(explainTool.inputSchema.properties.content).toBeDefined();
    expect(explainTool.inputSchema.properties.level).toBeDefined();
  });

  it('explains a Coral diagram', async () => {
    const r = await handleExplain({ content: DSL });

    expect(r.isError).toBeFalsy();
    const text = textOf(r);
    expect(text).toContain('API Gateway');
    expect(text.length).toBeGreaterThan(50);
  });

  it('explains Graph-IR JSON', async () => {
    const r = await handleExplain({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [{ id: 'a', type: 'service', label: 'Alpha' }],
        edges: [],
      }),
    });

    expect(textOf(r)).toContain('Alpha');
  });

  it.each([['brief'], ['standard'], ['detailed']])('supports the %s level', async (level) => {
    const r = await handleExplain({ content: DSL, level });

    expect(r.isError).toBeFalsy();
    expect(textOf(r).length).toBeGreaterThan(20);
  });

  it('says more at the detailed level than the brief one', async () => {
    const brief = textOf(await handleExplain({ content: DSL, level: 'brief' }));
    const detailed = textOf(await handleExplain({ content: DSL, level: 'detailed' }));

    expect(detailed.length).toBeGreaterThan(brief.length);
  });

  it('narrows to a focus node when asked', async () => {
    const r = await handleExplain({ content: DSL, focus: 'auth_service' });

    expect(textOf(r)).toContain('Auth Service');
  });

  it('describes the connections it found', async () => {
    const text = textOf(await handleExplain({ content: DSL, level: 'detailed' }));

    expect(text).toMatch(/Auth Service/);
    expect(text).toMatch(/Users|Stripe/);
  });

  it('attributes authored relationship ends to the written endpoints', async () => {
    const source = '@diagram architecture\nwhole service\npart service\n' +
      'link = whole -> part [firstEnd: filledDiamond, secondEnd: arrow]\n';
    const standard = await handleExplain({ content: source, level: 'standard' });
    expect(standard.isError, JSON.stringify(standard)).toBeFalsy();
    expect(textOf(standard)).toContain('first end at whole: filledDiamond');
    expect(textOf(standard)).toContain('second end at part: arrow');
    const focused = await handleExplain({ content: source, focus: 'whole' });
    expect(textOf(focused)).toContain('first end at whole: filledDiamond');
  });

  it('handles a diagram with no edges', async () => {
    const r = await handleExplain({ content: '@diagram architecture\nsolo service as "Solo"' });

    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain('Solo');
  });

  it('does not invent structure from content it cannot parse', async () => {
    const r = await handleExplain({ content: '!!! not a diagram !!!' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.structuredContent?.diagnostics))
      .toContain('header.diagram.required');
    expect(JSON.stringify(r.structuredContent?.diagnostics))
      .toContain('coral.syntax.token.invalid');
  });

  it('rejects arguments that do not match the schema', async () => {
    await expect(handleExplain({ level: 'brief' })).rejects.toThrow();
  });
});

describe('coral_explain: focused observations', () => {
  const HUB = `@diagram architecture
hub service as "Hub"
a service as "A"
b service as "B"
c service as "C"
d service as "D"
e service as "E"
f service as "F"

a -> hub [calls]
b -> hub [calls]
c -> hub [calls]
hub -> d [calls]
hub -> e [calls]
hub -> f [calls]`;

  it('flags a node with high incoming traffic and high coupling', async () => {
    const text = textOf(await handleExplain({ content: HUB, focus: 'hub' }));

    expect(text).toMatch(/bottleneck/i);
    expect(text).toMatch(/coupling/i);
  });

  it('flags an entry point, which only has outgoing connections', async () => {
    const text = textOf(await handleExplain({ content: HUB, focus: 'a' }));

    expect(text).toMatch(/entry point/i);
    expect(text).toMatch(/no incoming/i);
  });

  it('flags a terminal node, which only has incoming connections', async () => {
    const text = textOf(await handleExplain({ content: HUB, focus: 'd' }));

    expect(text).toMatch(/terminal node|data sink/i);
    expect(text).toMatch(/no outgoing/i);
  });

  it('describes an isolated node as having neither', async () => {
    const text = textOf(
      await handleExplain({ content: '@diagram architecture\nalone service as "Alone"\nother service as "Other"\n\nother -> other', focus: 'alone' })
    );

    expect(text).toMatch(/no incoming/i);
    expect(text).toMatch(/no outgoing/i);
  });

  it('reports a focus that names no node', async () => {
    const r = await handleExplain({ content: '@diagram architecture\na service as "A"', focus: 'nope' });

    expect(typeof textOf(r)).toBe('string');
  });
});
