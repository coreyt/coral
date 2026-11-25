import { describe, it, expect } from 'vitest';
import { detectFormat, SOURCE_FORMATS } from '../src/index.js';

// One row per line of the Slice 55 detection table (R-064 AC-1).
export const DETECTION_TABLE: Array<[string, string, string | undefined, string | null, string]> = [
  ['coral extension', 'anything', 'a.coral', 'coral', 'extension'],
  ['mmd extension', 'digraph G { a -> b }', 'a.mmd', 'mermaid', 'extension'],
  ['mermaid extension', 'flowchart LR', 'a.mermaid', 'mermaid', 'extension'],
  ['dot extension', 'graph TD', 'a.dot', 'dot', 'extension'],
  ['gv extension', 'digraph {}', 'A.GV', 'dot', 'extension'],
  ['puml extension', 'x', 'a.puml', 'plantuml', 'extension'],
  ['plantuml extension', 'x', 'a.plantuml', 'plantuml', 'extension'],
  ['pu extension', 'x', 'a.pu', 'plantuml', 'extension'],
  ['coral document', '{"schemaVersion":"1.0.0","content":{"format":"graph-ir"}}', 'a.coral.json', 'coral-document', 'content'],
  ['graphir json', '{"version":"2.0.0","nodes":[],"edges":[]}', 'a.json', 'graphir-json', 'content'],
  ['graphir json without name', '  {"version":"3.0.0","nodes":[]}', undefined, 'graphir-json', 'content'],
  ['json matching neither', '{"hello":1}', 'a.json', null, 'content'],
  ['invalid json', '{ nope', 'a.json', null, 'content'],
  ['json array', '[1,2]', 'a.json', null, 'content'],
  ['plantuml content', '@startuml\nA -> B\n@enduml', 'a.txt', 'plantuml', 'content'],
  ['mermaid keyword', 'sequenceDiagram\nA->>B: hi', undefined, 'mermaid', 'content'],
  ['mermaid graph direction', 'graph TD\nA-->B', 'a.txt', 'mermaid', 'content'],
  ['dot content', 'strict digraph G {\n a -> b\n}', undefined, 'dot', 'content'],
  ['binary content', 'PNG\u0000\u0001', 'a.png', null, 'content'],
  ['coral header', '@graph {"id":"x"}\nservice a', 'a.txt', 'coral', 'content'],
  ['commented coral header', '// title\n@graph {"id":"x"}', undefined, 'coral', 'content'],
  ['required 0.2.8 diagram header', '@diagram flowchart\nstart process', 'a.txt', 'coral', 'content'],
  ['commented 0.2.8 diagram header', '// title\n@diagram uml-sequence\nclient participant',
    undefined, 'coral', 'content'],
  ['mermaid front matter', '---\ntitle: T\n---\nflowchart LR\nA-->B', undefined, 'mermaid', 'content'],
  ['mermaid comment and directive', '%% note\n%%{init: {}}%%\ngraph TD\nA-->B', 'a.txt', 'mermaid', 'content'],
  ['dot block comment', '/* g */\n// x\ndigraph G { a -> b }', undefined, 'dot', 'content'],
  ['dot hash comment', '# generated\ndigraph G { a -> b }', undefined, 'dot', 'content'],
  ['mermaid gantt', 'gantt\n  title Plan', 'a.txt', 'mermaid', 'content'],
  ['mermaid pie', 'pie title Pets', undefined, 'mermaid', 'content'],
  ['mermaid mindmap', 'mindmap\n  root', undefined, 'mermaid', 'content'],
  ['coral fallback', 'service a', 'a.txt', 'coral', 'fallback'],
  ['empty fallback', '', undefined, 'coral', 'fallback'],
];

describe('detectFormat', () => {
  it.each(DETECTION_TABLE)('%s', (_name, text, fileName, format, basis) => {
    const result = detectFormat(text, fileName === undefined ? {} : { fileName });
    expect(result.format).toBe(format);
    expect(result.basis).toBe(basis);
    if (format === null || basis === 'fallback') {
      expect(result.candidates.length).toBeGreaterThan(1);
    } else {
      expect(result.candidates).toEqual([]);
    }
  });

  it('names both JSON candidates for unrecognized JSON', () => {
    expect(detectFormat('{"a":1}').candidates).toEqual(['coral-document', 'graphir-json']);
  });

  it('names every other format for fallback Coral', () => {
    expect(detectFormat('service a').candidates).toEqual(SOURCE_FORMATS.filter((format) => format !== 'coral'));
  });

  it('prefers the Mermaid rule for graph TD, which a naive DOT rule also matches', () => {
    expect(detectFormat('graph TD { a }').format).toBe('mermaid');
  });

  it('holds a .json file to the JSON rules instead of sniffing other formats', () => {
    expect(detectFormat('flowchart LR\nA-->B', { fileName: 'a.json' })).toMatchObject({ format: null, basis: 'content' });
  });
});
