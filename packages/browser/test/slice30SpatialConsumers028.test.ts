import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';
import { handleRender } from '../../mcp-server/src/tools/render.js';
import { handleConvert } from '../../mcp-server/src/tools/convert.js';
import { handleValidate } from '../../mcp-server/src/tools/validate.js';

const source = '@diagram architecture\n' +
  'layout [algorithm: layered, direction: RIGHT, edgeRouting: POLYLINE, nodeNode: 40, layerSpacing: 60]\n' +
  'api service as "API" @ (120, 100) pinned\nstore database as "Store" @ (500, 100) pinned\n' +
  'request = api -> store as "Request"\n' +
  'constraint caption: label node api above edge request [preferred, gap: 8]\n';

const normalizedSvg = (svg: string): string => {
  const ids = new Map<string, string>();
  return svg.replace(/(?:coral-instance|coral-glyph-title)-[0-9a-f]+(?:-[0-9a-f]+)*/g, (id) => {
    if (!ids.has(id)) ids.set(id, `DOM-SCOPE-${ids.size + 1}`);
    return ids.get(id)!;
  });
};

const getSvg = (response: Awaited<ReturnType<typeof handleRender>>) => {
  const text = (response.content[0] as { text: string }).text;
  return text.slice(text.indexOf('<svg'));
};

describe('Slice30 typed spatial source consumers', () => {
  it.each(['left', 'right', 'top', 'bottom'] as const)('renders a feasible ordinary-node %s diagram boundary in both public consumers', async (side) => {
    const text = `@diagram architecture\na service\nb service\nconstraint dock: node a at the ${side} of diagram\n`;
    const browser = await render(text, { direction: 'DOWN' });
    const mcp = await handleRender({ content: text, options: { direction: 'DOWN' } });
    expect(mcp.isError).toBeUndefined();
    expect(browser.sourceGraph?.constraints).toContainEqual(expect.objectContaining({ id: 'dock', kind: 'boundary', side }));
    for (const svg of [browser.svg, getSvg(mcp)]) {
      expect(svg).toContain('data-coral-node="a"');
      expect(svg).toContain('data-coral-node="b"');
    }
  });

  it('exposes located rejected proximity and preferred intent without blocking the accepted diagram', async () => {
    const text = '@diagram architecture\na service @ (0, 0) pinned\nb service @ (200, 0) pinned\n' +
      'e = a ------> b\norder = arrange row: a, b\nconstraint soft: node a above node b [preferred]\n';
    const browser = await render(text);
    const mcp = await handleRender({ content: text });
    expect(mcp.isError).toBeUndefined();
    for (const diagnostics of [browser.diagnostics, mcp.structuredContent?.diagnostics]) {
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.proximity.rejected', severity: 'warning',
        range: expect.objectContaining({ start: expect.objectContaining({ line: 4 }) }) }));
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.constraint.preferred-rejected', severity: 'warning',
        range: expect.objectContaining({ start: expect.objectContaining({ line: 6 }) }) }));
    }
  });

  it.each([{ prefix: 'e = ', typed: true }, { prefix: '', typed: true }, { prefix: '', typed: false }])(
    'locates an actual edge-label collision with declaration %j', async ({ prefix, typed }) => {
    const invalid = '@diagram architecture\na service @ (100, 100) pinned\nb service @ (500, 100) pinned\n' +
      `${prefix}a -> b as "Caption" label above at 0 offset 0\n` +
      (typed ? 'constraint hint: node a left of node b [preferred]\n' : '');
    let cause: unknown;
    try { await render(invalid, { style: 'hifi' }); } catch (error) { cause = error; }
    const expected = expect.objectContaining({ code: 'render.capability.scene-layout', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 4 }) }) });
    expect(cause).toMatchObject({ diagnostics: expect.arrayContaining([expected]) });
    const findings = (cause as { diagnostics: Array<{ range: { start: { offset: number }; end: { offset: number } } }> }).diagnostics;
    const finding = findings.find(({ range }) => range?.start)!;
    expect(invalid.slice(finding.range.start.offset, finding.range.end.offset)).toBe('above at 0 offset 0');
    const mcp = await handleRender({ content: invalid, options: { style: 'hifi' } });
    expect(mcp.isError).toBe(true);
    expect(mcp.structuredContent?.diagnostics).toContainEqual(expected);
  });

  it('locates the actual route-local cycle failure in both public consumers', async () => {
    const invalid = '@diagram architecture\na service\nb service\ne = a -> b\nroute edge e {\n' +
      'p = waypoint relative to waypoint q offset (20, 0)\nq = waypoint relative to waypoint p offset (-19, 0)\n}\n';
    const expected = expect.objectContaining({ severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 6 }) }) });
    let cause: unknown;
    try { await render(invalid); } catch (error) { cause = error; }
    expect(cause).toMatchObject({ diagnostics: expect.arrayContaining([expected]) });
    const mcp = await handleRender({ content: invalid });
    expect(mcp.isError).toBe(true);
    expect(mcp.structuredContent?.diagnostics).toContainEqual(expected);
  });

  it.each(['lowfi', 'hifi'] as const)('keeps typed source meaning and shared scene geometry through browser and MCP in %s', async (style) => {
    const browser = await render(source, { style });
    expect(browser.sourceGraph?.constraints).toEqual([{ id: 'caption', kind: 'relative',
      subject: { kind: 'node-label', nodeId: 'api' }, target: { kind: 'edge', edgeId: 'request' },
      relation: 'above', strength: 'preferred', gap: 8 }]);
    expect(browser.sourceGraph?.layoutOptions).toEqual({ algorithm: 'layered', direction: 'RIGHT',
      edgeRouting: 'POLYLINE', spacing: { nodeNode: 40, layerSpacing: 60 } });
    const mcp = await handleRender({ content: source, options: { style } });
    expect(mcp.isError, mcp.content[0]).toBeUndefined();
    for (const rendered of [browser.svg, getSvg(mcp)]) {
      expect(rendered).toContain('data-coral-edge="request"');
      expect(rendered).toContain('API'); expect(rendered).toContain('Request');
    }
    expect(normalizedSvg(browser.svg)).toBe(normalizedSvg(getSvg(mcp)));
    const validation = await handleValidate({ content: source });
    expect(validation.isError, JSON.stringify(validation)).toBeUndefined();
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError, JSON.stringify(converted)).toBeUndefined();
    const text = (converted.content[0] as { text: string }).text;
    const portable = JSON.parse(text.slice(text.indexOf('{')));
    expect(portable).toEqual(browser.sourceGraph);
    expect(JSON.stringify(portable)).not.toMatch(/spatialConstraints028|labelBounds028|routeIntents028|layoutOptions028/);
  });

  it.each([false, true])('locates failed exact placement with only-preferred constraint=%s and preserves input for source save/reopen', async (withPreferred) => {
    const invalid = '@diagram architecture\napi service as "API" label right offset 12 @ (100, 100) pinned\n' +
      'obstacle service @ (200, 100) pinned\n' +
      (withPreferred ? 'constraint hint: node api above node obstacle [preferred]\n' : '');
    let cause: unknown;
    try { await render(invalid); } catch (error) { cause = error; }
    expect(cause).toMatchObject({ diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.scene-layout', severity: 'error', range: expect.objectContaining({ start: expect.objectContaining({ line: 2 }) }) }),
    ]) });
    const mcp = await handleRender({ content: invalid });
    expect(mcp.isError).toBe(true);
    expect(mcp.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.scene-layout', severity: 'error', range: expect.objectContaining({ start: expect.objectContaining({ line: 2 }) }),
    }));
  });
});
