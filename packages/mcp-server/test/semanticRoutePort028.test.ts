import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { handleValidate } from '../src/tools/validate.js';

const source = (port = 'outbound', authored = true) => '@diagram architecture\n' +
  (authored ? 'api service {\n  outbound port [direction: out, anchor: E]\n}\n' : 'api service\n') +
  'store database\nrequest = api -> store\nroute edge request {\n' +
  `  bend = waypoint relative to port api:${port} offset (20, 0)\n}\n`;

describe('MCP source semantic-port route validation', () => {
  it.each([['outbound', true], ['out', false]] as const)('accepts an authored/catalog route anchor %s', async (port, authored) => {
    const checked = await handleValidate({ content: source(port, authored), strict: true });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent.diagnostics).toEqual([]);
  });

  it('reports one source-located missing route port instead of duplicate model/staging errors', async () => {
    const content = source('absent');
    const checked = await handleValidate({ content, strict: true });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toHaveLength(1);
    const [finding] = checked.structuredContent.diagnostics;
    expect(finding.code).toBe('GRAPHIR.INVALID_ROUTE_PORT_REFERENCE');
    expect(content.slice(finding.range!.start.offset, finding.range!.end.offset)).toBe('absent');
  });

  it('retains independent missing route-port references at their own source tokens', async () => {
    const content = source('absent').replace('offset (20, 0)\n}\n', 'offset (20, 0)\n  other = waypoint relative to port api:alsoMissing offset (40, 0)\n}\n');
    const checked = await handleValidate({ content, strict: true });
    expect(checked.structuredContent.diagnostics).toHaveLength(2);
    expect(checked.structuredContent.diagnostics.map(({ range }) => content.slice(range!.start.offset, range!.end.offset)))
      .toEqual(['absent', 'alsoMissing']);
  });

  it('retains raw GraphIR4 JSON model diagnostics without source-only suppression', async () => {
    const graph = projectInstalledSourceToSuccessor028(source('absent')).graph!;
    const checked = await handleValidate({ content: JSON.stringify(graph), strict: true });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics.map((item) => item.code)).toContain('UNKNOWN_ROUTE_SEMANTIC_PORT');
  });
});
