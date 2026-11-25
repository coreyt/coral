import { describe, expect, it } from 'vitest';
import { documentCatalog029, projectInstalledSourceToSuccessor028, searchSymbols, symbolCatalogEntries,
  symbolRegistry } from '../src/index.js';

// C5: palette search covers user symbols with exactly the bundled rules
// (design parity table, "Tags for search"; c5-design.md "Search").

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol shield {', '  name "Auth Shield"',
  '  tags "security" "auth"', '  size 24 x 24', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>', '"""', '}',
  'g service [symbol: "local.shield"]', ''].join('\n');

describe('searchSymbols over a supplied catalog', () => {
  const user = documentCatalog029('architecture',
    projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029!).userSymbols.get('local.shield')!.symbol;
  const bundled = symbolRegistry.get('arch-service')!;
  const catalog = symbolCatalogEntries([bundled, user]);

  it('matches a user symbol by tag and by its normalized name tag', () => {
    expect(searchSymbols('Security', catalog)).toEqual([{ symbolId: 'local.shield', variantKey: undefined }]);
    expect(searchSymbols('auth shield', catalog)).toEqual([{ symbolId: 'local.shield', variantKey: undefined }]);
    expect(searchSymbols('auth', catalog).map((item) => item.symbolId)).toEqual(['local.shield']);
  });

  it('keeps whole-tag matching and the bundled catalog as the default', () => {
    expect(searchSymbols('sec', catalog)).toEqual([]);
    expect(searchSymbols('security')).toEqual(searchSymbols('security', symbolCatalogEntries(symbolRegistry.getAll())));
    expect(searchSymbols('security').some((item) => item.symbolId === 'local.shield')).toBe(false);
  });
});
