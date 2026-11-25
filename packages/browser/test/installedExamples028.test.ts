import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { render } from '../src/index.js';

const profiles = ['architecture', 'flowchart', 'block', 'bpmn', 'code', 'aiml',
  'data-engineering', 'sketch', 'uml-class', 'uml-sequence'];

describe('exact Welcome examples through the public browser renderer', () => {
  for (const style of ['lowfi', 'hifi'] as const) it.each(profiles)('%s (' + style + ') retains portable example meaning', async (profile) => {
    const source = readFileSync(new URL(`../../diagram-editor/src/example-sources/${profile}.coral`, import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const rendered = await render(source, { style });
    expect(rendered.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(rendered.sourceGraph).toEqual(projected.graph);
    expect(rendered.graph.nodes.length).toBeGreaterThan(0);
    expect(rendered.svg).toContain('<svg');
    if (profile === 'data-engineering') {
      expect(rendered.sourceGraph?.edges.map(({ type }) => type)).toEqual(['batch-flow', 'batch-flow', 'quality', 'quality']);
    }
  });
});
