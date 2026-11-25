import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { renderCharacterGraph028 as publicRenderCharacterGraph028 } from '../src/index.js';
import {
  decodeCharacterField028, encodeCharacterField028, parseCharacterLedger028, renderCharacterGraph028,
  CharacterRenderError,
} from '../src/characters028.js';

const blockSource = '@diagram block\nsource block as "Same"\nsink block as "Same"\n' +
  'transfer = source -> sink as "Data"\n';
const flowSource = '@diagram flowchart\nstart terminal [variant: "start"]\n' +
  'check decision\nfinish terminal [variant: "end"]\n' +
  'start -> check\ncheck -> finish [label: "Yes"]\n';

function parsed(source: string): GraphIR {
  const document = parseInstalledDocument028(source);
  expect(document.syntax.diagnostics).toEqual([]);
  expect(document.header.diagnostics).toEqual([]);
  expect(document.graph).toBeDefined();
  return document.graph!;
}

describe('0.2.8 bounded character ledger', () => {
  it.each([40, 80, 120] as const)('renders parsed Block and flowchart meaning within %i columns', (columns) => {
    for (const graph of [parsed(blockSource), parsed(flowSource)]) {
      const result = renderCharacterGraph028(graph, { columns });
      expect(result.charset).toBe('ASCII');
      expect(result.text).toMatch(/^CHAR\/1 (block|flowchart) ASCII\nGRAPH\n/);
      expect(result.text).toContain('K flow');
      expect(result.text.split('\n').every((line) => line.length <= columns)).toBe(true);
      expect(/^[\x20-\x7e\n]*$/.test(result.text)).toBe(true);
      expect(renderCharacterGraph028(graph, { columns })).toEqual(result);
    }
    const block = renderCharacterGraph028(parsed(blockSource), { columns }).text;
    expect(block).toContain('F "source"');
    expect(block).toContain('T "sink"');
    expect(block).toContain('R block');
    const flow = renderCharacterGraph028(parsed(flowSource), { columns }).text;
    expect(flow).toContain('R decision');
    expect(flow).toContain('L "Yes"');
  });

  it('round-trips hostile scalar text and distinguishes equal visible names by stable IDs', () => {
    const graph = structuredClone(parsed(blockSource));
    const hostile = 'Å|"\\\n\t\u0001😀';
    graph.nodes[0]!.id = 'long-identity-needs-to-wrap-over-forty-columns-😀';
    graph.edges[0]!.source = graph.nodes[0]!.id;
    graph.nodes[0]!.label = hostile;
    const result = renderCharacterGraph028(graph, { columns: 40 });
    expect(result.text).toContain('N 01');
    expect(result.text).toContain('N 02');
      expect(result.text).toContain('L "\\u{C5}\\u{7C}');
    expect(result.text.split('\n').every((line) => line.length <= 40)).toBe(true);
    expect(decodeCharacterField028(encodeCharacterField028(hostile))).toBe(hostile);
    expect(decodeCharacterField028(encodeCharacterField028(graph.nodes[0]!.id))).toBe(graph.nodes[0]!.id);
    const recovered = parseCharacterLedger028(result.text);
    expect(recovered.graphId).toBe(graph.id);
    expect(recovered.nodes.map(({ id, label }) => ({ id, label }))).toEqual(
      graph.nodes.map(({ id, label }) => ({ id, label })),
    );
    expect(recovered.edges[0]).toMatchObject({
      id: graph.edges[0]!.id, source: graph.edges[0]!.source,
      target: graph.edges[0]!.target, label: graph.edges[0]!.label,
    });
  });

  it('uses whole-diagram ASCII when MonoTrue is unavailable or lacks a required role', () => {
    const graph = parsed(blockSource);
    for (const capability of [undefined, {
      profile: 'monotrue-v1' as const, selected: true, fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
      validatedRoles: ['stroke.single.h'],
    }]) {
      const result = renderCharacterGraph028(graph, { columns: 80, monoTrue: capability });
      expect(result.charset).toBe('ASCII');
      expect(/^[\x20-\x7e\n]*$/.test(result.text)).toBe(true);
    }
  });

  it('selects standard MonoTrue Unicode only for a complete controlled-host capability', () => {
    const graph = parsed(blockSource);
    const monoTrue = {
      profile: 'monotrue-v1' as const, selected: true as const, face: 'Regular' as const,
      fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
      validatedRoles: [
        'stroke.single.nw', 'stroke.single.h', 'stroke.single.ne',
        'stroke.single.v', 'stroke.single.sw', 'stroke.single.se',
      ],
    };
    const controlled = renderCharacterGraph028(graph, { columns: 80, target: 'controlled-display', monoTrue });
    expect(controlled.charset).toBe('MonoTrue-v1');
    expect(controlled.text).toContain('┌──────────────┐');
    expect(parseCharacterLedger028(controlled.text).nodes).toHaveLength(2);
    const copied = renderCharacterGraph028(graph, { columns: 80, target: 'copy-export', monoTrue });
    expect(copied.charset).toBe('ASCII');
    expect(/^[\x20-\x7e\n]*$/.test(copied.text)).toBe(true);
    const wrongFaceHash = renderCharacterGraph028(graph, {
      columns: 80, target: 'controlled-display', monoTrue: { ...monoTrue, face: 'Bold' },
    });
    expect(wrongFaceHash.charset).toBe('ASCII');
  });

  it('exposes the same renderer through the package entry point for API consumers', () => {
    const graph = parsed(flowSource);
    const options = { columns: 40 as const, target: 'copy-export' as const };
    expect(publicRenderCharacterGraph028(graph, options)).toEqual(renderCharacterGraph028(graph, options));
  });

  it('refuses unsupported semantics with typed attribution and no graph mutation', () => {
    const graph = parsed(blockSource);
    const before = structuredClone(graph);
    const withGroup = structuredClone(graph);
    withGroup.nodes[0]!.children = [{ id: 'nested', type: 'block' }];
    for (const candidate of [
      withGroup,
      { ...graph, metadata: { notation: 'infrastructure' } },
      { ...graph, nodes: [{ ...graph.nodes[0]!, label: '\uD800' }, graph.nodes[1]!] },
      { ...graph, edges: [{ ...graph.edges[0]!, sourceEnd: { marker: { kind: 'arrow', fill: 'open' } } }] },
    ]) {
      expect(() => renderCharacterGraph028(candidate as GraphIR, { columns: 80 })).toThrow(CharacterRenderError);
    }
    expect(graph).toEqual(before);
  });

  it('refuses oversized fields and cumulative text before allocating output', () => {
    const graph = parsed(blockSource);
    const huge = structuredClone(graph);
    huge.nodes[0]!.label = 'x'.repeat(100_000);
    expect(() => renderCharacterGraph028(huge, { columns: 40 })).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }),
    );
    const cumulative = structuredClone(graph);
    cumulative.nodes[0]!.label = 'x'.repeat(2_000);
    cumulative.nodes[1]!.label = 'y'.repeat(2_000);
    cumulative.edges[0]!.label = 'z'.repeat(2_000);
    cumulative.name = 'w'.repeat(2_000);
    cumulative.id = 'q'.repeat(2_000);
    expect(() => renderCharacterGraph028(cumulative, { columns: 40 })).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }),
    );
  });

  it('refuses every selected notation outside the bounded first slice', () => {
    const graph = parsed(blockSource);
    for (const notation of [
      'dfd', 'infrastructure', 'system-architecture', 'uml-sequence', 'uml-class',
      'uml-use-case', 'uml-state',
    ]) {
      const candidate = { ...graph, metadata: { notation } } as GraphIR;
      try {
        renderCharacterGraph028(candidate, { columns: 80 });
        throw new Error(`Expected refusal for ${notation}`);
      } catch (error) {
        expect(error).toBeInstanceOf(CharacterRenderError);
        expect((error as CharacterRenderError).code).toBe('character.notation.unsupported');
      }
    }
  });
});
