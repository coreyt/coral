import { describe, expect, it } from 'vitest';
import { successorCoreValidationInput029 } from '../src/successorInterpretation028.js';
import { graphIrExportRefusal029 } from '../src/successorPortableExport028.js';
import { projectInstalledSourceToSuccessor028, type SuccessorGraphIr029 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';

// Real production GraphIR interchange; no test-only freeze override.

const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>';
const HAND = "<svg viewBox=' 0 0 24 16' xmlns='http://www.w3.org/2000/svg'><!-- hand --><path d='M0,0 L24,0 L24,16 z' fill='#2F6F4F'/></svg>";
const gate = ['@symbol gate {', '  name "Gate"', '  description "Ingress"', '  tags "edge" "auth"', '  size 40 x 30',
  '  label right', '  outline diamond', '  tint stroke', '  source "Drawn here"', '  license "CC0-1.0"',
  '  crest anchor [side: N, at: 0.25]'.replace('crest anchor', 'anchor crest'),
  '  anchor core [x: 0.5, y: 0.5, exit: E]', '  login port [direction: in, anchor: crest, label: "Login", maxConnections: 2]',
  '  out port [direction: out, anchor: up]', '  artwork svg """', HAND, '"""', '}'];
const plain = ['@symbol spare {', '  name "Spare"', '  size 16 x 16', '  artwork svg """', ART, '"""', '}'];
const doc = (...lines: string[]) => ['@diagram architecture', '@coralVersion "0.2.9"', '', ...lines, ''].join('\n');
const exportOf = (source: string): SuccessorGraphIr029 => {
  const projected = projectInstalledSourceToSuccessor028(source);
  expect(projected.diagnostics).toEqual([]);
  expect(graphIrExportRefusal029(projected.graph!, source)).toEqual([]);
  return successorCoreValidationInput029(projected.graph!, { limits: true }).graph;
};
const imported = (graph: SuccessorGraphIr029): string => {
  const written = printSuccessorSource028(graph);
  expect(written.diagnostics).toEqual([]);
  return written.text!;
};

describe('GraphIR 4 round trips of document symbols', () => {
  it.each([
    ['a used definition', doc(...gate, 'g service [symbol: "local.gate"]', 'a service', 'r1 = a -> g:login')],
    ['an unused definition', doc(...plain, 'a service')],
    ['mixed bundled and local nodes', doc(...gate, ...plain, 'g service [symbol: "local.gate"]',
      'd database', 's service [symbol: "local.spare"]', 'r1 = d -> g:login', 'r2 = g:out -> s')],
  ])('%s reaches a fixed point', (_name, source) => {
    const first = exportOf(source);
    expect(first.documentCatalog?.length).toBeGreaterThan(0);
    const written = imported(first);
    expect(exportOf(written)).toEqual(first);
    expect(imported(exportOf(written))).toBe(written);
  });

  it('writes canonical artwork, so imported text differs from the hand-written block only in artwork', () => {
    const written = imported(exportOf(doc(...gate, 'a service')));
    expect(written).not.toContain('<!-- hand -->');
    expect(written).toContain('  anchor crest [side: N, at: 0.25]\n');
    expect(written).toContain('  out port [direction: out, anchor: N]\n');
  });
});

describe('GraphIR 4 import refusals', () => {
  const graph = () => exportOf(doc(...plain, 'a service'));
  const codes = (value: SuccessorGraphIr029) => printSuccessorSource028(value).diagnostics.map(({ code }) => code);

  it('refuses a digest mismatch', () => {
    const value = graph();
    value.documentCatalog![0]!.digest = `sha256:${'0'.repeat(64)}`;
    expect(printSuccessorSource028(value).diagnostics).toEqual([expect.objectContaining({ severity: 'error',
      code: 'import.graphir.local-symbol.digest-mismatch',
      message: expect.stringMatching(/ at \/documentCatalog\/0\/digest$/) })]);
  });

  it('refuses rejected artwork with the first coral.artwork.svg failure', () => {
    const value = graph();
    value.documentCatalog![0]!.artwork.text = '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>';
    const diagnostics = printSuccessorSource028(value).diagnostics;
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'import.graphir.artwork.rejected',
      message: expect.stringMatching(/coral\.artwork\.svg\.[a-z.]+: .* at \/documentCatalog\/0\/artwork\/text$/) }));
  });

  it('refuses admissible artwork that is not canonical', () => {
    const value = graph();
    value.documentCatalog![0]!.artwork.text = HAND;
    expect(codes(value)).toContain('import.graphir.artwork.noncanonical');
  });

  it('refuses a profile version Coral lacks', () => {
    const value = graph();
    value.documentCatalog![0]!.artwork.profile.version = '2';
    expect(codes(value)).toContain('import.graphir.artwork.profile-unsupported');
  });

  it('maps every other GraphIR finding to a located GRAPHIR diagnostic', () => {
    const value = exportOf(doc(...gate, 'g service [symbol: "local.gate"]', 'a service', 'req = a -> g:login',
      'route edge req {', '  bend = waypoint relative to port g:login offset (20, 0)', '}'));
    const anchor = value.edges[0]!.routeIntent!.waypoints[0]!.placement;
    if (anchor.kind !== 'relative' || anchor.anchor.kind !== 'port') throw new Error('expected a port anchor');
    anchor.anchor.portId = 'absent';
    expect(printSuccessorSource028(value).diagnostics).toContainEqual(expect.objectContaining({ severity: 'error',
      code: 'GRAPHIR.UNKNOWN_ROUTE_SEMANTIC_PORT', message: expect.stringMatching(/ at \/edges\/0\/routeIntent\/.+$/) }));
  });

  it('applies bundled port limits to an imported graph', () => {
    const value = exportOf(['@diagram flowchart', '@coralVersion "0.2.9"', ...plain, 'a process', 'b process',
      'd decision', 'a -> d:in', ''].join('\n'));
    value.edges.push({ ...structuredClone(value.edges[0]!), id: 'second', first: { node: 'b' } });
    expect(codes(value)).toContain('GRAPHIR.PORT_CONNECTIONS_EXCEEDED');
  });
});
