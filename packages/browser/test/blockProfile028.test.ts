import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

describe('block source in the public browser renderer', () => {
  it('renders ID-first blocks, a named connector, and the installed profile', async () => {
    const result = await render('@diagram block\nproducer block\nconsumer block\n' +
      'transfer = producer -> consumer as "Data"\n');
    expect(result.graph.metadata?.notation).toBe('block');
    expect(result.graph.edges[0]).toMatchObject({ id: 'transfer', label: 'Data' });
    expect(result.svg).toContain('producer');
    expect(result.svg).toContain('consumer');
    expect(result.svg).toContain('Data');
  });
});
