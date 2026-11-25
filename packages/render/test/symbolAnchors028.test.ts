import { describe, expect, it } from 'vitest';
import type { SymbolDefinition } from '../src/types.js';
import { namedSymbolAnchors028, resolveNamedSymbolAnchor028 } from '../src/symbolAnchors028.js';

const symbol = (): SymbolDefinition => ({ id: 'decision', name: 'Decision', shape: 'diamond', tags: [],
  namedAnchors: [{ id: 'base', side: 'EAST', position: 0.25 }],
  variants: {
    inherit: { name: 'Inherit' },
    replace: { name: 'Replace', namedAnchors: [{ id: 'variant', side: 'SOUTH', position: 0.75 }] },
    empty: { name: 'Empty', namedAnchors: [] },
  } });

describe('0.2.8 named stencil-anchor catalog contract', () => {
  it('inherits only when the variant omits the list, and honors replacement and empty lists', () => {
    const definition = symbol();
    expect(namedSymbolAnchors028(definition, undefined).map((item) => item.id)).toEqual(['base']);
    expect(namedSymbolAnchors028(definition, 'inherit').map((item) => item.id)).toEqual(['base']);
    expect(namedSymbolAnchors028(definition, 'replace').map((item) => item.id)).toEqual(['variant']);
    expect(namedSymbolAnchors028(definition, 'empty')).toEqual([]);
    expect(() => resolveNamedSymbolAnchor028(definition, 'replace', 'base'))
      .toThrow(/coral\.port\.anchor\.symbol-unknown/);
    expect(() => resolveNamedSymbolAnchor028(definition, 'empty', 'base'))
      .toThrow(/coral\.port\.anchor\.symbol-unknown/);
  });

  it('allows compass words that have no generic Coral meaning as catalog anchor IDs', () => {
    const definition = { ...symbol(), namedAnchors: [
      { id: 'north', side: 'NORTH' as const, position: 0.5 },
      { id: 'south', side: 'SOUTH' as const, position: 0.5 },
      { id: 'east', side: 'EAST' as const, position: 0.5 },
      { id: 'west', side: 'WEST' as const, position: 0.5 },
    ] };
    expect(namedSymbolAnchors028(definition, undefined).map((anchor) => anchor.id))
      .toEqual(['north', 'south', 'east', 'west']);
    expect(resolveNamedSymbolAnchor028(definition, undefined, 'east').side).toBe('EAST');
  });

  it.each([
    [{ id: '', side: 'EAST', position: 0.5 }],
    [{ id: 'east-rim', side: 'EAST', position: 0.5 }],
    [{ id: 'north.rim', side: 'NORTH', position: 0.5 }],
    [{ id: '2east', side: 'EAST', position: 0.5 }],
    [{ id: 'auto', side: 'EAST', position: 0.5 }],
    [{ id: 'side', side: 'EAST', position: 0.5 }],
    [{ id: 'right', side: 'EAST', position: 0.5 }],
    [{ id: 'N', side: 'NORTH', position: 0.5 }],
    [{ id: 'same', side: 'EAST', position: 0.5 }, { id: 'same', side: 'WEST', position: 0.5 }],
    [{ id: 'bad', side: 'CENTER', position: 0.5 }],
    [{ id: 'bad', side: 'EAST', position: Number.NaN }],
    [{ id: 'bad', side: 'EAST', position: -0.01 }],
    [{ id: 'bad', side: 'EAST', position: 1.01 }],
  ].map((anchors) => [anchors]))('rejects a malformed catalog list instead of projecting any named anchor',
    (namedAnchors) => {
    const definition = { ...symbol(), namedAnchors } as SymbolDefinition;
    expect(() => namedSymbolAnchors028(definition, undefined))
      .toThrow(/coral\.catalog\.anchor\.invalid/);
    });

  it('rejects a non-list catalog field with the same typed error', () => {
    const definition = { ...symbol(), namedAnchors: { east: 0.5 } } as unknown as SymbolDefinition;
    expect(() => namedSymbolAnchors028(definition, undefined))
      .toThrow(/coral\.catalog\.anchor\.invalid/);
  });
});
