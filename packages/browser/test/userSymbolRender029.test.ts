import { describe, expect, it } from 'vitest';
import { render, CoralRenderError } from '../src/index.js';

// The browser package resolves user symbols through the document catalog and
// reports connection limits on read only in edition 0.2.9 (R-065 AC-4, AC-5).

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const doc = (...body: string[]) => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {',
  '  name "Probe"', '  size 60 x 40', '  outline ellipse', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  login port [direction: in, maxConnections: 1]', '  deep port [direction: out, anchor: core]', ...ARTWORK, '}',
  '@symbol spare {', '  name "Spare"', '  size 20 x 20', ...ARTWORK, '}',
  'g service [symbol: "local.probe"]', 'a service', 'b service', ...body, ''].join('\n');

describe('browser rendering of user symbols', () => {
  it('renders a user-symbol document and notes the unused definition', async () => {
    const result = await render(doc('g:deep -> b', 'a -> g:login'));
    expect(result.svg).toContain('<svg');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'info', code: 'coral.symbol.local.unused' }));
  });

  it('refuses an edition 0.2.9 document that exceeds a port limit', async () => {
    let caught: unknown;
    try { await render(doc('a -> g:login', 'b -> g:login')); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CoralRenderError);
    expect((caught as CoralRenderError).diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'coral.port.connections.exceeded' }));
  });

  it('renders a document with an explicit level and warns that conformance is not checked', async () => {
    const result = await render(doc('g:deep -> b').replace('@coralVersion "0.2.9"',
      '@coralVersion "0.2.9"\n@conformanceLevel strict'));
    expect(result.svg).toContain('<svg');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'coral.symbol.local.conformance-unsupported' }));
  });
});
