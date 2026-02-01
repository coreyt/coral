/**
 * Symbol Registry - Loads and provides access to symbol definitions
 *
 * Symbols are shapes with semantic meaning: ports, variants, defaults, tags.
 * They reference shapes by ID and add meaning for specific use cases.
 */

import type { SymbolDefinition, SymbolLibrary, SymbolRegistry } from '../types';

// Import symbol libraries (would be YAML in production)
import { flowchartSymbols } from './flowchart';
import { bpmnSymbols } from './bpmn';
import { erdSymbols } from './erd';
import { codeSymbols } from './code';
import { architectureSymbols } from './architecture';

// Combine all symbol libraries
const allLibraries: SymbolLibrary[] = [
  flowchartSymbols,
  bpmnSymbols,
  erdSymbols,
  codeSymbols,
  architectureSymbols,
];

// Flatten all symbols
const allSymbols: SymbolDefinition[] = allLibraries.flatMap((lib) => lib.symbols);

// Build lookup maps
const symbolMap = new Map<string, SymbolDefinition>();
const tagMap = new Map<string, SymbolDefinition[]>();
const notationMap = new Map<string, SymbolDefinition[]>();

allSymbols.forEach((symbol) => {
  // Add to ID map
  symbolMap.set(symbol.id, symbol);

  // Add to tag map
  symbol.tags.forEach((tag) => {
    const existing = tagMap.get(tag) || [];
    existing.push(symbol);
    tagMap.set(tag, existing);
  });
});

// Build notation map from library IDs
allLibraries.forEach((lib) => {
  notationMap.set(lib.id, lib.symbols);
});

/**
 * Symbol registry implementation
 */
export const symbolRegistry: SymbolRegistry = {
  get(id: string): SymbolDefinition | undefined {
    return symbolMap.get(id);
  },

  getByTag(tag: string): SymbolDefinition[] {
    return tagMap.get(tag) || [];
  },

  getByNotation(notationId: string): SymbolDefinition[] {
    return notationMap.get(notationId) || [];
  },

  getAll(): SymbolDefinition[] {
    return allSymbols;
  },

  has(id: string): boolean {
    return symbolMap.has(id);
  },
};

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
export { flowchartSymbols } from './flowchart';
export { bpmnSymbols } from './bpmn';
export { erdSymbols } from './erd';
export { codeSymbols } from './code';
export { architectureSymbols } from './architecture';

export default symbolRegistry;
