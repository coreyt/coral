import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { documentCatalog029, projectInstalledSourceToSuccessor028, userSymbolSvgDefinition029 } from '@coral-viz/render';
import { UserSymbolArtwork029 } from '../src/components/UserSymbolArtwork029.js';

// C5: one way to draw a definition outside a scene, shared by palette
// thumbnails, the inspector and the symbol editor (c5-design.md "Thumbnails").

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {',
  '  name "Probe"', '  size 60 x 40', '  outline ellipse', '  tint stroke', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" stroke="#123456"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', ''].join('\n');

function resolved() {
  const graph = projectInstalledSourceToSuccessor028(SOURCE).graph!;
  return documentCatalog029('architecture', graph.userSymbols029!).userSymbols.get('local.probe')!;
}

describe('UserSymbolArtwork029', () => {
  it('fits the definition frame into a square box, keeping its aspect ratio', () => {
    const { container } = render(<UserSymbolArtwork029 symbol={resolved()} fit={24} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('16');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the definition once and one decorative use, with tint colour', () => {
    const user = resolved();
    const { container } = render(<UserSymbolArtwork029 symbol={user} width={60} height={40} color="#ff0000" />);
    expect(container.querySelectorAll('symbol')).toHaveLength(1);
    const use = container.querySelector('[data-coral-artwork="local.probe"] use')!;
    expect(use.getAttribute('aria-hidden')).toBe('true');
    expect(use.getAttribute('color')).toBe('#ff0000');
    expect(use.getAttribute('width')).toBe('60');
    const id = container.querySelector('symbol')!.id;
    expect(use.getAttribute('href')).toBe(`#${id}`);
    expect(userSymbolSvgDefinition029('x', 'probe', user.artwork029!, { tint: 'stroke', outline: user.outline }))
      .toContain('<symbol id="x-coral-sym-probe"');
  });

  it('gives two instances distinct IDs', () => {
    const user = resolved();
    const { container } = render(<><UserSymbolArtwork029 symbol={user} fit={24} />
      <UserSymbolArtwork029 symbol={user} fit={24} /></>);
    const ids = [...container.querySelectorAll('symbol')].map((symbol) => symbol.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('draws nothing without admitted artwork', () => {
    const { artwork029: _artwork, ...withoutArtwork } = resolved();
    const { container } = render(<UserSymbolArtwork029 symbol={withoutArtwork} fit={24} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
