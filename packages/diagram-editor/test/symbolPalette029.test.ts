import { describe, expect, it } from 'vitest';
import { documentCatalog029, projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import {
  getSourceSymbolPaletteEntries029, searchSymbolPaletteEntries029, userSymbolPaletteEntry029,
} from '../src/authoringModel';

// C5 palette: document symbols (unused included), then extra (C6 My Icons),
// then the bundled words the dialog offers (c5-design.md "Palette").

const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const definition = (id: string, name: string, tags: string) => [`@symbol ${id} {`, `  name "${name}"`,
  `  tags ${tags}`, '  size 24 x 24', '  artwork svg """', ARTWORK, '"""', '}'];
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"',
  ...definition('shield', 'Shield', '"security" "auth"'), ...definition('vault', 'Vault', '"storage"'),
  'g service [symbol: "local.shield"]', ''].join('\n');
const definitions = () => projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029!;

describe('source-owned symbol palette', () => {
  it('lists every document definition, then extra entries, then bundled words', () => {
    const library = userSymbolPaletteEntry029(documentCatalog029('architecture', definitions())
      .userSymbols.get('local.vault')!, 'library', definitions()[1]);
    const entries = getSourceSymbolPaletteEntries029('architecture', ['service', 'database', 'group'],
      definitions(), [{ ...library, key: 'library:local.vault' }]);
    expect(entries.map((entry) => [entry.kind, entry.name, entry.symbol ?? entry.typeWord])).toEqual([
      ['document', 'Shield', 'local.shield'],
      ['document', 'Vault', 'local.vault'],
      ['library', 'Vault', 'local.vault'],
      ['bundled', 'Service', 'service'],
      ['bundled', 'Database', 'database'],
      ['bundled', 'group', 'group'],
    ]);
    expect(entries[0]!.user?.artwork029).toBeDefined();
    expect(entries[4]!.shape?.id).toBe('cylinder');
    expect(entries[5]!.shape?.id).toBe('rectangle');
    expect(entries[2]!.definition?.symbolId).toBe('local.vault');
  });

  it('searches names and tags across every kind with the bundled rules', () => {
    const entries = getSourceSymbolPaletteEntries029('architecture', ['service', 'database', 'group'], definitions());
    const names = (query: string) => searchSymbolPaletteEntries029(entries, query).map((entry) => entry.name);
    expect(names('')).toHaveLength(entries.length);
    expect(names('auth')).toEqual(['Shield']);
    expect(names('Vault')).toEqual(['Vault']);
    expect(names('service')).toEqual(['Service']);
    expect(names('group')).toEqual(['group']);
    expect(names('sec')).toEqual([]);
  });

  it('has no document entries in a document without definitions', () => {
    expect(getSourceSymbolPaletteEntries029('architecture', ['service'], []).map((entry) => entry.kind))
      .toEqual(['bundled']);
  });
});
