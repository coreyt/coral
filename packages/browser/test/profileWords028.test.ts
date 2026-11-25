import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

describe('scoped author words in the browser renderer', () => {
  it('renders a BPMN source with concrete event and task symbols', async () => {
    const result = await render('@diagram bpmn\nstart startEvent\nwork task\ndone endEvent\n' +
      'start -> work\nwork -> done\n');
    expect(result.graph.nodes.map((node) => node.type)).toEqual(['startEvent', 'task', 'endEvent']);
    expect(result.svg).toContain('start');
    expect(result.svg).toContain('work');
    expect(result.svg).toContain('done');
    expect(result.sourceGraph?.edges.map((edge) => edge.type)).toEqual([undefined, undefined]);
    const markerId = result.svg.match(/<marker id="([^"]+)"[^>]*><path[^>]*fill="#363430"/)?.[1];
    expect(markerId).toBeDefined();
    expect(result.svg).toContain(`marker-end="url(#${markerId})"`);
    expect(result.svg).toContain('data-coral-part-id="edge-1:target-marker"');
  });

  it('refuses disabled Chen ERD source rather than publishing a scene', async () => {
    await expect(render('@diagram erd\nCustomer entity\nowns relationship\n' +
      'Customer -> owns\n')).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'header.diagram.disabled' })]),
    });
  });

  it('scopes marker definitions for two browser diagrams on one page', async () => {
    const source = '@diagram flowchart\nstart terminal\nwork process\nstart -> work\n';
    const first = await render(source);
    const second = await render(source);
    const marker = (svg: string) => svg.match(/<marker id="([^"]+)"/)?.[1];
    expect(marker(first.svg)).toBeDefined();
    expect(marker(first.svg)).not.toBe(marker(second.svg));
    expect(first.svg).toContain(`marker-end="url(#${marker(first.svg)})"`);
    expect(second.svg).toContain(`marker-end="url(#${marker(second.svg)})"`);
  });
});
