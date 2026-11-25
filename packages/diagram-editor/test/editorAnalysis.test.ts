import { describe, expect, it } from 'vitest';
import { analyzeEditorSource } from '../src/editorAnalysis';
import { parseCoralDSL, parseMermaidDSL } from '../src/parsers';

function marked(source: string, format: 'coral' | 'mermaid') {
  const parsed = format === 'coral' ? parseCoralDSL(source) : parseMermaidDSL(source);
  return analyzeEditorSource(source, format, parsed.nodes, parsed.edges)
    .map((item) => ({ text: source.slice(item.start, item.end), entityId: item.entityId }));
}

function occurrences(source: string, format: 'coral' | 'mermaid') {
  const parsed = format === 'coral' ? parseCoralDSL(source) : parseMermaidDSL(source);
  return analyzeEditorSource(source, format, parsed.nodes, parsed.edges);
}

describe('R-036 entity occurrence analysis', () => {
  it('marks saved-header ID-first declarations and written connector endpoints', () => {
    const source = '@diagram flowchart\napi process as "API"\ndb process as "DB"\napi:out -> db:in\n';
    expect(marked(source, 'coral')).toEqual([
      { text: 'api', entityId: 'api' },
      { text: 'db', entityId: 'db' },
      { text: 'api', entityId: 'api' },
      { text: 'db', entityId: 'db' },
    ]);
  });

  it('keeps qualified group IDs on their exact source tokens', () => {
    const source = '@diagram flowchart\nsales group {\n  api process\n}\nops group {\n  api process\n}\nsales.api -> ops.api\n';
    expect(marked(source, 'coral')).toEqual([
      { text: 'sales', entityId: 'sales' },
      { text: 'api', entityId: 'sales.api' },
      { text: 'ops', entityId: 'ops' },
      { text: 'api', entityId: 'ops.api' },
      { text: 'sales.api', entityId: 'sales.api' },
      { text: 'ops.api', entityId: 'ops.api' },
    ]);
  });

  it('recognizes compact ends without highlighting roles or markers as entities', () => {
    const source = 'a (1 "role -> )" diamond+) -> b (0..* "a")';
    const edge = { id: 'edge', source: 'a', target: 'b', sourceInfo: { range: { start: 0, end: source.length } } };
    expect(analyzeEditorSource(source, 'coral', [], [edge]).map((item) => ({ text: source.slice(item.start, item.end), id: item.entityId })))
      .toEqual([{ text: 'a', id: 'a' }, { text: 'b', id: 'b' }]);
  });
  it('marks written IDs without treating escaped rendered labels as identity', () => {
    const source = '@diagram flowchart\napi process as "A\\\"PI"\napi -> api as "loop"';
    expect(marked(source, 'coral')).toEqual([
      { text: 'api', entityId: 'api' },
      { text: 'api', entityId: 'api' },
      { text: 'api', entityId: 'api' },
    ]);
  });

  it('does not publish entity occurrences from a duplicate-ID draft', () => {
    const source = '@diagram flowchart\nsame process\nsame process\n';
    expect(parseCoralDSL(source).errors.length).toBeGreaterThan(0);
    expect(occurrences(source, 'coral')).toEqual([]);
  });

  it('marks only Mermaid IDs from recognized declarations and endpoints', () => {
    const source = 'flowchart TD\nA[Alpha] --> B[Beta]\nstyle A fill:red\nignored prose';
    expect(marked(source, 'mermaid')).toEqual([
      { text: 'A', entityId: 'A' },
      { text: 'B', entityId: 'B' },
    ]);
  });

  it('uses the endpoint token offset rather than matching inside its label and rejects ignored suffixes', () => {
    const source = 'A --> B[Beta]\nA --> B junk';
    expect(occurrences(source, 'mermaid')).toEqual([
      { start: 0, end: 1, entityId: 'A' },
      { start: 6, end: 7, entityId: 'B' },
    ]);
  });
});
