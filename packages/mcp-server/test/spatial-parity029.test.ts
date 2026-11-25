import { describe, expect, it } from 'vitest';
import { render as browserRender } from '../../browser/src/render.js';
import { handleRender } from '../src/tools/render.js';
import { spatialQualityFixtures029, impossibleSpatialSource029 } from '../../render/test/fixtures/spatialQuality029.js';

function visibleGeometry(svg: string) {
  return { viewBox: /viewBox="([^"]+)"/.exec(svg)?.[1],
    paths: [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]),
    labels: [...svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)].map((match) => match[0]) };
}
describe('shared spatial corpus browser/MCP parity', () => {
  for (const fixture of spatialQualityFixtures029.filter((item) => ['diamond', 'nested', 'mixed-ports', 'pinned-corridor', 'code-containment'].includes(item.id)))
    it.each(['lowfi', 'hifi'] as const)(`${fixture.id} publishes equal %s geometry through both public consumers`, async (style) => {
      const browser = await browserRender(fixture.source, { style, direction: fixture.direction });
      const mcp = await handleRender({ content: fixture.source, options: { style, direction: fixture.direction } });
      expect(mcp.isError).toBeUndefined();
      const raw = mcp.content[0]?.text ?? '';
      const svg = raw.slice(raw.indexOf('<svg'));
      expect(visibleGeometry(svg)).toEqual(visibleGeometry(browser.svg));
      expect(browser.sourceGraph?.nodes.length).toBeGreaterThan(0);
    });

  it('both consumers reject impossible exact geometry with useful diagnostics', async () => {
    await expect(browserRender(impossibleSpatialSource029)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/route|waypoint|obstacle|penetrat/i) }),
    ]) });
    const mcp = await handleRender({ content: impossibleSpatialSource029 });
    expect(mcp.isError).toBe(true);
    expect(mcp.structuredContent?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/route|waypoint|obstacle|penetrat/i) }),
    ]));
  });
});
