import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const source = readFileSync(new URL('./fixtures/flowchart-25.coral', import.meta.url), 'utf8');

describe('current Coral browser performance source', () => {
  it('keeps the 25-step flowchart as authored 0.2.8 source', async () => {
    expect(source).toMatch(/^@diagram flowchart\n/);
    expect(source).not.toContain('@graph');

    const result = await render(source);
    expect(result.sourceGraph?.nodes).toHaveLength(25);
    expect(result.sourceGraph?.edges).toHaveLength(28);
    expect(result.svg).toContain('Step 25');
    expect(result.diagnostics).toEqual([]);
  });
});
