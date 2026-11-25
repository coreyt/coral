import { expect, it } from 'vitest';
import * as viz from '../src/index';
import * as render from '@coral-viz/render';

it('shares the public shape, symbol and notation registry instances with render', () => {
  expect(viz.shapeRegistry).toBe(render.shapeRegistry);
  expect(viz.symbolRegistry).toBe(render.symbolRegistry);
  expect(viz.notationRegistry).toBe(render.notationRegistry);
});
