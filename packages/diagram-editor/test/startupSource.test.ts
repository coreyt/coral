import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '@coral-viz/render';
import { bundledSourceExamples028 } from '../src/exampleSources028';
import { startupSource } from '../src/startupSource';

describe('0.2.8 startup source', () => {
  it('uses the exact bundled Coral flowchart with complete projected meaning', () => {
    const example = bundledSourceExamples028.find((item) => item.id === 'flowchart')!;
    expect(startupSource).toEqual({ format: 'coral', text: example.source });
    const result = parseInstalledDocument028(startupSource.text);
    expect(result.graph?.nodes.map((node) => node.id))
      .toEqual(['start', 'review', 'decision', 'revise', 'end']);
    expect(result.graph?.edges).toHaveLength(5);
  });
});
