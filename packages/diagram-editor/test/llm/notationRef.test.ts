/**
 * Notation Reference Tests
 *
 * Tests for composeNotationReference() and getValidTypesForNotation().
 */

import { describe, it, expect } from 'vitest';
import { getNotation, getSymbolsForNotation, notationRegistry } from '@coral-viz/viz';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import { parseInstalledDocument028 } from '@coral-viz/render';
import { composeNotationReference, getValidTypesForNotation } from '../../src/llm/notationRef';
import { buildConnectionLookup } from '../../src/llm/notationLint';
import { effectiveSymbolId, semanticTypeForSymbol } from '../../src/notationSemantics';

const enabledNotations028 = () => notationRegistry.getAll().filter((notation) => {
  const installed = HEADER_MANIFEST_028['0.2.8']?.[notation.id];
  return installed !== undefined && installed.enabled !== false;
});

describe('composeNotationReference', () => {
  it('advertises saved headers only for enabled 0.2.8 profiles', () => {
    for (const notation of enabledNotations028()) {
      expect(composeNotationReference(notation.id)).toContain(`@diagram ${notation.id}`);
    }
    expect(composeNotationReference('erd')).toBe('');
    expect(getValidTypesForNotation('erd').size).toBe(0);
  });

  it('uses saved-header UML class declarations accepted by the installed reader', () => {
    const ref = composeNotationReference('uml-class');
    expect(ref).toContain('@diagram uml-class');
    expect(ref).not.toContain('@graph ');
    const example = ref.match(/~~~coral\n([\s\S]*?)\n~~~/)?.[1];
    expect(example).toBeDefined();
    const parsed = parseInstalledDocument028(example!);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
  });

  it('lists every non-default symbol with its exact keyed spelling and no default symbol', () => {
    for (const notation of enabledNotations028()) {
      const ref = composeNotationReference(notation.id);
      for (const symbol of notation.symbols) {
        const type = semanticTypeForSymbol(symbol, notation.id)!;
        const spelling = `example ${type} [symbol: "${symbol}"] as "Label"`;
        if (effectiveSymbolId({ type }, notation.id) === symbol) expect(ref).not.toContain(spelling);
        else expect(ref, `${notation.id}.${symbol}`).toContain(spelling);
      }
    }
  });

  it('returns non-empty string for architecture notation', () => {
    const ref = composeNotationReference('architecture');
    expect(ref.length).toBeGreaterThan(50);
    expect(ref).toContain('Architecture');
  });

  it('includes node types section', () => {
    const ref = composeNotationReference('architecture');
    expect(ref).toContain('Node Types for This Notation');
    expect(ref).toContain('service');
    expect(ref).toContain('database');
  });

  it('includes edge styles section for architecture', () => {
    const ref = composeNotationReference('architecture');
    expect(ref).toContain('Edge Styles');
    expect(ref).toContain('Synchronous Call');
  });

  it('includes connection guidance', () => {
    const ref = composeNotationReference('architecture');
    expect(ref).toContain('Connection Guidance');
  });

  it('returns AI/ML types for aiml notation', () => {
    const ref = composeNotationReference('aiml');
    expect(ref).toContain('AI/ML');
    expect(ref).toContain('model');
    expect(ref).toContain('llm');
    expect(ref).toContain('dataset');
    expect(ref).toContain('vector_store');
    expect(ref).toContain('guardrail');
  });

  it('returns data engineering types for data-engineering notation', () => {
    const ref = composeNotationReference('data-engineering');
    expect(ref).toContain('warehouse');
    expect(ref).toContain('lake');
    expect(ref).toContain('stream');
    expect(ref).toContain('pipeline');
    expect(ref).toContain('dashboard');
  });

  it('returns code types for code notation', () => {
    const ref = composeNotationReference('code');
    expect(ref).toContain('function');
    expect(ref).toContain('class');
    expect(ref).toContain('interface');
    expect(ref).toContain('namespace');
  });

  it('returns flowchart types for flowchart notation', () => {
    const ref = composeNotationReference('flowchart');
    expect(ref).toContain('process');
    expect(ref).toContain('decision');
    expect(ref).toContain('terminal');
  });

  it('returns empty string for unknown notation', () => {
    const ref = composeNotationReference('nonexistent');
    expect(ref).toBe('');
  });

  it('returns mapped types for sketch notation', () => {
    const ref = composeNotationReference('sketch');
    expect(ref).toContain('step');
    expect(ref).toContain('cloud');
  });

  it('marks the default edge style', () => {
    const ref = composeNotationReference('architecture');
    expect(ref).toContain('[default]');
  });
});

