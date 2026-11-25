import { describe, expect, it } from 'vitest';
import { checkInstalledDocumentConformance028, parseInstalledDocument028 } from '../src/installedDocument028.js';
import { resolveNotationNode028 } from '../src/notations/index.js';
import { semanticLayoutPorts028 } from '../src/semanticLayoutPorts028.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { renderSvg } from '../src/svg/serialize.js';

const source = '@diagram block\nsource block as "Source"\nsink block as "Sink"\n' +
  'transfer = source -> sink as "Data"\n';

describe('source-first block profile', () => {
  it('parses one scoped block word and renders two blocks with a labeled connector', () => {
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.metadata?.notation).toBe('block');
    expect(parsed.graph?.nodes).toMatchObject([
      { id: 'source', type: 'block', label: 'Source' },
      { id: 'sink', type: 'block', label: 'Sink' },
    ]);
    expect(parsed.graph?.edges).toMatchObject([{ id: 'transfer', label: 'Data' }]);
    const svg = renderSvg(parsed.graph!);
    expect(svg).toContain('Source');
    expect(svg).toContain('Sink');
    expect(svg).toContain('Data');
  });

  it('resolves semantic input and output ports independently of their legacy stencil sides', () => {
    const interpreted = resolveNotationNode028({ id: 'source', type: 'block' }, 'block');
    expect(interpreted).toMatchObject({ status: 'resolved', effectiveSymbolId: 'block-unit' });
    expect(interpreted.semanticPorts).toMatchObject([
      { id: 'input', direction: 'in', anchor: 'auto', origin: 'catalog' },
      { id: 'output', direction: 'out', anchor: 'auto', origin: 'catalog' },
    ]);
    const symbol = symbolRegistry.get('block-unit');
    const right = semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT');
    const down = semanticLayoutPorts028(interpreted, symbol, undefined, 'DOWN');
    expect(right).toMatchObject({ sourceDefault: 'output', targetDefault: 'input' });
    expect(right.ports.find((port) => port.id === 'output')?.side).toBe('EAST');
    expect(down.ports.find((port) => port.id === 'output')?.side).toBe('SOUTH');
  });

  it('certifies only the approved shared-check Block inventory', () => {
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(checked.report?.evaluatedLevel).toBe('strict');
    expect(checked.report?.claimStatus).toBe('conformant');
    expect(checked.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(checked.report?.unverifiedObligations).toEqual([]);
  });
});
