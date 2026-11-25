/**
 * Symbol Registry - Loads and provides access to symbol definitions
 *
 * Symbols are shapes with semantic meaning: ports, variants, defaults, tags.
 * They reference shapes by ID and add meaning for specific use cases.
 */

import type { SymbolDefinition, SymbolLibrary, SymbolRegistry } from '../types.js';
import { freezeCatalog028 } from '../catalogFreeze028.js';

// Import symbol libraries (would be YAML in production)
import { flowchartSymbols } from './flowchart.js';
import { blockSymbols } from './block.js';
import { bpmnSymbols } from './bpmn.js';
import { erdSymbols } from './erd.js';
import { codeSymbols } from './code.js';
import { architectureSymbols } from './architecture.js';
import { aimlSymbols } from './aiml.js';
import { dataEngineeringSymbols } from './data-engineering.js';
import { sketchSymbols } from './sketch.js';
import { umlSequenceSymbols, umlSymbols } from './uml.js';

// Combine all symbol libraries
const allLibraries: SymbolLibrary[] = [
  blockSymbols,
  flowchartSymbols,
  bpmnSymbols,
  erdSymbols,
  codeSymbols,
  architectureSymbols,
  aimlSymbols,
  dataEngineeringSymbols,
  sketchSymbols,
  umlSymbols,
  umlSequenceSymbols,
];

/** Build a registry with globally unique IDs and explicit library membership. */
export function createSymbolRegistry(libraries: SymbolLibrary[]): SymbolRegistry {
  const allSymbols = libraries.flatMap((lib) => lib.symbols);
  const symbolMap = new Map<string, SymbolDefinition>();
  const tagMap = new Map<string, SymbolDefinition[]>();
  const notationMap = new Map(libraries.map((lib) => [lib.id, lib.symbols]));

  for (const symbol of allSymbols) {
    if (symbolMap.has(symbol.id)) throw new Error(`Duplicate symbol ID: ${symbol.id}`);
    // `local.` names document-local symbols and never resolves to a bundled catalog.
    if (symbol.id.startsWith('local.')) throw new Error(
      `coral.symbol.local.reserved-prefix: bundled symbol ${symbol.id} uses the reserved local. prefix`);
    symbolMap.set(symbol.id, symbol);
    for (const tag of symbol.tags) {
      const tagged = tagMap.get(tag) ?? [];
      tagged.push(symbol);
      tagMap.set(tag, tagged);
    }
  }

  return {
    get: (id) => symbolMap.get(id),
    getByTag: (tag) => tagMap.get(tag) ?? [],
    getByNotation: (notationId) => notationMap.get(notationId) ?? [],
    getAll: () => allSymbols,
    has: (id) => symbolMap.has(id),
  };
}

/** The installed edition remains one shared, immutable catalog. */
export const symbolRegistry: SymbolRegistry = createSymbolRegistry(allLibraries);
const allSymbols = symbolRegistry.getAll();

// Every public lookup returns the same installed edition. Freeze the arrays
// and nested definitions before a resolver can pin their content fingerprint.
freezeCatalog028(allLibraries);
freezeCatalog028(allSymbols);
for (const tag of new Set(allSymbols.flatMap((symbol) => symbol.tags))) {
  freezeCatalog028(symbolRegistry.getByTag(tag));
}

/** Selectable symbol reference. Base entries have an undefined variant key. */
export interface SymbolSearchResult {
  symbolId: string;
  variantKey: string | undefined;
}

export interface SymbolCatalogEntry extends SymbolSearchResult {
  name: string;
  tags: string[];
}

function normalizeNameTag(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Search entries for symbols: base entries plus named variants, each tagged
 * with its normalized name, in stable ID/key order. User symbols use the same rules. */
export function symbolCatalogEntries(
  symbols: readonly Pick<SymbolDefinition, 'id' | 'name' | 'tags' | 'variants'>[],
): SymbolCatalogEntry[] {
  return symbols.flatMap((symbol) => [
    {
      symbolId: symbol.id, variantKey: undefined, name: symbol.name,
      tags: [...new Set([...symbol.tags, normalizeNameTag(symbol.name)])],
    },
    ...Object.entries(symbol.variants ?? {}).map(([variantKey, variant]) => ({
      symbolId: symbol.id,
      variantKey,
      name: variant.name,
      tags: [...new Set([
        ...symbol.tags, normalizeNameTag(symbol.name), normalizeNameTag(variant.name),
      ])],
    })),
  ]).sort((a, b) => {
    const left = `${a.symbolId}\0${a.variantKey ?? ''}`;
    const right = `${b.symbolId}\0${b.variantKey ?? ''}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

const symbolCatalog: SymbolCatalogEntry[] = symbolCatalogEntries(allSymbols);

/** Catalog includes base symbols and named variants; notation membership is explicit. */
export function getSymbolCatalog(): SymbolCatalogEntry[] {
  return symbolCatalog.map((entry) => ({ ...entry, tags: [...entry.tags] }));
}

/** Match complete normalized tags, preserving collisions in stable ID/key order. */
export function searchSymbols(query: string,
  catalog: readonly SymbolCatalogEntry[] = symbolCatalog): SymbolSearchResult[] {
  const tag = normalizeNameTag(query);
  if (!tag) return [];
  return catalog.filter((entry) => entry.tags.includes(tag))
    .map(({ symbolId, variantKey }) => ({ symbolId, variantKey }));
}

/**
 * Get a symbol by ID (convenience function)
 */
export function getSymbol(id: string): SymbolDefinition | undefined {
  return symbolRegistry.get(id);
}

/**
 * Get all symbols with a specific tag
 */
export function getSymbolsByTag(tag: string): SymbolDefinition[] {
  return symbolRegistry.getByTag(tag);
}

/**
 * Get all symbols for a notation
 */
export function getSymbolsForNotation(notationId: string): SymbolDefinition[] {
  return symbolRegistry.getByNotation(notationId);
}

/**
 * Get all available symbols
 */
export function getAllSymbols(): SymbolDefinition[] {
  return symbolRegistry.getAll();
}

/**
 * Get all symbol libraries
 */
export function getAllLibraries(): SymbolLibrary[] {
  return allLibraries;
}

// Re-export individual libraries
export { blockSymbols } from './block.js';
export { flowchartSymbols } from './flowchart.js';
export { bpmnSymbols } from './bpmn.js';
export { erdSymbols } from './erd.js';
export { codeSymbols } from './code.js';
export { architectureSymbols } from './architecture.js';
export { aimlSymbols } from './aiml.js';
export { dataEngineeringSymbols } from './data-engineering.js';
export { sketchSymbols } from './sketch.js';
export { umlSequenceSymbols, umlSymbols } from './uml.js';
