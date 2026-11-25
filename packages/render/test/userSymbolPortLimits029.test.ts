import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028, installedWrittenPortReferenceRanges028 } from '../src/installedDocument028.js';
import { resolveNodeInterpretation028, type CatalogSnapshot028 } from '../src/interpretation028.js';
import { assessInstalledSuccessorSourceIntegrity028 } from '../src/successorSourceIntegrity028.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { assessSuccessorSourcePortLimits029 } from '../src/successorSourcePortReferences028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { userSymbolNotices029 } from '../src/userSymbolNotices029.js';

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const doc = (diagram: string, edition: string | undefined, ...lines: string[]) => [`@diagram ${diagram}`,
  ...(edition ? [`@coralVersion "${edition}"`] : []), ...lines, ''].join('\n');
const limits = (source: string) => {
  const document = parseInstalledDocument028(source);
  const graph = projectInstalledSourceToSuccessor028(source).graph!;
  return assessSuccessorSourcePortLimits029(graph, resolveSuccessorGraphNodes028(graph),
    installedWrittenPortReferenceRanges028(document));
};
const integrityCodes = (source: string) => {
  const graph = projectInstalledSourceToSuccessor028(source).graph!;
  return assessInstalledSuccessorSourceIntegrity028(parseInstalledDocument028(source), graph)
    .map((item) => item.code);
};

describe('connection counting', () => {
  it('counts only endpoints that name the port and reports the first excess endpoint', () => {
    const source = doc('architecture', '0.2.9', 'a service', 'b service', 'c service',
      'vault database {', '  ingest port [direction: in, maxConnections: 1]', '}',
      'a -> vault:ingest', 'c -> vault', 'b -> vault:ingest');
    expect(limits(source)).toEqual([expect.objectContaining({
      code: 'coral.port.connections.exceeded', nodeId: 'vault', portId: 'ingest', count: 2, limit: 1,
      range: expect.objectContaining({ start: expect.objectContaining({ line: 11, column: 11 }) }),
      message: expect.stringMatching(/ingest.*vault.*2.*1/) })]);
  });

  it('counts a self-loop that names one port at both ends twice, with later excess endpoints related', () => {
    const source = doc('architecture', '0.2.9', 'x service {',
      '  io port [direction: inout, maxConnections: 1]', '}', 'x:io -> x:io', 'x:io -> x:io');
    const [issue, ...rest] = limits(source);
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ count: 4, limit: 1, range: { start: { line: 6, column: 10 } } });
    expect(issue!.related?.map((item) => [item.range.start.line, item.range.start.column]))
      .toEqual([[7, 2], [7, 10]]);
  });

  it('applies user-symbol, bundled and variant limits', () => {
    const user = doc('architecture', '0.2.9', '@symbol gate {', '  name "Gate"', '  size 40 x 40',
      '  login port [direction: in, maxConnections: 1]', ...ARTWORK, '}', 'g service [symbol: "local.gate"]',
      'a service', 'b service', 'a -> g:login', 'b -> g:login');
    expect(limits(user)).toEqual([expect.objectContaining({ nodeId: 'g', portId: 'login', count: 2, limit: 1 })]);
    const bundled = doc('flowchart', '0.2.9', 'a process', 'b process', 'd decision', 'a -> d:in', 'b -> d:in');
    expect(limits(bundled)).toEqual([expect.objectContaining({ nodeId: 'd', portId: 'in', count: 2, limit: 1 })]);
    const symbols = new Map([['s', { id: 's', name: 'S', shape: 'rectangle', tags: [],
      variants: { v: { name: 'V', ports: [{ id: 'p', anchor: 'NORTH' as const, direction: 'in' as const,
        maxConnections: 1 }] } } }]]);
    const catalog: CatalogSnapshot028 = { identity: { id: 'x', version: '1', digest: 'd' }, profileId: 'x',
      symbols, allowedSymbolIds: new Set(['s']), typeSymbols: new Map() };
    const variantGraph = projectInstalledSourceToSuccessor028(doc('architecture', '0.2.9',
      'n service', 'a service', 'b service', 'a -> n:p', 'b -> n:p')).graph!;
    const interpretations = new Map(resolveSuccessorGraphNodes028(variantGraph));
    interpretations.set('n', resolveNodeInterpretation028({ id: 'n', type: 'service', symbol: 's', variant: 'v' }, catalog));
    expect(assessSuccessorSourcePortLimits029(variantGraph, interpretations))
      .toEqual([expect.objectContaining({ nodeId: 'n', portId: 'p', count: 2, limit: 1 })]);
  });
});

describe('edition-scoped read diagnostics', () => {
  const bundled = (edition?: string) => doc('flowchart', edition, 'a process', 'b process', 'd decision',
    'a -> d:in', 'b -> d:in');

  it('reports an exceeded limit on read in an edition 0.2.9 document', () => {
    expect(integrityCodes(bundled('0.2.9'))).toContain('coral.port.connections.exceeded');
    expect(verifyPortableSuccessorSource028(bundled('0.2.9')).diagnostics.map((item) => item.code))
      .toContain('coral.port.connections.exceeded');
  });

  it('adds no diagnostic to an edition 0.2.8 document that exceeds a bundled limit', () => {
    for (const source of [bundled(), bundled('0.2.8')]) {
      expect(integrityCodes(source)).not.toContain('coral.port.connections.exceeded');
      expect(verifyPortableSuccessorSource028(source).diagnostics.map((item) => item.code))
        .not.toContain('coral.port.connections.exceeded');
    }
  });
});

describe('unused definitions', () => {
  it('notes each definition no node selects, at its opening line', () => {
    const source = doc('architecture', '0.2.9', '@symbol used {', '  name "Used"', '  size 40 x 40', ...ARTWORK, '}',
      '@symbol spare {', '  name "Spare"', '  size 40 x 40', ...ARTWORK, '}', 'u service [symbol: "local.used"]');
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    expect(userSymbolNotices029(parseInstalledDocument028(source), graph)).toEqual([expect.objectContaining({
      severity: 'info', code: 'coral.symbol.local.unused', range: expect.objectContaining({
        start: expect.objectContaining({ line: 10, column: 0 }) }),
      message: expect.stringContaining('local.spare') })]);
  });
});
