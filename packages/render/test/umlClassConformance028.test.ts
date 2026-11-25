import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { checkInstalledDocumentConformance028 } from '../src/installedDocument028.js';

const inheritance = (operator: string): string => '@diagram uml-class\n' +
  'Child class\nBase class\n' +
  `generalizes = Child ${operator} Base [inheritance]\n`;

describe('UML class generalization notation', () => {
  it.each(['->', '--', '--#|>'])('retains authored %s but reports its non-open-triangle end at strict', (operator) => {
    const source = inheritance(operator);
    const ordinary = checkInstalledDocumentConformance028(source);
    expect(ordinary.document.syntax.diagnostics).toEqual([]);
    expect(ordinary.report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(strict.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE', severity: 'error',
      subject: { kind: 'edge', id: 'generalizes' },
      range: { start: expect.objectContaining({ offset: source.indexOf(operator) }),
        end: expect.objectContaining({ offset: source.indexOf(operator) + operator.length }) },
    }));
    expect(strict.report?.claimStatus).toBe('failed');
    expect(strict.document.graph?.edges[0]?.targetEnd?.marker)
      .toMatchObject(operator === '->' ? { kind: 'arrow' }
        : operator === '--' ? { kind: 'none' } : { kind: 'triangle', fill: 'filled' });
    expect(checkInstalledDocumentConformance028(source, { requestedLevel: 'none' })
      .report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
  });

  it('accepts an authored open triangle without requiring extra bracket fields', () => {
    const source = inheritance('--|>');
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(strict.document.syntax.diagnostics).toEqual([]);
    expect(strict.report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
    expect(strict.report?.claimStatus).toBe('conformant');
    expect(strict.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(strict.document.graph?.edges[0]?.targetEnd?.marker)
      .toEqual({ kind: 'triangle', fill: 'open' });
  });

  it('leaves an unmarked GraphIR edge to its catalog default instead of inventing authored evidence', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'classes',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      metadata: { notation: 'uml-class' },
      nodes: [{ id: 'Child', type: 'class' }, { id: 'Base', type: 'class' }],
      edges: [{ id: 'generalizes', source: 'Child', target: 'Base', type: 'inheritance' }],
    };
    const report = checkGraphConformance028(graph, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id))
      .not.toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
  });
});
