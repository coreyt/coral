import { describe, expect, it } from 'vitest';
import { createSymbolRegistry, symbolRegistry } from '../src/symbols/index.js';
import type { SymbolDefinition } from '../src/types.js';

const bundled = symbolRegistry.getAll()[0]!;

describe('Reserved local. symbol prefix', () => {
  it('no bundled catalog symbol starts with local.', () => {
    expect(symbolRegistry.getAll().filter(({ id }) => id.startsWith('local.'))).toEqual([]);
  });

  it('a catalog build that contains a local. ID fails with coral.symbol.local.reserved-prefix', () => {
    const symbols: SymbolDefinition[] = [{ ...bundled, id: 'local.shield' }];
    expect(() => createSymbolRegistry([{ id: 'test', name: 'Test', symbols } as never]))
      .toThrow('coral.symbol.local.reserved-prefix: bundled symbol local.shield uses the reserved local. prefix');
  });
});
