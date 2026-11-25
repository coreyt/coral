import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { assessInstalledSuccessorSourceIntegrity028 } from '../src/successorSourceIntegrity028.js';

describe('source-owned U1 integrity independent of scene capability', () => {
  it('checks valid recursive source without requiring a flat scene', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  client -> server\n' +
      '} else "no" {\n  server -> client\n}\n';
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    expect(graph.interaction?.fragments).toHaveLength(1);
    expect(assessInstalledSuccessorSourceIntegrity028(parseInstalledDocument028(source), graph))
      .toEqual([]);
  });

  it('locates an unknown symbol and a separate invalid port while scene is unavailable', () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  client -> server:missing\n' +
      '} else "no" {\n  server -> client\n}\n';
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    expect(assessInstalledSuccessorSourceIntegrity028(parseInstalledDocument028(source), graph))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'coral.symbol.unknown',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('"missing-symbol"'),
          }) }) }),
        expect.objectContaining({ code: 'coral.port.reference.missing',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('server:missing') + 'server:'.length,
          }) }) }),
      ]));
  });
});
