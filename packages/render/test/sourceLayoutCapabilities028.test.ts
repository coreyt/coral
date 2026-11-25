import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { sourceLayoutCapabilityNotices028 } from '../src/sourceLayoutCapabilities028.js';

describe('source-owned layout capability notices', () => {
  it('reports only unsupported self-connection proximity at its operator', () => {
    const source = '@diagram architecture\nA service\nB service\nC service\n' +
      'near = A -> B\nfar = B ----> B\n';
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    const statements = parseInstalledDocument028(source).syntax.statements.filter((item) => item.kind === 'edge');
    expect(sourceLayoutCapabilityNotices028(graph, statements)).toEqual([{
      severity: 'warning', code: 'coral.layout.proximity.unapplied',
      message: 'Edge far preserves its 4-position proximity hint, but a self-connection has no distinct endpoint separation to influence.',
      subject: { kind: 'edge', id: 'far' },
      range: statements[1]?.operator.range,
    }]);
  });

  it('withholds a token range when statement order cannot be certified', () => {
    const source = '@diagram architecture\nA service\nB service\nA ---> A\n';
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    expect(sourceLayoutCapabilityNotices028(graph, []).at(0)).not.toHaveProperty('range');
  });
});
