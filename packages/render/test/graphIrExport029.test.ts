import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { describe, expect, it } from 'vitest';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { successorCatalogSnapshot028, successorCoreValidationInput029 } from '../src/successorInterpretation028.js';
import { graphIrExportRefusal029, verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { assessSuccessorSourcePortLimits029 } from '../src/successorSourcePortReferences028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { symbolRegistry } from '../src/symbols/index.js';

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const definition = ['@symbol gate {', '  name "Gate"', '  size 40 x 40',
  '  login port [direction: in, maxConnections: 1]', ...ARTWORK, '}'];
const doc029 = (diagram: string, ...lines: string[]) => [`@diagram ${diagram}`, '@coralVersion "0.2.9"', ...lines, ''].join('\n');
const project = (source: string) => {
  const projected = projectInstalledSourceToSuccessor028(source);
  expect(projected.diagnostics).toEqual([]);
  return projected.graph!;
};
const coreExceeded = (source: string): boolean => {
  const core = successorCoreValidationInput029(project(source), { limits: true });
  return validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options).errors
    .some((error) => error.code === 'PORT_CONNECTIONS_EXCEEDED');
};
const OVER_DECISION_028 = '@diagram flowchart\na process\nb process\nd decision\na -> d:in\nb -> d:in\n';

describe('bundled port limits in the GraphIR snapshot', () => {
  it('carries every bundled base and variant port limit', () => {
    const snapshot = successorCatalogSnapshot028(project('@diagram flowchart\na process\n'));
    const ports = (list: readonly { id: string; direction: string; maxConnections?: number }[] | undefined) =>
      list?.map(({ id, direction, maxConnections }) => ({ id, direction,
        ...(maxConnections !== undefined ? { maxConnections } : {}) }));
    for (const symbol of symbolRegistry.getAll()) {
      expect(snapshot.symbols[symbol.id]?.ports, symbol.id).toEqual(ports(symbol.ports));
      for (const [id, variant] of Object.entries(symbol.variants ?? {})) {
        expect(snapshot.symbols[symbol.id]?.variants?.[id]?.ports, `${symbol.id}/${id}`).toEqual(ports(variant.ports));
      }
    }
    expect(snapshot.symbols['flowchart-decision']!.ports![0]).toEqual({ id: 'in', direction: 'in', maxConnections: 1 });
  });

  it('leaves bundled and node-port limits to the edition-scoped reader on read', () => {
    const graph = project(doc029('architecture', 'n service {', '  p port [direction: in, maxConnections: 2]', '}'));
    const read = successorCoreValidationInput029(graph);
    expect(Object.values(read.snapshot.symbols).flatMap((entry) => [entry, ...Object.values(entry.variants ?? {})])
      .flatMap((entry) => entry.ports ?? []).some((port) => 'maxConnections' in port)).toBe(false);
    expect(read.graph.nodes[0]!.semanticPorts).toEqual([{ id: 'p', direction: 'in' }]);
    const exported = successorCoreValidationInput029(graph, { limits: true });
    expect(exported.graph.nodes[0]!.semanticPorts).toEqual([{ id: 'p', direction: 'in', maxConnections: 2 }]);
    const checked = validateGraphIRSuccessorWithCatalog(exported.graph, exported.snapshot, exported.options);
    expect(checked.errors).toEqual([]);
    expect(checked.verification.complete).toBe(true);
  });

  it('gives an edition 0.2.8 document over a bundled limit no new read diagnostic', () => {
    expect(verifyPortableSuccessorSource028(OVER_DECISION_028).diagnostics).toEqual([]);
    expect(checkInstalledSuccessorSourceConformance028(OVER_DECISION_028, { requestedLevel: 'none' }).diagnostics)
      .toEqual([]);
  });
});

describe('Coral and core count connections alike', () => {
  const authored = (...edges: string[]) => doc029('architecture', 'a service', 'b service',
    'n service {', '  p port [direction: inout, maxConnections: 1]', '}', ...edges);
  it.each([
    ['inherited bundled limit', doc029('flowchart', 'a process', 'b process', 'd decision', 'a -> d:in', 'b -> d:in'), true],
    ['inherited bundled limit, once', doc029('flowchart', 'a process', 'd decision', 'a -> d:in'), false],
    ['definition port limit', doc029('architecture', ...definition, 'g service [symbol: "local.gate"]',
      'a service', 'b service', 'a -> g:login', 'b -> g:login'), true],
    ['authored limit, ->', authored('a -> n:p', 'b -> n:p'), true],
    ['authored limit, <-', authored('n:p <- a', 'n:p <- b'), true],
    ['authored limit, <->', authored('a <-> n:p', 'b <-> n:p'), true],
    ['authored limit, -', authored('a - n:p', 'b - n:p'), true],
    ['a self-loop counts twice', authored('n:p -> n:p'), true],
    ['a port-less endpoint never counts', authored('a -> n:p', 'b -> n'), false],
  ])('%s', (_name, source, exceeded) => {
    expect(assessSuccessorSourcePortLimits029(project(source)).length > 0).toBe(exceeded);
    expect(coreExceeded(source)).toBe(exceeded);
  });
});

describe('GraphIR 4 export refusals', () => {
  it('refuses an edition 0.2.8 document over a bundled limit, located on the endpoint beyond it', () => {
    const refusals = graphIrExportRefusal029(project(OVER_DECISION_028), OVER_DECISION_028);
    expect(refusals).toEqual([expect.objectContaining({ severity: 'error', code: 'export.graphir.port-limit.exceeded',
      detail: 'GraphIR 4.0.0 candidate', message: expect.stringContaining('Port in on d has 2 connections') })]);
    expect(refusals[0]!.range?.start).toMatchObject({ line: 6 });
  });

  it('exports port limits within their limits', () => {
    const graph = project(doc029('architecture', 'a service', 'n service {',
      '  p port [direction: in, maxConnections: 2]', '}', 'a -> n:p'));
    expect(graphIrExportRefusal029(graph)).toEqual([]);
  });

  it.each([
    ['a used definition', [...definition, 'g service [symbol: "local.gate"]']],
    ['an unused definition', [...definition, 'g service']],
  ])('exports %s with the frozen artwork profile', (_name, lines) => {
    expect(graphIrExportRefusal029(project(doc029('architecture', ...lines)))).toEqual([]);
  });

  it('lets a document without definitions or exceeded limits through, including port labels', () => {
    expect(graphIrExportRefusal029(project(doc029('architecture', 'g service {', '  p port [direction: in, label: "In"]', '}'))))
      .toEqual([]);
    expect(graphIrExportRefusal029(project('@diagram architecture\na service\nb service\na -> b\n'))).toEqual([]);
  });
});
