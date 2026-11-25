import { describe, expect, it } from 'vitest';
import { render, CoralRenderError } from '../src/index.js';

// The browser package reads source through the shared installed reader, so it
// runs coral.svg-artwork 1 admission on every artwork block (R-065 AC-3).

const source = '@diagram architecture\n@coralVersion "0.2.9"\n\n@symbol shield {\n  name "Shield"\n  size 24 x 28\n' +
  '  artwork svg """\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" onload="alert(1)">\n' +
  '  <path d="M0 0H1"/>\n</svg>\n"""\n}\ngate service\n';

describe('browser user-symbol artwork admission', () => {
  it('refuses hostile artwork with the located admission diagnostic', async () => {
    let caught: unknown;
    try { await render(source); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CoralRenderError);
    expect((caught as CoralRenderError).diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'coral.artwork.svg.attribute.unsupported', line: 8,
      column: source.split('\n')[7]!.indexOf('onload') + 1,
    }));
  });
});