describe('getValidTypesForNotation', () => {
  it('returns no types for unknown notation', () => {
    const types = getValidTypesForNotation('nonexistent');
    expect(types.size).toBe(0);
  });

  it('includes extended types for aiml notation', () => {
    const types = getValidTypesForNotation('aiml');
    expect(types.has('model')).toBe(true);
    expect(types.has('llm')).toBe(true);
    expect(types.has('dataset')).toBe(true);
    expect(types.has('guardrail')).toBe(true);
    // Also includes base types
    expect(types.has('service')).toBe(true);
    expect(types.has('database')).toBe(true);
  });

  it('includes extended types for data-engineering notation', () => {
    const types = getValidTypesForNotation('data-engineering');
    expect(types.has('warehouse')).toBe(true);
    expect(types.has('lake')).toBe(true);
    expect(types.has('stream')).toBe(true);
    expect(types.has('pipeline')).toBe(true);
    expect(types.has('service')).toBe(true);
  });

  it('includes extended types for code notation', () => {
    const types = getValidTypesForNotation('code');
    expect(types.has('function')).toBe(true);
    expect(types.has('class')).toBe(true);
    expect(types.has('interface')).toBe(true);
    expect(types.has('namespace')).toBe(true);
    expect(types.has('service')).toBe(true);
  });

  it('includes base types for architecture notation', () => {
    const types = getValidTypesForNotation('architecture');
    expect(types.has('service')).toBe(true);
    expect(types.has('database')).toBe(true);
    expect(types.has('external_api')).toBe(true);
    expect(types.has('actor')).toBe(true);
    expect(types.has('group')).toBe(true);
  });
});

describe('advertised symbol/type pairs round-trip through projection', () => {
  const ruleAllows = (notationId: string, fromType: string, toType: string): boolean => {
    const from = effectiveSymbolId({ type: fromType }, notationId);
    const to = effectiveSymbolId({ type: toType }, notationId);
    return getNotation(notationId)!.connectionRules
      .some((rule) => rule.from === from && to !== undefined && rule.to.includes(to));
  };

  it('prompt node-type lines describe the symbol each type renders as', () => {
    for (const notation of enabledNotations028()) {
      const symbols = new Map(getSymbolsForNotation(notation.id).map((s) => [s.id, s]));
      const ref = composeNotationReference(notation.id);
      const typeSection = ref.split('### Node Types for This Notation')[1]!.split('\n###')[0]!;
      for (const line of typeSection.split('\n').filter((l) => l.startsWith('  '))) {
        const [type, desc] = line.trim().split(' — ');
        if (desc === '(base type, mapped automatically)') continue;
        const rendered = effectiveSymbolId({ type: type! }, notation.id);
        const symbol = rendered ? symbols.get(rendered) : undefined;
        expect(symbol?.description || symbol?.name || rendered, `${notation.id}: ${line}`).toBe(desc);
      }
    }
  });

  it('prompt connection guidance only claims rules that hold for rendered symbols', () => {
    for (const notation of enabledNotations028()) {
      const ref = composeNotationReference(notation.id);
      const guidance = ref.split('### Connection Guidance')[1]!;
      for (const line of guidance.split('\n').filter((l) => l.includes(' → '))) {
        const [fromType, rest] = line.trim().split(' → ');
        const toTypes = rest!.replace(/ \(.*\)$/, '').split(', ');
        for (const toType of toTypes) {
          expect(ruleAllows(notation.id, fromType!, toType), `${notation.id}: ${line} [${toType}]`).toBe(true);
        }
      }
    }
  });

  it('lint connection lookup only allows pairs that hold for rendered symbols', () => {
    for (const notation of notationRegistry.getAll()) {
      const lookup = buildConnectionLookup(notation.id);
      for (const [fromType, toTypes] of lookup ?? []) {
        for (const toType of toTypes) {
          expect(ruleAllows(notation.id, fromType, toType), `${notation.id}: ${fromType} → ${toType}`).toBe(true);
        }
      }
    }
  });
});
