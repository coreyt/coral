import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { sourceSemanticCapabilityNotices028 } from '../src/sourceSemanticCapabilities028.js';

const notices = (source: string) => {
  const document = parseInstalledDocument028(source);
  const projected = projectInstalledSourceToSuccessor028(source);
  expect(projected.diagnostics).toEqual([]);
  const before = JSON.stringify(projected.graph);
  const result = sourceSemanticCapabilityNotices028(projected.graph!,
    document.syntax.statements.filter((item) => item.kind === 'node'),
    document.syntax.statements.filter((item) => item.kind === 'edge'));
  expect(JSON.stringify(projected.graph)).toBe(before);
  return result;
};

describe('source semantic capability notices', () => {
  it('keeps ordinary generic containment distinct from BPMN scope', () => {
    const source = '@diagram bpmn\narea group {\n' +
      '  lane group [symbol: "bpmn-lane"] {\n    work task\n  }\n}\n';
    expect(notices(source)).toMatchObject([{ code: 'render.capability.bpmn-scope',
      subject: { kind: 'node', id: 'area.lane' } }]);
  });

  it('does not infer ERD or BPMN meaning in another profile', () => {
    expect(notices('@diagram sketch\nprobe group [symbol: "erd-attribute"]\n')).toEqual([]);
  });
});
