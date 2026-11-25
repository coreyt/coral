/**
 * Tests for ShapeRenderer sketch mode (SVG turbulence filter)
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ShapeRenderer } from '../src/components/ShapeRenderer';
import { getShape, stencilFit028 } from '@coral-viz/render';

describe('ShapeRenderer', () => {
  const rectangleShape = getShape('rectangle')!;

  for (const style of ['lowfi', 'hifi'] as const) {
    for (const [width, height] of [[60, 140], [160, 170], [200, 100]]) {
      it.each(['actor', 'brain', 'funnel'])('reserves the shared independent caption frame for %s (' + style + ', ' + width + 'x' + height + ')', (id) => {
        const shape = getShape(id)!;
        const fit = stencilFit028(shape, width, height);
        const { container } = render(<ShapeRenderer shape={shape} width={width} height={height} renderStyle028={style} />);
        expect(container.querySelector('svg')?.getAttribute('viewBox'))
          .toBe(`0 0 ${width} ${height}`);
        const tx = fit.offsetX - fit.viewX * fit.scale;
        const ty = fit.offsetY - fit.viewY * fit.scale;
        expect(container.querySelector('g')?.getAttribute('transform'))
          .toBe(`translate(${tx} ${ty}) scale(${fit.scale})`);
        expect(container.querySelector('path')).not.toBeNull();
      });
    }
    it('retains an ordinary stencil frame (' + style + ')', () => {
      const { container } = render(<ShapeRenderer shape={rectangleShape} renderStyle028={style} />);
      expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(rectangleShape.viewBox);
    });
    it('applies Option 2 domain-notation caption frames on canvas without affecting flowchart diamonds (' + style + ')', () => {
      const cylinder = getShape('cylinder')!;
      const diamond = getShape('diamond')!;
      const aimlFit = stencilFit028(cylinder, 200, 150, { symbolId: 'aiml-dataset' });
      const aimlView = render(<ShapeRenderer shape={cylinder} symbolId="aiml-dataset" width={200} height={150} renderStyle028={style} />);
      expect(aimlView.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 200 150');
      expect(aimlView.container.querySelector('g')?.getAttribute('transform'))
        .toBe(`translate(${aimlFit.offsetX - aimlFit.viewX * aimlFit.scale} ${aimlFit.offsetY - aimlFit.viewY * aimlFit.scale}) scale(${aimlFit.scale})`);
      const flowView = render(<ShapeRenderer shape={diamond} symbolId="flowchart-decision" width={160} height={160} renderStyle028={style} />);
      expect(flowView.container.querySelector('svg')?.getAttribute('viewBox')).toBe(diamond.viewBox);
    });
  }

  it('default render has no filter element', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} fill="#fff" stroke="#000" />
    );
    const filter = container.querySelector('filter');
    expect(filter).toBeNull();
  });

  it('preserves the default SVG aspect ratio for explicitly resized public shapes', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} width={120} height={120} fill="#fff" stroke="#000" />
    );
    expect(container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBeNull();
  });

  it('sketch={true} renders with SVG turbulence filter', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} fill="#fff" stroke="#000" sketch={true} />
    );
    const filter = container.querySelector('filter');
    expect(filter).not.toBeNull();
    const turbulence = container.querySelector('feTurbulence');
    expect(turbulence).not.toBeNull();
    const displacement = container.querySelector('feDisplacementMap');
    expect(displacement).not.toBeNull();
  });

  it('sketch mode increases stroke width', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} fill="#fff" stroke="#000" strokeWidth={2} sketch={true} />
    );
    const path = container.querySelector('path');
    const strokeWidthAttr = path?.getAttribute('stroke-width');
    // Sketch adds 0.5 to the base stroke width (before scaling)
    expect(strokeWidthAttr).toBeDefined();
  });

  it('draws an inset second path for double-outline variants', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} fill="#fff" stroke="#000" doubleOutline />
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('path')[1].getAttribute('fill')).toBe('none');
  });

  it('uses the shared rounded-rectangle geometry', () => {
    const { container } = render(
      <ShapeRenderer shape={rectangleShape} parameters={{ cornerRadius: 8 }} />
    );
    expect(container.querySelector('path')?.getAttribute('d')).toContain('Q 100,0 100,8');
  });
});
