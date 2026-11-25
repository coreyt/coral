import { describe, expect, it } from 'vitest';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';

const check = checkInstalledSuccessorSourceConformance028;
const alternatives = 'CORAL.FLOWCHART.DECISION.ALTERNATIVES';
const entryRule = 'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY';
const triangle = 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE';
const flow = (declaration: string, incoming = true, complete = false) =>
  '@diagram flowchart\n@conformanceLevel typical\n' +
  'area group {\n  before process as "📌 Earlier"\n  entry process\n  choice '+declaration+'\n' +
  '  yes terminal\n  no terminal\n  earlier = before -> entry\n' +
  (incoming ? '  enter = entry -> choice\n' : '') +
  '  accept = choice -> yes\n'+(complete ? '  reject = choice -> no\n' : '')+'}\n';
const classes = (operator = '->', keyed = '') =>
  '@diagram uml-class\n@conformanceLevel typical\n' +
  'area group {\n  Child class\n  Base class\n  Other class\n' +
  '  earlier = Other -> Base\n  generalizes = Child '+operator+' Base [inheritance'+keyed+']\n}\n';
const rangeAt = (source: string, token: string) => ({
  start: expect.objectContaining({ offset: source.indexOf(token) }),
  end: expect.objectContaining({ offset: source.indexOf(token)+token.length }),
});

describe('CR-102 source evidence for approved rules', () => {
  it.each(['process', 'decision'])(
    'locates an explicitly selected decision on its symbol when declared %s', (kind) => {
      const source = flow(kind+' [symbol: "flowchart-decision"]');
      const result = check(source, { requestedLevel: 'strict' });
      expect(result.diagnostics).toEqual([]);
      expect(result.report?.findings).toContainEqual(expect.objectContaining({
        id: alternatives, subject: { kind: 'node', id: 'area.choice' },
        severity: 'error', range: rangeAt(source, '"flowchart-decision"'),
        provenance: { kind: 'coral', reference: expect.stringContaining('ISO 5807') },
      }));
      expect(result.report?.notices).toEqual(result.report?.findings);
    });

  it('uses the explicit decision symbol for the independent single-entry finding too', () => {
    const source = flow('process [symbol: "flowchart-decision"]', false, true);
    expect(check(source, { requestedLevel: 'strict' }).report?.findings)
      .toContainEqual(expect.objectContaining({ id: entryRule,
        range: rangeAt(source, '"flowchart-decision"') }));
  });

  it('keeps a default decision finding located on its kind token', () => {
    const source = flow('decision');
    expect(check(source, { requestedLevel: 'strict' }).report?.findings)
      .toContainEqual(expect.objectContaining({ id: alternatives, range: rangeAt(source, 'decision') }));
  });

  it('does not invent a decision finding when its explicit symbol selects a process', () => {
    const source = flow('decision [symbol: "flowchart-process"]');
    expect(check(source, { requestedLevel: 'strict' }).report?.findings).toEqual([]);
  });

  it('locates a keyed inheritance mark rather than an earlier connector or the operator', () => {
    const source = classes('->', ', secondEnd: zeroOrOne');
    const result = check(source, { requestedLevel: 'strict' });
    expect(result.diagnostics).toEqual([]);
    expect(result.report?.findings).toContainEqual(expect.objectContaining({
      id: triangle, subject: { kind: 'edge', id: 'area.generalizes' }, severity: 'error',
      range: rangeAt(source, 'zeroOrOne'),
      provenance: { kind: 'standard', reference: expect.stringContaining('§9.2.4.2') },
    }));
    expect(result.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
    }));
  });

  it('keeps operator-based inheritance evidence on the affected named connector', () => {
    const source = classes();
    const operator = source.indexOf('->', source.indexOf('generalizes'));
    expect(check(source, { requestedLevel: 'strict' }).report?.findings)
      .toContainEqual(expect.objectContaining({ id: triangle, range: {
        start: expect.objectContaining({ offset: operator }),
        end: expect.objectContaining({ offset: operator+2 }),
      } }));
  });

  it.each([
    ['flowchart', flow('process [symbol: "flowchart-decision"]', true, true)],
    ['uml-class', classes('--|>')],
  ])('certifies positive %s controls only within the approved inventory', (_profile, source) => {
    const result = check(source, { requestedLevel: 'strict' });
    expect(result.diagnostics).toEqual([]);
    expect(result.report?.findings).toEqual([]);
    expect(result.report?.claimStatus).toBe('conformant');
    expect(result.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(result.report?.unverifiedObligations).toEqual([]);
  });

  it.each([
    ['flowchart', flow('process [symbol: "flowchart-decision"]'), alternatives],
    ['uml-class', classes('->', ', secondEnd: zeroOrOne'), triangle],
  ])('preserves %s source meaning, levels, and notice policy', (_profile, source, rule) => {
    const before = projectInstalledSourceToSuccessor028(source);
    const strict = check(source, { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(strict.report?.findings.find(({ id }) => id === rule)?.severity).toBe('error');
    for (const notificationLevel of ['error', 'warning', 'info', 'debug'] as const) {
      const result = check(source, { requestedLevel: 'strict', notificationLevel });
      expect(result.report).toEqual(strict.report);
      expect(result.document.header.source).toBe(source);
      expect(result.document.header.header?.conformanceLevel).toBe('typical');
    }
    for (const requestedLevel of ['none', 'typical'] as const) {
      const result = check(source, { requestedLevel, notificationLevel: 'debug' });
      expect(result.report?.evaluatedLevel).toBe(requestedLevel);
      expect(result.report?.findings).toEqual([]);
      expect(result.report?.claimStatus).toBe('not-claimed');
      expect(result.document.header.source).toBe(source);
    }
    expect(projectInstalledSourceToSuccessor028(source)).toEqual(before);
  });
});
