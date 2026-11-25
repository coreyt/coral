import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('published dependency ownership', () => {
  it('declares the XY Flow system types carried by public declarations', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(manifest.dependencies?.['@xyflow/system']).toBe('0.0.82');
  });
});
