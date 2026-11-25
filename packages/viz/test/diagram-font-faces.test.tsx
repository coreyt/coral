import React from 'react';
import { render } from '@testing-library/react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as viz from '../src/index.js';

const DiagramFontFaces = (
  viz as Record<string, unknown>
).DiagramFontFaces as React.ComponentType<{ settings?: unknown }> | undefined;
const Subject = DiagramFontFaces ?? (() => null);

describe('DiagramFontFaces', () => {
  it('is a public SSR-safe component with a stable marker', () => {
    expect(DiagramFontFaces).toBeTypeOf('function');
    const html = renderToStaticMarkup(<Subject />);
    expect(html).toContain('data-coral-diagram-font-faces');
    expect(html).toContain("font-family:'Coral Inter'");
    const hydratable = renderToString(<Subject />);
    expect(hydratable).toContain("font-family:'Coral Inter'");
    expect(hydratable).not.toContain('&#x27;Coral Inter&#x27;');
  });

  it('deduplicates resolved profile/weight pairs and ignores malformed overrides', () => {
    const settings = {
      default: { family: 'serif', size: 16, weight: 'normal', lineHeight: 1.4 },
      symbolOverrides: {
        service: { family: 'monospace', weight: 'bold' },
        database: { family: 'monospace', weight: 700 },
        broken: null,
      },
    };
    const { container } = render(<Subject settings={settings} />);
    const style = container.querySelector('style[data-coral-diagram-font-faces]');

    expect(style).not.toBeNull();
    const css = style!.textContent ?? '';
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-family:'Coral Source Serif 4'");
    expect(css).toContain("font-family:'Coral JetBrains Mono'");
  });
});
