import { describe, expect, it } from 'vitest';
import { handleValidate } from '../src/tools/validate.js';

// MCP validation reads source through the shared installed reader, so it runs
// coral.svg-artwork 1 admission on every artwork block (R-065 AC-3).

const source = '@diagram architecture\n@coralVersion "0.2.9"\n\n@symbol shield {\n  name "Shield"\n  size 24 x 28\n' +
  '  artwork svg """\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
  '  <image href="https://evil.example/track.png" width="1" height="1"/>\n</svg>\n"""\n}\ngate service\n';

describe('MCP user-symbol artwork admission', () => {
  it('reports hostile artwork with the admission diagnostic', async () => {
    const checked = await handleValidate({ content: source });
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'coral.artwork.svg.element.unsupported',
    }));
  });
});
