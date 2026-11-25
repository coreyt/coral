import { describe, expect, it } from 'vitest';
import { notationRegistry } from '@coral-viz/viz';
import { KNOWN_NODE_TYPES } from '../src/parsers';
import {
  approvedImplicitSymbol028,
  advertisedSemanticTypeForSymbol,
  effectiveSymbolId,
  getSemanticTypesForNotation,
  semanticTypeForSymbol,
  symbolForSemanticType,
} from '../src/notationSemantics';

describe('notation semantic and symbol mapping', () => {
  it('uses the shared U1 interpretation for symbol-less nodes', () => {
    expect(effectiveSymbolId({ type: 'service' }, 'architecture')).toBe('arch-service');
    expect(effectiveSymbolId({ type: 'service' }, 'flowchart')).toBeUndefined();
    expect(effectiveSymbolId({ type: 'event' }, 'bpmn')).toBeUndefined();
    expect(effectiveSymbolId({ type: 'decision' }, 'flowchart')).toBe('flowchart-decision');
  });

  it('offers only implicit words that the shared U1 resolver actually maps', () => {
    expect(approvedImplicitSymbol028('service', 'flowchart')).toBeUndefined();
    expect(approvedImplicitSymbol028('module', 'flowchart')).toBeUndefined();
    expect(approvedImplicitSymbol028('event', 'bpmn')).toBeUndefined();
    expect(approvedImplicitSymbol028('io', 'flowchart')).toBe('flowchart-io');
    for (const notation of notationRegistry.getAll()) {
      for (const word of getSemanticTypesForNotation(notation.id)) {
        const approved = approvedImplicitSymbol028(word, notation.id);
        if (approved !== undefined) expect(approved).toBe(effectiveSymbolId({ type: word }, notation.id));
      }
    }
  });

  it('assigns portable semantic types to the newly reachable symbols', () => {
    const expected = {
      architecture: {
        'arch-queue': 'queue', 'arch-load-balancer': 'load_balancer',
        'arch-cdn': 'cdn', 'arch-storage': 'storage',
      },
      flowchart: { 'flowchart-document': 'document' },
      bpmn: {
        'bpmn-intermediate-event': 'event', 'bpmn-subprocess': 'subprocess',
        'bpmn-data-object': 'document',
      },
      erd: { 'erd-relationship': 'relationship' },
    } as const;
    for (const [notation, symbols] of Object.entries(expected)) {
      for (const [symbol, type] of Object.entries(symbols)) {
        expect(semanticTypeForSymbol(symbol, notation)).toBe(type);
        expect(symbolForSemanticType(type, notation)).toBe(symbol);
      }
    }
  });

  it('partitions the catalog into default type pairs and explicit symbol pairs', () => {
    for (const notation of notationRegistry.getAll()) {
      for (const symbol of notation.symbols) {
        const semanticType = semanticTypeForSymbol(symbol, notation.id)!;
        const advertised = advertisedSemanticTypeForSymbol(symbol, notation.id);
        if (advertised === undefined) {
          expect(effectiveSymbolId({ type: semanticType }, notation.id), `${notation.id}.${symbol}`)
            .not.toBe(symbol);
        } else {
          expect(advertised).toBe(semanticType);
          expect(effectiveSymbolId({ type: advertised }, notation.id)).toBe(symbol);
        }
      }
    }
  });

  it('is total for every advertised symbol and parser-recognized in reverse', () => {
    for (const notation of notationRegistry.getAll()) {
      for (const symbol of notation.symbols) {
        const semanticType = semanticTypeForSymbol(symbol, notation.id);
        expect(semanticType, `${notation.id}.${symbol}`).toBeDefined();
        expect(KNOWN_NODE_TYPES.has(semanticType!) ||
          approvedImplicitSymbol028(semanticType!, notation.id) === symbol,
        `${notation.id}.${symbol}.${semanticType}`).toBe(true);
      }
      for (const semanticType of getSemanticTypesForNotation(notation.id)) {
        const symbol = symbolForSemanticType(semanticType, notation.id);
        expect(notation.symbols, `${notation.id}.${semanticType}.${symbol}`).toContain(symbol);
      }
    }
  });

  it('never fabricates a catalog id for unknown notation or semantic type', () => {
    expect(symbolForSemanticType('not-a-type', 'flowchart')).toBeUndefined();
    expect(symbolForSemanticType('service', 'not-a-notation')).toBeUndefined();
    expect(semanticTypeForSymbol('not-a-symbol', 'flowchart')).toBeUndefined();
    expect(getSemanticTypesForNotation('not-a-notation')).toEqual([]);
  });

  it('projects only approved profile words without generic cross-profile aliases', () => {
    const baseTypes = ['service', 'database', 'module', 'external_api', 'actor', 'group'] as const;
    const expected: Record<string, readonly (string | undefined)[]> = {
      block: [undefined, undefined, undefined, undefined, undefined, undefined],
      architecture: ['arch-service', 'arch-database', undefined, undefined, 'arch-actor', undefined],
      flowchart: [undefined, undefined, undefined, undefined, undefined, undefined],
      bpmn: [undefined, undefined, undefined, undefined, undefined, undefined],
      erd: [undefined, undefined, undefined, undefined, undefined, undefined],
      code: [undefined, undefined, undefined, undefined, undefined, undefined],
      aiml: [undefined, undefined, undefined, undefined, undefined, undefined],
      'data-engineering': [undefined, undefined, undefined, undefined, undefined, undefined],
      sketch: [undefined, undefined, undefined, undefined, undefined, undefined],
      'uml-class': [undefined, undefined, undefined, undefined, undefined, undefined],
      'uml-sequence': [undefined, undefined, undefined, undefined, 'uml-actor', undefined],
      'uml-state': [undefined, undefined, undefined, undefined, undefined, undefined],
    };
    for (const notation of notationRegistry.getAll()) {
      const actual = baseTypes.map((type) => effectiveSymbolId({ type }, notation.id));
      expect(actual, notation.id).toEqual(expected[notation.id]);
      for (const symbol of actual) if (symbol) expect(notation.symbols, `${notation.id}.${symbol}`).toContain(symbol);
    }
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'does not resolve inherited object key %s as a notation, type, or symbol',
    (key) => {
      expect(effectiveSymbolId({ type: 'service' }, key)).toBeUndefined();
      expect(effectiveSymbolId({ type: key }, 'flowchart')).toBeUndefined();
      expect(symbolForSemanticType('service', key)).toBeUndefined();
      expect(symbolForSemanticType(key, 'flowchart')).toBeUndefined();
      expect(semanticTypeForSymbol('flowchart-process', key)).toBeUndefined();
      expect(semanticTypeForSymbol(key, 'flowchart')).toBeUndefined();
      expect(advertisedSemanticTypeForSymbol(key, 'flowchart')).toBeUndefined();
      expect(getSemanticTypesForNotation(key)).toEqual([]);
    },
  );
});
