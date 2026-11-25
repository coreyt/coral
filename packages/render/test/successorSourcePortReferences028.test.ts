import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { assessSuccessorSourcePortReferences028 } from '../src/successorSourcePortReferences028.js';

describe('source-owned successor port references', () => {
  it('uses authored ports and the source direction across profiles without GraphIR 3 arrow inference', () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram block\na block\nz block\na -> z');
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.nodes[0]!.semanticPorts = [{ id: 'send', direction: 'out' }];
    source.nodes[1]!.semanticPorts = [{ id: 'receive', direction: 'in' }];
    source.edges[0]!.first.port = 'send';
    source.edges[0]!.second.port = 'receive';
    const checked = assessSuccessorSourcePortReferences028(source);
    expect(checked.assessments[0]?.assessment).toEqual({ diagnostics: [], obligations: [] });
    expect([...checked.supersededGraphIrPaths]).toEqual(['/edges/0/sourcePort', '/edges/0/targetPort']);
  });

  it('keeps written endpoint and token roles fixed on a reverse sequence message', () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram uml-sequence\nclient participant\nserver participant\nclient <- server');
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.nodes[0]!.semanticPorts = [{ id: 'reply', direction: 'in' }];
    source.nodes[1]!.semanticPorts = [{ id: 'send', direction: 'out' }];
    source.edges[0]!.first.port = 'reply';
    source.edges[0]!.second.port = 'send';
    const first = { start: { line: 4, column: 7, offset: 70 }, end: { line: 4, column: 12, offset: 75 } };
    const second = { start: { line: 4, column: 25, offset: 88 }, end: { line: 4, column: 29, offset: 92 } };
    const ranges = new Map([['edge-1', { firstPort: first, secondPort: second }]]);
    const checked = assessSuccessorSourcePortReferences028(source, ranges);
    expect(checked.assessments[0]?.assessment).toEqual({ diagnostics: [], obligations: [] });
    expect([...checked.supersededGraphIrPaths]).toEqual(['/edges/0/targetPort', '/edges/0/sourcePort']);
    source.nodes[0]!.semanticPorts = [{ id: 'reply', direction: 'out' }];
    const wrong = assessSuccessorSourcePortReferences028(source, ranges);
    expect(wrong.assessments[0]?.assessment.diagnostics).toMatchObject([
      { code: 'coral.port.reference.direction', role: 'source', portId: 'reply', range: first },
    ]);
  });

  it('reports a missing authored port at the written endpoint token', () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram architecture\napi service\ndb database\napi -> db');
    const source = projected.graph!;
    source.edges[0]!.first.port = 'missing';
    const range = { start: { line: 4, column: 4, offset: 48 },
      end: { line: 4, column: 11, offset: 55 } };
    const checked = assessSuccessorSourcePortReferences028(source,
      new Map([['edge-1', { firstPort: range }]]));
    expect(checked.assessments[0]?.assessment.diagnostics).toMatchObject([
      { code: 'coral.port.reference.missing', nodeId: 'api', portId: 'missing', range },
    ]);
  });
});
